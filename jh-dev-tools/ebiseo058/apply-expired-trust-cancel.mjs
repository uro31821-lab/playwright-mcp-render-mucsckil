import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const ROOT=path.resolve(import.meta.dirname,'../..');
const SERVICE=path.join(ROOT,'jh-server/owner-setup/owner-enrollment/owner-registry-service.mjs');
const TEST=path.join(ROOT,'jh-server/owner-setup/owner-enrollment/permanent-trust-revocation.test.mjs');
const fail=code=>{throw Error(code);};
const text=file=>readFileSync(file,'utf8');
const replaceOne=(source,before,after,code)=>{
 if(source.split(before).length!==2||source.includes(after))fail(code);
 return source.replace(before,after);
};
const OLD=`        const n=time(),retentionEnd=r.manifest.durationDays===0?PERMANENT_TRUST_EXPIRES_AT:r.manifest.issuedAtMs+31*86400000;\n        if(n<r.manifest.issuedAtMs||n>retentionEnd)deny('outcome_retention_expired');`;
const NEW=`        const n=time();\n        // Status/cancel proof remains available for a durable registration after\n        // finite trust expiry. This cannot renew trust, issue a session or grant\n        // an action; it only permits device-key-signed observation/revocation.\n        const durableOutcome=r.receipt!=null||['APPLIED','APPLYING','CANCEL_PENDING','CANCELED'].includes(r.state);\n        const retentionEnd=r.manifest.durationDays===0||durableOutcome?PERMANENT_TRUST_EXPIRES_AT:r.manifest.issuedAtMs+31*86400000;\n        if(n<r.manifest.issuedAtMs||n>retentionEnd)deny('outcome_retention_expired');`;
const MARKER=`test('expired finite trust remains signed-readable and explicitly revocable without renewal'`;
const TEST_BLOCK=`\n\ntest('expired finite trust remains signed-readable and explicitly revocable without renewal',async t=>{\n  const f=context(t);\n  const begin=f.service.begin({publicKeySpki:f.spki,deviceDigest:f.deviceDigest,durationDays:30});\n  await f.service.finish(f.make(begin));\n  f.advance(days(400));\n  const observed=await f.service.status(f.proof(begin,STATUS_PURPOSE));\n  assert.equal(observed.code,'TRUST_EXPIRED');\n  assert.equal(observed.trustRegistered,false);\n  assert.equal(observed.sessionActive,false);\n  const canceled=await f.service.cancel(f.proof(begin,CANCEL_PURPOSE));\n  assert.equal(canceled.code,'ENROLLMENT_CANCELED');\n  assert.equal(canceled.complete,true);\n  assert.equal(canceled.serverRecordRevoked,true);\n  assert.equal(canceled.activeSessionsRevoked,true);\n  assert.equal(canceled.pendingJobsRevoked,true);\n});\n`;
function verify(){
 const service=text(SERVICE),test=text(TEST);
 if(!service.includes(NEW)||service.includes(OLD))fail('SERVICE_PATCH_NOT_EXACT');
 if(!test.includes(MARKER))fail('EXPIRED_TRUST_TEST_MISSING');
 const out=execFileSync(process.execPath,['--test','--test-reporter=spec',TEST],{cwd:ROOT,encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024});
 if(!/fail 0/.test(out))fail('SERVER_TESTS_NOT_GREEN');
 return {serverTests:'PASS',automaticReplayAllowed:false,trustRenewed:false};
}
function write(){
 let service=text(SERVICE);
 service=replaceOne(service,OLD,NEW,'SERVICE_RETENTION_ANCHOR_CHANGED');
 writeFileSync(SERVICE,service);
 let test=text(TEST);
 if(test.includes(MARKER))fail('TEST_ALREADY_PRESENT');
 test+=TEST_BLOCK;
 writeFileSync(TEST,test);
 return verify();
}
const mode=process.argv[2];
if(mode==='--write')console.log('JH_EBISEO058_SERVER_PATCH_WRITTEN '+JSON.stringify(write()));
else if(mode==='--check')console.log('JH_EBISEO058_SERVER_PATCH_PASS '+JSON.stringify(verify()));
else fail('USAGE: --write | --check');
