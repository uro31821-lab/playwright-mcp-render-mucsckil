/** JH167 V4: conservative Gemini native visible-turn SEQUENCE candidate.
 *
 * Inputs are trusted ONLY when the caller has independently authenticated an
 * original Secure56 agent_snapshot, current command, saved task and fold proof.
 * AndroidAgent includes SHA256 of the raw current user-message node and masked
 * assistant text. Matching this digest and DOM/accessibility traversal order
 * is NOT an authenticated Gemini conversation or message-turn identifier.
 * No prompt, raw user text, passwords, or UI grant is returned.
 *
 * This module never executes or sends anything. In particular, it must NEVER
 * be treated as proof of full answer, video content, or ChatGPT delivery.
 */
const H='com.google.android.googlequicksearchbox';
const USER=H+':id/assistant_robin_user_message_text';
const ASSISTANT=H+':id/assistant_robin_text';
const HEX64=/^[a-f0-9]{64}$/;
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const result=(code,extra={})=>Object.freeze({
  candidate:false,code,requestTurnVerified:false,conversationVerified:false,
  fullReplyVerified:false,productionVerified:false,
  autoReplay:false,autoDeliver:false,...extra
});
const validRow=r=>isObj(r)&&r.geminiReadbackSchema==='NATIVE_V4'&&
  r.sensitive==='false'&&r.geminiFullReplyVerified==='false'&&
  HEX64.test(r.geminiTextDigest??'')&&
  typeof r.geminiPlainText==='string'&&
  r.geminiPlainText.length>=1&&r.geminiPlainText.length<=800&&
  (r.geminiTextPartial==='true'||r.geminiTextPartial==='false')&&
  typeof r.geminiVisibleTextLength==='string'&&
  /^(0|[1-9][0-9]{0,5})$/.test(r.geminiVisibleTextLength)&&
  Number(r.geminiVisibleTextLength)>0;

/** @param {object} input - task and rows already verified by original host */
export function inspectV4GeminiVisibleTurnSequence({
  task,rows,workPackage=H,workWindowId
}={}){
  if(!isObj(task)||!HEX64.test(task.promptDigest??'')||
     !Array.isArray(rows)||rows.length<2||rows.length>3000||
     workPackage!==H||!Number.isSafeInteger(workWindowId)||workWindowId<0)
    return result('VISIBLE_TURN_SCOPE_REQUIRED');

  let messages=[];
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    if(!isObj(r)||r.viewId!==USER&&r.viewId!==ASSISTANT)continue;
    // A target-message identity appearing on some other window is
    // ambiguous even if a valid target exists: block all association.
    if(r.package!==H||String(r.windowId)!==String(workWindowId))
      return result('VISIBLE_TURN_CROSS_WINDOW_MESSAGE');
    if(!validRow(r))return result('VISIBLE_TURN_MESSAGE_SCHEMA_INVALID');
    messages.push({index:i,kind:r.viewId===USER?'USER':'ASSISTANT',
      digest:r.geminiTextDigest,nodePartial:r.geminiTextPartial==='true'});
    if(messages.length>64)return result('VISIBLE_TURN_MESSAGE_BUDGET_EXCEEDED');
  }
  const users=messages.filter(x=>x.kind==='USER');
  if(!users.length)return result('VISIBLE_TURN_USER_NOT_VISIBLE');
  const matches=users.filter(x=>x.digest===task.promptDigest);
  if(matches.length===0)return result('VISIBLE_TURN_PROMPT_HASH_NOT_FOUND');
  if(matches.length!==1)return result('VISIBLE_TURN_DUPLICATE_PROMPT_AMBIGUOUS');
  const matched=matches[0];
  // If a newer user bubble is visible, the assistant could be replying
  // to that newer message or a different account/conversation.
  if(users[users.length-1]!==matched)
    return result('VISIBLE_TURN_LATER_USER_MESSAGE');
  const after=messages.filter(x=>x.kind==='ASSISTANT'&&x.index>matched.index);
  if(after.length===0)return result('VISIBLE_TURN_REPLY_NOT_AFTER_PROMPT');
  if(after.length!==1)return result('VISIBLE_TURN_MULTIPLE_REPLIES_AMBIGUOUS');
  // Traversal order and exact prompt hash provide a *candidate*, not
  // Gemini's authenticated sentMessageId/conversationId binding.
  return result('VISIBLE_PROMPT_HASH_AND_SINGLE_FOLLOWING_REPLY_CANDIDATE',{
    candidate:true,assistantRowIndex:after[0].index,
    nodePartial:after[0].nodePartial,
    source:'SIGNED_VISIBLE_SEQUENCE_ONLY',
    sentMessageIdProven:false
  });
}
