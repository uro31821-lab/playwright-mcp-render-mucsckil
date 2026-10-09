/** Optional, strictly scoped content sidecars for existing checkpoints. Never changes metadata wire.
 * Unicode content is UTF-8/base64; raw image and HEALTH record types are not accepted.
 * No credential fields exist. The trusted host must classify query text; this is NOT a semantic secret scanner. */
import {exact,fail,isId,isHex,sha} from './life-checkpoint-wire.mjs';
export const CONTENT_MAX_BYTES=262144;
export const CATEGORIES=new Set(['INPUT_TEXT','INPUT_SOURCE','RESULT_TEXT']);
export function contentCanonical(o,depth=0){
 if(depth>12)fail('content_structure_limit');
 if(o===null||typeof o==='boolean')return JSON.stringify(o);
 if(typeof o==='number'){if(!Number.isSafeInteger(o)||Object.is(o,-0))fail('content_integer_invalid');return String(o);}
 if(typeof o==='string'){if(!/^[\x20-\x7e]*$/.test(o)||o.length>131072)fail('content_string_invalid');return JSON.stringify(o);}
 if(Array.isArray(o))return '['+o.map(x=>contentCanonical(x,depth+1)).join(',')+']';
 if(o&&typeof o==='object')return '{'+Object.keys(o).sort().map(k=>contentCanonical(k,depth+1)+':'+contentCanonical(o[k],depth+1)).join(',')+'}';
 fail('content_value_invalid');
}
export function contentParse(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>CONTENT_MAX_BYTES)fail('content_size_invalid');
 let text,o;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);o=JSON.parse(text);}catch{fail('content_json_invalid');}
 if(contentCanonical(o)!==text)fail('content_noncanonical_json');return o;
}
export function decodePayload(payload){
 if(typeof payload!=='string'||payload.length>131072||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload))fail('content_base64_invalid');
 const b=Buffer.from(payload,'base64');if(b.toString('base64')!==payload)fail('content_base64_invalid');return b;
}
export function contentRecord(r){
 exact(r,'version workflowId planDigest ref category kind taskId providerId actionDigest evidenceDigest verifiedAt createdAt expiresAt payload payloadDigest proofDigest factSource');
 if(r.version!==1||!isId(r.workflowId)||!isHex(r.planDigest)||!isId(r.ref)||!CATEGORIES.has(r.category)||!isHex(r.payloadDigest))fail('content_record_invalid');
 for(const k of ['verifiedAt','createdAt','expiresAt'])if(!Number.isSafeInteger(r[k])||r[k]<0)fail('content_time_invalid');
 if(r.expiresAt<=r.createdAt||r.expiresAt-r.createdAt>600000)fail('content_lifetime_invalid');
 const b=decodePayload(r.payload);
 try{
  if(sha(b)!==r.payloadDigest)fail('content_digest_invalid');
  if(r.category==='RESULT_TEXT'){
   if(!r.ref.startsWith('receipt_')||!['MEMORIA','BOOKTOON'].includes(r.kind)||!isId(r.taskId)||!isId(r.providerId)||!isHex(r.actionDigest)||!isHex(r.evidenceDigest)||r.verifiedAt!==r.createdAt||(r.proofDigest!==null&&!isHex(r.proofDigest))||!['PROVIDER_RESPONSE','FOLLOWUP_READ'].includes(r.factSource))fail('content_result_binding_invalid');
  }else{
   if(!r.ref.startsWith('input_')||!['QUERY','MEAL','PAGES'].includes(r.kind)||r.taskId!==null||r.providerId!==null||r.actionDigest!==null||r.evidenceDigest!==null||r.verifiedAt!==0||r.proofDigest!==null||r.factSource!==null)fail('content_input_binding_invalid');
  }
  if(r.category==='INPUT_SOURCE'){
   const x=contentParse(b);exact(x,'sourceProvider sourceRef contentDigest pageStart pageEnd');
   if(!isId(x.sourceProvider)||!isId(x.sourceRef)||!isHex(x.contentDigest))fail('content_source_invalid');
   if(r.kind==='PAGES'){
    if(!Number.isSafeInteger(x.pageStart)||!Number.isSafeInteger(x.pageEnd)||x.pageStart<1||x.pageEnd<x.pageStart||x.pageEnd-x.pageStart>29)fail('content_page_range_invalid');
   }else if(x.pageStart!==null||x.pageEnd!==null)fail('content_page_range_invalid');
  }else{
   if(r.category==='INPUT_TEXT'&&r.kind!=='QUERY')fail('content_class_not_supported');
   let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(b);}catch{fail('content_unicode_invalid');}
   if(!text.trim()||text.includes('\u0000')||text.length>(r.category==='INPUT_TEXT'?20000:24000))fail('content_text_size_invalid');
  }
 }finally{b.fill(0);}
 if(Buffer.byteLength(contentCanonical(r))>CONTENT_MAX_BYTES-4096)fail('content_size_invalid');return r;
}
export function contentTime(r,now){if(!Number.isSafeInteger(now)||r.createdAt>now||r.expiresAt<=now)fail('content_expired_or_future');}
export function contentBinding(checkpoint,r,reading=false){
 if(!checkpoint||checkpoint.planDigest!==r.planDigest||checkpoint.workflowId!==r.workflowId)fail('content_checkpoint_binding');
 if(checkpoint.paused||checkpoint.cancelled)fail('content_workflow_stopped');
 if(r.category!=='RESULT_TEXT'){
  if(!reading&&checkpoint.entries.some(e=>e.invocations!==0))fail('content_input_after_dispatch');
  return;
 }
 const e=checkpoint.entries.find(e=>e.taskId===r.taskId);
 if(!e||e.providerId!==r.providerId||e.invocations<1)fail('content_task_binding');
 if(reading){
  if(e.status!=='SUCCEEDED'||e.receiptRef!==r.ref||e.evidenceDigest!==r.evidenceDigest||e.verifiedAt!==r.verifiedAt)fail('content_result_not_committed');
 }else if(e.status!=='RUNNING')fail('content_result_not_running');
}
