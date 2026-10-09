/** Exact-task delegation metadata. Authentication and the compiled plan registry are
 * trusted host dependencies, never client-supplied owner, scopes, task definitions or URLs. */
import {exact,fail,isId,isHex,sha,canonical} from './life-checkpoint-wire.mjs';
import {contentCanonical,contentParse} from './life-content-wire.mjs';
export const REMOTE_TASK_PATH='/jh/life/remote-task/v1';
export const stableBinding=b=>Object.fromEntries(Object.entries(b).filter(([k])=>!['observedAt','expiresAt'].includes(k)));
export function binding(b,now){
 exact(b,'providerId toolName descriptorDigest capability observedAt expiresAt modelProvider model');
 if(!isId(b.providerId)||!isHex(b.descriptorDigest)||typeof b.toolName!=='string'||!/^[-A-Za-z0-9_.:/]{1,160}$/.test(b.toolName)||
  !['MEMORY_READ','FILE_READ','GPT_REASONING'].includes(b.capability)||!Number.isSafeInteger(b.observedAt)||!Number.isSafeInteger(b.expiresAt)||
  b.observedAt>now||now-b.observedAt>60000||b.expiresAt<=now||b.expiresAt-b.observedAt>60000)fail('remote_binding_invalid');
 if(b.capability==='GPT_REASONING'){
  if(b.providerId!=='OpenAI'||b.toolName!=='responses.create'||b.modelProvider!=='openai'||typeof b.model!=='string'||!/^gpt-[A-Za-z0-9_.-]{1,96}$/.test(b.model))fail('remote_model_invalid');
 }else if(b.modelProvider!==null||b.model!==null)fail('remote_model_invalid');
 return b;
}
export function taskSpec(s){
 exact(s,'stepDigest bindingDigest kind verificationKey inputRefs dependencies capability');
 if(!isHex(s.stepDigest)||!isHex(s.bindingDigest)||!['MEMORIA','BOOKTOON'].includes(s.kind)||
  !['MEMORY_READ','FILE_READ','GPT_REASONING'].includes(s.capability)||typeof s.verificationKey!=='string'||! /^[a-z][a-z0-9_.-]{0,63}$/.test(s.verificationKey)||
  /(password|token|secret|credential|cookie|email|account|url)/i.test(s.verificationKey))fail('remote_task_spec_invalid');
 for(const k of ['inputRefs','dependencies'])if(!Array.isArray(s[k])||s[k].length>16||s[k].some(t=>!isId(t))||new Set(s[k]).size!==s[k].length)fail('remote_task_spec_invalid');
 return s;
}
export function remoteContext(p){
 if(!p||!isHex(p.ownerDigest)||!isHex(p.workerDigest)||!isId(p.workflowId)||!isHex(p.planDigest)||!Number.isSafeInteger(p.expiresAt)||
  !(p.remoteTasks instanceof Map)||p.remoteTasks.size<1||p.remoteTasks.size>16||!(p.remoteTargets instanceof Set)||p.remoteTargets.size>8||[...p.remoteTargets].some(t=>!isHex(t)))fail('remote_scope_denied');
 for(const [id,s]of p.remoteTasks){if(!isId(id))fail('remote_scope_denied');taskSpec(s);}
 return p;
}
export function intersectRemote(a,b){
 remoteContext(a);remoteContext(b);
 if(['ownerDigest','workerDigest','workflowId','planDigest','queueDescriptorDigest'].some(k=>a[k]!==b[k]))fail('remote_scope_denied');
 const tasks=new Map([...a.remoteTasks].filter(([id,s])=>b.remoteTasks.has(id)&&canonical(s)===canonical(b.remoteTasks.get(id))));
 if(!tasks.size)fail('remote_scope_denied');
 return {...b,expiresAt:Math.min(a.expiresAt,b.expiresAt),remoteTasks:tasks,remoteTargets:new Set([...a.remoteTargets].filter(t=>b.remoteTargets.has(t)))};
}
export function remoteRequest(raw){
 const x=contentParse(Buffer.from(contentCanonical(raw)));
 if(x.version!==1||!isId(x.requestId)||!isId(x.workflowId)||!isHex(x.planDigest))fail('remote_request_invalid');
 const extra={offer:' proof taskId delegateDigest stepDigest actionDigest binding dependencies',list:'',begin:' ticketId',current:' ticketId',snapshot:' ticketId',get:' ticketId ref category',put:' ticketId record expectedRevision',result:' proof ticketId'}[x.operation];
 if(extra===undefined)fail('remote_operation_invalid');exact(x,'version requestId operation workflowId planDigest'+extra);
 if('ticketId'in x&&!isId(x.ticketId))fail('remote_ticket_invalid');
 if(x.operation==='offer'&&(!isId(x.taskId)||!isHex(x.delegateDigest)||!isHex(x.stepDigest)||!isHex(x.actionDigest)))fail('remote_offer_invalid');
 if(x.operation==='get'&&(!isId(x.ref)||!['INPUT_TEXT','INPUT_SOURCE','RESULT_TEXT'].includes(x.category)))fail('remote_content_scope');
 if(x.operation==='put'&&(!Number.isSafeInteger(x.expectedRevision)||x.expectedRevision<1))fail('remote_revision_invalid');
 return x;
}
export const remoteValueDigest=v=>sha(contentCanonical(v));
