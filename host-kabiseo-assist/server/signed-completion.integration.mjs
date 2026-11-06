/** Real localhost HTTP using byte-identical extracted Secure56 signing/completion code.
 * Queue/session/capability bindings are synthetic fixtures. NOT full MCP, OAuth,
 * capability negotiation, generated operator E2E, Android execution or phone testing.
 * Node builtins only; no production file is edited or production listener started.
 */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {createKabiseoMetadataProducer as fixed} from './metadata-producer.mjs';
const required=name=>{assert.ok(process.env[name],name+' required');return path.resolve(process.env[name]);};
const source=readFileSync(required('KABISEO_BASELINE_FILE'),'utf8');
const baselineBlob=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(baselineBlob,'2c4fc54d0c2789b8c02e825c3946b9777e14a694','pinned original Secure56 source drift');
const previous=(await import(pathToFileURL(required('KABISEO_PREVIOUS_PRODUCER')).href)).createKabiseoMetadataProducer;
function section(begin,end){
 assert.equal(source.split(begin).length,2,'unique beginning: '+begin);
 assert.equal(source.split(end).length,2,'unique ending: '+end);
 const a=source.indexOf(begin),b=source.indexOf(end,a);assert.ok(b>a);return source.slice(a,b);
}
const cryptoCode=[
 section('function sha56(v){','function mcpCallerAuthorized56(req){'),
 section('function token56(n=18){','const PUBLIC_BASE_URL='),
 section('function seen56(set,nonce){','function sessionDigest56(x){'),
 section('function payloadDigest56(p){','function safeJobView56(j){')
].join('\n');
const completion=section('  const completeMatch=url.pathname.match(','  const frameMatch=url.pathname.match(');
assert.ok(completion.includes('secure completion invalid')&&completion.includes('delete j[k]'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const hmac=(secret,x)=>createHmac('sha256',secret).update(x).digest('hex');
const stable=v=>v===null?'null':Array.isArray(v)?'['+v.map(stable).join(',')+']':typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const completed=[];
const success={ok:true,code:'kabiseo_camera_metadata_verified',readOnly:true,pixelsRead:false,
 gestureDispatched:false,cameraSettingsChanged:false,automaticZoomEnabled:false,restoreVerified:false};
async function fixture(t,factory=fixed){
 const f={jobs:new Map(),sent:0,waits:0,unsigned:false,enabled:true,during:async()=>{},last:null,
  binding:{deviceId:'synthetic-kabiseo',sessionId:'synthetic_session',trustId:'synthetic_trust',ownerDigest:'b'.repeat(64),
   deviceDigest:'c'.repeat(64),commandId:'d'.repeat(32),runtimeDigest:'e'.repeat(64),expiresAt:Date.now()+600000,supported:true}};
 f.secret=randomBytes(32);
 f.session={secret:f.secret,sessionId:f.binding.sessionId,deviceDigest:f.binding.deviceDigest,
  seenComplete:new Set(),expiresAt:f.binding.expiresAt};
 const context=vm.createContext({Buffer,createHash,createHmac,timingSafeEqual,randomBytes,
  SECURE56_JOB_MS:45000,jobs:f.jobs,active56:id=>id===f.binding.deviceId?f.session:null});
 vm.runInContext(cryptoCode+'\nthis.sign=signJob56;this.finish=async function(req,res,url){\n'+completion+'\nres.writeHead(404).end();};',context,{timeout:1000});
 const server=createServer((req,res)=>{context.finish(req,res,new URL(req.url,'http://127.0.0.1')).catch(()=>{if(!res.headersSent)res.writeHead(500);res.end();});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 assert.equal(server.address().address,'127.0.0.1');
 f.base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});f.secret.fill(0);});
 f.api=factory({enabled:()=>f.enabled,now:()=>Date.now(),binding:()=>({...f.binding}),
  enqueue(p,b){
   f.sent++;const payload={...p,commandId:b.commandId,mcpToolName:'life_android_kabiseo_metadata',
    targetDeviceDigest:b.deviceDigest,secureRequestedEffect:'READ_ONLY'};
   const j={...payload,id:'job_'+f.sent,type:'kabiseo_camera_metadata',status:'queued',targetDeviceId:b.deviceId};
   if(!f.unsigned){
    context.sign(j,payload);
    assert.equal(j.securePayloadDigest,sha(stable(payload)));
    assert.equal(j.secureMac,hmac(f.secret,[j.secureSessionId,j.id,j.type,j.secureNonce,j.secureExpiresAt,j.securePayloadDigest].join('|')));
   }else j.secureSessionId=b.sessionId;
   f.jobs.set(j.id,j);f.last=j;return {id:j.id};
  },lookup:id=>f.jobs.get(id),wait:async id=>{f.waits++;await f.during(f.jobs.get(id));}});
 f.args={mode:'READ',request_id:'a'.repeat(32),task_digest:'f'.repeat(64),runtime_digest:f.binding.runtimeDigest};
 f.read=extra=>f.api.handle({...f.args,...extra});
 f.packet=(j,result=success)=>{
  const body=JSON.stringify({result}),rd=sha(body),nonce=randomBytes(24).toString('base64url'),exp=Date.now()+30000;
  const sid=f.session.sessionId,dev=f.session.deviceDigest;
  return {url:f.base+'/job/'+j.id+'/complete',body,headers:{'content-type':'application/json',
   'x-jh-session':sid,'x-jh-device':dev,'x-jh-nonce':nonce,'x-jh-expires':String(exp),'x-jh-result-digest':rd,
   'x-jh-mac':hmac(f.secret,['complete',sid,j.id,dev,nonce,exp,rd].join('|'))}};
 };
 f.post=async packet=>{const r=await fetch(packet.url,{method:'POST',body:packet.body,headers:packet.headers,signal:AbortSignal.timeout(3000)});await r.text();return r.status;};
 f.complete=(j,result=success)=>f.post(f.packet(j,result));
 return f;
}
function check(name,fn){test(name,{timeout:10000},async t=>{await fn(t);completed.push(name);});}
check('original v0.10 failure reproduced after authentic HTTP completion strips MAC',async t=>{
 const f=await fixture(t,previous);f.during=async j=>assert.equal(await f.complete(j),200);
 const r=await f.read();assert.equal(f.last.status,'complete');assert.equal(f.last.secureMac,undefined);
 assert.equal(r.code,'job_binding_unverified');assert.equal(r.ok,false);
});
check('fixed producer accepts authenticated stripped completion without retaining signer material',async t=>{
 const f=await fixture(t);f.during=async j=>assert.equal(await f.complete(j),200);
 const r=await f.read();assert.equal(r.ok,true);assert.equal(r.currentFrameVerified,false);
 for(const key of ['secureMac','secureNonce','securePayloadDigest'])assert.equal(f.last[key],undefined);
 const later=await f.read({mode:'RESULT'});assert.equal(later.ok,true);assert.equal(later.historical,true);
 assert.equal((await f.read()).code,'already_requested_use_result');assert.equal(f.sent,1);
 for(const key of ['pixelsRead','gestureDispatched','cameraSettingsChanged','automaticZoomEnabled','restoreVerified'])assert.equal(r[key],false);
});
check('bad completion MAC rejected; valid late result reuses the same request',async t=>{
 const f=await fixture(t);f.during=async j=>{const p=f.packet(j);p.headers['x-jh-mac']='0'.repeat(64);assert.equal(await f.post(p),401);};
 assert.equal((await f.read()).code,'result_unconfirmed_use_result');assert.notEqual(f.last.status,'complete');
 assert.equal(await f.complete(f.last),200);assert.equal((await f.read({mode:'RESULT'})).ok,true);assert.equal(f.sent,1);
});
check('body digest tampering cannot produce a camera success',async t=>{
 const f=await fixture(t);f.during=async j=>{const p=f.packet(j);p.body=JSON.stringify({result:{...success,pixelsRead:true}});assert.equal(await f.post(p),401);};
 assert.equal((await f.read()).ok,false);assert.notEqual(f.last.status,'complete');
});
check('replayed completion nonce is rejected by the unchanged original handler',async t=>{
 const f=await fixture(t);let packet;f.during=async j=>{packet=f.packet(j);assert.equal(await f.post(packet),200);};
 assert.equal((await f.read()).ok,true);assert.equal(await f.post(packet),401);assert.equal(f.sent,1);
});
check('wrong session completion is rejected before storing a result',async t=>{
 const f=await fixture(t);f.during=async j=>{const p=f.packet(j);p.headers['x-jh-session']='other_session';assert.equal(await f.post(p),401);};
 assert.equal((await f.read()).ok,false);assert.equal(f.last.result,undefined);
});
check('substituting an equal-looking completed job object is not accepted',async t=>{
 const f=await fixture(t);f.during=async j=>{assert.equal(await f.complete(j),200);f.jobs.set(j.id,{...j});};
 assert.equal((await f.read()).code,'job_binding_unverified');
});
check('unsigned submission stays consumed and cannot use a later fabricated result',async t=>{
 const f=await fixture(t);f.unsigned=true;assert.equal((await f.read()).code,'signed_submission_unverified');
 assert.equal(f.waits,0);f.last.status='complete';f.last.result=success;
 assert.equal((await f.read({mode:'RESULT'})).code,'job_binding_unverified');
 assert.equal((await f.read()).code,'already_requested_use_result');assert.equal(f.sent,1);
});
check('request identity change after signing invalidates the accepted result',async t=>{
 const f=await fixture(t);f.during=async j=>{assert.equal(await f.complete(j),200);j.requestId='1'.repeat(32);};
 assert.equal((await f.read()).code,'job_binding_unverified');
});
check('authentic profile-required result remains unverified and camera controls stay OFF',async t=>{
 const f=await fixture(t);f.during=async j=>assert.equal(await f.complete(j,{...success,ok:false,code:'kabiseo_profile_not_enrolled'}),200);
 const r=await f.read();assert.equal(r.code,'camera_profile_required');assert.equal(r.ok,false);assert.equal(r.automaticZoomEnabled,false);
});
after(()=>{
 const result={schema:'KABISEO_SIGNED_COMPLETION_V011',status:completed.length===10?'PASS':'FAILED',tests:10,passed:completed.length,
  baselineBlob,cryptoSourceSha256:sha(cryptoCode),completionSourceSha256:sha(completion),
  scope:'original signer and original completion block over localhost HTTP; synthetic queue/session bindings',
  fullMcpE2E:false,capabilityNegotiationTested:false,originalHmacGuardsChanged:false,
  productionStartupChanged:false,physicalPhoneCommands:0,apkBuild:'NOT_RUN',checks:completed};
 const dest=required('KABISEO_TRANSPORT_RESULT');mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 console.log('KABISEO_SIGNED_COMPLETION_RESULT='+JSON.stringify(result));
});
