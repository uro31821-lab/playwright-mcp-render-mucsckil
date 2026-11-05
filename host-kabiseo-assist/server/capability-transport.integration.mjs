/** Original Secure56 crypto and completion block, localhost HTTP, synthetic session.
 * Exercises capability -> metadata producer connection; NOT full MCP or Android E2E.
 * No new packages, production startup changes, actual phone calls or external listener.
 */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {createKabiseoCapabilityProbe} from './capability-probe.mjs';
import {createKabiseoMetadataProducer} from './metadata-producer.mjs';
assert.ok(process.env.KABISEO_BASELINE_FILE,'baseline required');
const source=readFileSync(process.env.KABISEO_BASELINE_FILE,'utf8');
const blob=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(blob,'2c4fc54d0c2789b8c02e825c3946b9777e14a694');
const slice=(a,b)=>{assert.equal(source.split(a).length,2);assert.equal(source.split(b).length,2);const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(end>start);return source.slice(start,end);};
const crypto=[slice('function sha56(v){','function mcpCallerAuthorized56(req){'),
 slice('function token56(n=18){','const PUBLIC_BASE_URL='),slice('function seen56(set,nonce){','function sessionDigest56(x){'),
 slice('function payloadDigest56(p){','function safeJobView56(j){')].join('\n');
