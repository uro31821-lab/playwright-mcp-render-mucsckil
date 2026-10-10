/** Runs the existing signed Secure56 integration harness with extra Computer Use cases.
 * Temporary generated test only; no operational entrypoint, device, or stored owner changes.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const baseline=new URL('./durable-native-integration.mjs',import.meta.url);
const generated=new URL('./durable-computer-http.generated.mjs',import.meta.url);
const source=readFileSync(baseline,'utf8');
const blob=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(blob,'0418ab5bb54b2634adb87a307f694aa128710455','pinned previous HTTP harness');
const anchor='  const prior=counts();const observed=await screen(b,B);';
assert.equal(source.split(anchor).length,2);
const extra=`
  // The phone is synthetic. These checks prove routing and durable behavior, not phone consent.
  const cu={device_id:B.deviceId,task_digest:sha('synthetic-cu-task'),action:'TYPE',viewport_width:1000,viewport_height:1800,x:100,y:200,effect:'REVERSIBLE_WRITE',data_class:'NON_SENSITIVE'};
  const beforeCu=counts();
  const planned=b.call('life_android_computer_prepare',cu),prepareJob=await b.take(B);
  mark('Computer Use preparation keeps signed exact read-only request',prepareJob.type==='computer_use_action_prepare'&&prepareJob.secureRequestedEffect==='READ_ONLY');
  assert.equal((await b.complete(B,prepareJob,{ok:false,code:'APPROVAL_REQUIRED'})).status,200);
  const preparation=await planned;
  mark('phone approval-required response is not converted to approval',preparation.result.ok===false&&preparation.result.code==='APPROVAL_REQUIRED'&&counts().uncertain===beforeCu.uncertain);
  const permit=b.call('life_android_action_approval_request',cu),permitJob=await b.take(B);
  mark('local action approval request passes without creating business-action journal entry',permitJob.type==='computer_use_action_approval_request'&&counts().uncertain===beforeCu.uncertain);
  assert.equal((await b.complete(B,permitJob,{ok:false,code:'LOCAL_APPROVAL_PENDING'})).status,200);await permit;
  const consent=b.call('life_android_screen_consent_request',{device_id:B.deviceId,task_digest:cu.task_digest,run_digest:sha('synthetic-run')}),consentJob=await b.take(B);
  mark('screen-sharing consent request remains a phone prompt, not a grant',consentJob.type==='computer_use_screen_consent_request'&&counts().uncertain===beforeCu.uncertain);
  assert.equal((await b.complete(B,consentJob,{ok:false,code:'SCREENSHOT_CONSENT_REQUIRED'})).status,200);await consent;
  const waited=b.call('life_android_execute_computer_action',{...cu,action:'WAIT',wait_ms:100,effect:'READ_ONLY',lease_token:'SYNTHETIC_WAIT_LEASE'}),waitJob=await b.take(B);
  mark('WAIT execution preserves original lease and does not record a mutation',waitJob.type==='computer_use_action_execute'&&waitJob.leaseToken==='SYNTHETIC_WAIT_LEASE'&&counts().uncertain===beforeCu.uncertain);
  assert.equal((await b.complete(B,waitJob,{ok:true,code:'wait_completed',resultVerified:false})).status,200);await waited;
  const typeArgs={...cu,text_digest:sha('SYNTHETIC_CU_PRIVATE_TEXT'),text_value:'SYNTHETIC_CU_PRIVATE_TEXT',lease_token:'SYNTHETIC_LEASE_ONE',action_approval_grant_token:'SYNTHETIC_GRANT_ONE'};
  const typed=b.call('life_android_execute_computer_action',typeArgs),typeJob=await b.take(B);
  mark('Computer Use TYPE is recorded before dispatch with original grant intact',typeJob.type==='computer_use_action_execute'&&typeJob.textValue===typeArgs.text_value&&typeJob.actionApprovalGrantToken===typeArgs.action_approval_grant_token&&counts().uncertain===beforeCu.uncertain+1);
  const duplicated=b.call('life_android_execute_computer_action',{...typeArgs,task_digest:sha('fresh-task'),lease_token:'SYNTHETIC_LEASE_TWO',action_approval_grant_token:'SYNTHETIC_GRANT_TWO'});
  let rejected=null;for(let i=0;i<100;i++){const r=await b.poll(B);if(r.status!==204){rejected=r;break}await delay(25)}
  mark('new lease or task cannot bypass an unknown identical Computer Use action',rejected?.status===409&&rejected.data.code==='DURABLE_PREVIOUS_OUTCOME_UNKNOWN');
  const duplicateResult=await duplicated;
  mark('denied duplicate is not reported as completed execution',duplicateResult.status==='error');
  mark('bad signed Computer Use result cannot clear durable uncertainty',(await b.complete(B,typeJob,{ok:true,code:'synthetic_type'},true)).status===401&&counts().uncertain===beforeCu.uncertain+1);
  assert.equal((await b.complete(B,typeJob,{ok:true,code:'synthetic_type'})).status,200);
  const typeResult=await typed;
  mark('correctly authenticated Computer Use reply records transport outcome only',typeResult.status==='complete'&&typeResult.result.ok===true&&counts().uncertain===beforeCu.uncertain);
  const secret=await b.call('life_android_execute_computer_action',{...typeArgs,data_class:'SECRET'});
  mark('SECRET input remains blocked by original MCP envelope before any dispatch',secret.ok===false&&secret.code==='credential_class_never_crosses_secure_bridge'&&(await b.poll(B)).status===204);
  // Real MCP + signed Android poll/complete: emulate the delayed foreground accessibility update seen on FIX10.
  const slowIntegrated=b.call('life_android_open_and_snapshot',{target:'카카오T'});
  const slowAction=await b.take(B);
  mark('delayed readback opens the native target only once',slowAction.type==='open_url'&&slowAction.target==='카카오T');
  assert.equal((await b.complete(B,slowAction,{ok:true,url:'app:카카오T'})).status,200);
  const slowRead=await b.take(B);
  mark('delayed readback has exactly one queued native snapshot',slowRead.type==='agent_snapshot');
  await delay(14500);
  assert.equal((await b.complete(B,slowRead,{ok:true,url:JSON.stringify([{package:'com.kakao.taxi',className:'android.view.View',text:'synthetic slow foreground'}])})).status,200);
  const observedSlow=await slowIntegrated;
  mark('14.5-second real signed reply completes inside the expanded 20-second budget',
     observedSlow.readback?.ready===true&&observedSlow.readback?.targetMatched===true&&observedSlow.snapshot?.status==='complete');
  mark('delayed readback never replays app action or invents business completion',
     observedSlow.readback.actionReplayCount===0&&observedSlow.readback.taskSuccessVerified===false);
  mark('no pending repeated Android job follows accepted delayed readback',(await b.poll(B)).status===204);
  const cuBytes=[file,file+'-wal'].filter(existsSync).map(f=>readFileSync(f));
  mark('Computer Use text, grant and lease do not appear in durable storage',cuBytes.every(v=>!v.includes('SYNTHETIC_CU_PRIVATE_TEXT')&&!v.includes('SYNTHETIC_GRANT_ONE')&&!v.includes('SYNTHETIC_LEASE_ONE')));
`;
const expanded=source.replace(anchor,extra+anchor).replaceAll('JH_DURABLE_NATIVE_INTEGRATION_PASS','JH_DURABLE_COMPUTER_INTEGRATION_PASS').replaceAll('JH_DURABLE_NATIVE_INTEGRATION_FAIL','JH_DURABLE_COMPUTER_INTEGRATION_FAIL');
writeFileSync(generated,expanded,{mode:0o600});
try{
 const p=spawnSync(process.execPath,[fileURLToPath(generated)],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:160000,maxBuffer:4*1024*1024});
 if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);
 assert.equal(p.status,0,'extended signed HTTP test failed');
}finally{rmSync(generated,{force:true})}
