/** Metadata-only wire for the existing Kotlin LifeJournal.Checkpoint. No prompt, source, key or
 * provider result body is accepted. Canonical JSON is mandatory, including on requests. */
import {createHash} from 'node:crypto';
export const MAX_BYTES=65536;
export const ID=/^[A-Za-z0-9_.-]{1,80}$/;
export const HEX=/^[a-f0-9]{64}$/;
export const isId=x=>typeof x==='string'&&ID.test(x);
export const isHex=x=>typeof x==='string'&&HEX.test(x);
const CODE=/^[a-z0-9_]{1,96}$/;
export class CheckpointError extends Error {constructor(code){super(code);this.code=code;}}
export function fail(code){throw new CheckpointError(code);}
export const sha=x=>createHash('sha256').update(x).digest('hex');
export function exact(o,keys){
 if(!o||Array.isArray(o)||typeof o!=='object'||Object.keys(o).sort().join('|')!==keys.split(' ').sort().join('|'))fail('checkpoint_fields_invalid');
}
export function canonical(o,depth=0){
 if(depth>12)fail('checkpoint_structure_limit');
 if(o===null||typeof o==='boolean')return JSON.stringify(o);
 if(typeof o==='number'){if(!Number.isSafeInteger(o)||Object.is(o,-0))fail('checkpoint_integer_invalid');return String(o);}
 if(typeof o==='string'){if(!/^[\x20-\x7e]*$/.test(o)||o.length>256)fail('checkpoint_string_invalid');return JSON.stringify(o);}
 if(Array.isArray(o))return '['+o.map(x=>canonical(x,depth+1)).join(',')+']';
 if(o&&typeof o==='object')return '{'+Object.keys(o).sort().map(k=>canonical(k)+':'+canonical(o[k],depth+1)).join(',')+'}';
 fail('checkpoint_value_invalid');
}
export function parse(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length>MAX_BYTES)fail('checkpoint_size_invalid');
 let text,o;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);o=JSON.parse(text);}catch{fail('checkpoint_json_invalid');}
 // Parse/re-encode equality rejects duplicate/escaped keys, alternate numeric encodings, trailing
 // whitespace and nesting tricks before any storage operation. The protocol intentionally is strict.
 if(canonical(o)!==text)fail('checkpoint_noncanonical_json');return o;
}
export function checkpoint(s){
 exact(s,'workflowId planDigest revision paused cancelled entries');
 if(!isId(s.workflowId)||!isHex(s.planDigest)||!Number.isSafeInteger(s.revision)||s.revision<0||
    typeof s.paused!=='boolean'||typeof s.cancelled!=='boolean'||!Array.isArray(s.entries)||s.entries.length<1||s.entries.length>16)fail('checkpoint_invalid');
 if(s.cancelled&&!s.paused)fail('checkpoint_cancel_without_pause');
 const ids=new Set();
 for(const e of s.entries){
  exact(e,'taskId status providerId code evidenceDigest receiptRef verifiedAt invocations');
  if(!isId(e.taskId)||ids.has(e.taskId)||!['PENDING','RUNNING','SUCCEEDED','FAILED','NEEDS_USER','SKIPPED'].includes(e.status)||
   (typeof e.code!=='string'||!CODE.test(e.code))||(e.providerId!==null&&!isId(e.providerId))||(e.receiptRef!==null&&!isId(e.receiptRef))||
   (e.evidenceDigest!==null&&!isHex(e.evidenceDigest))||!Number.isSafeInteger(e.verifiedAt)||e.verifiedAt<0||
   !Number.isInteger(e.invocations)||e.invocations<0||e.invocations>64)fail('checkpoint_metadata_invalid');
  ids.add(e.taskId);
  if(e.status==='SUCCEEDED'&&(e.evidenceDigest===null||e.receiptRef===null||e.providerId===null))fail('checkpoint_success_without_receipt');
 }
 if(Buffer.byteLength(canonical(s))>MAX_BYTES-2048)fail('checkpoint_size_invalid');return s;
}
export function transition(old,s,expected){
 checkpoint(s);
 if(!Number.isSafeInteger(expected)||expected<0||expected>=Number.MAX_SAFE_INTEGER||s.revision!==expected)fail('checkpoint_revision_invalid');
 if(!old){
  if(expected!==0)fail('checkpoint_conflict');
  if(s.entries.some(e=>e.status!=='PENDING'||e.invocations!==0||e.providerId!==null||e.evidenceDigest!==null||e.receiptRef!==null||e.verifiedAt!==0))fail('checkpoint_initial_state_invalid');
  return;
 }
 if(old.revision!==expected)fail('checkpoint_conflict');
 if(old.planDigest!==s.planDigest)fail('plan_changed');
 if(old.entries.map(e=>e.taskId).join('|')!==s.entries.map(e=>e.taskId).join('|'))fail('checkpoint_tasks_changed');
 if(old.cancelled&&!s.cancelled)fail('checkpoint_cancel_is_final');
 const allowed={PENDING:['PENDING','RUNNING','NEEDS_USER'],RUNNING:['RUNNING','SUCCEEDED','FAILED','NEEDS_USER'],
  SUCCEEDED:['SUCCEEDED','NEEDS_USER'],FAILED:['FAILED','NEEDS_USER'],NEEDS_USER:['NEEDS_USER'],SKIPPED:['SKIPPED','NEEDS_USER']};
 for(let i=0;i<s.entries.length;i++){
  const a=old.entries[i],b=s.entries[i];
  if(!allowed[a.status].includes(b.status))fail('checkpoint_transition_invalid');
  const started=a.status==='PENDING'&&b.status==='RUNNING';
  if(b.invocations!==a.invocations+(started?1:0))fail('checkpoint_attempt_invalid');
  if(started&&(s.paused||s.cancelled||b.providerId===null))fail('checkpoint_stopped');
  if(!started&&a.providerId!==b.providerId)fail('checkpoint_provider_changed');
  const success=a.status==='RUNNING'&&b.status==='SUCCEEDED';
  if(success&&(s.cancelled||s.paused))fail('checkpoint_stopped');
  if(!success&&['evidenceDigest','receiptRef','verifiedAt'].some(k=>a[k]!==b[k]))fail('checkpoint_receipt_changed');
 }
}
