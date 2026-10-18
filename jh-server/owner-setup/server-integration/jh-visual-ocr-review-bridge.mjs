/**
 * Review-only OCR bridge: inspect native right-pane photo -> execute only the
 * exact device-emitted review selector -> report redacted status. Never approve,
 * capture, start OCR, retry, or export raw pixels/account information.
 */
const MARKER='__JH_VISUAL_OCR_V1__';
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isUUID=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(x);
export function readReviewCommand(snapshot,checkSplit){
  if(snapshot?.status!=='complete'||snapshot?.result?.ok!==true)return {ok:false,code:'OCR_SNAPSHOT_NOT_COMPLETE'};
  const r=snapshot.result;
  if(typeof r.url!=='string'||Buffer.byteLength(r.url,'utf8')>2_000_000)return {ok:false,code:'OCR_SNAPSHOT_INVALID'};
  let rows;try{rows=JSON.parse(r.url)}catch{return {ok:false,code:'OCR_SNAPSHOT_INVALID'}};
  if(!Array.isArray(rows)||rows.length>3000||rows.some(x=>!isObject(x)))return {ok:false,code:'OCR_SNAPSHOT_INVALID'};
  if(typeof checkSplit!=='function'||checkSplit(r,rows)?.ok!==true)return {ok:false,code:'OCR_SPLIT_PROOF_REQUIRED'};
  if(rows.some(x=>x.restricted==='true'||x.secureContext==='true'||x.locked==='true'))
    return {ok:false,code:'OCR_SECURE_VIEW_BLOCKED'};
  const matches=rows.filter(x=>x.kind==='native_photo_ocr_review_available' && x.visualOcr);
  if(matches.length!==1)return {ok:false,code:matches.length?'OCR_REVIEW_AMBIGUOUS':'OCR_PHOTO_REVIEW_NOT_AVAILABLE'};
  let v;try{v=JSON.parse(matches[0].visualOcr)}catch{return {ok:false,code:'OCR_REVIEW_METADATA_INVALID'}};
  if(v?.carrier!=='android_step:set_text')return {ok:false,code:'OCR_REVIEW_CARRIER_INVALID'};
  const c=v.reviewToolArguments;
  if(c?.action!=='set_text'||c.value!==''||typeof c.text!=='string'||c.text.length>512)
    return {ok:false,code:'OCR_REVIEW_COMMAND_INVALID'};
  const parts=c.text.split('|');
  if(parts.length!==5||parts[0]!==MARKER||!isUUID(parts[1])||!token(parts[2])||parts[3]!=='visual_ocr_review'||parts[4]!=='')
    return {ok:false,code:'OCR_REVIEW_COMMAND_INVALID'};
  return {ok:true,code:'OCR_READONLY_REVIEW_READY',args:{action:c.action,text:c.text,value:c.value}};
}
export function safeOcrReviewOutcome(job){
  if(job?.status!=='complete')return {ok:false,code:'OCR_REVIEW_RESULT_UNKNOWN_NO_REPLAY'};
  if(job?.result?.ok!==true)return {ok:false,code:'OCR_REVIEW_JOB_FAILED_NO_REPLAY'};
  let r=job.result;
  const payload=typeof r.url==='string'?r.url:r.result;
  if(typeof payload==='string'){try{r=JSON.parse(payload)}catch{return {ok:false,code:'OCR_REVIEW_RESULT_UNPARSEABLE'}}}
  else if(isObject(payload))r=payload;
  const code=typeof r.code==='string'&&/^[a-z0-9_]{1,90}$/.test(r.code)?r.code:'ocr_review_result_unavailable';
  const reviewOnly=code==='fresh_consent_required'||code==='target_selection_required';
  if(r.ok===true && !reviewOnly)return {ok:false,code:'OCR_REVIEW_UNEXPECTED_RESULT',capturePerformed:false,automaticApprovalAllowed:false};
  return {ok:r.ok===true&&reviewOnly,code,localConsentRequired:r.freshConsentRequired===true,
    capturePerformed:false,automaticApprovalAllowed:false,
    note:'Consent and OCR-start are device-local; no selector, token or account data is exposed.'};
}
