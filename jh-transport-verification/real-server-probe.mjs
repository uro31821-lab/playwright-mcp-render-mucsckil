import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeFile,readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';
const sha=x=>createHash('sha256').update(x).digest('hex');
const token=()=>randomBytes(18).toString('base64url');
const mac=(k,x)=>createHmac('sha256',k).update(x).digest('hex');
const temp=await mkdtemp(join(tmpdir(),'jh-synthetic-proof-'));
const portFinder=http.createServer();portFinder.listen(0,'127.0.0.1');await once(portFinder,'listening');
const port=portFinder.address().port;await new Promise(r=>portFinder.close(r));
let serverOut='',serverErr='';
const child=spawn(process.execPath,['auth-diagnostics-entry.mjs'],{cwd:'service',stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,PORT:String(port),PUBLIC_BASE_URL:'https://test.invalid',NODE_ENV:'production'}});
child.stdout.on('data',b=>{serverOut+=b;});child.stderr.on('data',b=>{serverErr+=b;});
const base='http://127.0.0.1:'+port;
const results=[];
let failure=null;
async function request(path,{method='GET',body,headers={}}={}){
 const r=await fetch(base+path,{method,headers:{...headers,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
 return {status:r.status,text:await r.text()};
}
async function pair(){
 const id='synthetic-'+token(),digest=sha('jh56|'+id),now=Date.now();
 const baseline=await readFile('service/server.mjs','utf8');
 const catalog=baseline.match(/const SECURE56_TOOL_CATALOG_DIGEST="([a-f0-9]{64})"/)[1];
 const reg=await request('/device/register',{method:'POST',body:{deviceId:id,deviceDigest:digest,clientNonce:token(),clientTime:now,secureBridgeVersion:56,bridgeVersion:'FIXTURE_ONLY',toolCatalogDigest:catalog}});
 assert.equal(reg.status,200);const s=JSON.parse(reg.text),key=Buffer.from(s.secureSessionSecret,'base64url');
 const nonce=token(),exp=Date.now()+30000;
 const active=await request('/device/activate',{method:'POST',body:{deviceId:id,sessionDigest:s.sessionDigest},headers:{'x-jh-session':s.secureSessionId,'x-jh-device':digest,'x-jh-nonce':nonce,'x-jh-expires':String(exp),'x-jh-mac':mac(key,`activate|${s.secureSessionId}|${digest}|${nonce}|${exp}`)}});
 key.fill(0);assert.equal(active.status,200);
 return {id,digest,sid:s.secureSessionId,secret:s.secureSessionSecret};
}
async function experiment(retry){
 const p=await pair(),statuses=[],sockets=new Set();let polls=0,proxyFailure=null;
 const before=serverOut.length;
 const proxy=http.createServer((req,res)=>{
   const isPoll=req.url.startsWith('/device/poll?');
   const n=isPoll?++polls:0;
   const headers={};for(const [k,v] of Object.entries(req.headers))if(k.startsWith('x-jh-'))headers[k]=v;
   const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:'GET',headers},r=>{
     const parts=[];r.on('data',b=>parts.push(b));r.on('end',()=>{
       if(isPoll)statuses.push(r.statusCode);
       if(isPoll && n===1){req.socket.destroy();return;}
       res.writeHead(r.statusCode,{'content-type':r.headers['content-type']||'text/plain'});res.end(Buffer.concat(parts));
     });
   });
   upstream.on('error',e=>{proxyFailure=e;res.destroy();});upstream.end();
 });
 proxy.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
 const file=join(temp,retry?'retry.properties':'single.properties');
 await writeFile(file,Object.entries({base:'http://127.0.0.1:'+proxy.address().port,...p}).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600});
 let clientOut='',clientErr='',client=null;
 try{
   client=spawn('java',['-cp','.:libs/*','RealServerReplay',file,String(retry)],{stdio:['ignore','pipe','pipe']});
   client.stdout.on('data',b=>{clientOut+=b;});client.stderr.on('data',b=>{clientErr+=b;});
   const timer=setTimeout(()=>client.kill('SIGKILL'),15000);
   const [code]=await once(client,'exit');clearTimeout(timer);assert.equal(code,0,'fixture Java exit');
   assert.equal(proxyFailure,null);const outcome=JSON.parse(clientOut.trim());
   await sleep(100);
   const reasons=serverOut.slice(before).split('\n').filter(x=>x.startsWith('JH_AUTH_REJECTION ')).map(x=>JSON.parse(x.slice('JH_AUTH_REJECTION '.length)).reason);
   if(retry){assert.equal(polls,2);assert.deepEqual(statuses,[204,401]);assert.equal(outcome.status,401);assert.deepEqual(reasons,['nonce_replayed']);}
   else{assert.equal(polls,1);assert.deepEqual(statuses,[204]);assert.equal(outcome.status,null);assert.equal(outcome.exception,'IOException');assert.deepEqual(reasons,[]);}
   results.push({automaticRetry:retry,applicationPollCalls:outcome.applicationPollCalls,proxyWirePolls:polls,actualServerStatuses:statuses,actualServerReasons:reasons,client:outcome,passed:true});
 }finally{
   if(client && client.exitCode===null)client.kill('SIGKILL');
   await rm(file,{force:true});p.secret='';
   for(const s of sockets)s.destroy();await new Promise(r=>proxy.close(r));
 }
}
try{
 let ready=false;
 for(let i=0;i<60;i++){
   assert.equal(child.exitCode,null,'server must remain running');
   try{ready=(await request('/health')).status===200;}catch{}
   if(ready)break;await sleep(100);
 }
 assert.ok(ready,'exact server ready');
 await experiment(true);await experiment(false);
 assert.equal(results.length,2);
}catch(e){failure=e;}
finally{
 child.kill('SIGTERM');await sleep(200);if(child.exitCode===null)child.kill('SIGKILL');
 await rm(temp,{recursive:true,force:true});
 const report={schema:1,passed:!failure,serverRevision:'6a9ef4a1722f33f04a279aa150664fa47d3800ff',scope:'Actual JH diagnostic server with synthetic sessions on loopback; client is upstream OkHttp 2.7.5 JVM surrogate, NOT the phone. Reproduction does not identify historical production cause.',results,error:failure?String(failure):null,phoneOperations:0,productionDeployment:false,authenticationRulesChanged:false};
 await writeFile('evidence/real-server-replay.json',JSON.stringify(report,null,2));
 // Server messages never include fixture keys, but avoid collecting broad logs anyway.
 console.log(JSON.stringify(report));
}
if(failure)throw failure;
