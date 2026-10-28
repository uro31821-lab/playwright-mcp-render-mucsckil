import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAndroidDirectStage1} from './engine.mjs';
const h=x=>createHash('sha256').update(x).digest('hex');
const id='b'.repeat(32);
const scope=()=>({deviceId:'synthetic-galaxy',sessionId:'secure-session-A',
  commandId:'a'.repeat(32),rightPaneDigest:'e'.repeat(64),
  current:true,secure56:true,rightPaneVerified:true});
const view=()=>({verifiedByExistingJH:true,readOnlySnapshot:true,
  binding:scope(),observedAtMs:100_000});
const args=()=>({device_id:'synthetic-galaxy',task_digest:h('task-1'),
  action:'CLICK',viewport_width:1000,viewport_height:1800,
  x:120,y:410,effect:'REVERSIBLE_WRITE',data_class:'NON_SENSITIVE',
  lease_token:'existing-JH-lease-only',action_approval_grant_token:'existing-JH-device-local-grant-only'});
const job=(status='complete', ok=true)=>({id:'signed-job-A',
  targetDeviceId:'synthetic-galaxy',secureSessionId:'secure-session-A',
  commandId:'a'.repeat(32),status,result:{ok}});
function harness({enabled=true,approval=true,reply=job(),capacity=256}={}) {
  const calls=[];let binding=scope();let now=100_001;
  let permit=approval, response=reply;
  const runner=createAndroidDirectStage1({
    readBinding:()=>binding,
    authorizeExistingStep:async()=>permit,
    invokeExistingTool:async(name,value)=>{
      calls.push({name,value});
      if(response instanceof Error) throw response;
      return typeof response==='function'?response(name,value):response;
    },
    enabled,capacity,clock:()=>now
  });
  return {runner,calls,setBinding:b=>{binding=b},setApproval:b=>{permit=b},
    setReply:r=>{response=r},tick:n=>{now=n},
    request:(operationId=id,overrides={})=>({operationId,args:args(),
      expectedBinding:scope(),screenEvidence:view(),...overrides})};
}
test('default disabled, no tools or approvals issued',async()=>{
  const a=harness({enabled:false});
  assert.equal(a.runner.capabilities().playwrightUsed,false);
  assert.equal(a.runner.capabilities().enabled,false);
  assert.equal((await a.runner.execute(a.request())).code,'ANDROID_DIRECT_DISABLED');
  assert.equal((await a.runner.observe({expectedBinding:scope()})).code,'ANDROID_DIRECT_DISABLED');
  assert.equal(a.calls.length,0);
});
test('rejects incomplete trust, changed device and unverified right pane',async()=>{
  const a=harness();
  a.setBinding({...scope(),rightPaneVerified:false});
  assert.equal((await a.runner.execute(a.request())).code,'CURRENT_SIGNED_RIGHT_PANE_REQUIRED');
  a.setBinding({...scope(),sessionId:'changed'});
  assert.equal((await a.runner.execute(a.request())).code,'CURRENT_SIGNED_RIGHT_PANE_REQUIRED');
  assert.equal(a.calls.length,0);
});
test('rejects stale or forged screenshot before dispatch',async()=>{
  const a=harness();
  for(const evidence of [null,{...view(),observedAtMs:50000},
    {...view(),verifiedByExistingJH:false},
    {...view(),binding:{...scope(),rightPaneDigest:'f'.repeat(64)}},
    {...view(),observedAtMs:200000}]){
    assert.equal((await a.runner.execute(a.request(id,{screenEvidence:evidence}))).code,
      'FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
  }
  assert.equal(a.calls.length,0);
});
test('requires existing JH explicit approval and never fabricates grants',async()=>{
  const a=harness({approval:false});
  assert.equal((await a.runner.execute(a.request())).code,'EXISTING_JH_APPROVAL_REQUIRED');
  assert.equal(a.calls.length,0);
  // A normal low-risk Android action may have a phone-issued lease with
  // no one-shot approval grant; the existing JH authorizeExistingStep port
  // must still authorize this exact preparation.
  a.setApproval(true);
  const missing={...args()};delete missing.action_approval_grant_token;
  assert.equal((await a.runner.execute(a.request(id,{args:missing}))).code,
    'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
  assert.equal(a.calls.length,1);
});
test('rejects secret/payload pollution and out-of-bounds inputs',async()=>{
  const a=harness();
  const bad=[
    {...args(),data_class:'SECRET'},
    {...args(),containsCredential:true},
    {...args(),action:'SCREENSHOT'},
    {...args(),action:'BACK'},
    {...args(),action:'OPEN_APP'},
    {...args(),x:1000},
    {...args(),viewport_width:-1},
    {...args(),lease_token:''},
    {...args(),effect:'READ_ONLY'}
  ];
  for(const value of bad)assert.equal(
    (await a.runner.execute(a.request(id,{args:value}))).code,
    'ANDROID_ACTION_SCHEMA_OR_GRANT_INVALID');
  assert.equal(a.calls.length,0);
});
test('one computer action only, returned device ok is NOT claimed verified',async()=>{
  const a=harness();
  const first=await a.runner.execute(a.request());
  assert.equal(first.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
  assert.equal(first.dispatched,true);
  assert.equal(first.effectVerified,false);
  assert.equal(a.calls[0].name,'life_android_execute_computer_action');
  assert.equal(a.calls.length,1);
  const repeat=await a.runner.execute(a.request());
  assert.equal(repeat.code,'OPERATION_ALREADY_DISPATCHED_NO_REPLAY');
  assert.equal(a.calls.length,1);
  assert.equal((await a.runner.status({operationId:id})).code,
    'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
  assert.equal(a.calls[1].name,'life_job_status');
});
test('conflicting operation ID must never dispatch again',async()=>{
  const a=harness();await a.runner.execute(a.request());
  const changed={...args(),x:121};
  assert.equal((await a.runner.execute(a.request(id,{args:changed}))).code,
    'OPERATION_ID_CONFLICT_NO_REPLAY');
  assert.equal(a.calls.length,1);
});
test('transport failure remains UNKNOWN and duplicate retry forbidden',async()=>{
  const a=harness({reply:new Error('socket lost')});
  const r=await a.runner.execute(a.request());
  assert.equal(r.code,'DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY');
  assert.equal(r.autoRetry,false);
  assert.equal((await a.runner.execute(a.request())).code,
    'OPERATION_ALREADY_DISPATCHED_NO_REPLAY');
  assert.equal((await a.runner.status({operationId:id})).code,
    'DISPATCH_OUTCOME_UNKNOWN_NO_REPLAY');
  assert.equal(a.calls.length,1);
});
test('untrusted job binding never becomes a success',async()=>{
  const a=harness({reply:{...job(),secureSessionId:'other'}});
  assert.equal((await a.runner.execute(a.request())).code,'UNVERIFIED_JOB_BINDING_NO_REPLAY');
  assert.equal((await a.runner.execute(a.request())).code,
    'OPERATION_ALREADY_DISPATCHED_NO_REPLAY');
  assert.equal(a.calls.length,1);
});
test('queued receipt can only be followed by original status job',async()=>{
  const a=harness({reply:job('queued')});
  assert.equal((await a.runner.execute(a.request())).code,'PENDING_EXISTING_JOB');
  a.setReply(job('complete',false));
  const status=await a.runner.status({operationId:id});
  assert.equal(status.code,'DEVICE_REPORTED_FAILURE');
  assert.equal(status.deviceReportedOk,false);
  assert.equal(a.calls.length,2);
  assert.equal(a.calls[1].value.job_id,'signed-job-A');
  assert.equal(a.calls[1].name,'life_job_status');
});
test('session change blocks status lookup and any new execution',async()=>{
  const a=harness({reply:job('queued')});
  await a.runner.execute(a.request());
  a.setBinding({...scope(),sessionId:'secure-session-B'});
  assert.equal((await a.runner.status({operationId:id})).code,
    'ANDROID_CONTEXT_CHANGED_STATUS_READ_BLOCKED');
  assert.equal((await a.runner.execute(a.request('c'.repeat(32)))).code,
    'CURRENT_SIGNED_RIGHT_PANE_REQUIRED');
  assert.equal(a.calls.length,1);
});
test('lost/misbound status cannot confirm an effect',async()=>{
  const a=harness({reply:job('queued')});
  await a.runner.execute(a.request());
  a.setReply({...job('complete'),id:'different-job'});
  assert.equal((await a.runner.status({operationId:id})).code,
    'UNVERIFIED_JOB_STATUS_NO_REPLAY');
  a.setReply(new Error('not reachable'));
  assert.equal((await a.runner.status({operationId:id})).code,
    'STATUS_READ_UNAVAILABLE_NO_REPLAY');
  assert.equal(a.calls.length,3);
});
test('approval timing changes invalidate dispatch',async()=>{
  let approved=0;
  let live=scope(),calls=0;
  const runner=createAndroidDirectStage1({
    readBinding:()=>live,enabled:true,clock:()=>100001,
    authorizeExistingStep:async()=>{approved++;live={...scope(),rightPaneDigest:'f'.repeat(64)};return true;},
    invokeExistingTool:async()=>{calls++;return job()}
  });
  assert.equal((await runner.execute({operationId:id,args:args(),
    expectedBinding:scope(),screenEvidence:view()})).code,'ANDROID_CONTEXT_CHANGED_BEFORE_DISPATCH');
  assert.equal(approved,1);assert.equal(calls,0);
});
test('TYPE requires exact text digest; never store or expose input in return',async()=>{
  const a=harness();
  const secretLooking='synthetic typing only';
  const type={...args(),action:'TYPE',text_value:secretLooking,text_digest:h(secretLooking)};
  const r=await a.runner.execute(a.request(id,{args:type}));
  assert.equal(r.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
  assert.equal(JSON.stringify(r).includes(secretLooking),false);
  const b=harness();
  assert.equal((await b.runner.execute(b.request(id,{args:{...type,text_digest:h('not matching')}}))).code,
    'ANDROID_ACTION_SCHEMA_OR_GRANT_INVALID');
});
test('SCROLL and KEYPRESS use existing Computer Use, no browser',async()=>{
  const a=harness();
  const scroll={...args(),action:'SCROLL',scroll_y:550};
  const keys={...args(),action:'KEYPRESS',keys:['ENTER']};
  await a.runner.execute(a.request(id,{args:scroll}));
  await a.runner.execute(a.request('c'.repeat(32),{args:keys}));
  assert.deepEqual(a.calls.map(x=>x.name),[
    'life_android_execute_computer_action','life_android_execute_computer_action'
  ]);
});
test('read-only inspection reuses signed Android snapshot without action replay',async()=>{
  const a=harness({reply:{status:'complete',result:{ok:true}}});
  const r=await a.runner.observe({kind:'INSPECT',expectedBinding:scope(),
    args:{device_id:'synthetic-galaxy',task_digest:h('read-inspect'),action:'CLICK'}});
  assert.equal(r.code,'READ_TOOL_RETURNED_NOT_EFFECT_PROOF');
  assert.equal(r.effectVerified,false);
  assert.equal(a.calls[0].name,'life_android_computer_inspect');
  await a.runner.observe({kind:'SNAPSHOT',expectedBinding:scope()});
  assert.equal(a.calls[1].name,'life_android_snapshot');
  const wrong=await a.runner.observe({kind:'WEB_NAVIGATE',expectedBinding:scope()});
  assert.equal(wrong.code,'READ_OPERATION_UNSUPPORTED');
});
test('bounded in-memory fence fails closed; existing durable journal remains mandatory',async()=>{
  const a=harness({capacity:1});
  await a.runner.execute(a.request());
  assert.equal((await a.runner.execute(a.request('c'.repeat(32)))).code,
    'LOCAL_FENCE_CAPACITY_REACHED');
  assert.equal(a.calls.length,1);
  assert.equal(a.runner.capabilities().existingDurableJournalRequired,true);
  assert.equal(a.runner.capabilities().nativeAppLaunchSupported,false);
});
test('no browser/ADB/network calls are part of the candidate interface',async()=>{
  const a=harness();
  assert.equal(a.runner.capabilities().playwrightUsed,false);
  assert.equal(a.runner.capabilities().liveDeviceVerified,false);
  assert.deepEqual(a.runner.capabilities().allowedActions.sort(),
    ['CLICK','SCROLL','TYPE','KEYPRESS'].sort());
});


test('concurrent duplicate while approval is pending cannot dispatch twice',async()=>{
  let unblock;
  const approvalGate=new Promise(resolve=>{unblock=resolve});
  let invocations=0,approvalChecks=0;
  const runner=createAndroidDirectStage1({
    enabled:true,clock:()=>100001,readBinding:()=>scope(),
    authorizeExistingStep:async()=>{approvalChecks++;await approvalGate;return true},
    invokeExistingTool:async()=>{invocations++;return job()}
  });
  const request={operationId:id,args:args(),expectedBinding:scope(),screenEvidence:view()};
  const first=runner.execute(request);
  try {
    const second=await runner.execute(request);
    assert.equal(second.code,'OPERATION_PREFLIGHT_IN_PROGRESS');
    assert.equal(second.dispatched,false);
    assert.equal(second.autoRetry,false);
    assert.equal(approvalChecks,1);
    assert.equal(invocations,0);
  }finally{unblock()}
  const firstResult=await first;
  assert.equal(firstResult.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
  assert.equal(invocations,1);
});
test('approval rejected before dispatch permits a new explicit attempt',async()=>{
  const a=harness({approval:false});
  assert.equal((await a.runner.execute(a.request())).code,'EXISTING_JH_APPROVAL_REQUIRED');
  a.setApproval(true);
  assert.equal((await a.runner.execute(a.request())).code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
  assert.equal(a.calls.length,1);
});

test('inspection must match original read-only JH Computer Use schema',async()=>{
  const a=harness();
  const invalid=[
    {device_id:'synthetic-galaxy'},
    {task_digest:h('inspect'),action:'OPEN_APP'},
    {task_digest:h('inspect'),action:'CLICK',device_id:'other-phone'},
    {task_digest:h('inspect'),action:'CLICK',data_class:'SECRET'}
  ];
  for(const read of invalid){
    assert.equal((await a.runner.observe({kind:'INSPECT',args:read,
      expectedBinding:scope()})).code,'ANDROID_INSPECT_ARGUMENTS_INVALID');
  }
  assert.equal((await a.runner.observe({kind:'SNAPSHOT',
    args:{url:'https://example.com'},expectedBinding:scope()})).code,
    'ANDROID_SNAPSHOT_ARGUMENTS_INVALID');
  assert.equal(a.calls.length,0);
});

test('grantless safe action still requires verified existing JH authorization',async()=>{
 const a=harness({approval:false});
 const grantless={...args()};delete grantless.action_approval_grant_token;
 assert.equal((await a.runner.execute(a.request(id,{args:grantless}))).code,
   'EXISTING_JH_APPROVAL_REQUIRED');
 assert.equal(a.calls.length,0);
});
