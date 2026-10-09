/** Actual sealed HTTP + MCP handlers, SQLite and cryptography; synthetic phone. */
import {before,after,test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {once} from 'node:events';
import {randomBytes,generateKeyPairSync,sign,createHmac} from 'node:crypto';
import {TrustedDeviceRegistry,sha256,canonicalChallenge} from './trusted-device-registry.mjs';
import {activationMaterial} from './trusted-bridge-session-authority.mjs';
import {installCompletionObserver} from './completion-observer.mjs';
process.env.JH_OWNER_DEFER_LISTEN='1';process.env.PUBLIC_BASE_URL='https://jh-secure-bridge-fix4.onrender.com';process.env.LIFE_HUB_TOKEN=randomBytes(32).toString('base64url');
let runtime,registry,authority,observer,origin,dir,p,seq=0;const ctx={},errors=[];
const tok=()=>randomBytes(24).toString('base64url'),h=(key,msg)=>createHmac('sha256',key).update(msg).digest('hex');
async function request(path,body,headers={}){
 const r=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
 const text=await r.text();let value;try{value=JSON.parse(text)}catch{value=text}return {status:r.status,value};
}
function headers(action,jobId,body){
 const nonce=tok(),exp=Date.now()+20000,sid=p.o.secureSessionId,dev=p.o.deviceDigest;
 const out={'x-jh-session':sid,'x-jh-device':dev,'x-jh-nonce':nonce,'x-jh-expires':String(exp)};
 let material=`poll|${sid}|${dev}|${nonce}|${exp}`;
 if(action==='complete'){out['x-jh-result-digest']=sha256(JSON.stringify(body));material=`complete|${sid}|${jobId}|${dev}|${nonce}|${exp}|${out['x-jh-result-digest']}`;}
 out['x-jh-mac']=h(Buffer.from(p.o.secureSessionSecret,'base64url'),material);return out;
}
before(async()=>{
 runtime=await import('../server-integration/server.mjs');
 dir=mkdtempSync(join(tmpdir(),'jh-receipt-http-'));
 registry=new TrustedDeviceRegistry({databasePath:join(dir,'registry.db'),serverDigest:sha256(process.env.PUBLIC_BASE_URL+'/mcp|jh-secure-bridge56'),catalogDigest:'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1',authorizeEnrollment:(c,e)=>c===ctx?{ownerDigest:sha256('synthetic owner'),enrollmentId:e.consentRequestId,expiresAt:Date.now()+30000,exactConsentDigest:sha256(JSON.stringify(e))}:null,authorizeRevocation:()=>null});
 authority=runtime.installTrustedSessionRegistry56(registry);observer=installCompletionObserver(runtime.httpServer,authority,x=>errors.push(x));
 runtime.httpServer.listen(0,'127.0.0.1');await once(runtime.httpServer,'listening');origin='http://127.0.0.1:'+runtime.httpServer.address().port;
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),d=tok();
 const trust=registry.enroll({publicKeySpki:key.publicKey.export({format:'der',type:'spki'}).toString('base64url'),deviceDigest:sha256('jh56|'+d),requestedTrustMs:86400000,consentRequestId:tok()},ctx);
 const c=(await request('/device/trusted/challenge',{trustId:trust.trustId,clientNonce:tok(),deviceId:d})).value;
 const proof={challenge:c,signature:sign('sha256',canonicalChallenge(c),key.privateKey).toString('base64url')};
 const reply=await request('/device/trusted/reconnect',{deviceId:d,proof});assert.equal(reply.status,200);p={d,o:reply.value,trust,key};
 const a={deviceId:d,trustId:p.o.trustId,challengeId:p.o.challengeId,redemptionId:p.o.redemptionId,sessionId:p.o.secureSessionId,deviceDigest:p.o.deviceDigest,sessionDigest:p.o.sessionDigest,nonce:tok(),expiresAt:Math.min(Date.now()+10000,p.o.activationExpiresAt)};
 a.mac=h(Buffer.from(p.o.secureSessionSecret,'base64url'),activationMaterial(a));assert.equal((await request('/device/trusted/activate',a)).status,200);
});
after(async()=>{observer?.close();runtime?.httpServer.closeAllConnections();await new Promise(r=>runtime.httpServer.close(r));registry?.close();rmSync(dir,{recursive:true,force:true})});
async function startJob(name,args){
 const waiting=request('/mcp',{jsonrpc:'2.0',id:++seq,method:'tools/call',params:{name,arguments:args}},{authorization:'Bearer '+process.env.LIFE_HUB_TOKEN,accept:'application/json, text/event-stream'});
 let job;
 for(let i=0;i<30;i++){const poll=await request('/device/poll?deviceId='+p.d,undefined,headers('poll'));if(poll.status===200){job=poll.value;break;}assert.equal(poll.status,204);await new Promise(r=>setTimeout(r,20));}
 assert.ok(job,'job must be dispatched');return {job,waiting};
}
test('native read-only snapshot never becomes unresolved',async()=>{
 const {job,waiting}=await startJob('life_android_snapshot',{});assert.equal(job.type,'agent_snapshot');assert.equal(registry.uncertainDispatchCount(p.trust.trustId,registry.issuerContext),0);
 const body={result:{ok:true,url:'synthetic native snapshot'}};
 assert.equal((await request('/job/'+job.id+'/complete',body,headers('complete',job.id,body))).status,200);assert.equal((await waiting).status,200);assert.equal(errors.length,0);
});
test('unauthenticated completion cannot account for mutation; authenticated error result can',async()=>{
 const {job,waiting}=await startJob('life_android_step',{action:'click',text:'synthetic test control'});
 assert.equal(registry.uncertainDispatchCount(p.trust.trustId,registry.issuerContext),1);
 const body={result:{ok:false,url:'synthetic not_found'}};
 assert.equal((await request('/job/'+job.id+'/complete',body)).status,401);assert.equal(registry.uncertainDispatchCount(p.trust.trustId,registry.issuerContext),1);
 const signed=headers('complete',job.id,body);
 assert.equal((await request('/job/'+job.id+'/complete',body,signed)).status,200);assert.equal((await waiting).status,200);
 assert.equal(registry.uncertainDispatchCount(p.trust.trustId,registry.issuerContext),0);
 assert.equal((await request('/job/'+job.id+'/complete',body,signed)).status,401);assert.equal(errors.length,0);
});
test('receipt persistence failure leaves pending and does not break active poll',async()=>{
 const {job,waiting}=await startJob('life_android_step',{action:'click',text:'different synthetic control'});
 const old=registry.recordDeviceResult;registry.recordDeviceResult=()=>{throw Error('synthetic disk failure')};
 try{const body={result:{ok:true,url:'synthetic clicked'}};assert.equal((await request('/job/'+job.id+'/complete',body,headers('complete',job.id,body))).status,200);await waiting;assert.equal(registry.uncertainDispatchCount(p.trust.trustId,registry.issuerContext),1);assert.equal((await request('/device/poll?deviceId='+p.d,undefined,headers('poll'))).status,204);assert.equal(errors.length,1);}
 finally{registry.recordDeviceResult=old;}
});
