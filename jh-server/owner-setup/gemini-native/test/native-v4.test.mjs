import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiNativeTask,GeminiNativeWorkflow,validDelivery} from '../src/native-workflow.mjs';
import {NATIVE_BACKEND,GEMINI_HOST,hash,safePrompt} from '../src/contract.mjs';
import {createJhBackgroundWebPort} from '../src/jh-background-port.mjs';
import {GeminiSession} from '../src/session.mjs';
import {executeWithJh} from '../src/jh-port.mjs';
const cid='a'.repeat(32),pk='com.sec.android.app.popupcalculator';
function fixture(mode='YOUTUBE',options={}){
 const request={id:'native-task-123',mode,instruction:'핵심을 알려 주세요.',url:'https://youtu.be/jNQXAC9IVRw',
  expectedTargetPackage:pk,nativeAction:{kind:'OPEN_APP',packageName:pk,label:'계산기'}};
 const state=createGeminiNativeTask(request,cid);let now=1000;const calls=[],saved=[],receipts=new Map();
 const observation={taskId:state.id,commandId:cid,deviceId:'device-1',sessionId:'session-1',receiptId:'signed-read',
  backend:NATIVE_BACKEND,workSide:'RIGHT',chatSide:'LEFT',splitVerified:true,observedAt:now,
  packageName:mode==='ANDROID'?'com.android.chrome':GEMINI_HOST,surface:'GEMINI_NATIVE',surfaceVerified:true,
  accountBinding:'opaque-account',conversationId:'conversation-1',input:{unique:true,target:'input-1',text:''},
  submit:{unique:true,target:'send-1',locallyReviewable:true},generating:false,
  includedVideoUseAvailable:true,additionalPaymentRequired:false,videoModeSelected:true,...options.observation};
 const valid=new WeakSet();
 const receipt=(a,outcome='CONFIRMED',extra={})=>{const r={actionId:a.id,taskId:a.taskId,commandId:a.commandId,
  deviceId:a.deviceId,sessionId:a.sessionId,outcome,...extra};valid.add(r);return r};
 const engine={backend:NATIVE_BACKEND,
  observe:async()=>{const o=structuredClone({...observation,observedAt:now});valid.add(o);return o},
  type:async a=>{calls.push(['type',a]);observation.input.text=a.text;observation.input.draftActionId=a.id;return receipt(a)},
  submit:async a=>{calls.push(['submit',a]);observation.sent={actionId:a.id,promptDigest:a.promptDigest,messageId:'sent-1',at:now};
   observation.result={complete:true,sentMessageId:'sent-1',promptDigest:a.promptDigest,videoUrl:state.url,
    text:'확인한 내용입니다.',coverage:'UNKNOWN',fullReplyVerified:false,playable:true,artifactHandle:'current-video'};return receipt(a)},
  openApp:async a=>{calls.push(['open-app',a]);observation.packageName=a.targetPackage;
   observation.targetStateVerified=true;observation.independentOfGeminiReply=true;return receipt(a)},
  exportExistingVideo:async a=>{calls.push(['export',a]);const r=receipt(a,'EXPORTED',{artifact:{taskId:a.taskId,sentMessageId:'sent-1',
   accountBinding:'opaque-account',localPath:'/private/current.mp4',sha256:'b'.repeat(64),bytes:123,mime:'video/mp4',durationSeconds:10}});
   receipts.set(a.id,r);return r},
  lookupExport:async id=>receipts.get(id),
  cancelPending:()=>calls.push(['cancel-engine'])};
 const delivery={playbackOrigins:['https://media.example.com'],verifyArtifact:async()=>true,
  publish:async a=>{calls.push(['publish',a]);const ar=a.payload.artifact??{};
   const r=receipt(a,'DELIVERED',{destination:'CHATGPT',payloadDigest:a.payloadDigest,...ar,
    href:'https://media.example.com/play/owned',playbackVerified:true});receipts.set(a.id,r);return r},
  lookup:async id=>receipts.get(id)};
 const config={save:async s=>saved.push(structuredClone(s)),engine,delivery,
  verifyObservation:async o=>valid.has(o),verifyReceipt:async r=>valid.has(r),clock:()=>now};
 const workflow=new GeminiNativeWorkflow(state,config);
 return {workflow,state,request,config,calls,saved,observation,receipts,receipt,valid,
  tick:x=>{now+=x},count:n=>calls.filter(x=>x[0]===n).length};
}
async function until(f,phase,max=12){let r;while(f.workflow.state.phase!==phase&&max-->0)r=await f.workflow.advance();
 assert.equal(f.workflow.state.phase,phase,JSON.stringify(r));return r}
