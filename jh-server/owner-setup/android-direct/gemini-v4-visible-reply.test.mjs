import test from 'node:test';
import assert from 'node:assert/strict';
import {createV4GeminiVisibleReplyObserver} from './gemini-v4-visible-reply.mjs';
const H='com.google.android.googlequicksearchbox',T='gemini-v4-task-01',C='a'.repeat(32),NOW=1800000000000;
const owner=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
 deviceId:'original-fold',sessionId:'secure56-session',commandId:C,
 workSide:'RIGHT',chatSide:'LEFT',workPackage:H,chatPackage:'com.openai.chatgpt',
 workWindowId:21,chatWindowId:20,workBounds:'1080,0,2160,1800',
 chatBounds:'0,0,1080,1800',observedAt:NOW-1000,nativeGeminiWindowVerified:true});
const persisted=()=>({schema:4,id:T,commandId:C,backend:'JH_ANDROID_NATIVE',
 deviceId:'original-fold',sessionId:'secure56-session',workSide:'RIGHT',chatSide:'LEFT',
 sentMessageId:'submitted-message-1',phase:'WAITING',cancelled:false});
const proof=()=>({kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
 chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'20',
 chatBounds:'0,0,1080,1800',workPackage:H,workWindowId:'21',
 workBounds:'1080,0,2160,1800',observedAtMs:String(NOW-500)});
const assistantRow=(m={})=>({package:H,windowId:'21',viewId:H+':id/assistant_robin_text',
 text:'부분만 보입니다',geminiPlainText:'부분만 보입니다',
 geminiTextDigest:'d'.repeat(64),geminiReadbackSchema:'NATIVE_V4',
 geminiFullReplyVerified:'false',geminiTextPartial:'true',
 geminiVisibleTextLength:'9',sensitive:'false',
 bounds:'1200,200,2000,1000',...m});
