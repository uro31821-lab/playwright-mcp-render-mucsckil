/** B9 fails closed at the host boundary. No local approvals, task persistence or retries. */
import {isIP} from 'node:net';
const URL_REJECT=/\b(?:password|passwd|token|access_token|refresh_token|session|auth|authorization|key|secret|otp|pin|cvc|cvv)\b/i;
const SECRET_RE=/(?:\b(?:bearer\s+[\w.~-]{8,}|sk-[\w-]{8,})\b|(?:otp|인증번호|보안코드|cvv|cvc|pin|비밀번호)\s*[:：]?\s*\S{3,})/i;
export function fail(code){throw Object.assign(new Error(code),{code});}
export function requireCondition(ok,code){if(!ok)fail(code);}
export function boundedText(v,{min=1,max=2000}={}){
 requireCondition(typeof v==='string'&&v.trim().length>=min&&v.length<=max,'INVALID_TEXT');
 requireCondition(!SECRET_RE.test(v),'LOCAL_SECRET_MUST_NOT_BE_ROUTED');return v.trim();
}
export function safePublicUrl(value){
 requireCondition(typeof value==='string'&&value.length>0&&value.length<=2048,'URL_REQUIRED');
 let u;try{u=new URL(value)}catch{fail('INVALID_URL')}
 requireCondition(u.protocol==='https:'&&!u.username&&!u.password,'HTTPS_PUBLIC_URL_REQUIRED');
 const h=u.hostname.toLowerCase();
 requireCondition(!isIP(h.replace(/^\[|\]$/g,''))&&!/^(?:localhost|.*\.localhost|.*\.local)$/.test(h),'NONPUBLIC_URL_BLOCKED');
 requireCondition(!h.endsWith('.internal')&&!h.endsWith('.onion')&&!h.endsWith('.test'),'NONPUBLIC_URL_BLOCKED');
 requireCondition(!URL_REJECT.test(u.search)||u.search==='','TOKENIZED_URL_NOT_ALLOWED');
 requireCondition(!SECRET_RE.test(value),'LOCAL_SECRET_MUST_NOT_BE_ROUTED');
 return u.toString();
}
const hospitalOps=/(?:병원|의원|진료실|환자|차트|EMR|초음파|ESWL|원무|접수|의무기록).{0,24}(?:운영|매출|진료|처방|예약관리|수당|급여|프로그램|통계|환자관리)|(?:진료|처방|환자기록|검사판독|매출계산).{0,15}(?:병원|의원|환자|직원)/i;
const financeOps=/(?:열대어매매|주식매매|매수|매도|포트폴리오|보유종목|손절|익절|불타기|물타기|정배열).{0,30}(?:주식|ETF|종목|차트|투자|열대어|계좌|비중|수익)?|(?:주식|ETF|종목|계좌).{0,18}(?:매수|매도|매매|비중|손절|익절|정배열|투자금)/i;
export function excludedSpecialty(text){
 if(hospitalOps.test(text))return 'HOSPITAL_CLINICAL_SPECIALTY_EXCLUDED';
 if(financeOps.test(text))return 'STOCK_TRADING_SPECIALTY_EXCLUDED';
 return null;
}
export const EFFECTS=Object.freeze({READ:'READ',NAVIGATE:'NAVIGATE',ANALYZE:'ANALYZE',NON_SENSITIVE_INPUT:'NON_SENSITIVE_INPUT',PREPARE:'PREPARE',EXTERNAL_COMMIT:'EXTERNAL_COMMIT'});
export const SENSITIVE_OPERATIONS=Object.freeze(['PAYMENT','TRANSFER','BOOKING_CONFIRM','SEND','DELETE','ACCOUNT_SECURITY','PURCHASE','SUBSCRIPTION','PROFILE_CHANGE']);
const strongTarget=/(?:결제|구매\s*확정|송금|이체|예약\s*확정|예약\s*완료|예매\s*확정|주문\s*완료|발송|보내기|삭제|탈퇴|비밀번호\s*변경|보안\s*설정|구독\s*신청|예약금\s*지불)/i;
export function classifyObservedAction({effect,screenLabel='',interactionKind='',dataClass='NONE'}={}){
 requireCondition(Object.values(EFFECTS).includes(effect),'UNKNOWN_EFFECT');
 if(effect==='EXTERNAL_COMMIT'||(effect!=='READ'&&effect!=='ANALYZE'&&strongTarget.test(screenLabel)))return 'SENSITIVE';
 if(dataClass==='SECRET'||dataClass==='PAYMENT_CREDENTIAL')return 'BLOCKED';
 if(effect==='NON_SENSITIVE_INPUT'&&interactionKind!=='NON_SENSITIVE_FORM')return 'REVIEW_REQUIRED';
 if(effect==='PREPARE')return 'REVIEW_REQUIRED';
 if(effect==='NAVIGATE'&&interactionKind!=='SAFE_NAVIGATION')return 'REVIEW_REQUIRED';
 return 'GENERAL';
}
export function checkCurrentContext(ctx,{needsRightPane=false,at=Date.now(),maxAgeMs=120000}={}){
 if(!ctx||ctx.current!==true||ctx.cancelled===true||ctx.forcedRestart===true)return {ok:false,code:'WORKFLOW_NOT_CURRENT'};
 if(typeof ctx.workflowId!=='string'||!ctx.workflowId||!Number.isSafeInteger(ctx.generation)||ctx.generation<0)return {ok:false,code:'INVALID_WORKFLOW_BINDING'};
 if(ctx.cancelFenceConfirmed!==true)return {ok:false,code:'CANCEL_FENCE_NOT_CONFIRMED'};
 if(ctx.externalEffectUnknown===true)return {ok:false,code:'UNKNOWN_EXTERNAL_EFFECT_NO_RETRY'};
 if(needsRightPane){
  const p=ctx.splitScreen;
  if(!p||p.verified!==true||p.orientation!=='LEFT_GPT_RIGHT_TARGET'||!p.leftIsGpt||!p.rightTargetId||typeof p.pairDigest!=='string'||!/^[a-f0-9]{32,128}$/i.test(p.pairDigest))return {ok:false,code:'RIGHT_PANE_BINDING_UNVERIFIED'};
  if(!Number.isSafeInteger(p.observedAt)||p.observedAt>at+5000||at-p.observedAt>maxAgeMs)return {ok:false,code:'STALE_RIGHT_PANE_EVIDENCE'};
 }
 return {ok:true};
}
export function guardGeneralStep({plan,stepId,context,observedAction,approval,at=Date.now()}={}){
 if(!plan||plan.status!=='PLANNED'||!Array.isArray(plan.steps))return {ok:false,code:'PLAN_NOT_ACTIVE'};
 const step=plan.steps.find(x=>x.id===stepId);if(!step)return {ok:false,code:'UNKNOWN_STEP'};
 const bind=checkCurrentContext(context,{needsRightPane:step.target==='ANDROID_RIGHT',at});if(!bind.ok)return bind;
 if(plan.workflowId&&plan.workflowId!==context.workflowId)return {ok:false,code:'PLAN_WORKFLOW_MISMATCH'};
 if(plan.generation!==undefined&&plan.generation!==context.generation)return {ok:false,code:'PLAN_GENERATION_MISMATCH'};
 if(step.state==='WAIT_FOR_CONTEXT'||step.state==='WAIT_FOR_SOURCE')return {ok:false,code:step.state};
 const cls=classifyObservedAction({effect:step.effect,screenLabel:observedAction?.screenLabel||'',interactionKind:observedAction?.interactionKind||'',dataClass:observedAction?.dataClass||'NONE'});
 if(cls==='BLOCKED')return {ok:false,code:'LOCAL_SECRET_MUST_NOT_BE_ROUTED'};
 if(cls==='SENSITIVE'||step.approval==='EXPLICIT'){
  // JH B9 never accepts arbitrary GPT-granted approval. Existing JH's gate handles this.
  return {ok:false,code:'EXISTING_JH_APPROVAL_GATE_REQUIRED',handoff:step.tool||'EXISTING_HOST',approvalTokenAccepted:false};
 }
 if(cls==='REVIEW_REQUIRED')return {ok:false,code:'OBSERVED_INTERACTION_NOT_PROVEN_SAFE'};
 if(step.tool==='life_android_split_screen_assistant'&&step.args?.mode!=='START'&&step.args?.mode!=='STATUS')return {ok:false,code:'ANDROID_FOLLOWUP_USE_EXISTING_JH_GATE'};
 return {ok:true,code:'SAFE_FOR_EXISTING_HOST_ONLY',tool:step.tool,args:structuredClone(step.args),workflowId:context.workflowId,generation:context.generation};
}
export function verifyOutcome({invoked,hostResult,evidence,at=Date.now(),existingJHVerifier}={}){
 if(!invoked)return {completed:false,status:'NOT_EXECUTED'};
 if(!hostResult||!evidence||evidence.effectConfirmed!==true)return {completed:false,status:'RESULT_UNKNOWN_NO_RETRY'};
 if(!['MERCHANT_RECEIPT','BOOKING_PROVIDER_CONFIRMATION','DESTINATION_STATE','SERVER_EFFECT_CONFIRMATION'].includes(evidence.kind))return {completed:false,status:'EVIDENCE_INSUFFICIENT'};
 if(!Number.isSafeInteger(evidence.observedAt)||evidence.observedAt>at+5000||at-evidence.observedAt>120000)return {completed:false,status:'STALE_EVIDENCE'};
 if(evidence.resultId!==hostResult.resultId||evidence.workflowId!==hostResult.workflowId||!evidence.resultId)return {completed:false,status:'EVIDENCE_MISMATCH'};
 // Never trust a GPT-provided `effectConfirmed:true`. This MUST be attested by
 // the existing JH result verification/duplicate guard authoritative port.
 if(typeof existingJHVerifier!=='function'||existingJHVerifier(hostResult,evidence)!==true)return {completed:false,status:'EXISTING_JH_VERIFIER_REQUIRED'};
 return {completed:true,status:'EFFECT_CONFIRMED',resultId:hostResult.resultId,evidenceKind:evidence.kind};
}
