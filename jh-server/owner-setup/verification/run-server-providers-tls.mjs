/** Real localhost TLS + separate JVM and Node port processes; all provider data/keys synthetic.
 * Does NOT access OpenAI/Memoria operating endpoints or change account/phone/hosting settings. */
import {createServer} from 'node:https';
import {once} from 'node:events';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {fixture} from './provider-fixture.mjs';
const source=path.resolve(new URL('..',import.meta.url).pathname);
const jar=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
mkdirSync(out,{recursive:true});
const temp=mkdtempSync(path.join(tmpdir(),'jh-provider-tls-'));
const checks=[],observations=[],children=new Set();
const modes=['normal_json','normal_sse','food','book','private_entry','metadata_401','malformed_init','tool_changed_init',
 'fetch_foreign','partial_fetch','wrong_model','drop_generate','schema_drift','stopped','process_death','revoked_after_memory'];
let server;
const counts=new Map(),fixtures=new Map();
function getFixture(mode){
 if(!fixtures.has(mode))fixtures.set(mode,fixture({sse:mode==='normal_sse',edit:(r,b)=>{
  if(mode==='malformed_init'&&b.method==='initialize')r.id='foreign';
  if(mode==='tool_changed_init'&&b.method==='tools/list')r.result.tools[0].annotations={readOnlyHint:false};
  if(mode==='schema_drift'&&b.method==='tools/list'){
   const n=(counts.get(mode)||0)+1;counts.set(mode,n);if(n>1)r.result.tools[0].description='definition changed';
  }
  if(b.method==='tools/call'&&b.params.name==='fetch_memory'){
   let m=r.result.structuredContent;
   m.memory.weight=1.5; // Exercises Kotlin decimal JSON preservation, not original media.
   if(mode==='fetch_foreign')m.memory.id='wrong_memory';
   if(mode==='partial_fetch')m.media_complete=false;
   r.result.content[0].text=JSON.stringify(m);
  }
  return r;
 }}));return fixtures.get(mode);
}
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(temp,'key.pem'),'-out',path.join(temp,'cert.pem'),
  '-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','extendedKeyUsage=serverAuth'],{stdio:'pipe',timeout:15000});
 server=createServer({key:readFileSync(path.join(temp,'key.pem')),cert:readFileSync(path.join(temp,'cert.pem'))},async(req,res)=>{
  try{
   const bits=req.url.split('/'),mode=bits[2];assert.ok(modes.includes(mode));
   const isMcp=bits[1]==='mcp';const url=isMcp?'https://memoria.invalid/mcp':'https://api.openai.com/'+bits.slice(3).join('/');
   let size=0;const chunks=[];for await(const b of req){size+=b.length;assert.ok(size<=24*1024*1024);chunks.push(b);}
   const body=chunks.length?Buffer.concat(chunks).toString():undefined;
   const parsed=body?JSON.parse(body):null;
   observations.push({mode,path:isMcp?'/mcp':new URL(url).pathname,method:req.method,
    operation:parsed?.method,tool:parsed?.params?.name,body:parsed,
    // Only boolean equality, never record the synthetic Authorization value.
    credentialCorrect:req.headers.authorization===(isMcp?'Bearer SYNTHETIC_MEMORY_CREDENTIAL_000000':'Bearer SYNTHETIC_OPENAI_CREDENTIAL_000000')});
   assert.equal(observations.at(-1).credentialCorrect,true);
   if(mode==='metadata_401'&&url.includes('/models/')){send(res,401,{error:'synthetic'});return;}
   if(mode==='drop_generate'&&url.endsWith('/responses')){req.socket.destroy();return;}
   const f=getFixture(mode);let r=await f.fetchImpl(url,{method:req.method,headers:{authorization:'NOT_RECORDED'},body});
   if(mode==='wrong_model'&&url.endsWith('/responses')){const b=await r.json();b.model='gpt-foreign';send(res,200,b);return;}
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
  }catch(e){send(res,500,{error:'FIXTURE_REQUEST_REJECTED'});}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='https://localhost:'+server.address().port;
 for(const mode of modes){
  const before=observations.length,start=Date.now();
  const child=spawn('java',['-cp',jar,'com.koreanlifehub.bridge.ServerProviderChecks',source,process.execPath,origin,path.join(temp,'cert.pem'),mode],
   {stdio:['ignore','pipe','pipe']});children.add(child);
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
  const [code,signal]=await once(child,'exit');clearTimeout(timer);children.delete(child);
  writeFileSync(path.join(out,mode+'.log'),stdout+'\n'+stderr);
  assert.equal(code,0,mode+'\n'+stdout+'\n'+stderr);assert.match(stdout,new RegExp('PASS '+mode));
  const seen=observations.slice(before),generates=seen.filter(x=>x.path.endsWith('/responses')),calls=seen.filter(x=>x.operation==='tools/call');
  if(['normal_json','normal_sse'].includes(mode)){
   assert.equal(generates.length,1);assert.deepEqual(calls.map(x=>x.tool),['search_memory','fetch_memory']);
   const body=JSON.stringify(generates[0].body);
   assert.ok(body.includes('재조회 원문'));assert.ok(!body.includes('과거 검색 요약'));
  }
  if(mode==='food'){assert.equal(generates.length,2);assert.equal(calls.length,0);}
  if(mode==='book'){assert.equal(generates.length,1);assert.equal(calls.length,0);assert.ok(generates[0].body.instructions.includes('3~5'));}
  if(['stopped','process_death','revoked_after_memory','partial_fetch','fetch_foreign','schema_drift'].includes(mode))assert.equal(generates.length,0);
  if(['wrong_model','drop_generate'].includes(mode))assert.equal(generates.length,1);
  if(mode==='private_entry')assert.equal(seen.filter(x=>x.path!=='/mcp').length,0);
  assert.ok(seen.every(x=>!['save_memory','delete_memory'].includes(x.tool)));
  checks.push({name:mode,passed:true,providerHttpRequests:seen.length,generationRequests:generates.length,seconds:(Date.now()-start)/1000});
  console.log('PASS '+mode);
 }
}finally{
 for(const c of children)c.kill('SIGKILL');if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 rmSync(temp,{recursive:true,force:true});
 writeFileSync(path.join(out,'result.json'),JSON.stringify({scope:'Production ports/adapter/Host/Session/JVM/process IPC/localhost TLS; accounts/models/providers are synthetic fixtures.',tests:checks.length,expected:modes.length,checks,operatingProviderCalls:0,phoneOperations:0},null,2));
 // Only test data. No tokens in this transcript.
 writeFileSync(path.join(out,'wire-observations.json'),JSON.stringify(observations,null,2));
}
assert.equal(checks.length,modes.length);console.log('SUMMARY '+checks.length+' passed');
