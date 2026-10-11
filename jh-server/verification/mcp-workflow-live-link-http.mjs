/** Release check for the already-built v141 workflow adapter, not a new engine.
 * Reuses the existing signed Secure56 HTTP test transport. Synthetic device only.
 */
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const input=new URL('./durable-native-integration.mjs',import.meta.url);
const output=new URL('./mcp-workflow-live-link-http.generated.mjs',import.meta.url);
let s=readFileSync(input,'utf8');
const blob=createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
if(blob!=='0418ab5bb54b2634adb87a307f694aa128710455')throw Error('MCP_WORKFLOW_HARNESS_CHANGED');
const anchor=' try{\n  build=buildDurableNativeRuntime(ROOT);';
if(s.split(anchor).length!==2)throw Error('MCP_WORKFLOW_BODY_ANCHOR');
s=s.slice(0,s.indexOf(anchor));
const before="import {buildDurableNativeRuntime} from '../owner-setup/deployment/durable-native-runtime-candidate.mjs';";
if(s.split(before).length!==2)throw Error('MCP_WORKFLOW_IMPORT_ANCHOR');
s=s.replace(before,"import {buildDurableRoutedRuntime,buildDurableRoutedOperationalEntrypoint} from '../owner-setup/deployment/durable-live-release.mjs';");
s=s.replace('Synthetic Secure56 device only. Two actual SIGKILL restarts; no live phone or production mount.','Synthetic Secure56 device only; process termination is cleanup, not a restart test.');
s+=String.raw`
 const linked=(j,r)=>({...r,jhMcpWorkflow:{workflowId:j.workflowId,workflowStepId:j.workflowStepId,
  workflowPlanDigest:j.workflowPlanDigest,workflowActionDigest:j.workflowActionDigest,jobId:j.id}});
 const screenPayload=packageName=>({ok:true,url:JSON.stringify([{package:packageName,text:'synthetic',className:'android.view.View'}])});
 try{
  const assembled=buildDurableRoutedOperationalEntrypoint(ROOT);
  build=buildDurableRoutedRuntime(ROOT);
  mark('actual owner-host selected runtime includes packaged workflow tool',assembled.runtimeFile===build.file&&assembled.candidateSha256===build.candidateSha256&&readFileSync(build.file,'utf8').includes("registerOAuthTool('life_android_workflow_link'"));
  const seed=new DurableManualCircuitFence({file,key:KEY,namespace:NS,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});seed.close();
  const h=await start(19611);
  const noDevice=await h.call('life_android_workflow_link',{mode:'BEGIN'});
  mark('workflow BEGIN without active phone cannot dispatch',noDevice.ok===false&&noDevice.code==='active_secure56_device_required');
  const p=await h.enroll('synthetic-workflow-release-01');
  const begin=h.call('life_android_workflow_link',{mode:'BEGIN'});
  const origin=await h.take(p);
  mark('first screen has server-assigned workflow and a signed payload',origin.type==='agent_snapshot'&&/^jh_mcp_[a-f0-9]{32}$/.test(origin.workflowId)&&origin.workflowStepId==='step_0'&&!!origin.secureMac&&!!origin.workflowActionDigest);
  assert.equal((await h.complete(p,origin,linked(origin,screenPayload('com.android.chrome')))).status,200);
  const ready=await begin;
  mark('verified original Chrome screen is bound to step_0',ready.ok===true&&ready.phase==='READY'&&ready.jobs[0].jobId===origin.id);
  const id=ready.workflowId;
  const status=await h.call('life_android_workflow_link',{mode:'STATUS',workflow_id:id});
  mark('new MCP request retains the same workflow without a new job',status.workflowId===id&&status.phase==='READY'&&(await h.poll(p)).status===204);
  const opening=h.call('life_android_workflow_link',{mode:'OPEN_KAKAO_T',workflow_id:id});
  const app=await h.take(p);
  mark('Kakao action preserves workflow/plan with distinct step and job',app.type==='open_url'&&app.target==='카카오T'&&app.workflowId===id&&app.workflowPlanDigest===ready.planDigest&&app.workflowStepId==='step_1'&&app.id!==origin.id);
  const bad=await h.complete(p,app,linked(app,{ok:true}),true);
  mark('invalid completion signature is rejected before phase advancement',bad.status===401);
  assert.equal((await h.complete(p,app,linked(app,{ok:true,packageName:'com.kakao.taxi'}))).status,200);
  const destination=await h.take(p);
  assert.equal(destination.workflowStepId,'step_2');
  assert.equal((await h.complete(p,destination,linked(destination,screenPayload('com.kakao.taxi')))).status,200);
  const opened=await opening;
  mark('action receipt alone is not final; separate destination screen verified',opened.ok===true&&opened.phase==='OPENED'&&opened.verified===false&&opened.jobs.length===3);
  const returning=h.call('life_android_workflow_link',{mode:'RETURN_PREVIOUS',workflow_id:id});
  const back=await h.take(p);
  mark('return uses original previous_work_app command in same workflow',back.type==='open_url'&&back.target==='previous_work_app'&&back.workflowId===id&&back.workflowStepId==='step_3');
  assert.equal((await h.complete(p,back,linked(back,{ok:true,code:'synthetic_return'}))).status,200);
  const last=await h.take(p);
  assert.equal(last.workflowStepId,'step_4');
  assert.equal((await h.complete(p,last,linked(last,screenPayload('com.android.chrome')))).status,200);
  const done=await returning;
  mark('five actual signed jobs share one workflow and final origin verified',done.ok===true&&done.phase==='VERIFIED'&&done.verified===true&&done.workflowId===id&&done.jobs.length===5&&new Set(done.jobs.map(j=>j.jobId)).size===5);
  const repeated=await h.call('life_android_workflow_link',{mode:'RETURN_PREVIOUS',workflow_id:id});
  mark('repeating completed return never dispatches again',repeated.ok===false&&repeated.code==='workflow_phase_mismatch'&&(await h.poll(p)).status===204);

  // A real phone can finish accessibility readback just after the bounded
  // server wait. Prove STATUS reconciles the already MAC-accepted result
  // without re-dispatching or creating a new job.
  const lateBegin=h.call('life_android_workflow_link',{mode:'BEGIN'});
  const lateOrigin=await h.take(p);
  assert.equal((await h.complete(p,lateOrigin,linked(lateOrigin,screenPayload('com.android.chrome')))).status,200);
  const lateReady=await lateBegin;
  const lateId=lateReady.workflowId;
  const lateOpening=h.call('life_android_workflow_link',{mode:'OPEN_KAKAO_T',workflow_id:lateId});
  const lateApp=await h.take(p);
  assert.equal((await h.complete(p,lateApp,linked(lateApp,{ok:true,packageName:'com.kakao.taxi'}))).status,200);
  const lateDestination=await h.take(p);
  assert.equal((await h.complete(p,lateDestination,linked(lateDestination,screenPayload('com.kakao.taxi')))).status,200);
  assert.equal((await lateOpening).phase,'OPENED');
  const lateReturning=h.call('life_android_workflow_link',{mode:'RETURN_PREVIOUS',workflow_id:lateId});
  const lateBack=await h.take(p);
  assert.equal((await h.complete(p,lateBack,linked(lateBack,{ok:true,code:'synthetic_return'}))).status,200);
  const lateLast=await h.take(p);
  const lateCompletion=delay(26000).then(()=>h.complete(p,lateLast,linked(lateLast,screenPayload('com.android.chrome'))));
  const needsReview=await lateReturning;
  mark('bounded wait can end before a valid late screen receipt',needsReview.phase==='NEEDS_REVIEW'&&needsReview.verified===false);
  assert.equal((await lateCompletion).status,200);
  const beforeStatusJobs=needsReview.jobs.length;
  const reconciled=await h.call('life_android_workflow_link',{mode:'STATUS',workflow_id:lateId});
  mark('STATUS promotes a MAC-accepted late final screen without replay',reconciled.ok===true&&reconciled.reconciled===true&&reconciled.phase==='VERIFIED'&&reconciled.verified===true&&reconciled.jobs.length===beforeStatusJobs&&(await h.poll(p)).status===204);
  const missing=h.call('life_android_workflow_link',{mode:'BEGIN'});
  const missingJob=await h.take(p);
  assert.equal((await h.complete(p,missingJob,screenPayload('com.android.chrome'))).status,200);
  const missingResult=await missing;
  mark('legacy phone without workflow echo cannot pass new integration',missingResult.ok===false&&missingResult.code==='workflow_phone_binding_not_proven'&&missingResult.phase==='NEEDS_REVIEW'&&(await h.poll(p)).status===204);
  const legacy=h.call('life_android_snapshot');
  const legacyJob=await h.take(p);
  assert.equal((await h.complete(p,legacyJob,screenPayload('com.android.chrome'))).status,200);
  mark('legacy diagnostic call is unchanged',(await legacy).status==='complete'&&legacyJob.workflowId===undefined);
  console.log('JH_INSTALLED_V141_WORKFLOW_RELEASE_PASS '+JSON.stringify({checks:checks.length,failed:0,oneWorkflowJobs:5,runtimeSha256:build.candidateSha256,phoneActions:0,productionDeployments:0,scope:'signed localhost MCP plus synthetic v141 completion echoes; not physical phone completion'}));
 }catch(e){console.error('JH_INSTALLED_V141_WORKFLOW_RELEASE_FAIL',e);process.exitCode=1}
 finally{for(const c of clients)try{await c.close()}catch{};for(const p of children)try{await kill(p)}catch{};rmSync(dir,{recursive:true,force:true})}
}
`;
try{
 writeFileSync(output,s,{mode:0o600});
 const syntax=spawnSync(process.execPath,['--check',fileURLToPath(output)],{stdio:'inherit'});
 if(syntax.status!==0)throw Error('MCP_WORKFLOW_TEST_SYNTAX');
 const ran=spawnSync(process.execPath,[fileURLToPath(output)],{stdio:'inherit',timeout:120000});
 if(ran.status!==0)process.exitCode=1;
}finally{rmSync(output,{force:true})}