function make(x={}){
 let current=owner(),task=persisted(),responses=[{...proof()},assistantRow()],
 queued=0,executed=0;
 const initial={id:'original-signed-job-1',type:'agent_snapshot',status:'queued',
  targetDeviceId:'original-fold',secureSessionId:'secure56-session',commandId:C};
 const api={enabled:true,clock:()=>NOW,
  readOriginalOwner:async()=>({...current}),verifyOriginalOwner:async()=>true,
  readOriginalTask:async()=>({...task}),verifyOriginalTask:async()=>true,
  createOriginalSnapshot:async()=>{queued++;return {...initial}},
  waitOriginalSnapshot:async()=>{executed++;return {...initial,status:'complete',
   result:{ok:true,url:JSON.stringify(responses),splitScreenRequired:true,splitScreen:proof()}}},
  verifyOriginalSnapshot:async()=>true,...x};
 return {obs:createV4GeminiVisibleReplyObserver(api),state:{
  setOwner:f=>{current={...current,...f}},setTask:f=>{task={...task,...f}},
  setRows:r=>{responses=r},counts:()=>({queued,executed})}};
}
const req={taskId:T,commandId:C};
test('original signed Gemini snapshot yields only bounded masked, unbound visible candidate',async()=>{
 const h=make(),r=await h.obs.read(req);
 assert.equal(r.code,'SIGNED_GEMINI_VISIBLE_FRAGMENTS_UNBOUND');
 assert.equal(r.ok,true);assert.equal(r.fragmentCount,1);
 assert.equal(r.fragments[0].maskedText,'부분만 보입니다');
 assert.equal(r.fullReplyVerified,false);assert.equal(r.requestTurnVerified,false);
 assert.equal(r.conversationVerified,false);assert.equal(r.requiresMessageTurnProof,true);
 assert.deepEqual(h.state.counts(),{queued:1,executed:1});
});
test('the user message itself cannot masquerade as a Gemini assistant reply',async()=>{
 const h=make();h.state.setRows([proof(),assistantRow({viewId:H+':id/assistant_robin_user_message_text'})]);
 assert.equal((await h.obs.read(req)).code,'GEMINI_ASSISTANT_REPLY_NOT_VISIBLE');
});
test('no response may be produced until original task has a confirmed sent message',async()=>{
 const h=make();h.state.setTask({sentMessageId:null});
 assert.equal((await h.obs.read(req)).code,'ORIGINAL_GEMINI_SENT_MESSAGE_REQUIRED');
 assert.deepEqual(h.state.counts(),{queued:0,executed:0});
});
test('a fabricated task verified:true cannot defeat the original task verifier',async()=>{
 const h=make({verifyOriginalTask:async()=>false});
 assert.equal((await h.obs.read(req)).code,'ORIGINAL_GEMINI_TASK_UNAUTHENTICATED');
 assert.deepEqual(h.state.counts(),{queued:0,executed:0});
});
test('no phone observation is performed without the current original signed owner',async()=>{
 const h=make({verifyOriginalOwner:async()=>false});
 assert.equal((await h.obs.read(req)).code,'ORIGINAL_GEMINI_RIGHT_OWNER_UNVERIFIED');
 assert.deepEqual(h.state.counts(),{queued:0,executed:0});
});
test('left Gemini/right GPT reversed layout is not a V4 reply source',async()=>{
 const h=make();h.state.setOwner({workSide:'LEFT',chatSide:'RIGHT'});
 assert.equal((await h.obs.read(req)).code,'ORIGINAL_GEMINI_RIGHT_OWNER_UNVERIFIED');
});
test('unknown, incomplete, or signed-wrong phone snapshot never returns reply text',async()=>{
 for(const patch of [{verifyOriginalSnapshot:async()=>false},
  {waitOriginalSnapshot:async()=>({id:'wrong-job',type:'agent_snapshot',status:'complete',result:{ok:true,url:'[]'}})},
  {createOriginalSnapshot:async()=>({id:'x',type:'agent_snapshot',status:'queued',targetDeviceId:'wrong',secureSessionId:'secure56-session',commandId:C})}]){
  const h=make(patch);const r=await h.obs.read(req);
  assert.equal(r.ok,false);
 }
});
test('wrong original ChatGPT, other work app, divider collision, or stale proof fails',async()=>{
 for(const p of [
  {workPackage:'com.android.chrome'},
  {chatPackage:'com.sec.android.app.sbrowser'},
  {workBounds:'800,0,2160,1800'},
  {observedAtMs:String(NOW-60000)},
  {workWindowId:'99'}]){
  const first=proof(),pair={...first,...p};
  const h=make({waitOriginalSnapshot:async()=>({id:'original-signed-job-1',
   type:'agent_snapshot',status:'complete',targetDeviceId:'original-fold',
   secureSessionId:'secure56-session',commandId:C,
   result:{ok:true,url:JSON.stringify([pair,assistantRow()]),splitScreenRequired:true,splitScreen:pair}})});
  assert.equal((await h.obs.read(req)).ok,false,JSON.stringify(p));
 }
});
test('changed owner while in-flight snapshot prevents consuming old screen text',async()=>{
 let current=owner(),n=0;
 const h=make({readOriginalOwner:async()=>{
  n++;return {...current,workWindowId:n===1?21:25};
 }});
 assert.equal((await h.obs.read(req)).code,'GEMINI_WINDOW_CHANGED_DURING_READBACK');
});
test('redacted or unverified assistant node is refused without relaxing masking',async()=>{
 for(const patch of [{sensitive:'true'},{geminiFullReplyVerified:'true'},
  {geminiPlainText:'x'.repeat(801)},{geminiTextDigest:'0'},
  {geminiReadbackSchema:'UNKNOWN'},{geminiTextPartial:'yes'}]){
  const h=make();h.state.setRows([proof(),assistantRow(patch)]);
  assert.equal((await h.obs.read(req)).code,'GEMINI_VISIBLE_TEXT_SCOPE_INVALID',JSON.stringify(patch));
 }
});
test('more than eight candidate assistant fragments fails closed instead of claiming complete transcript',async()=>{
 const h=make();h.state.setRows([proof(),...Array.from({length:9},()=>assistantRow())]);
 assert.equal((await h.obs.read(req)).code,'GEMINI_VISIBLE_NODE_BUDGET_EXCEEDED');
});
test('nonmatching window and wrong package assistant nodes are never included',async()=>{
 const h=make();h.state.setRows([proof(),assistantRow({windowId:'33'}),assistantRow({package:'com.android.chrome'})]);
 assert.equal((await h.obs.read(req)).code,'GEMINI_ASSISTANT_REPLY_NOT_VISIBLE');
});
test('disabled and invalid task paths cannot reach original signed phone queue',async()=>{
 const h=make({enabled:false});
 assert.equal((await h.obs.read(req)).code,'GEMINI_VISIBLE_READBACK_DISABLED');
 assert.deepEqual(h.state.counts(),{queued:0,executed:0});
 const x=make();assert.equal((await x.obs.read({...req,taskId:'../bad'})).code,'SIGNED_COMMAND_AND_GEMINI_TASK_REQUIRED');
});
test('concurrent read cannot generate second signed phone job',async()=>{
 let unblock,arrive;const wait=new Promise(r=>unblock=r),started=new Promise(r=>arrive=r);
 const h=make({waitOriginalSnapshot:async(j)=>{arrive();await wait;return {
   ...j,status:'complete',result:{ok:true,url:JSON.stringify([proof(),assistantRow()]),
    splitScreenRequired:true,splitScreen:proof()}}}});
 const first=h.obs.read(req);await started;
 const second=await h.obs.read(req);
 assert.equal(second.code,'GEMINI_READBACK_IN_PROGRESS');
 unblock();const done=await first;assert.equal(done.ok,true);assert.equal(h.state.counts().queued,1);
});
test('capabilities never claim Gemini message ID, full transcript or actual phone verification',()=>{
 const h=make();const c=h.obs.capabilities();
 assert.equal(c.mode,'LEFT_GPT_RIGHT_NATIVE_GEMINI');assert.equal(c.fullReplyVerified,false);
 assert.equal(c.actualPhoneTested,false);assert.equal(c.readOnly,true);
});
