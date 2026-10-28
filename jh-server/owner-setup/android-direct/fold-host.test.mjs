import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAndroidDirectSecure56Host} from './host-port.mjs';
const h=x=>createHash('sha256').update(x).digest('hex');
const now=1800000000000, rect=(a,b,c,d)=>[a,b,c,d].join(',');
function make({browser='com.android.chrome',focus=false,reuse=false,layoutMode='LEFT_WEB_RIGHT_GPT'}={}){
 let t=now,split=1050,app=browser,input=focus,seq=0,session='secure-56';
 let command='a'.repeat(32);const jobs=[],phoneInputs=[];
 const proof=()=>({kind:'split_screen_evidence',version:'1',verified:'true',
  layout:'LEFT_RIGHT',chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',
  chatWindowId:'32',chatBounds:rect(split,0,2160,1800),
  workPackage:app,workWindowId:'31',workBounds:rect(0,0,split,1800),
  observedAtMs:String(t-1000+Math.min(seq,4)*100)});
 const snapshot=()=>{const p=proof();return {ok:true,
  splitScreenRequired:true,splitScreen:p,
  url:JSON.stringify([{...p},{package:app,windowId:'31',clickable:true,
   bounds:rect(100,100,800,500)},...(input?[{package:app,windowId:'31',
   focused:true,editable:true,bounds:rect(150,510,650,570)}]:[])])}};
 const mk=(type,body)=>{const j={id:'signed-'+(jobs.length+1),type,
  targetDeviceId:'fold-phone',secureSessionId:session,commandId:command,
  status:'queued',result:body};jobs.push(j);return j};
 const api=createAndroidDirectSecure56Host({
  enabled:true,layoutMode,clock:()=>t,
  selectDevice:()=> 'fold-phone',
  deviceMeta:()=>({secureBridgeVersion:56,secureActive:true,deviceDigest:h('dev'),lastSeen:t-200}),
  activeSession:()=>({sessionId:session,deviceDigest:h('dev')}),
  requireCommand:()=>command,
  makeSnapshotJob:()=>{
   if(reuse&&jobs.some(j=>j.type==='agent_snapshot'))return jobs.find(j=>j.type==='agent_snapshot');
   seq++;return mk('agent_snapshot',snapshot())
  },
  exactEnvelope:(_,type,__,args)=>{
    phoneInputs.push({type,args:structuredClone(args)});
    return {deviceId:'fold-phone',job:mk(type,
   type==='computer_use_action_prepare'?{ok:true,code:'READY',requiresFreshApproval:false,
    leaseToken:'lease-from-phone-123456'}:{ok:true})};
  },
  waitJob:async j=>{j.status='complete';return j;},
  getJob:id=>jobs.find(j=>j.id===id),
  durableReady:()=>true
 });
 const action=(x=200)=>({task_digest:h('task'),action:'CLICK',
  effect:'REVERSIBLE_WRITE',data_class:'NON_SENSITIVE',
  viewport_width:2160,viewport_height:1800,x,y:250});
 return {api,jobs,phoneInputs,action,setSplit:x=>split=x,setApp:x=>app=x,
  setFocus:x=>input=x,setSession:x=>session=x,setCommand:x=>command=x};
}
test('folded-layout mode recognizes LEFT web RIGHT native GPT and does not invent FLAT posture',async()=>{
 const t=make(),s=await t.api.capture();
 assert.equal(s.code,'SIGNED_LEFT_WEB_RIGHT_GPT_OBSERVED');
 assert.equal(s.workPaneSide,'LEFT');assert.equal(s.chatPaneSide,'RIGHT');
 assert.equal(s.physicalUnfoldVerified,false);
 assert.equal(t.api.capabilities().playwrightUsed,false);
});
test('left click uses original signed phone action once after second screen proof',async()=>{
 const t=make();await t.api.capture();const p=await t.api.prepare({args:t.action()});
 assert.equal(p.code,'SIGNED_PHONE_PREPARATION_READY');
 const x=await t.api.execute({preparationId:p.preparationId,operationId:'b'.repeat(32)});
 assert.equal(x.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
 assert.equal(x.effectVerified,false);
 assert.equal(t.jobs.filter(j=>j.type==='agent_snapshot').length,2);
 assert.equal(t.jobs.filter(j=>j.type==='computer_use_action_execute').length,1);
});
test('right GPT/divider and half-window coordinates are refused BEFORE prep',async()=>{
 const t=make();await t.api.capture();
 for(const x of [1200,1050,1049]){
  assert.equal((await t.api.prepare({args:t.action(x)})).code,'FOLD_ACTION_OUTSIDE_LEFT_BROWSER');
 }
 assert.equal((await t.api.prepare({args:{...t.action(),viewport_width:1050}})).code,'FOLD_GLOBAL_VIEWPORT_REQUIRED');
 assert.equal(t.jobs.filter(j=>j.type==='computer_use_action_prepare').length,0);
});
test('dragged splitter after phone preparation invalidates action',async()=>{
 const t=make();await t.api.capture();const p=await t.api.prepare({args:t.action()});
 t.setSplit(850);
 const r=await t.api.execute({preparationId:p.preparationId,operationId:'c'.repeat(32)});
 assert.equal(r.code,'FOLD_LAYOUT_CHANGED_BEFORE_ACTION');
 assert.equal(t.jobs.filter(j=>j.type==='computer_use_action_execute').length,0);
});
test('changed browser app or reused stale job ID cannot execute',async()=>{
 const t=make();await t.api.capture();const p=await t.api.prepare({args:t.action()});
 t.setApp('com.untrusted.app');
 assert.equal((await t.api.execute({preparationId:p.preparationId,operationId:'e'.repeat(32)})).code,'FOLD_LEFT_WEB_BROWSER_NOT_VERIFIED');
 const u=make({reuse:true});await u.api.capture();const q=await u.api.prepare({args:u.action()});
 assert.equal((await u.api.execute({preparationId:q.preparationId,operationId:'d'.repeat(32)})).code,'FOLD_FRESH_SNAPSHOT_REQUIRED');
 assert.equal(t.jobs.filter(j=>j.type==='computer_use_action_execute').length,0);
});
test('TYPE needs left browser focused editable node and must remain focused',async()=>{
 const value='hello',task={action:'TYPE',text_value:value,text_digest:h(value)};
 const t=make();await t.api.capture();
 assert.equal((await t.api.prepare({args:{...t.action(),...task}})).code,'FOLD_LEFT_WEB_INPUT_FOCUS_REQUIRED');
 const u=make({focus:true});await u.api.capture();
 const p=await u.api.prepare({args:{...u.action(),...task}});
 assert.equal(p.ok,true);u.setFocus(false);
 assert.equal((await u.api.execute({preparationId:p.preparationId,operationId:'d'.repeat(32)})).code,'FOLD_LEFT_WEB_INPUT_FOCUS_REQUIRED');
 assert.equal(u.jobs.filter(j=>j.type==='computer_use_action_execute').length,0);
});
test('left SCROLL requires coordinate inside browser, not right GPT',async()=>{
 const t=make();await t.api.capture();
 assert.equal((await t.api.prepare({args:{...t.action(),action:'SCROLL',scroll_y:500}})).ok,true);
 const u=make();await u.api.capture();
 assert.equal((await u.api.prepare({args:{...u.action(1500),action:'SCROLL',scroll_y:500}})).code,'FOLD_ACTION_OUTSIDE_LEFT_BROWSER');
});
test('Samsung Internet allowed and command/session change denies old context',async()=>{
 const t=make({browser:'com.sec.android.app.sbrowser'});
 assert.equal((await t.api.capture()).ok,true);
 t.setSession('changed');
 assert.equal((await t.api.prepare({args:t.action()})).code,'FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
 const u=make();await u.api.capture();u.setCommand('f'.repeat(32));
 assert.equal((await u.api.prepare({args:u.action()})).code,'FRESH_SIGNED_ANDROID_SCREEN_REQUIRED');
});

test('global fold coordinate is translated to REAL R5 work-local viewport before phone prepare',async()=>{
 const t=make();
 await t.api.capture();
 const p=await t.api.prepare({args:t.action(270)});
 assert.equal(p.code,'SIGNED_PHONE_PREPARATION_READY');
 const job=t.jobs.find(j=>j.type==='computer_use_action_prepare');
 assert.ok(job);
 const prepared=t.phoneInputs.find(i=>i.type==='computer_use_action_prepare');
 assert.equal(prepared.args.x,270);
 assert.equal(prepared.args.y,250);
 assert.equal(prepared.args.viewport_width,1050);
 assert.equal(prepared.args.viewport_height,1800);
 assert.equal(prepared.args.action_approval_grant_token,undefined);
 const result=await t.api.execute({preparationId:p.preparationId,operationId:'f'.repeat(32)});
 assert.equal(result.code,'DEVICE_REPORTED_OK_EFFECT_UNVERIFIED');
 const executed=t.phoneInputs.find(i=>i.type==='computer_use_action_execute');
 assert.equal(executed.args.x,270);
 assert.equal(executed.args.viewport_width,1050);
 assert.equal(executed.args.action_approval_grant_token,undefined);
});

test('V4 native Gemini host captures exact signed left-window/right-GPT without trusting a Gemini reply',async()=>{
 const t=make({browser:'com.google.android.googlequicksearchbox',layoutMode:'LEFT_NATIVE_GEMINI_RIGHT_GPT'});
 const result=await t.api.capture();
 assert.equal(result.ok,true);
 assert.equal(result.code,'SIGNED_LEFT_NATIVE_GEMINI_RIGHT_GPT_OBSERVED');
 const owner=t.api.nativeOwnerEvidence();
 assert.equal(owner.backend,'JH_ANDROID_NATIVE');
 assert.equal(owner.deviceId,'fold-phone');
 assert.equal(owner.workWindowId,31);
 assert.equal(owner.chatWindowId,32);
 assert.equal(owner.workPackage,'com.google.android.googlequicksearchbox');
 assert.equal(owner.nativeGeminiWindowVerified,true);
 assert.equal(owner.geminiSurfaceVerified,false);
 assert.equal(owner.geminiAccountVerified,false);
 assert.equal(t.api.verifyNativeOwnerEvidence(owner),true);
 assert.equal(t.api.verifyNativeOwnerEvidence({...owner,workWindowId:32}),false);
 assert.equal(t.api.verifyNativeOwnerEvidence({...owner,commandId:'f'.repeat(32)}),false);
 assert.equal(t.api.verifyNativeOwnerEvidence({...owner,geminiSurfaceVerified:true}),false);
});
test('Gemini host refuses unrelated package and right-pane click without consuming action',async()=>{
 const t=make({browser:'com.android.chrome',layoutMode:'LEFT_NATIVE_GEMINI_RIGHT_GPT'});
 assert.equal((await t.api.capture()).code,'FOLD_LEFT_NATIVE_GEMINI_PACKAGE_REQUIRED');
 assert.equal(t.api.nativeOwnerEvidence(),null);
 const g=make({browser:'com.google.android.googlequicksearchbox',
  layoutMode:'LEFT_NATIVE_GEMINI_RIGHT_GPT'});
 assert.equal((await g.api.capture()).ok,true);
 assert.equal((await g.api.prepare({args:g.action(1400)})).code,'FOLD_ACTION_OUTSIDE_LEFT_BROWSER');
 assert.equal(g.jobs.filter(j=>j.type==='computer_use_action_prepare').length,0);
 assert.equal(g.api.capabilities().protectedApprovalFlowConnected,false);
});
test('native Gemini signed owner becomes invalid on command or session change',async()=>{
 const t=make({browser:'com.google.android.googlequicksearchbox',
  layoutMode:'LEFT_NATIVE_GEMINI_RIGHT_GPT'});
 await t.api.capture();const proof=t.api.nativeOwnerEvidence();
 t.setCommand('f'.repeat(32));
 assert.equal(t.api.nativeOwnerEvidence(),null);
 assert.equal(t.api.verifyNativeOwnerEvidence(proof),false);
 const s=make({browser:'com.google.android.googlequicksearchbox',
  layoutMode:'LEFT_NATIVE_GEMINI_RIGHT_GPT'});
 await s.api.capture();const old=s.api.nativeOwnerEvidence();
 s.setSession('another-session');
 assert.equal(s.api.verifyNativeOwnerEvidence(old),false);
});
test('native Gemini left window still requires a fresh second signed snapshot before a click',async()=>{
 const t=make({browser:'com.google.android.googlequicksearchbox',
  layoutMode:'LEFT_NATIVE_GEMINI_RIGHT_GPT'});
 await t.api.capture();const p=await t.api.prepare({args:t.action(300)});
 assert.equal(p.ok,true);
 t.setSplit(800);
 const effect=await t.api.execute({preparationId:p.preparationId,operationId:'e'.repeat(32)});
 assert.equal(effect.code,'FOLD_LAYOUT_CHANGED_BEFORE_ACTION');
 assert.equal(t.jobs.filter(j=>j.type==='computer_use_action_execute').length,0);
});
