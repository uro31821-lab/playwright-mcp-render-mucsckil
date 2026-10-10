/** Generate a focused test from the previously reviewed HTTP fixture's transport.
 * One localhost candidate process, synthetic device only. Existing business tests
 * are not relabelled as new; no live phone, real account credential or deployment.
 */
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const input=new URL('./orchestrator-chain-audit.mjs',import.meta.url);
const generated=new URL('./verified-roundtrip-runtime-http.generated.mjs',import.meta.url);
let source=readFileSync(input,'utf8');
const blob=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
if(blob!=='2e5cc32f95b22123b24c4b44f64f09a7b9521e31')throw Error('STAGE3_HTTP_PARENT_CHANGED');
const anchor=' try{\n  build=buildNativeQueueTruthCandidate(ROOT);';
if(source.split(anchor).length!==2)throw Error('STAGE3_HTTP_BODY_ANCHOR');
source=source.slice(0,source.indexOf(anchor));
const oldImport="import {buildNativeQueueTruthCandidate} from '../owner-setup/deployment/native-queue-truth-candidate.mjs';";
if(source.split(oldImport).length!==2)throw Error('STAGE3_HTTP_IMPORT_ANCHOR');
source=source.replace(oldImport,"import {buildVerifiedRoundtripRuntime} from '../owner-setup/deployment/verified-roundtrip-runtime.mjs';");
source=source.replace(' * Synthetic Secure56 device only. Two actual SIGKILL restarts; no live phone or production mount.',
 ' * Synthetic Secure56 device only. Process termination is cleanup, not restart verification.');
