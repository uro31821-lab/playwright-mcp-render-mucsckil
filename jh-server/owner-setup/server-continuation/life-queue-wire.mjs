/** Durable admission references for existing JH workflows. No raw input, prompt, media,
 * credential, provider result, or arbitrary task graph can be submitted to this endpoint. */
import {canonical,exact,isId,isHex,sha,fail} from './life-checkpoint-wire.mjs';
export function queueDescriptor(d){
 exact(d,'version model requests');
 if(d.version!==1||typeof d.model!=='string'||!/^gpt-[A-Za-z0-9_.-]{1,96}$/.test(d.model)||!Array.isArray(d.requests)||d.requests.length<1||d.requests.length>4)fail('queue_descriptor_invalid');
 const refs=new Set(),tasks=[];
 d.requests.forEach((r,i)=>{
  exact(r,'operation inputRef pageStart pageEnd');
  if(!isId(r.inputRef)||!r.inputRef.startsWith('input_')||refs.has(r.inputRef))fail('queue_input_ref_invalid');
  refs.add(r.inputRef);
  if(r.operation==='FIND_MEMORY'){
   if(r.pageStart!==null||r.pageEnd!==null)fail('queue_page_range_invalid');
   tasks.push(`life_${i}_memory_search`,`life_${i}_memory_answer`);
  }else if(r.operation==='READING_PREVIEW'){
   if(!Number.isSafeInteger(r.pageStart)||!Number.isSafeInteger(r.pageEnd)||r.pageStart<1||r.pageEnd<r.pageStart||r.pageEnd-r.pageStart>29)fail('queue_page_range_invalid');
   tasks.push(`life_${i}_book_source`,`life_${i}_book_preview`);
  }else fail('queue_operation_not_persistable'); // FOOD/health stays on the unchanged local path.
 });
 return {descriptor:JSON.parse(canonical(d)),digest:sha(canonical(d)),refs,tasks};
}
export function queueGrant(g){
 if(!g||!isHex(g.planDigest)||!isHex(g.descriptorDigest)||!Number.isSafeInteger(g.expiresAt)||g.expiresAt<0||
  !(g.readOnlyTasks instanceof Set)||g.readOnlyTasks.size<1||g.readOnlyTasks.size>16||[...g.readOnlyTasks].some(x=>!isId(x)))fail('queue_grant_invalid');
 return {planDigest:g.planDigest,descriptorDigest:g.descriptorDigest,expiresAt:g.expiresAt,readOnlyTasks:new Set(g.readOnlyTasks)};
}
export function queueContext(c){
 if(!c||!isHex(c.workerDigest)||!(c.queueGrants instanceof Map)||c.queueGrants.size>8||[...c.queueGrants.keys()].some(x=>!isId(x)))fail('queue_scope_denied');
 return {workerDigest:c.workerDigest,queueGrants:new Map([...c.queueGrants].map(([id,g])=>[id,queueGrant(g)]))};
}
export function queueRequest(x){
 if(!x||x.version!==1||!isId(x.requestId))fail('queue_request_invalid');
 if(x.operation==='list')exact(x,'version requestId operation');
 else if(x.operation==='submit'){
  exact(x,'version requestId operation workflowId planDigest descriptor');
  if(!isId(x.workflowId)||!isHex(x.planDigest))fail('queue_request_invalid');queueDescriptor(x.descriptor);
 }else fail('queue_request_invalid');
 return x;
}
export function queueRecord(r){
 exact(r,'version workflowId planDigest descriptorDigest sequence admittedAt expiresAt descriptor');
 if(r.version!==1||!isId(r.workflowId)||!isHex(r.planDigest)||!isHex(r.descriptorDigest)||
  !Number.isSafeInteger(r.sequence)||r.sequence<1||!Number.isSafeInteger(r.admittedAt)||r.admittedAt<0||
  !Number.isSafeInteger(r.expiresAt)||r.expiresAt<=r.admittedAt||r.expiresAt-r.admittedAt>600000)fail('queue_record_invalid');
 if(queueDescriptor(r.descriptor).digest!==r.descriptorDigest)fail('queue_descriptor_digest');return r;
}
