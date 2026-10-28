import test from 'node:test';
import assert from 'node:assert/strict';
import {createV4RightGeminiPhoneBinding} from './gemini-v4-right-phone-binding.mjs';
const cid='a'.repeat(32),op='b'.repeat(32),t=1800000000000;
const evidence=()=>({backend:'JH_ANDROID_NATIVE',current:true,secure56:true,
 commandId:cid,sessionId:'secure-56',deviceId:'phone-one',
 workSide:'RIGHT',chatSide:'LEFT',
 workPackage:'com.google.android.googlequicksearchbox',chatPackage:'com.openai.chatgpt',
 nativeGeminiWindowVerified:true,workWindowId:33,chatWindowId:32,
 workBounds:'1080,0,2160,1800',chatBounds:'0,0,1080,1800',
 observedAt:t-2000});
const receipt=o=>({ok:true,code:'GEMINI_EXISTING_RIGHT_WINDOW_BOUND',
 workSide:'RIGHT',chatSide:'LEFT',workWindowId:o.workWindowId,
 chatWindowId:o.chatWindowId,workPackage:o.workPackage,
 workBounds:o.workBounds,chatBounds:o.chatBounds,
 requestSent:false,resultVerified:false,automaticReplayAllowed:false});
function make(extra={}){
 const calls=[],reserved=new Set(),base=evidence();
 const ports={
 enabled:true,clock:()=>t,readSignedOwner:async()=>({...base}),
 verifySignedOwner:async()=>true,
 claimOriginalOperation:async(id,body)=>{calls.push(['claim',body]);if(reserved.has(id))return false;reserved.add(id);return true},
 startOriginalSignedJob:async payload=>{calls.push(['phone-job',payload]);return {jobId:'job-1',status:'queued'}},
 readOriginalJob:async()=>({operationId:op,commandId:cid,deviceId:base.deviceId,
  sessionId:base.sessionId,status:'COMPLETED',payload:receipt(base)}),
 verifyOriginalCompletion:async()=>true,...extra};
 return {gate:createV4RightGeminiPhoneBinding(ports),calls,reserved,base};
}
const q={commandId:cid,operationId:op};
test('refuses missing authenticated Secure56 callback instead of constructing second executor',()=>{
 assert.throws(()=>createV4RightGeminiPhoneBinding({}),/ORIGINAL_SECURE56_SIGNED_BINDING_PORTS_REQUIRED/);
});
test('disabled candidate never reaches original phone or durable journal',async()=>{
 const h=make({enabled:false});assert.equal((await h.gate.bind(q)).code,'V4_RIGHT_GEMINI_BINDING_DISABLED');
 assert.deepEqual(h.calls,[]);
});
test('only exact current signed command and one operation id accepted',async()=>{
 const h=make();for(const x of [{...q,commandId:'x'},{...q,operationId:'bad'},{}]){
  assert.equal((await h.gate.bind(x)).code,'SIGNED_COMMAND_AND_ORIGINAL_OPERATION_REQUIRED');
 }assert.deepEqual(h.calls,[]);
});
test('correct LEFT GPT RIGHT Gemini binds a read-only original phone job once',async()=>{
 const h=make(),r=await h.gate.bind(q);
 assert.equal(r.code,'RIGHT_GEMINI_BINDING_JOB_STARTED_READ_STATUS');
 assert.equal(r.status,'PENDING');assert.equal(r.automaticReplay,false);
 assert.equal(h.calls.length,2);
 assert.equal(h.calls[0][1].target,'right_gemini_existing');
 assert.equal(h.calls[1][1].expectedWorkBounds,'1080,0,2160,1800');
 assert.equal(h.calls[1][1].expectedChatBounds,'0,0,1080,1800');
 assert.equal(h.calls[1][1].commandId,cid);
});
test('old reversed layout, Chrome right, stale pane and overlapping split rejected',async()=>{
 const changes=[
 {workSide:'LEFT',chatSide:'RIGHT'},
 {workPackage:'com.android.chrome'},
 {chatPackage:'com.android.chrome'},
 {observedAt:t-12000},
 {workBounds:'800,0,2160,1800'},
 {chatWindowId:33}, {deviceId:''}
 ];
 for(const x of changes){
  const h=make({readSignedOwner:async()=>({...evidence(),...x})});
  assert.equal((await h.gate.bind(q)).code,'CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED',JSON.stringify(x));
  assert.deepEqual(h.calls,[]);
 }
});
test('untrusted verified:true field cannot replace original signed verifier',async()=>{
 const h=make({verifySignedOwner:async()=>false});
 assert.equal((await h.gate.bind({...q,verified:true})).code,'CURRENT_SIGNED_LEFT_GPT_RIGHT_GEMINI_REQUIRED');
 assert.deepEqual(h.calls,[]);
});
test('durable original claim prevents duplicated open_url binding even after response loss',async()=>{
 const h=make();await h.gate.bind(q);
 assert.equal((await h.gate.bind(q)).code,'ORIGINAL_OPERATION_ALREADY_RESERVED_READ_ONLY');
 assert.equal(h.calls.filter(x=>x[0]==='phone-job').length,1);
});
test('original signed command/split changing after reservation prevents any phone send',async()=>{
 let read=0;
 const h=make({readSignedOwner:async()=>({...evidence(),workWindowId:++read===1?33:34})});
 assert.equal((await h.gate.bind(q)).code,'SIGNED_GEMINI_PAIR_CHANGED_BEFORE_SEND_NO_REPLAY');
 assert.equal(h.calls.filter(x=>x[0]==='phone-job').length,0);
 assert.equal(h.reserved.size,1);
});
test('lost phone response cannot request a second phone job automatically',async()=>{
 const h=make({startOriginalSignedJob:async()=>{throw Error('network vanished')}});
 assert.equal((await h.gate.bind(q)).code,'GEMINI_PHONE_JOB_OUTCOME_UNKNOWN_NO_REPLAY');
 assert.equal((await h.gate.bind(q)).code,'ORIGINAL_OPERATION_ALREADY_RESERVED_READ_ONLY');
});
test('status checks original authenticated job, not a caller receipt, without replay',async()=>{
 const h=make();const r=await h.gate.status({...q,receipt:{verified:true,requestSent:true}});
 assert.equal(r.code,'SIGNED_GEMINI_RIGHT_WINDOW_BOUND');
 assert.equal(r.windowBound,true);assert.equal(r.requestSent,false);
 assert.equal(r.geminiDraftVerified,false);assert.equal(r.geminiReplyVerified,false);
 assert.equal(r.videoVerified,false);assert.equal(h.calls.length,0);
});
test('unsignatured phone completion is not trusted regardless of ok:true',async()=>{
 const h=make({verifyOriginalCompletion:async()=>false});
 assert.equal((await h.gate.status(q)).code,'ORIGINAL_GEMINI_RECEIPT_NOT_AUTHENTICATED');
});
test('mismatched phone window, submission or media success never yields bound state',async()=>{
 for(const result of [{workWindowId:50},{workSide:'LEFT'},{requestSent:true},
  {resultVerified:true},{automaticReplayAllowed:true},{code:'GEMINI_DONE'}]){
  const h=make({readOriginalJob:async()=>({...q,deviceId:'phone-one',sessionId:'secure-56',
   status:'COMPLETED',payload:{...receipt(evidence()),...result}})});
  assert.equal((await h.gate.status(q)).code,'GEMINI_RIGHT_PAIR_READBACK_MISMATCH',JSON.stringify(result));
 }
});
test('an original job from a different session is not an accepted result',async()=>{
 const h=make({readOriginalJob:async()=>({...q,deviceId:'phone-one',sessionId:'old',status:'COMPLETED',payload:receipt(evidence())})});
 assert.equal((await h.gate.status(q)).code,'ORIGINAL_GEMINI_PHONE_BINDING_PENDING_OR_UNKNOWN');
});
test('post-receipt window change invalidates previous current-device claim',async()=>{
 let read=0;const h=make({readSignedOwner:async()=>({...evidence(),workWindowId:++read===1?33:34})});
 assert.equal((await h.gate.status(q)).code,'GEMINI_WINDOW_CHANGED_AFTER_READBACK');
});
test('simultaneous requests for same operation id cannot both reserve or send',async()=>{
 let release,entered;
 const wait=new Promise(r=>release=r);
 const signal=new Promise(r=>entered=r);
 const h=make({claimOriginalOperation:async(id,body)=>{h.calls.push(['claim',body]);entered();await wait;return true}});
 const first=h.gate.bind(q);await signal;
 const duplicate=await h.gate.bind(q);assert.equal(duplicate.code,'BINDING_ALREADY_REQUESTED_STATUS_ONLY');
 release();await first;assert.equal(h.calls.filter(x=>x[0]==='phone-job').length,1);
});
test('capabilities never advertise native send, playback, or production installation',()=>{
 const c=make().gate.capabilities();assert.equal(c.actualPhoneTested,false);
 assert.equal(c.productionRegistered,false);assert.equal(c.automaticReplay,false);
 assert.equal(c.mode,'LEFT_GPT_RIGHT_NATIVE_GEMINI');
});
