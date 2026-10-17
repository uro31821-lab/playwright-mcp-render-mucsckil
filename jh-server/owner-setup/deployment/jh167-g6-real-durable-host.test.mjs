/** G6 — boot actual pinned Durable JH167 generated host on localhost with synthetic keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from './durable-clean-restart-release.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
test('G6 actual Durable generated runtime has seven read-only registrations and preserved fences',{timeout:30000},async()=>{
 const generated=buildCleanRestartRelease56();
 assert.equal(generated.selfReferencesRewritten,3);
 const runtime=await import(pathToFileURL(generated.file).href+'?jh167-g6');
 const b=runtime.buildDurableRoutedOperationalEntrypoint(ROOT);
 for(const file of [generated.file,b.file,b.ownerFile,b.unifiedFile,b.runtimeFile]){
  assert(fs.existsSync(file),'missing '+file);
  const p=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:10000});
  assert.equal(p.status,0,file+'\n'+p.stderr);
 }
 const src=fs.readFileSync(b.runtimeFile,'utf8');
 // MCP tool names are registered by imported modules, not inlined as literals.
 // The second test independently verifies their actual names via HTTP tools/list.
 for(const registrar of ['jhRegisterReservationLinkTools','jhRegisterGuide13Tools'])
  assert(src.includes(registrar),'missing live runtime registrar '+registrar);
 for(const gate of ['jhRequireCommand56','jhOwnerAdmission155','jhDiscardPayments56',
  'jhInspectSplitEvidence155','jhResultVerificationGuard56'])
  assert(src.includes(gate),gate);
 assert.equal(b.routePatch,true);
});
const bootScript="\nimport assert from 'node:assert/strict';\nimport {readFileSync} from 'node:fs';\nimport {pathToFileURL} from 'node:url';\nimport {Client} from '@modelcontextprotocol/sdk/client/index.js';\nimport {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';\nconst ROOT=process.argv[1],data=JSON.parse(readFileSync(process.argv[2],'utf8'));\nconst imp=async file=>import(pathToFileURL(file).href);\nconst mod=await imp(ROOT+'/deployment/durable-live-clean-restart-generated.mjs');\nconst built=mod.buildDurableRoutedOperationalEntrypoint(ROOT);\nconst {validateOwnerConfiguration,loadOwnerKey}=await imp(ROOT+'/deployment/owner-config.mjs');\nconst {takeStorageSecrets,materializeStorageKeys}=await imp(ROOT+'/deployment/storage-secret-bridge.mjs');\nconst {prepareOperationalStorage}=await imp(ROOT+'/deployment/operational-service-entry.mjs');\nconst {startUnifiedOwnerServer}=await imp(built.unifiedFile);\nconst config=validateOwnerConfiguration(data.input);\nconst secrets=takeStorageSecrets({\n JH_OWNER_STORAGE_SECRET:Buffer.alloc(32,17).toString('base64'),\n JH_LIFE_STORAGE_SECRET:Buffer.alloc(32,18).toString('base64')\n});\nconst files=materializeStorageKeys(config,secrets,data.keys);\nsecrets.owner.fill(0);secrets.life.fill(0);\nconst p=prepareOperationalStorage(config,files,{confirmation:'EXPLICIT_ONE_TIME',\n storageObservations:data.observations});\nconst key=loadOwnerKey(files.ownerKeyFile,config);\nlet running=null,client=null;\ntry{\n const cutover=mod.prepareOrVerifyDurableRelease({config,key,storageObservations:data.observations,\n  mode:mod.INITIAL_MODE});\n running=await startUnifiedOwnerServer({config,key,lifeStorage:p.lifeStorage,\n  storageObservations:data.observations,port:0,bindAddress:'127.0.0.1'});\n const base='http://127.0.0.1:'+running.port;\n const health=await fetch(base+'/health'),unauth=await fetch(base+'/mcp');\n assert.equal(health.status,200);assert.equal(unauth.status,401);\n client=new Client({name:'jh167-g6-durable-http-client',version:'0.6.0'},{capabilities:{}});\n await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),\n  {requestInit:{headers:{Authorization:'Bearer '+process.env.LIFE_HUB_TOKEN}}}));\n const list=await client.listTools();\n const tools=['life_guide13_catalog','life_guide13_plan',\n  'life_reservation_link_assistant','life_reservation_screen_guide',\n  'life_reservation_regional_handoff','life_reservation_provider_status',\n  'life_reservation_live_search'];\n const actual=list.tools.filter(x=>tools.includes(x.name));\n assert.equal(actual.length,7);\n assert(actual.every(x=>x.annotations?.readOnlyHint===true));\n const reply=await client.callTool({name:'life_guide13_catalog',arguments:{}});\n assert.notEqual(reply.isError,true);\n const body=reply.content?.find(x=>x.type==='text')?.text;\n assert.equal(typeof body,'string');\n const result=JSON.parse(body);\n assert.equal(result.external_effect_status,'NOT_EXECUTED');\n assert.equal(result.ok,false);\n assert.equal(cutover.initializedNow,true);\n assert.equal(running.durableCircuitInstalled,true);\n assert.equal(running.lifeRuntimeInstalled,true);\n assert.equal(running.trustCreated,false);assert.equal(running.sessionCreated,false);\n console.log('JH167_G6_DURABLE_HTTP '+JSON.stringify({health:health.status,\n  noAuth:unauth.status,tools:actual.length,readOnly:true,\n  noDeviceReason:result.code||null,durable:running.durableCircuitInstalled,\n  synthetic:true,phone:false,render:false}));\n}finally{\n try{await client?.close()}catch{}\n key.fill(0);\n try{await running?.close()}catch{}\n}\n";
test('G6 genuine Durable+owner service synthetic HTTP boot, auth and tool call',{timeout:60000},()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'jh167-g6-real-'));fs.chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');fs.mkdirSync(mount,{mode:0o700});
 fs.mkdirSync(path.join(mount,'jh-pc-bootstrap'),{mode:0o700});
 const data=path.join(dir,'fixture.json');
 const input={version:1,serverOrigin:'https://jh-secure-bridge-fix4.onrender.com',
  catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',
  googleWebClientId:'jh167-g6-synthetic.apps.googleusercontent.com',
  allowedPresenterClientIds:['jh167-g6-synthetic.apps.googleusercontent.com'],
  ownerSubject:'synthetic-jh167-g6',ownerLabel:'Synthetic JH167 G6',
  storageMount:mount,storageEpoch:'synthetic_20261018_g6'};
 const observations={mountInfo:'1 0 8:1 / '+mount+' rw - ext4 /dev/synthetic rw',
  filesystemType:0xef53};
 fs.writeFileSync(data,JSON.stringify({input,observations,keys:path.join(dir,'keys')}),{mode:0o600});
 try{
  const r=spawnSync(process.execPath,['--input-type=module','-e',bootScript,ROOT,data],
   {cwd:path.resolve(ROOT,'..'),encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024,
    env:{PATH:process.env.PATH,
     LIFE_HUB_TOKEN:'G6_SYNTHETIC_TOKEN_LOCAL_ONLY_20261018',
     JH_OWNER_DEFER_LISTEN:'1'}});
  assert.equal(r.status,0,'synthetic boot exit: '+r.status+'\n'+r.stderr+'\n'+r.stdout);
  const prefix='JH167_G6_DURABLE_HTTP ';
  const line=r.stdout.split('\n').find(x=>x.startsWith(prefix));
  assert(line,'no boot proof: '+r.stdout);
  const proof=JSON.parse(line.slice(prefix.length));
  assert.deepEqual([proof.health,proof.noAuth,proof.tools,proof.durable,proof.readOnly,
   proof.synthetic,proof.phone,proof.render],[200,401,7,true,true,true,false,false]);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
