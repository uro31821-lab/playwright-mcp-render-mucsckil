/** Test actual authenticated HTTP/MCP with synthetic Android and deliberately invalid completion headers. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const file=new URL('./durable-native-integration.mjs',import.meta.url);
const generated=new URL('./secure-complete-401-audit.generated.mjs',import.meta.url);
let source=readFileSync(file,'utf8');
const blob=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(blob,'0418ab5bb54b2634adb87a307f694aa128710455','unchanged signed Secure56 harness');
function replaceOnce(before,after){
 assert.equal(source.split(before).length,2,'pinned signed HTTP test anchor');
 source=source.replace(before,after);
}
replaceOnce('  return{p,call,enroll,poll,take,complete};',
 '  return{p,call,enroll,poll,take,complete,request,logs:()=>logs};');
replaceOnce("  mark('old signed completion cannot clear a new job with reused ID',(await b.complete(A,sent)).status===401);",
 "  mark('old signed completion cannot clear a new job with reused ID',(await b.complete(A,sent)).status===401);\n"+
 "  await delay(30);\n"+
 "  mark('old Secure session denial is categorized without disclosing request values',b.logs().includes('job_secure_session_mismatch'));\n");
const extra="\n  await delay(30);\n  mark('bad signed MAC has fixed completion audit reason',b.logs().includes('\"reason\":\"completion_signature_mismatch\"'));\n  const validBody={result:{ok:true,url:'synthetic:chrome-opened'}};\n  const nonceForDigest=nonce(),untilDigest=Date.now()+30000,incorrectDigest='0'.repeat(64);\n  const badDigestHeaders={\n   'x-jh-session':B.secureSessionId,'x-jh-device':B.deviceDigest,\n   'x-jh-nonce':nonceForDigest,'x-jh-expires':String(untilDigest),\n   'x-jh-result-digest':incorrectDigest,\n   'x-jh-mac':mac(B.secureSessionSecret,'complete|'+B.secureSessionId+'|'+fresh.id+'|'+B.deviceDigest+'|'+nonceForDigest+'|'+untilDigest+'|'+incorrectDigest)\n  };\n  mark('incorrect completion body digest is still rejected',(await b.request('POST','/job/'+fresh.id+'/complete',validBody,badDigestHeaders)).status===401);\n  await delay(30);\n  mark('incorrect result digest has a bounded reason code',b.logs().includes('\"reason\":\"result_body_digest_mismatch\"'));\n  const originalDigest=sha(JSON.stringify(validBody)),replayNonce=nonce(),replayUntil=Date.now()+30000;\n  const replayHeaders={\n   'x-jh-session':B.secureSessionId,'x-jh-device':B.deviceDigest,\n   'x-jh-nonce':replayNonce,'x-jh-expires':String(replayUntil),\n   'x-jh-result-digest':originalDigest,\n   'x-jh-mac':mac(B.secureSessionSecret,'complete|'+B.secureSessionId+'|'+fresh.id+'|'+B.deviceDigest+'|'+replayNonce+'|'+replayUntil+'|'+originalDigest)\n  };\n  mark('first exactly signed completion is accepted',(await b.request('POST','/job/'+fresh.id+'/complete',validBody,replayHeaders)).status===200);\n  mark('identical old nonce is still rejected',(await b.request('POST','/job/'+fresh.id+'/complete',validBody,replayHeaders)).status===401);\n  await delay(30);\n  mark('duplicate nonce failure has specific redacted reason',b.logs().includes('\"reason\":\"completion_nonce_replayed\"'));\n  const auditLines=b.logs().split('\\n').filter(line=>line.startsWith('JH_COMPLETE_AUTH_REJECT '));\n  mark('rejection logs omit all device/job IDs, raw session/MAC/nonce',auditLines.length>=4 &&\n   auditLines.every(line=>!line.includes(B.deviceId)&&!line.includes(B.secureSessionId)&&\n      !line.includes(fresh.id)&&!line.includes(replayNonce)&&!line.includes(B.secureSessionSecret)));\n  mark('every diagnostic log record uses fixed safe fields',auditLines.every(line=>{\n    try{const o=JSON.parse(line.slice('JH_COMPLETE_AUTH_REJECT '.length));\n      return Object.keys(o).sort().join('|')==='atUtc|event|reason|schema|suppressedSinceLastRecord';\n    }catch{return false}\n  }));\n";
replaceOnce("  const genuine={ok:true,url:'synthetic:chrome-opened'};",extra+"\n  const genuine={ok:true,url:'synthetic:chrome-opened'};");
source=source.replaceAll('JH_DURABLE_NATIVE_INTEGRATION_PASS','JH_COMPLETE_401_HTTP_AUDIT_PASS')
 .replaceAll('JH_DURABLE_NATIVE_INTEGRATION_FAIL','JH_COMPLETE_401_HTTP_AUDIT_FAIL');
writeFileSync(generated,source,{mode:0o600});
try{
 const p=spawnSync(process.execPath,[fileURLToPath(generated)],{
   cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:100000,maxBuffer:4*1024*1024});
 if(p.stdout)process.stdout.write(p.stdout);
 if(p.stderr)process.stderr.write(p.stderr);
 assert.equal(p.status,0,'real signed HTTP/MCP completion audit scenario failed');
}finally{rmSync(generated,{force:true})}