const completion=slice('  const completeMatch=url.pathname.match(','  const frameMatch=url.pathname.match(');
const sha=x=>createHash('sha256').update(x).digest('hex');
const mac=(key,x)=>createHmac('sha256',key).update(x).digest('hex');
const checks=[];
async function fixture(t){
 const f={on:true,jobs:new Map(),sent:[],during:async()=>{},b:{deviceId:'synthetic_capability_device',
  sessionId:'synthetic_capability_session',trustId:'synthetic_capability_trust',ownerDigest:'1'.repeat(64),
  deviceDigest:'2'.repeat(64),commandId:'3'.repeat(32),runtimeDigest:'4'.repeat(64),expiresAt:Date.now()+600000}};
 const secret=randomBytes(32),session={secret,sessionId:f.b.sessionId,deviceDigest:f.b.deviceDigest,seenComplete:new Set()};
 const context=vm.createContext({Buffer,createHash,createHmac,timingSafeEqual,randomBytes,SECURE56_JOB_MS:45000,
  jobs:f.jobs,active56:id=>id===f.b.deviceId?session:null});
 vm.runInContext(crypto+'\nthis.sign=signJob56;this.finish=async function(req,res,url){\n'+completion+'\nres.writeHead(404).end();};',context,{timeout:1000});
 const server=createServer((req,res)=>context.finish(req,res,new URL(req.url,'http://127.0.0.1')).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();}));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 assert.equal(server.address().address,'127.0.0.1');
 const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});secret.fill(0);});
 f.host=kind=>({enabled:()=>f.on,now:()=>Date.now(),
  binding:()=>kind==='probe'?{...f.b}:{...f.b,supported:f.cap.supported(f.b)},
  enqueue(p,b){
   const type=kind==='probe'?'secure_device_status':'kabiseo_camera_metadata';
   const payload={...p,commandId:b.commandId,mcpToolName:kind==='probe'?'life_android_secure_status':'life_android_kabiseo_metadata',
    targetDeviceDigest:b.deviceDigest,secureRequestedEffect:'READ_ONLY'};
   const j={...payload,id:'job_'+(f.sent.length+1),type,status:'queued',targetDeviceId:b.deviceId};
   context.sign(j,payload);f.jobs.set(j.id,j);f.sent.push(j);return {id:j.id};
  },lookup:id=>f.jobs.get(id),wait:async id=>f.during(f.jobs.get(id))});
 f.cap=createKabiseoCapabilityProbe(f.host('probe'));f.meta=createKabiseoMetadataProducer(f.host('metadata'));
 f.args={request_id:'5'.repeat(32),task_digest:'6'.repeat(64),runtime_digest:f.b.runtimeDigest};
 f.probe=extra=>f.cap.handle({...f.args,mode:'PROBE',...extra});
 f.read=extra=>f.meta.handle({...f.args,request_id:'7'.repeat(32),mode:'READ',...extra});
 f.capReply=j=>({ok:true,kabiseoCameraMetadata:{schema:'KABISEO_CAMERA_METADATA_CAPABILITY_V1',requestId:j.requestId,
  version:1,enabled:true,cameraTargetPackage:'com.openai.chatgpt',readOnly:true,pixelsRead:false,gestureDispatched:false,
  cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false,cameraSurfaceMatched:false}});
 f.metaReply={ok:true,code:'kabiseo_camera_metadata_verified',readOnly:true,pixelsRead:false,
  gestureDispatched:false,cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false};
 f.packet=(j,result)=>{
  const body=JSON.stringify({result}),rd=sha(body),nonce=randomBytes(24).toString('base64url'),exp=Date.now()+30000;
  return {url:base+'/job/'+j.id+'/complete',body,headers:{'content-type':'application/json',
   'x-jh-session':session.sessionId,'x-jh-device':session.deviceDigest,'x-jh-nonce':nonce,
   'x-jh-expires':String(exp),'x-jh-result-digest':rd,
   'x-jh-mac':mac(secret,['complete',session.sessionId,j.id,session.deviceDigest,nonce,exp,rd].join('|'))}};
 };
 f.post=async p=>{const r=await fetch(p.url,{method:'POST',body:p.body,headers:p.headers,signal:AbortSignal.timeout(3000)});await r.text();return r.status;};
 f.complete=(j,r)=>f.post(f.packet(j,r));
 return f;
}
function check(name,fn){test(name,{timeout:10000},async t=>{await fn(t);checks.push(name);});}
check('authenticated capability then explicit metadata read, two distinct signed jobs',async t=>{
 const f=await fixture(t);
 assert.equal((await f.read()).code,'device_camera_metadata_not_supported');assert.equal(f.sent.length,0);
 f.during=async j=>assert.equal(await f.complete(j,j.type==='secure_device_status'?f.capReply(j):f.metaReply),200);
 const supported=await f.probe();assert.equal(supported.deviceSupported,true);assert.equal(supported.cameraSurfaceMatched,false);
 assert.equal((await f.read()).ok,true);assert.deepEqual(f.sent.map(j=>j.type),['secure_device_status','kabiseo_camera_metadata']);
 assert.ok(f.sent.every(j=>j.secureMac===undefined));
});
check('invalid capability MAC cannot unlock metadata; late valid lookup does not replay',async t=>{
 const f=await fixture(t);f.during=async j=>{const p=f.packet(j,f.capReply(j));p.headers['x-jh-mac']='0'.repeat(64);assert.equal(await f.post(p),401);};
 assert.equal((await f.probe()).deviceSupported,false);assert.equal((await f.read()).ok,false);assert.equal(f.sent.length,1);
 const j=f.sent[0];assert.equal(await f.complete(j,f.capReply(j)),200);
 assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,true);
 assert.equal((await f.probe()).code,'capability_already_requested_use_result');assert.equal(f.sent.length,1);
});
check('capability body tampering is rejected by original HTTP verifier',async t=>{
 const f=await fixture(t);f.during=async j=>{const p=f.packet(j,f.capReply(j));p.body=JSON.stringify({result:{ok:true}});assert.equal(await f.post(p),401);};
 assert.equal((await f.probe()).deviceSupported,false);assert.equal(f.cap.supported(f.b),false);
});
check('capability completion replay nonce still receives HTTP401',async t=>{
 const f=await fixture(t);let packet;f.during=async j=>{packet=f.packet(j,f.capReply(j));assert.equal(await f.post(packet),200);};
 assert.equal((await f.probe()).deviceSupported,true);assert.equal(await f.post(packet),401);assert.equal(f.sent.length,1);
});
check('signed old-device status without capability does not activate camera metadata',async t=>{
 const f=await fixture(t);f.during=async j=>assert.equal(await f.complete(j,{ok:true,secureBridgeVersion:56}),200);
 assert.equal((await f.probe()).code,'device_capability_not_supported');assert.equal((await f.read()).ok,false);assert.equal(f.sent.length,1);
});
check('wrong session capability packet cannot be stored',async t=>{
 const f=await fixture(t);f.during=async j=>{const p=f.packet(j,f.capReply(j));p.headers['x-jh-session']='another_session';assert.equal(await f.post(p),401);};
 assert.equal((await f.probe()).deviceSupported,false);assert.equal(f.sent[0].result,undefined);
});
check('changed command after authentic completion cannot reuse support',async t=>{
 const f=await fixture(t);f.during=async j=>{assert.equal(await f.complete(j,f.capReply(j)),200);f.b.commandId='8'.repeat(32);};
 assert.equal((await f.probe()).deviceSupported,false);assert.equal((await f.read()).ok,false);assert.equal(f.sent.length,1);
});
check('late accepted HTTP reply requires explicit result processing, not silent enablement',async t=>{
 const f=await fixture(t);await f.probe();const j=f.sent[0];assert.equal(await f.complete(j,f.capReply(j)),200);
 assert.equal(f.cap.supported(f.b),false);assert.equal((await f.read()).ok,false);
 assert.equal((await f.probe({mode:'RESULT'})).deviceSupported,true);assert.equal(f.sent.length,1);
});
check('signed capability cannot turn camera or restoration claims on',async t=>{
 const f=await fixture(t);f.during=async j=>{const r=f.capReply(j);r.kabiseoCameraMetadata.automaticZoomEnabled=true;assert.equal(await f.complete(j,r),200);};
 const r=await f.probe();assert.equal(r.deviceSupported,false);assert.equal(r.automaticZoomEnabled,false);assert.equal(r.restoreVerified,false);assert.equal((await f.read()).ok,false);
});
after(()=>{
 const result={schema:'KABISEO_CAPABILITY_TRANSPORT_V012',status:checks.length===9?'PASS':'FAILED',tests:9,passed:checks.length,
  baselineBlob:blob,cryptoSourceSha256:sha(crypto),completionSourceSha256:sha(completion),
  scope:'server handshake and metadata producers plus original signer/completion over localhost HTTP; synthetic session/device',
  androidCapabilityReplyWired:false,fullMcpE2E:false,physicalPhoneCommands:0,productionStartupChanged:false,apkBuild:'NOT_RUN',checks};
 assert.ok(process.env.KABISEO_CAPABILITY_RESULT,'result output required');
 const dest=path.resolve(process.env.KABISEO_CAPABILITY_RESULT);mkdirSync(path.dirname(dest),{recursive:true});
 writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log('KABISEO_CAPABILITY_TRANSPORT_RESULT='+JSON.stringify(result));
});
