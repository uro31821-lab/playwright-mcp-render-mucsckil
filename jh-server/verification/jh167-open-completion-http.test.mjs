/** Real generated production routes, cryptography and SQLite; synthetic phone only. */
import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {randomBytes,generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {TrustedDeviceRegistry,sha256,canonicalChallenge} from '../owner-setup/trusted-server/trusted-device-registry.mjs';
import {activationMaterial,receiptMaterial} from '../owner-setup/trusted-server/trusted-bridge-session-authority.mjs';
import {buildCleanRestartRelease56} from '../owner-setup/deployment/durable-clean-restart-news-review-entry.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'jh-process-route-'));
const owner=sha256('synthetic owner'),d='synthetic-process-device',epoch='synthetic-android-process-001';
const tok=()=>randomBytes(24).toString('base64url'),h=(k,m)=>createHmac('sha256',k).update(m).digest('hex');
process.env.JH_CONNECTION_V2_RECOVERY='0';process.env.JH_OWNER_DEFER_LISTEN='1';process.env.PUBLIC_BASE_URL='https://jh-secure-bridge-fix4.onrender.com';
process.env.LIFE_HUB_TOKEN=tok();process.env.JH_OPERATIONAL_ACCOUNT_DIGEST=owner;
process.env.JH_OAUTH_STATE_FILE=path.join(dir,'oauth.json');
let runtime,registry,circuit,origin,offer,commandId,seq=0;
async function request(p,b,headers={}){
 const r=await fetch(origin+p,{method:b===undefined?'GET':'POST',headers:{...(b===undefined?{}:{'content-type':'application/json'}),...headers},body:b===undefined?undefined:JSON.stringify(b),signal:AbortSignal.timeout(55000)});
 const text=await r.text();let value;try{value=JSON.parse(text)}catch{value=text}return {status:r.status,value};
}
async function call(name,args={}){
 const r=await request('/mcp',{jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:{...args,...(commandId?{command_id:commandId}:{})}}},{authorization:'Bearer '+process.env.LIFE_HUB_TOKEN,accept:'application/json, text/event-stream'});
 assert.equal(r.status,200);assert.ok(r.value.result?.content,JSON.stringify(r.value));
 return JSON.parse(r.value.result.content.find(x=>x.type==='text').text);
}
function signedHeaders(action,jobId,body){
 const nonce=tok(),exp=Date.now()+20000,sid=offer.secureSessionId,dev=offer.deviceDigest;
 const headers={'x-jh-session':sid,'x-jh-device':dev,'x-jh-nonce':nonce,'x-jh-expires':String(exp)};
 let material=`poll|${sid}|${dev}|${nonce}|${exp}`;
 if(action==='complete'){headers['x-jh-result-digest']=sha256(JSON.stringify(body));material=`complete|${sid}|${jobId}|${dev}|${nonce}|${exp}|${headers['x-jh-result-digest']}`;}
 headers['x-jh-mac']=h(Buffer.from(offer.secureSessionSecret,'base64url'),material);return headers;
}
before(async()=>{
 const generated=buildCleanRestartRelease56();const builder=await import(generated.file);
 const built=builder.buildDurableRoutedRuntime(path.resolve(import.meta.dirname,'../owner-setup'));
 runtime=await import(built.file);
 const ctx={};registry=new TrustedDeviceRegistry({databasePath:path.join(dir,'registry.db'),serverDigest:sha256(process.env.PUBLIC_BASE_URL+'/mcp|jh-secure-bridge56'),catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',authorizeEnrollment:(c,e)=>c===ctx?{ownerDigest:owner,enrollmentId:e.consentRequestId,expiresAt:Date.now()+30000,exactConsentDigest:sha256(JSON.stringify(e))}:null,authorizeRevocation:()=>null});
 runtime.installTrustedSessionRegistry56(registry);
 circuit=runtime.installDurableNativeCircuit56({file:path.join(dir,'circuit.db'),key:Buffer.alloc(32,17),namespace:sha256('synthetic circuit'),mode:'EXPLICIT_ONE_TIME'});
 runtime.httpServer.listen(0,'127.0.0.1');await once(runtime.httpServer,'listening');origin='http://127.0.0.1:'+runtime.httpServer.address().port;
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const trust=registry.enroll({publicKeySpki:key.publicKey.export({format:'der',type:'spki'}).toString('base64url'),deviceDigest:sha256('jh56|'+d),requestedTrustMs:86400000,consentRequestId:tok()},ctx);
 const c=(await request('/device/trusted/challenge',{trustId:trust.trustId,clientNonce:tok(),deviceId:d})).value;
 const proof={challenge:c,signature:sign('sha256',canonicalChallenge(c),key.privateKey).toString('base64url')};
 const reply=await request('/device/trusted/reconnect',{deviceId:d,proof});assert.equal(reply.status,200);offer=reply.value;
 const a={deviceId:d,trustId:offer.trustId,challengeId:offer.challengeId,redemptionId:offer.redemptionId,sessionId:offer.secureSessionId,deviceDigest:offer.deviceDigest,sessionDigest:offer.sessionDigest,nonce:tok(),expiresAt:Math.min(Date.now()+10000,offer.activationExpiresAt),processEpoch:epoch,restartDisposition:'DISCARD_PREVIOUS'};
 a.mac=h(Buffer.from(offer.secureSessionSecret,'base64url'),activationMaterial(a));
 const active=await request('/device/trusted/activate',a);assert.equal(active.status,200);assert.equal(active.value.version,2);
 assert.equal(active.value.mac,h(Buffer.from(offer.secureSessionSecret,'base64url'),receiptMaterial(active.value)));
 const begin=await call('life_android_workflow_link',{mode:'BEGIN_COMMAND',request_id:randomBytes(16).toString('hex')});
 commandId=begin.commandId??begin.command_id;assert.ok(commandId,JSON.stringify(begin));
});
after(async()=>{runtime?.httpServer.closeAllConnections();if(runtime?.httpServer.listening)await new Promise(r=>runtime.httpServer.close(r));circuit?.close();registry?.close();rmSync(dir,{recursive:true,force:true})});

test('real signed HTTP completion after 23 seconds reaches MCP, status does not reopen',{timeout:50000},async()=>{
 const waiting=call('life_open_service',{service:'유튜브'});waiting.catch(()=>{});let job;
 for(let i=0;i<60;i++){
  const poll=await request('/device/poll?deviceId='+d,undefined,signedHeaders('poll'));
  if(poll.status===200){job=poll.value;break;}
  assert.equal(poll.status,204,JSON.stringify(poll));await new Promise(r=>setTimeout(r,20));
 }
 assert.equal(job?.type,'open_url');assert.equal(job.target,'right_web_link');
 assert.equal(job.commandId,commandId);assert.equal(new URL(job.url).href,'https://www.youtube.com/');
 // Use real time past the old budget, and the actual signed completion endpoint.
 await new Promise(r=>setTimeout(r,23000));
 const now=Date.now();
 const body={result:{ok:true,url:job.url,rightAddressConfirmed:true,pageContentVerified:false,
  splitScreenRequired:true,splitScreen:{kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
   chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'1',chatBounds:'0,0,500,900',
   workPackage:'com.android.chrome',workWindowId:'2',workBounds:'510,0,1000,900',observedAtMs:String(now)}}};
 const rejected={...signedHeaders('complete',job.id,body),'x-jh-mac':'0'.repeat(64)};
 assert.equal((await request('/job/'+job.id+'/complete',body,rejected)).status,401);
 assert.equal((await request('/job/'+job.id+'/complete',body,signedHeaders('complete',job.id,body))).status,200);
 const result=await waiting;
 assert.equal(result.jobId,job.id);assert.equal(result.completionReceived,true,JSON.stringify(result));
 assert.equal(result.actionSucceeded,true);assert.equal(result.pageContentVerified,false);
 const status=await call('life_job_status',{job_id:job.id});
 assert.equal(status.status,'complete');assert.equal(status.rightAddressConfirmed,true);
 assert.equal(status.deviceReportedOutcome,'DEVICE_REPORTED_OK_UNVERIFIED');
 const empty=await request('/device/poll?deviceId='+d,undefined,signedHeaders('poll'));
 assert.equal(empty.status,204,'status must not dispatch another open');
});
