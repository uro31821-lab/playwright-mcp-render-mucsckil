import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectV4GeminiVisibleTurnSequence as inspect} from './gemini-v4-turn-sequence.mjs';
const H='com.google.android.googlequicksearchbox',W=21;
const hash=x=>createHash('sha256').update(x,'utf8').digest('hex');
const PROMPT='https://www.youtube.com/watch?v=jNQXAC9IVRw\n요약해줘';
const task=()=>({promptDigest:hash(PROMPT),sentMessageId:'stored-message-1'});
const msg=(kind,raw,m={})=>({
 package:H,windowId:String(W),
 viewId:H+(kind==='USER'?':id/assistant_robin_user_message_text':':id/assistant_robin_text'),
 geminiReadbackSchema:'NATIVE_V4',sensitive:'false',
 geminiFullReplyVerified:'false',
 geminiPlainText:raw.length<=800?raw:raw.slice(0,800),
 geminiTextDigest:hash(raw),geminiTextPartial:raw.length>800?'true':'false',
 geminiVisibleTextLength:String(raw.length),...m
});
const call=(rows,more={})=>inspect({task:task(),rows,workPackage:H,workWindowId:W,...more});
const ensureUnverified=r=>{
 assert.equal(r.requestTurnVerified,false);
 assert.equal(r.conversationVerified,false);
 assert.equal(r.fullReplyVerified,false);
 assert.equal(r.productionVerified,false);
 assert.equal(r.autoReplay,false);
 assert.equal(r.autoDeliver,false);
};
test('unique exact prompt followed by ONE assistant node is a visible candidate ONLY',()=>{
 const r=call([{kind:'split_screen_evidence'},msg('USER',PROMPT),msg('ASSISTANT','요약 후보')]);
 assert.equal(r.candidate,true);assert.equal(r.assistantRowIndex,2);
 assert.equal(r.code,'VISIBLE_PROMPT_HASH_AND_SINGLE_FOLLOWING_REPLY_CANDIDATE');
 assert.equal(r.sentMessageIdProven,false);ensureUnverified(r);
});
test('Android UTF8 digest of Korean prompt is compared exactly, not to masked text',()=>{
 const text='질문: 비뇨기과 예약 알림은 어떻게 해?';
 const t={promptDigest:hash(text),sentMessageId:'stored-message-1'};
 const r=call([{},msg('USER',text,{geminiPlainText:'질문: 비뇨기과 예약 알림은 ******'}),
  msg('ASSISTANT','짧은 답변')],{task:t});
 assert.equal(r.candidate,true);ensureUnverified(r);
});
test('no visible user message is not evidence for exact Gemini turn',()=>{
 const r=call([{},msg('ASSISTANT','어떤 과거 대화인지 모름')]);
 assert.equal(r.code,'VISIBLE_TURN_USER_NOT_VISIBLE');ensureUnverified(r);
});
test('a different displayed user prompt cannot correlate to saved original task',()=>{
 const r=call([{},msg('USER','다른 질문'),msg('ASSISTANT','다른 답변')]);
 assert.equal(r.code,'VISIBLE_TURN_PROMPT_HASH_NOT_FOUND');ensureUnverified(r);
});
test('duplicate identical prompts are ambiguous: never pick latest reply',()=>{
 const r=call([msg('USER',PROMPT),msg('ASSISTANT','old'),
  msg('USER',PROMPT),msg('ASSISTANT','new')]);
 assert.equal(r.code,'VISIBLE_TURN_DUPLICATE_PROMPT_AMBIGUOUS');ensureUnverified(r);
});
test('later different user prompt blocks selecting earlier matching prompt',()=>{
 const r=call([msg('USER',PROMPT),msg('ASSISTANT','old'),
  msg('USER','new question'),msg('ASSISTANT','new reply')]);
 assert.equal(r.code,'VISIBLE_TURN_LATER_USER_MESSAGE');ensureUnverified(r);
});
test('assistant before matching prompt is not a following answer',()=>{
 const r=call([{},msg('ASSISTANT','older'),msg('USER',PROMPT)]);
 assert.equal(r.code,'VISIBLE_TURN_REPLY_NOT_AFTER_PROMPT');ensureUnverified(r);
});
test('two post-prompt assistant nodes are not assumed to belong to one complete answer',()=>{
 const r=call([msg('USER',PROMPT),msg('ASSISTANT','part A'),msg('ASSISTANT','part B')]);
 assert.equal(r.code,'VISIBLE_TURN_MULTIPLE_REPLIES_AMBIGUOUS');ensureUnverified(r);
});
test('a previous assistant before the unique prompt does not become the selected candidate',()=>{
 const r=call([msg('ASSISTANT','from another turn'),msg('USER',PROMPT),msg('ASSISTANT','new')]);
 assert.equal(r.candidate,true);assert.equal(r.assistantRowIndex,2);ensureUnverified(r);
});
test('cross-window Gemini message cannot be used even with matching prompt hash',()=>{
 for(const patch of [{windowId:'99'},{package:'com.android.chrome'}]){
  const r=call([msg('USER',PROMPT,patch),msg('ASSISTANT','reply')]);
  assert.equal(r.code,'VISIBLE_TURN_CROSS_WINDOW_MESSAGE');
 }
});
test('malformed original Android message schema is rejected, never upgraded to proof',()=>{
 const patches=[{geminiReadbackSchema:'UNKNOWN'}, {geminiFullReplyVerified:'true'},
  {sensitive:'true'}, {geminiTextDigest:'invalid'},
  {geminiPlainText:'x'.repeat(801)},{geminiVisibleTextLength:'NaN'},
  {geminiTextPartial:'unknown'}, {geminiPlainText:''}];
 for(const patch of patches){
  const r=call([msg('USER',PROMPT,patch),msg('ASSISTANT','reply')]);
  assert.equal(r.code,'VISIBLE_TURN_MESSAGE_SCHEMA_INVALID',JSON.stringify(patch));
 }
});
test('malformed assistant schema is not a valid same-turn candidate',()=>{
 const r=call([msg('USER',PROMPT),msg('ASSISTANT','reply',{geminiTextDigest:'g'.repeat(64)})]);
 assert.equal(r.code,'VISIBLE_TURN_MESSAGE_SCHEMA_INVALID');
});
test('a forged caller verified:true or sentMessageId field cannot turn candidate into verified',()=>{
 const r=call([msg('USER',PROMPT,{verified:true,conversationId:'fake'}),
 msg('ASSISTANT','reply',{verified:true,fullReplyVerified:true,messageId:'fake'})],
 {task:{...task(),verified:true,sentMessageId:'a-forged-message'}});
 assert.equal(r.candidate,true);ensureUnverified(r);
});
test('no digest or wrong package/window/task input fails before candidate creation',()=>{
 for(const v of [{task:{sentMessageId:'x'}},{rows:null},{workPackage:'com.android.chrome'},
  {workWindowId:-1},{workWindowId:'21'},{task:{promptDigest:'0'.repeat(63)}}]){
  const r=call([msg('USER',PROMPT),msg('ASSISTANT','answer')],v);
  assert.equal(r.code,'VISIBLE_TURN_SCOPE_REQUIRED');
 }
});
test('more than 64 visible message nodes refuses association',()=>{
 const rows=Array.from({length:65},(_,i)=>msg(i%2===0?'USER':'ASSISTANT',i===0?PROMPT:'line'+i));
 const r=call(rows);assert.equal(r.code,'VISIBLE_TURN_MESSAGE_BUDGET_EXCEEDED');ensureUnverified(r);
});
test('the output has no prompt text, raw user message or secret metadata',()=>{
 const r=call([msg('USER',PROMPT),msg('ASSISTANT','candidate')]);
 const serialized=JSON.stringify(r);
 assert.equal(serialized.includes(PROMPT),false);
 assert.equal(serialized.includes('stored-message-1'),false);
 assert.equal(Object.hasOwn(r,'text'),false);ensureUnverified(r);
});
test('long masked assistant node stays explicitly partial',()=>{
 const r=call([msg('USER',PROMPT),msg('ASSISTANT','a'.repeat(950))]);
 assert.equal(r.candidate,true);assert.equal(r.nodePartial,true);ensureUnverified(r);
});
