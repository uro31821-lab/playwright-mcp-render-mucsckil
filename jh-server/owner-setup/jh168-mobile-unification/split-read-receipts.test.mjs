import test from 'node:test';
import assert from 'node:assert/strict';
import {createSplitReadReceiptRegistry56} from './split-read-receipts.mjs';
import {applyJH168SplitReadReceiptPatch,reverseJH168SplitReadReceiptPatch} from './split-read-receipt-patch.mjs';

const commandId='a'.repeat(32),taskDigest='b'.repeat(64);
const scope={deviceId:'phone-1',sessionId:'signed-session',commandId,taskDigest};
let at=10000,n=0;
const token=()=>String(++n).padStart(32,'0');
const registry=()=>createSplitReadReceiptRegistry56({clock:()=>at,token,maxEntries:3});
const job=()=>({id:'job_17',type:'split_screen_session_start',status:'queued',
  targetDeviceId:scope.deviceId,secureSessionId:scope.sessionId,
  commandId,taskDigest,expiresAtMs:90000});
const comfortJob=()=>({...job(),type:'split_comfort_status',
  mcpToolName:'life_android_capture_work_window',secureRequestedEffect:'READ_ONLY'});
const issue=(reg,j)=>reg.issue({job:j,...scope});
for(const createJob of [job,comfortJob]) test('late signed '+createJob().type+' is recovered without another job or click',()=>{
  const reg=registry(),j=createJob(),got=issue(reg,j);
  assert.ok(got.receiptRef.startsWith('srr_'));
  assert.equal(got.automaticReplay,false);
  let calls=0;
  const get=id=>{calls++;assert.equal(id,j.id);return j;};
  const pending=reg.read({receiptRef:got.receiptRef,...scope},get,()=>true);
  assert.equal(pending.code,'SPLIT_READ_STILL_PENDING');
  j.status='complete';j.result={ok:true,code:'captured',
    state:'ACTIVE',contextId:'ssc_'+'c'.repeat(32)};
  const done=reg.read({receiptRef:got.receiptRef,...scope},get,()=>true);
  assert.equal(done.ok,true);assert.equal(done.receiptRecovered,true);
  assert.equal(done.newJobCreated,false);assert.equal(done.automaticReplay,false);
  assert.equal(done.contextId,j.result.contextId);assert.equal(calls,2);
});
test('wrong device, session, command or guessed token never accesses job data',()=>{
  const reg=registry(),j=job(),got=issue(reg,j);
  const good={receiptRef:got.receiptRef,...scope};
  for(const changed of [{deviceId:'other'},{sessionId:'other'},{commandId:'e'.repeat(32)}]){
    const x=reg.read({...good,...changed},()=>{throw Error('must not fetch')},()=>true);
    assert.equal(x.code,'SPLIT_READ_RECEIPT_SCOPE_CHANGED');
  }
  assert.equal(reg.read({...good,receiptRef:'srr_'+'x'.repeat(32)},()=>j,()=>true).ok,false);
});
test('expired records and missing or replaced original job fail closed',()=>{
  const reg=registry(),j=job(),got=issue(reg,j);
  const q={receiptRef:got.receiptRef,...scope};
  assert.equal(reg.read(q,()=>undefined,()=>true).code,'SPLIT_READ_ORIGINAL_JOB_CHANGED');
  assert.equal(reg.read(q,()=>({...j,commandId:'e'.repeat(32)}),()=>true).code,'SPLIT_READ_ORIGINAL_JOB_CHANGED');
  at=got.expiresAt;
  assert.equal(reg.read(q,()=>j,()=>true).code,'SPLIT_READ_RECEIPT_UNAVAILABLE');
  at=10000;
});
test('consequential CLICK, SAVE_ANALYSIS or preflight never receive read-only receipt',()=>{
  const reg=registry();
  for(const type of ['split_screen_session_followup','split_screen_session_save_analysis',
    'computer_use_action_execute','split_screen_session_input_preflight',
    'split_comfort_scroll_once','split_comfort_zoom','split_comfort_zoom_reset',
    'split_comfort_manual_handoff','split_comfort_keyboard_advice','split_comfort_restore_info']){
    assert.equal(issue(reg,{...job(),type}),null,type);
  }
});
test('comfort STATUS requires its own exact read authority at issue and every read',()=>{
  for(const key of ['mcpToolName','secureRequestedEffect']){
    const expected=comfortJob()[key];
    for(const value of [undefined,'untrusted-authority']){
      const reg=registry(),j=comfortJob();j[key]=value;
      assert.equal(issue(reg,j),null,key);
    }
    const inherited=comfortJob();delete inherited[key];
    Object.setPrototypeOf(inherited,{[key]:expected});
    assert.equal(issue(registry(),inherited),null,'inherited '+key);
    for(const change of [j=>{delete j[key];},j=>{j[key]='untrusted-authority';},
      j=>{delete j[key];Object.setPrototypeOf(j,{[key]:expected});}]){
      const reg=registry(),j=comfortJob(),got=issue(reg,j);
      j.status='complete';j.result={ok:true};change(j);
      let proofs=0;
      const read=reg.read({receiptRef:got.receiptRef,...scope},()=>j,()=>{proofs++;return true;});
      assert.equal(read.code,'SPLIT_READ_ORIGINAL_JOB_CHANGED',key);
      assert.equal(proofs,0);assert.equal(read.newJobCreated,false);
    }
  }
});
test('authenticated job completion without original split-screen proof is refused',()=>{
  const reg=registry(),j=job(),got=issue(reg,j);
  j.status='complete';j.result={ok:true,contextId:'ssc_'+'c'.repeat(32)};
  const q={receiptRef:got.receiptRef,...scope};
  assert.equal(reg.read(q,()=>j,()=>false).code,'SPLIT_READ_SCREEN_PROOF_INVALID');
  assert.equal(reg.read(q,()=>j,()=>{throw Error('invalid scene')}).ok,false);
});
test('job expired or outcome unknown stays unknown and never replays',()=>{
  const reg=registry(),j=job(),got=issue(reg,j);
  const q={receiptRef:got.receiptRef,...scope};
  j.status='expired';j.error='job_timeout';
  const x=reg.read(q,()=>j,()=>true);
  assert.equal(x.code,'SPLIT_READ_TERMINAL_UNCONFIRMED');
  assert.equal(x.automaticReplay,false);assert.equal(x.newJobCreated,false);
});
test('device reports error cannot masquerade as captured work screen',()=>{
  const reg=registry(),j=job(),got=issue(reg,j);
  j.status='complete';j.result={ok:false,code:'work_window_unavailable'};
  assert.equal(reg.read({receiptRef:got.receiptRef,...scope},
    ()=>j,()=>true).code,'SPLIT_READ_DEVICE_REPORTED_FAILURE');
});
test('invalid issue bindings, near-expiry and capacity have no receipt',()=>{
  const reg=registry(),j=job();
  assert.equal(issue(reg,{...j,secureSessionId:'other'}),null);
  assert.equal(issue(reg,{...j,expiresAtMs:at+1000}),null);
  for(let i=0;i<3;i++)assert.ok(issue(reg,{...j,id:'job_'+(i+1)})?.receiptRef);
  assert.equal(issue(reg,{...j,id:'job_4'}),null);
});
test('reversible patch modifies only original generated runtime and keeps its guards',()=>{
  const raw=[
    'const recentWeb=new Map();',
    'function jhRequireCommand56(device){return device}',
    'const durableNativeHooks56={}; // durableNativeHooks56?.beforeDispatch(',
    'function jhInspectSplitEvidence155(screen){return {ok:!!screen}}',
    "registerOAuthTool('life_android_split_screen_assistant'",
    '  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){',
    "    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));",
    "    if(!completed||completed.status!=='complete')",
    "      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed'};",
    "mode:z.enum(['START','SAVE_ANALYSIS','FOLLOW_UP','STATUS','FINISH','CANCEL']),",
    'context_id:z.string().optional(),request_id:z.string().optional(),goal:z.string().optional(),',
    "    if(!jhSplitScreenContextId56(args.context_id))return textResult({ok:false,code:'split_screen_context_id_required'});"
  ].join('\n');
  const p=applyJH168SplitReadReceiptPatch(raw);
  assert.equal(reverseJH168SplitReadReceiptPatch(p),raw);
  assert.match(p,/READBACK_PENDING/);
  assert.match(p,/JH168_SPLIT_READ_DIAGNOSTIC_V1/);
  assert.match(p,/mode==='STATUS'\?args.context_id:args.receipt_ref/);
  assert.match(p,/receipt_ref/);
  assert.match(p,/effect==='READ_ONLY'/);
  assert.match(p,/jhRequireCommand56\(device\)/);
  assert.throws(()=>applyJH168SplitReadReceiptPatch(p));
  assert.throws(()=>applyJH168SplitReadReceiptPatch(raw.replace('jhInspectSplitEvidence155','invalid')));
});
