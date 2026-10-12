import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import {Client} from '../owner-setup/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {InMemoryTransport} from '../owner-setup/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import {buildDurableRoutedRuntime,buildDurableRoutedOperationalEntrypoint} from '../owner-setup/deployment/durable-live-release.mjs';

// Actual generated production handlers and SDK. Test-only session/transport fixtures are appended
// to a temporary sibling module; production source never exposes these seams or bypasses auth.
test('production generator + actual MCP schemas, signed job identity and queued browser cancellation',async()=>{
 const root=fileURLToPath(new URL('../owner-setup',import.meta.url));
 const dir=mkdtempSync(path.join(tmpdir(),'jh-command-runtime-'));
 const env={JH_OWNER_DEFER_LISTEN:process.env.JH_OWNER_DEFER_LISTEN,LIFE_HUB_TOKEN:process.env.LIFE_HUB_TOKEN,JH_WORKFLOW_STATE_DIR:process.env.JH_WORKFLOW_STATE_DIR};
 let client,server,file;
 try{
  process.env.JH_OWNER_DEFER_LISTEN='1';process.env.LIFE_HUB_TOKEN='SYNTHETIC_COMMAND_RUNTIME_ONLY_20261012';process.env.JH_WORKFLOW_STATE_DIR=dir;
  const built=buildDurableRoutedRuntime(root),entry=buildDurableRoutedOperationalEntrypoint(root);
  for(const f of [built.file,entry.file,entry.runtimeFile])execFileSync(process.execPath,['--check',f]);
  file=path.join(root,'server-integration','command-runtime-'+randomBytes(8).toString('hex')+'.test-generated.mjs');
  const seam=`
export const testOnly={createMcp,jobs,configure(){
 const device='synthetic-command-device',secret=Buffer.alloc(32,7);
 trustedSessionAuthority56={sessionAllowed:()=>true};
 devices.set(device,{secureBridgeVersion:56,deviceDigest:'d'.repeat(64),lastSeen:Date.now()});
 secureStates56.set(device,{pending:new Map(),active:{sessionId:'synthetic_session_001',deviceDigest:'d'.repeat(64),ownerDigest:'a'.repeat(64),trustId:'t'.repeat(32),secret,expiresAt:Date.now()+600000}});
},browser(fn){browserEventTransport.request=fn;}};
`;
  writeFileSync(file,readFileSync(built.file,'utf8')+seam);
  const runtime=await import(pathToFileURL(file).href);runtime.testOnly.configure();
  server=runtime.testOnly.createMcp();client=new Client({name:'command-runtime-test',version:'1'});
  const [c,s]=InMemoryTransport.createLinkedPair();await server.connect(s);await client.connect(c);
  const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true);return JSON.parse(r.content.find(x=>x.type==='text').text);};
  const catalog=await client.listTools();
  assert.ok(catalog.tools.find(x=>x.name==='life_android_open').inputSchema.properties.command_id);
  const begin=()=>call('life_android_workflow_link',{mode:'BEGIN_COMMAND',request_id:randomBytes(16).toString('hex')});
  const a=await begin();assert.equal(a.ok,true);
  const opened=await call('life_android_open',{target:'카카오T',command_id:a.commandId});assert.equal(opened.queued,true);
  const job=runtime.testOnly.jobs.get(opened.jobId);assert.equal(job.commandId,a.commandId);
  const signature=createHmac('sha256',Buffer.alloc(32,7)).update([job.secureSessionId,job.id,job.type,job.secureNonce,job.secureExpiresAt,job.securePayloadDigest].join('|')).digest('hex');
  assert.equal(job.secureMac,signature);
  const b=await begin();assert.equal(runtime.testOnly.jobs.has(job.id),false);
  assert.match((await call('life_android_open',{target:'카카오T',command_id:a.commandId})).code,/discarded/);
  assert.match((await call('life_android_open',{target:'카카오T'})).code,/binding_required/);
  let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let hold=true;const calls=[];
  runtime.testOnly.browser(async options=>{
   const m=JSON.parse(options.body);
   if(m.method==='notifications/initialized')return new Response(null,{status:202});
   if(m.method==='tools/list'&&hold){hold=false;entered();await gate;}
   let result;
   if(m.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'synthetic-browser',version:'1'}};
   else if(m.method==='tools/list')result={tools:[{name:'browser_snapshot',inputSchema:{type:'object',properties:{}}}]};
   else{calls.push(m);result={content:[{type:'text',text:'CURRENT_SCREEN'}]};}
   return new Response(JSON.stringify({jsonrpc:'2.0',id:m.id,result}),{status:200,headers:{'content-type':'application/json'}});
  });
  const stale=call('life_web_snapshot',{command_id:b.commandId});await started;
  const newest=await begin();const fresh=call('life_web_snapshot',{command_id:newest.commandId});release();
  assert.match((await stale).code,/discarded/);await fresh;
  assert.equal(calls.length,1,'only the newest queued browser action may cross transport');
  assert.equal(calls[0]._meta,undefined); // metadata belongs to params, not JSON-RPC envelope
  assert.equal(calls[0].params._meta.jhCommandId,newest.commandId);
 }finally{
  await client?.close();await server?.close();if(file)rmSync(file,{force:true});rmSync(dir,{recursive:true,force:true});
  for(const [k,v] of Object.entries(env))if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});