const ready="  process.stdout.write('SYNTHETIC_DURABLE_SERVER_READY\\n');";
if(source.split(ready).length!==2)throw Error('STAGE3_HTTP_STOP_ANCHOR');
source=source.replace(ready,`  process.on('message',m=>{if(m?.op==='stopRoundtrip')process.send?.({op:'roundtripStopped',result:runtime.stopVerifiedNativeRoundtrip56(m.workflowId)});});
`+ready);
source+=String.raw`
 async function stopRoundtrip(h,workflowId){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('test stop receipt timed out')),3000);
   const onMessage=m=>{if(m?.op==='roundtripStopped'){clearTimeout(timer);h.p.off('message',onMessage);resolve(m.result)}};
   h.p.on('message',onMessage);h.p.send({op:'stopRoundtrip',workflowId});
  });
 }
 const screenResult=app=>({ok:true,url:JSON.stringify([{package:app,text:'synthetic roundtrip screen',className:'android.view.View'}])});
 const args=id=>({target:'카카오T',workflow_id:id,return_to_origin:true});
 const APP='com.kakao.taxi',ORIGIN='laftel.net.laftel';
 async function newPhone(h,label){const p=await h.enroll(label);await h.call('life_android_select_device',{device_id:p.deviceId});return p;}
 async function finish(h,p,type,result){const j=await h.take(p);mark('expected signed '+type+' job delivered',j.type===type&&!!j.secureMac);assert.equal((await h.complete(p,j,result)).status,200);return j;}
 try{
  build=buildVerifiedRoundtripRuntime(ROOT);
  mark('existing MCP handler, not a detached helper, is compiled with no new MCP tools',build.newMcpTools===0&&build.productionEnabled===false);
  const seed=new DurableManualCircuitFence({file,key:KEY,namespace:NS,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});seed.close();
  const h=await start(19561);
  let p=await newPhone(h,'synthetic-stage3-A');
  const missing=await h.call('life_android_open_and_snapshot',{target:'카카오T',return_to_origin:true});
  mark('unscoped opt-in request rejected before any phone job',missing.code==='ROUNDTRIP_EXPLICIT_REQUEST_REQUIRED'&&(await h.poll(p)).status===204);
  const run=h.call('life_android_open_and_snapshot',args('workflow_stage3_happy'));
  const duplicate=h.call('life_android_open_and_snapshot',args('workflow_stage3_happy'));
  await finish(h,p,'agent_snapshot',screenResult(ORIGIN));
  await finish(h,p,'open_url',{ok:true,packageName:APP});
  await finish(h,p,'agent_snapshot',screenResult(APP));
  const back=await finish(h,p,'open_url',{ok:true,code:'synthetic-return'});
  mark('return goes through original host dispatcher with exact existing target',back.target==='last_work_screen');
  await finish(h,p,'agent_snapshot',screenResult(ORIGIN));
  const [done,repeated]=await Promise.all([run,duplicate]);
  mark('one initial MCP request drives execution, both verifications, and return',done.ok===true&&done.appReturnVerified===true);
  mark('same concurrent workflow is not dispatched twice',repeated.code===done.code&&(await h.poll(p)).status===204);
  mark('no whole-task or scroll restoration success is invented',done.taskSuccessVerified===false&&done.pageOrScrollRestored===false);
  const again=await h.call('life_android_open_and_snapshot',args('workflow_stage3_happy'));
  mark('repeated completed workflow causes zero new jobs',again.ok===true&&(await h.poll(p)).status===204);

  p=await newPhone(h,'synthetic-stage3-B');
  const failing=h.call('life_android_open_and_snapshot',args('workflow_stage3_failure'));
  await finish(h,p,'agent_snapshot',screenResult(ORIGIN));
  await finish(h,p,'open_url',{ok:false,code:'synthetic-open-failed'});
  const failed=await failing;
  mark('failed execution prevents downstream snapshot and return',failed.code==='ROUNDTRIP_ACTION_NOT_CONFIRMED'&&(await h.poll(p)).status===204);

  p=await newPhone(h,'synthetic-stage3-C');
  const wrong=h.call('life_android_open_and_snapshot',args('workflow_stage3_wrong_target'));
  await finish(h,p,'agent_snapshot',screenResult(ORIGIN));
  await finish(h,p,'open_url',{ok:true,packageName:APP});
  await finish(h,p,'agent_snapshot',screenResult('com.unrelated.app'));
  mark('wrong destination readback blocks return dispatch',(await wrong).code==='ROUNDTRIP_DESTINATION_NOT_VERIFIED'&&(await h.poll(p)).status===204);

  p=await newPhone(h,'synthetic-stage3-D');
  const stopping=h.call('life_android_open_and_snapshot',args('workflow_stage3_stopped'));
  await finish(h,p,'agent_snapshot',screenResult(ORIGIN));
  const sent=await h.take(p);assert.equal(sent.type,'open_url');
  const stopped=await stopRoundtrip(h,'workflow_stage3_stopped');
  mark('host stop acknowledges that already-delivered action may have happened',stopped.ok===true&&stopped.inFlightMayHaveExecuted===true);
  assert.equal((await h.complete(p,sent,{ok:true,packageName:APP})).status,200);
  const stopResult=await stopping;
  mark('late OK after stop cannot resume workflow or return',stopResult.code==='ROUNDTRIP_STOPPED'&&(await h.poll(p)).status===204);
  mark('same stopped workflow is not retried',(await h.call('life_android_open_and_snapshot',args('workflow_stage3_stopped'))).code==='ROUNDTRIP_STOPPED'&&(await h.poll(p)).status===204);

  p=await newPhone(h,'synthetic-stage3-E');
  const badReturn=h.call('life_android_open_and_snapshot',args('workflow_stage3_bad_return'));
  await finish(h,p,'agent_snapshot',screenResult(ORIGIN));
  await finish(h,p,'open_url',{ok:true,packageName:APP});
  await finish(h,p,'agent_snapshot',screenResult(APP));
  await finish(h,p,'open_url',{ok:true,code:'synthetic-return'});
  await finish(h,p,'agent_snapshot',screenResult(APP));
  const bad=await badReturn;
  mark('return acknowledgement without original app is not a successful return',bad.code==='ROUNDTRIP_RETURN_NOT_OBSERVED'&&bad.appReturnVerified===false&&(await h.poll(p)).status===204);

  p=await newPhone(h,'synthetic-stage3-F');
  const legacy=h.call('life_android_open_and_snapshot',{target:'카카오T'});
  await finish(h,p,'open_url',{ok:true,packageName:APP});
  await finish(h,p,'agent_snapshot',screenResult(APP));
  const legacyResult=await legacy;
  mark('old non-opt-in call keeps existing open and readback behavior',legacyResult.readback?.ready===true&&legacyResult.readback.taskSuccessVerified===false);
  mark('old call gains no automatic return',(await h.poll(p)).status===204);
  console.log('JH_STAGE3_RUNTIME_PASS '+JSON.stringify({passed:checks.length,failed:0,checks,
   parentSha256:build.parentSha256,candidateSha256:build.candidateSha256,livePhoneActions:0,productionDeployments:0,
   scope:'one opt-in native open-and-return through existing MCP handler; localhost signed synthetic phone',
   limitations:['not deployed','Android local stop button not wired by this change','workflow ID cache is process-local','no general multi-step business-task completion','scroll and session renewal excluded']}));
 }catch(e){console.error('JH_STAGE3_RUNTIME_FAIL',e);process.exitCode=1;}
 finally{for(const c of clients)try{await c.close()}catch{};for(const p of children)try{await kill(p)}catch{};rmSync(dir,{recursive:true,force:true});}
}
`;
try{
 writeFileSync(generated,source,{mode:0o600});
 const checked=spawnSync(process.execPath,['--check',fileURLToPath(generated)],{stdio:'inherit'});
 if(checked.status!==0)throw Error('STAGE3_HTTP_SYNTAX');
 const ran=spawnSync(process.execPath,[fileURLToPath(generated)],{stdio:'inherit',timeout:150000});
 if(ran.status!==0)process.exitCode=1;
}finally{rmSync(generated,{force:true});}
