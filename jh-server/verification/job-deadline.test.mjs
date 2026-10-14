import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const oldSource=readFileSync(path.join(root,'verification-output/original/server.mjs'),'utf8');
const newSource=readFileSync(path.join(root,'verification-output/candidate/server.mjs'),'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
const hmac=(k,x)=>createHmac('sha256',k).update(x).digest('hex');
assert.equal(sha(newSource),'952390b3d78547cc694566745f4aa4d5e4ad90d6c1fa35a156037cb50ce9f435');
function signer(source){
 const start=source.indexOf('function signJob56('),end=source.indexOf('\nfunction safeJobView56(',start);
 assert.ok(start>=0&&end>start);return source.slice(start,end);
}
const before=signer(oldSource),after=signer(newSource);
const original='expiresAt=Date.now()+SECURE56_JOB_MS';
const clipped='expiresAt=Math.min(a.expiresAt,Date.now()+SECURE56_JOB_MS)';
assert.equal(after.replace(clipped,original),before,'exact one-expression signer change');
const now=1_000_000;
function invoke(fn,remaining){
 const a={sessionId:'synthetic-session',deviceDigest:sha('synthetic-device'),secret:Buffer.alloc(32,7),expiresAt:now+remaining};
 const beforeState=JSON.stringify(a);
 const ctx={Date:{now:()=>now},Math,SECURE56_JOB_MS:45000,active56:()=>remaining<0?null:a,token56:()=> 'synthetic-once-nonce',payloadDigest56:()=>sha('{}'),hmac56:hmac};
 vm.createContext(ctx);vm.runInContext(fn,ctx);
 const j=ctx.signJob56({id:'synthetic-job',type:'secure_device_status',targetDeviceId:'synthetic-device'},{});
 assert.equal(JSON.stringify(a),beforeState,'signer may not extend or mutate session');
 return {job:j,active:a};
}
const vectors=[];
for(const remaining of [1800000,120000,60000,45001,45000,44999,44000,30000,10000,1000,1,0,-1]){
 test('signed job deadline with remainingMs='+remaining,()=>{
  const old=invoke(before,remaining),fresh=invoke(after,remaining),j=fresh.job,a=fresh.active;
  if(remaining<0){assert.equal(j.secureMac,undefined);assert.equal(old.job.secureMac,undefined);return;}
  const expected=Math.min(a.expiresAt,now+45000);
  assert.equal(j.secureExpiresAt,expected);assert.ok(j.secureExpiresAt<=a.expiresAt);assert.ok(j.secureExpiresAt<=now+45000);
  assert.equal(j.secureMac,hmac(a.secret,`${a.sessionId}|${j.id}|${j.type}|${j.secureNonce}|${j.secureExpiresAt}|${j.securePayloadDigest}`));
  if(remaining>=45000)assert.equal(JSON.stringify(j),JSON.stringify(old.job));
  else assert.ok(old.job.secureExpiresAt>a.expiresAt,'old boundary failure reproduced');
  vectors.push({remainingMs:remaining,sessionExpiry:a.expiresAt,originalJobExpiry:old.job.secureExpiresAt,candidateJobExpiry:j.secureExpiresAt,passed:true});
 });
}
test('deadline changes remain authenticated',()=>{
 const {job:j,active:a}=invoke(after,10000);
 const changed=hmac(a.secret,`${a.sessionId}|${j.id}|${j.type}|${j.secureNonce}|${j.secureExpiresAt+1}|${j.securePayloadDigest}`);
 assert.notEqual(changed,j.secureMac);
});
test('session lifetime and local approval code are not changed',()=>{
 assert.match(newSource,/const SECURE56_SESSION_MS=30\*60\*1000;/);
 assert.ok(!after.includes('approve'));assert.ok(!after.includes('grantToken'));
 assert.equal(after.replace(clipped,original),before);
});
test('write bounded evidence without fixture credentials',()=>{
 assert.equal(vectors.length,12);
 writeFileSync(path.join(root,'verification-output/job-deadline-results.json'),JSON.stringify({scope:'Exact server signer in Node VM with synthetic sessions; not a phone test',candidateSha256:sha(newSource),sessionLifetimeChanged:false,authenticationAcceptanceRulesChanged:false,vectors},null,2));
});