const gate=()=>{let release;const wait=new Promise(r=>release=r);return {wait,release}};
test('three modes have ONE Android backend; web and old native executors cannot start',()=>{
 for(const mode of ['YOUTUBE','VIDEO','ANDROID'])assert.equal(fixture(mode).state.backend,NATIVE_BACKEND);
 assert.throws(()=>createJhBackgroundWebPort(),/RETIRED/);assert.throws(()=>new GeminiSession(),/NO_REPLAY/);
 const f=fixture();assert.throws(()=>new GeminiNativeWorkflow({...f.state,schema:2},f.config),/V4/);
});
test('Korean final prompt obeys actual shared UTF8 and Unicode limits without truncation',()=>{
 assert.equal(safePrompt('가'.repeat(682)),true);assert.equal(safePrompt('가'.repeat(683)),false);
 assert.equal(safePrompt('🙂'),true);assert.equal(safePrompt('a\u202Eb'),false);assert.equal(safePrompt('a\ud800'),false);
 const f=fixture();assert.throws(()=>createGeminiNativeTask({...f.request,instruction:'가'.repeat(682)},cid),/SHARED_PHONE_LIMIT/);
});
test('YouTube returns matching native reply to GPT, not a claim of whole video inspection',async()=>{
 const f=fixture();const r=await until(f,'DELIVERED');assert.equal(r.result.text,'확인한 내용입니다.');
 assert.equal(r.result.partial,true);assert.equal(r.result.fullVideoInspectionVerified,false);
 assert.deepEqual(f.calls.map(x=>x[0]),['type','submit','publish']);
});
test('VIDEO generation/export/publication each happens once; authenticated playable link required',async()=>{
 const f=fixture('VIDEO');const r=await until(f,'DELIVERED');assert.equal(r.result.href,'https://media.example.com/play/owned');
 assert.equal(r.result.playbackVerified,true);assert.equal(r.result.localPath,undefined);
 assert.deepEqual(f.calls.map(x=>x[0]),['type','submit','export','publish']);
});
test('ANDROID open uses native left task and independent actual app readback',async()=>{
 const f=fixture('ANDROID');const r=await until(f,'DELIVERED');assert.equal(r.result.packageName,pk);
 assert.equal(r.result.effectVerified,true);assert.deepEqual(f.calls.map(x=>x[0]),['open-app','publish']);
});
test('already-open target is not opened twice',async()=>{
 const f=fixture('ANDROID',{observation:{packageName:pk,targetStateVerified:true,independentOfGeminiReply:true}});
 await until(f,'DELIVERED');assert.equal(f.count('open-app'),0);
});
test('Gemini text saying opened is NOT native app proof',async()=>{
 const f=fixture('ANDROID');f.config.engine.openApp=async a=>{f.calls.push(['open-app']);return f.receipt(a)};
 await f.workflow.advance();f.observation.result={text:'계산기를 열었습니다.'};
 assert.equal((await f.workflow.advance()).code,'OUTCOME_PENDING_READ_ONLY');assert.equal(f.count('publish'),0);
});
test('save failure precedes all effects',async()=>{
 const f=fixture();f.workflow.save=async()=>{throw Error('disk failed')};await assert.rejects(f.workflow.advance());assert.equal(f.calls.length,0);
});
test('concurrent advances never reserve two submits',async()=>{
 const f=fixture();await f.workflow.advance();await f.workflow.advance();await Promise.all([f.workflow.advance(),f.workflow.advance()]);assert.equal(f.count('submit'),1);
});
test('lost submit receipt reconciles same sent message without resending',async()=>{
 const f=fixture();const fn=f.config.engine.submit;f.config.engine.submit=async a=>{await fn(a);throw Error('lost')};
 await until(f,'DELIVERED');assert.equal(f.count('submit'),1);
});
test('lost export response reads same export; never regenerate or re-export',async()=>{
 const f=fixture('VIDEO');const fn=f.config.engine.exportExistingVideo;f.config.engine.exportExistingVideo=async a=>{await fn(a);throw Error('lost')};
 await until(f,'DELIVERED');assert.equal(f.count('submit'),1);assert.equal(f.count('export'),1);
});
test('lost delivery response is reconciled by lookup rather than republishing',async()=>{
 const f=fixture();const fn=f.config.delivery.publish;f.config.delivery.publish=async a=>{await fn(a);throw Error('lost')};
 await until(f,'DELIVERED');assert.equal(f.count('publish'),1);
});
test('restart reads old uncertain submission only, no automatic task continuation',async()=>{
 const f=fixture();f.config.engine.submit=async()=>{f.calls.push(['submit']);throw Error('lost')};
 await f.workflow.advance();await f.workflow.advance();await f.workflow.advance();
 f.workflow=new GeminiNativeWorkflow(f.saved.at(-1),f.config);
 for(let i=0;i<3;i++)assert.equal((await f.workflow.advance()).code,'OUTCOME_PENDING_READ_ONLY');
 assert.equal(f.count('submit'),1);
});
test('restored READY result never silently starts a new delivery',async()=>{
 const f=fixture();await until(f,'RESULT_READY');f.workflow=new GeminiNativeWorkflow(f.saved.at(-1),f.config);
 assert.equal((await f.workflow.advance()).code,'RESTORED_TASK_READ_ONLY_NO_AUTO_CONTINUE');assert.equal(f.count('publish'),0);
});
test('wrong-command, stale, swapped-pane and changed-session observations do not act',async()=>{
 for(const change of [{commandId:'f'.repeat(32)},{workSide:'LEFT',chatSide:'RIGHT'},{splitVerified:false},{backend:'GEMINI_WEB'}]){
  const f=fixture('YOUTUBE',{observation:change});assert.equal((await f.workflow.advance()).code,'FRESH_SIGNED_NATIVE_OBSERVATION_REQUIRED');assert.equal(f.calls.length,0);
 }
 const f=fixture();await f.workflow.advance();f.observation.sessionId='other';assert.equal((await f.workflow.advance()).code,'FRESH_SIGNED_NATIVE_OBSERVATION_REQUIRED');assert.equal(f.count('submit'),0);
});
test('a JSON verified flag without actual host verifier is rejected',async()=>{
 const f=fixture();f.config.engine.observe=async()=>({...f.observation,verified:true});assert.equal((await f.workflow.advance()).code,'FRESH_SIGNED_NATIVE_OBSERVATION_REQUIRED');assert.equal(f.calls.length,0);
});
test('existing draft remains intact',async()=>{
 const f=fixture();f.observation.input.text='작성 중인 내용';assert.equal((await f.workflow.advance()).code,'EXISTING_DRAFT_NOT_OVERWRITTEN');assert.equal(f.calls.length,0);
});
test('changed draft, account and conversation cannot be submitted',async()=>{
 for(const key of ['draft','accountBinding','conversationId']){
  const f=fixture();await f.workflow.advance();await f.workflow.advance();
  if(key==='draft')f.observation.input.text='다른 내용';else f.observation[key]='other';
  assert.match((await f.workflow.advance()).code,/DRAFT_CHANGED|ACCOUNT_OR_CONVERSATION_CHANGED/);assert.equal(f.count('submit'),0);
 }
});
test('missing quota/payment evidence or busy Gemini never triggers generation',async()=>{
 for(const change of [{includedVideoUseAvailable:false},{additionalPaymentRequired:true},{videoModeSelected:false}]){
  const f=fixture('VIDEO',{observation:change});assert.equal((await f.workflow.advance()).code,'INCLUDED_VIDEO_QUOTA_AND_MODE_REQUIRED');assert.equal(f.calls.length,0);
 }
});
test('wrong message and wrong video do not satisfy a summary',async()=>{
 const f=fixture();await until(f,'WAITING');f.observation.result.sentMessageId='wrong';assert.equal((await f.workflow.advance()).code,'WAIT_FOR_MATCHING_GENERATION_RESULT');
 f.observation.result.sentMessageId='sent-1';f.observation.result.videoUrl='https://www.youtube.com/watch?v=aaaaaaaaaaa';
 assert.equal((await f.workflow.advance()).code,'MATCHING_VIDEO_RESPONSE_REQUIRED');assert.equal(f.count('publish'),0);
});
test('partial/truncated output cannot be upgraded to full by one boolean',async()=>{
 const f=fixture();await until(f,'WAITING');f.observation.result.fullReplyVerified=true;
 const r=await until(f,'DELIVERED');assert.equal(r.result.fullReplyVerified,false);
});
test('another task video artifact is rejected even when verifier is overly permissive',async()=>{
 const f=fixture('VIDEO');await until(f,'WAITING');await f.workflow.advance();
 const r=f.receipts.get(f.workflow.state.pending.id);r.artifact.taskId='wrong';
 assert.equal((await f.workflow.advance()).code,'VIDEO_BYTES_AND_REQUEST_MISMATCH');assert.equal(f.count('publish'),0);
});
test('unapproved private URL and wrong bytes cannot become a playback link',()=>{
 const artifact={sha256:'b'.repeat(64),bytes:123,mime:'video/mp4',durationSeconds:10};
 const r={...artifact,destination:'CHATGPT',href:'https://media.example.com/play/1',playbackVerified:true};
 assert.equal(validDelivery(r,{kind:'VIDEO',artifact},['https://media.example.com']),true);
 for(const change of [{href:'blob:abc'},{href:'https://unknown.example/play'},{sha256:'a'.repeat(64)},{playbackVerified:false},{href:'https://user:pass@media.example.com/play'}])
  assert.equal(validDelivery({...r,...change},{kind:'VIDEO',artifact},['https://media.example.com']),false);
});
test('cancel while screen read is pending sends no input or submit after read resolves',async()=>{
 const f=fixture(),g=gate(),fn=f.config.engine.observe;
 f.config.engine.observe=async q=>{await g.wait;return fn(q)};
 const a=f.workflow.advance();await Promise.resolve();const c=f.workflow.cancel();g.release();await a;await c;
 assert.equal(f.count('type'),0);assert.equal(f.count('submit'),0);assert.equal(f.workflow.state.phase,'CANCELLED');
});
test('cancel while durable reservation is pending prevents subsequent dispatch',async()=>{
 const f=fixture(),g=gate();let inSave=false;
 f.workflow.save=async s=>{if(s.pending){inSave=true;await g.wait}f.saved.push(structuredClone(s))};
 const a=f.workflow.advance();for(let i=0;i<20&&!inSave;i++)await Promise.resolve();assert.equal(inSave,true);
 const c=f.workflow.cancel();g.release();await a;await c;assert.equal(f.count('type'),0);
});
test('cancel after send never promises to undo it or sends it again',async()=>{
 const f=fixture();await f.workflow.advance();await f.workflow.advance();await f.workflow.advance();
 const r=await f.workflow.cancel();assert.equal(r.priorOutcomeMayExist,true);await f.workflow.advance();assert.equal(f.count('submit'),1);
});
function portFixture(kind='SUBMIT'){
 const a={id:'task:1',taskId:'task-1234',commandId:cid,deviceId:'d',sessionId:'s',kind,target:'send',text:'요청',
  promptDigest:hash('요청'),accountBinding:'acct',conversationId:'conv'};
 const b={...a,backend:NATIVE_BACKEND,packageName:GEMINI_HOST,windowId:3,screenDigest:'c'.repeat(64),workSide:'RIGHT',chatSide:'LEFT'};
 let sent=0,cancelled=false;
 const v={...a,actionId:a.id,status:'READY',leaseToken:'real-phone-lease',executeArgs:{original:true},screenDigest:b.screenDigest,
  localApprovalVerified:true,approvalGrantToken:'real-exact-phone-grant',actionDigest:'d'.repeat(64),approvalActionDigest:'d'.repeat(64)};
 const p={prepare:async()=>({original:'signed'}),validatePrepared:async()=>v,readBinding:async()=>b,saveDispatched:async()=>true,
  execute:async()=>{sent++;return {original:'receipt'}},isCancelled:()=>cancelled};
 return {a,b,v,p,sent:()=>sent,cancel:()=>{cancelled=true}};
}
test('original phone grant required for consequential Gemini send, not forged by adapter',async()=>{
 const f=portFixture();f.v.approvalGrantToken=undefined;
 assert.equal((await executeWithJh(f.a,f.p)).code,'EXACT_PHONE_LOCAL_SEND_APPROVAL_REQUIRED');assert.equal(f.sent(),0);
});
test('normal TYPE uses real lease without unnecessary local send approval',async()=>{
 const f=portFixture('TYPE');f.v.localApprovalVerified=false;f.v.approvalGrantToken=undefined;
 assert.equal((await executeWithJh(f.a,f.p)).status,'RECEIPT_REQUIRES_VALIDATION');assert.equal(f.sent(),1);
});
test('approved exact submit still rechecks native binding before original executor',async()=>{
 const f=portFixture();assert.equal((await executeWithJh(f.a,f.p)).status,'RECEIPT_REQUIRES_VALIDATION');assert.equal(f.sent(),1);
});
test('cancellation after async authorization and journal claim cannot dispatch',async()=>{
 for(const where of ['validatePrepared','saveDispatched']){
  const f=portFixture(),old=f.p[where];f.p[where]=async(...a)=>{const r=await old(...a);f.cancel();return r};
  const r=await executeWithJh(f.a,f.p);assert.match(r.code,/CANCELLED/);assert.equal(f.sent(),0);
 }
});
test('durable duplicate claim is read-only, never a second send',async()=>{
 const f=portFixture();f.p.saveDispatched=async()=>false;assert.equal((await executeWithJh(f.a,f.p)).code,'ACTION_ALREADY_RESERVED_READ_SAME_JOB');assert.equal(f.sent(),0);
});

test('default native entry exposes current helpers and never exports old background web factory',async()=>{
 const api=await import('../src/index.mjs');
 for(const k of ['createGeminiNativeTask','GeminiNativeWorkflow','createJhNativeGeminiPort','executeWithJh','discoverGeminiSubmit','inspectVideoArtifact'])assert.equal(typeof api[k],'function');
 assert.equal(api.createJhBackgroundWebPort,undefined);
});
