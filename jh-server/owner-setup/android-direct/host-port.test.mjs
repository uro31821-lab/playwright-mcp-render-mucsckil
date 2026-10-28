import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAndroidDirectSecure56Host} from './host-port.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const clock=1_800_000_000_000;
const session='secure-session-verified-56',command='a'.repeat(32);
const meta=()=>({secureBridgeVersion:56,secureActive:true,
  deviceDigest:sha('device-digest'),lastSeen:clock-1000});
const screenProof=()=>({kind:'split_screen_evidence',version:'1',verified:'true',
  layout:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',
  chatWindowId:'1',chatBounds:'0,0,500,1000',workPackage:'com.example.testapp',
  workWindowId:'2',workBounds:'500,0,1000,1000',observedAtMs:String(clock-1000)});
const snapshot=()=>{const p=screenProof();return {
  ok:true,url:JSON.stringify([{...p},{package:p.workPackage,windowId:p.workWindowId,
    text:'Settings'}]),splitScreenRequired:true,splitScreen:p
}};
const action=()=>({task_digest:sha('task'),action:'CLICK',
  effect:'REVERSIBLE_WRITE',data_class:'NON_SENSITIVE',
  x:610,y:300,viewport_width:1000,viewport_height:1000});
function harness({enabled=true,approved=true,phoneSuccess=true,
  validPane=true,durable=true,preparedTokens=true,latency=false,prepareDelay=false}={}){
  let now=clock,commandId=command,secure=session,deviceMeta=meta();
  let phoneGrant=approved,phoneOK=phoneSuccess,ready=durable;
  const jobs=new Map(),invocations=[],pending=[];
  let releasePrepare;
  const prepareGate=new Promise(resolve=>{releasePrepare=resolve});
  let index=0;
  const mk=(type,bound,started='queued',body=null)=>{
    const j={id:'job_'+(++index),type,targetDeviceId:bound,
      commandId,secureSessionId:secure,status:started,
      result:body??(type==='agent_snapshot'?snapshot():{ok:true})};
    jobs.set(j.id,j);invocations.push({type,jobId:j.id});
    return j;
  };
  const api=createAndroidDirectSecure56Host({
    enabled,clock:()=>now,
    selectDevice:()=> 'synthetic-galaxy',
    deviceMeta:()=>deviceMeta,
    activeSession:()=>({sessionId:secure,deviceDigest:meta().deviceDigest}),
    requireCommand:()=>commandId,
    makeSnapshotJob:d=>mk('agent_snapshot',d,'queued',validPane?snapshot():{ok:false}),
    exactEnvelope:(tool,type,effect,args,extra)=>{
      invocations.push({tool,effect,extra:{leasePresent:!!extra.leaseToken}});
      if(latency && type==='computer_use_action_execute')
        return {deviceId:'synthetic-galaxy',job:mk(type,args.device_id,'queued',{ok:true})};
      let body;
      if(type==='computer_use_action_prepare'){
        body=phoneOK&&phoneGrant?{ok:true,code:'READY',requiresFreshApproval:false,
          leaseToken:preparedTokens?'lease-from-phone-98765':''}:
          {ok:false,code:'APPROVAL_REQUIRED',requiresFreshApproval:true};
      }else body={ok:true};
      return {deviceId:'synthetic-galaxy',job:mk(type,args.device_id,'queued',body)};
    },
    waitJob:async j=>{
      if(prepareDelay&&j.type==='computer_use_action_prepare')await prepareGate;
      if(latency&&j.type==='computer_use_action_execute')return j;
      j.status='complete';return j;
    },
    getJob:id=>jobs.get(id),
    durableReady:()=>ready
  });
  return {api,jobs,invocations,unblockPrepare:()=>releasePrepare(),
    setTime:x=>now=x,setCommand:x=>commandId=x,
    setSecure:x=>secure=x,setMeta:x=>deviceMeta=x,
    setGrant:x=>phoneGrant=x,setDurable:x=>ready=x,pending};
}
test('disabled default cannot even take a screenshot',async()=>{
 const a=harness({enabled:false});assert.equal((await a.api.capture()).code,'ANDROID_DIRECT_DISABLED');
 assert.equal(a.invocations.length,0);
 assert.equal(a.api.capabilities().realPhoneTested,false);
});
test('actual split-screen proof is checked against original signed job',async()=>{
 const a=harness();const r=await a.api.capture();
 assert.equal(r.ok,true);assert.equal(r.workPackage,'com.example.testapp');
 assert.equal(r.code,'SIGNED_ANDROID_RIGHT_PANE_OBSERVED');
 assert.equal(a.invocations[0].type,'agent_snapshot');
});
test('unverified screenshot cannot produce trusted binding',async()=>{
 const a=harness({validPane:false});
 assert.equal((await a.api.capture()).code,'SIGNED_ANDROID_SNAPSHOT_NOT_COMPLETED');
 assert.equal((await a.api.prepare({args:action()})).code,'FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
});
test('preparation requires existing installed durable journal',async()=>{
 const a=harness({durable:false});await a.api.capture();
 assert.equal((await a.api.prepare({args:action()})).code,'EXISTING_DURABLE_JOURNAL_REQUIRED');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_prepare').length,0);
});
test('preparation only uses original signed Computer Use envelope',async()=>{
 const a=harness();await a.api.capture();const p=await a.api.prepare({args:action()});
 assert.equal(p.code,'SIGNED_PHONE_PREPARATION_READY');
 assert.equal(a.invocations.filter(x=>x.tool==='life_android_computer_prepare').length,1);
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
 assert.equal(JSON.stringify(p).includes('grant-from-phone'),false);
 assert.equal(JSON.stringify(p).includes('lease-from-phone'),false);
});
test('protected action requires the existing phone local approval path',async()=>{
 const a=harness({approved:false});await a.api.capture();
 assert.equal((await a.api.prepare({args:action()})).code,'PHONE_LOCAL_APPROVAL_REQUIRED');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
});
test('phone approval-required is a protected action and does not authorize execution',async()=>{
 const a=harness({phoneSuccess:false});await a.api.capture();
 const p=await a.api.prepare({args:action()});
 assert.equal(p.code,'PHONE_LOCAL_APPROVAL_REQUIRED');
 assert.equal((await a.api.execute({preparationId:'x',operationId:'b'.repeat(32)})).code,
   'PHONE_PREPARATION_NOT_FOUND');
});
test('capture plus phone-prepared mutation routes exactly one native action',async()=>{
 const a=harness();await a.api.capture();const p=await a.api.prepare({args:action()});
 const r=await a.api.execute({preparationId:p.preparationId,operationId:'b'.repeat(32)});
 assert.equal(r.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
 assert.equal(r.dispatched,true);assert.equal(r.effectVerified,false);
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,1);
 assert.equal(a.invocations.filter(x=>x.tool==='life_android_execute_computer_action').length,1);
 assert.equal(JSON.stringify(r).includes('grant-from-phone'),false);
 assert.equal((await a.api.execute({preparationId:p.preparationId,operationId:'b'.repeat(32)})).code,
   'PHONE_PREPARATION_NOT_FOUND');
});
test('read-only status follows original internal job instead of redacted MCP receipt',async()=>{
 const a=harness();await a.api.capture();const p=await a.api.prepare({args:action()});
 await a.api.execute({preparationId:p.preparationId,operationId:'c'.repeat(32)});
 const out=await a.api.status({operationId:'c'.repeat(32)});
 assert.equal(out.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,1);
});
test('command change before phone mutation is fenced',async()=>{
 const a=harness();await a.api.capture();const p=await a.api.prepare({args:action()});
 a.setCommand('d'.repeat(32));
 assert.equal((await a.api.execute({preparationId:p.preparationId,
   operationId:'e'.repeat(32)})).code,'PHONE_PREPARATION_EXPIRED_OR_CONTEXT_CHANGED');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
});
test('session change before preparation is fenced',async()=>{
 const a=harness();await a.api.capture();a.setSecure('secure-other-session');
 assert.equal((await a.api.prepare({args:action()})).code,'FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
});
test('stale snapshot and expired lease cannot execute later',async()=>{
 const a=harness();await a.api.capture();const p=await a.api.prepare({args:action()});
 a.setTime(clock+11000);
 assert.equal((await a.api.execute({preparationId:p.preparationId,
   operationId:'f'.repeat(32)})).code,'PHONE_PREPARATION_EXPIRED_OR_CONTEXT_CHANGED');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
});
test('unapproved secret data and caller-supplied grants are rejected',async()=>{
 const a=harness();await a.api.capture();
 const invalid=[{...action(),data_class:'SECRET'},
   {...action(),lease_token:'caller-token'},
   {...action(),action_approval_grant_token:'caller-grant'},
   {...action(),x:1000}];
 for(const args of invalid)assert.equal(
   (await a.api.prepare({args})).code,'ANDROID_ACTION_ARGUMENTS_INVALID');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_prepare').length,0);
});
test('local cancel prevents any mutation',async()=>{
 const a=harness();await a.api.capture();const p=await a.api.prepare({args:action()});
 assert.equal(a.api.cancelPreparation().code,'LOCAL_PREPARATION_CANCELLED_NO_ACTION');
 assert.equal((await a.api.execute({preparationId:p.preparationId,
   operationId:'b'.repeat(32)})).code,'PHONE_PREPARATION_NOT_FOUND');
 assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
});
test('no Playwright, ADB, browser cookies or replacement MCP auth in host capabilities',async()=>{
 const a=harness();const v=a.api.capabilities();
 assert.equal(v.hostLocalOnly,true);assert.equal(v.playwrightUsed,false);
 assert.equal(v.existingSecure56Required,true);
 assert.equal(v.originalDurableJournalReady,true);
 assert.equal(v.phoneTokenSchemaConfirmed,true);
 assert.equal(v.protectedApprovalFlowConnected,false);
});

test('concurrent prepare attempts never create duplicate signed jobs',async()=>{
  const a=harness({prepareDelay:true});
  await a.api.capture();
  const first=a.api.prepare({args:action()});
  assert.equal((await a.api.prepare({args:action()})).code,
    'CANDIDATE_ACTION_IN_PROGRESS');
  assert.equal((await a.api.capture()).code,'CANDIDATE_ACTION_IN_PROGRESS');
  a.unblockPrepare();
  assert.equal((await first).code,'SIGNED_PHONE_PREPARATION_READY');
  assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_prepare').length,1);
  assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
});
test('cancellation during signed phone preparation cannot re-enable mutation',async()=>{
  const a=harness({prepareDelay:true});
  await a.api.capture();
  const first=a.api.prepare({args:action()});
  assert.equal(a.api.cancelPreparation().code,
    'PENDING_PREPARATION_CANCEL_REQUESTED_NO_ACTION');
  a.unblockPrepare();
  assert.equal((await first).code,'PHONE_PREPARATION_CANCELLED');
  assert.equal((await a.api.execute({operationId:'a'.repeat(32),
    preparationId:'from-cancelled-preparation'})).code,'PHONE_PREPARATION_NOT_FOUND');
  assert.equal(a.invocations.filter(x=>x.type==='computer_use_action_execute').length,0);
});

test('real JH167-R5 phone READY code and lease are required, missing grant is normal',async()=>{
 const a=harness({approved:true});
 await a.api.capture();
 const p=await a.api.prepare({args:action()});
 assert.equal(p.code,'SIGNED_PHONE_PREPARATION_READY');
 const e=await a.api.execute({preparationId:p.preparationId,operationId:'e'.repeat(32)});
 assert.equal(e.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
 assert.equal(a.invocations.filter(v=>v.type==='computer_use_action_execute').length,1);
});
test('R5 signed READY with empty lease is denied without executor',async()=>{
 const a=harness({preparedTokens:false});
 await a.api.capture();
 assert.equal((await a.api.prepare({args:action()})).code,'PHONE_ACTION_LEASE_NOT_CONFIRMED');
 assert.equal(a.invocations.filter(v=>v.type==='computer_use_action_execute').length,0);
});
