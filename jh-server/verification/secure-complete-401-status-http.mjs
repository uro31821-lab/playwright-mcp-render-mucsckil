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
const summaryProbes=String.raw`
  const summary=await b.call('life_android_complete_401_summary');
  mark('OAuth-authorized diagnostic summary counts real rejected completion responses',
    summary.total>=4&&summary.byReason.job_secure_session_mismatch>=1&&
    summary.byReason.result_body_digest_mismatch>=1&&summary.byReason.completion_nonce_replayed>=1&&
    summary.byReason.completion_signature_mismatch>=1);
  mark('completion summary discloses no sensitive identifiers or claims prior history',
    summary.scope==='current_server_process_only'&&summary.persisted===false&&
    summary.historicalCauseKnown===false&&summary.automaticRetryEnabled===false&&
    !JSON.stringify(summary).includes(B.deviceId)&&!JSON.stringify(summary).includes(B.secureSessionId)&&
    !JSON.stringify(summary).includes(fresh.id));
  const compatible=await b.call('life_status');
  mark('existing life_status includes the same completion401Summary with no new client tool',
    compatible.completion401Summary?.total===summary.total &&
    compatible.completion401Summary?.byReason?.completion_signature_mismatch===summary.byReason.completion_signature_mismatch);
  mark('existing diagnostic response keeps all prior supported fields',
    compatible.version==='1.5.0-fix5-local-prompts'&&compatible.secureBridgeVersion===56&&
    typeof compatible.registeredAndroidDevices==='number'&&typeof compatible.browser==='string');
  mark('existing status summary has no identifiers or historical success claims',
    compatible.completion401Summary?.historicalCauseKnown===false&&
    !JSON.stringify(compatible.completion401Summary).includes(B.deviceId)&&
    !JSON.stringify(compatible.completion401Summary).includes(fresh.id));
  mark('unauthenticated diagnostic MCP request is denied',
    (await b.request('GET','/mcp')).status===401);
`;
replaceOnce("  const genuine={ok:true,url:'synthetic:chrome-opened'};",extra+"\n  const genuine={ok:true,url:'synthetic:chrome-opened'};");
replaceOnce("  const preserved=await b.call('life_job_status',{job_id:fresh.id});",summaryProbes+"\n  const preserved=await b.call('life_job_status',{job_id:fresh.id});");
source=source.replaceAll('JH_DURABLE_NATIVE_INTEGRATION_PASS','JH_COMPAT_STATUS_HTTP_PASS')
 .replaceAll('JH_DURABLE_NATIVE_INTEGRATION_FAIL','JH_COMPAT_STATUS_HTTP_FAIL');
writeFileSync(generated,source,{mode:0o600});
try{
 const p=spawnSync(process.execPath,[fileURLToPath(generated)],{
   cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:100000,maxBuffer:4*1024*1024});
 if(p.stdout)process.stdout.write(p.stdout);
 if(p.stderr)process.stderr.write(p.stderr);
 assert.equal(p.status,0,'real signed HTTP/MCP completion audit scenario failed');
}finally{rmSync(generated,{force:true})}
