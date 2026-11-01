/**
 * Stage30 source-only code composition. Preserve byte-for-byte original
 * production journal/host/server and run candidates only under CI.
 */
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha=text=>createHash('sha256').update(text).digest('hex');
const fail=c=>{throw Object.assign(Error(c),{code:c});};
const exact=(source,oldText,newText)=>{
 if(typeof source!=='string'||source.split(oldText).length!==2||source.includes(newText))
  fail('STAGE30_PINNED_SOURCE_CHANGED');
 return source.replace(oldText,newText);
};
const updateOld=[
 "   this.#db.prepare('UPDATE circuit_actions SET status=?,completed_ms=?,result_hmac=? WHERE record_id=? AND status=?')",
 "     .run('DEVICE_RESULT_RECEIVED',now,proof,recordId,'OUTCOME_UNKNOWN');",
 "   this.#db.exec('COMMIT');"
].join('\n');
const updateNew=[
 "   this.#db.prepare('UPDATE circuit_actions SET status=?,completed_ms=?,result_hmac=? WHERE record_id=? AND status=?')",
 "     .run('DEVICE_RESULT_RECEIVED',now,proof,recordId,'OUTCOME_UNKNOWN');",
 "   // Original HMAC/nonce and owner host proof have ALREADY been checked.",
 "   // The Stage30 row is written inside this original BEGIN/COMMIT.",
 "   if(this.#stage30Write&&stage30Original!==null)",
 "    this.#stage30Write({db:this.#db,recordId,resultDigest,receivedAtMs:now,stage30Original});",
 "   this.#db.exec('COMMIT');"
].join('\n');
const JOURNAL=[
 [' #db;#key;#namespace;#clock;#verify;#closed=false;',
  ' #db;#key;#namespace;#clock;#verify;#stage30Write;#closed=false;'],
 [" constructor({file,key,namespace,clock=Date.now,mode='read',verifyAuthenticatedCompletion}={}){",
  " constructor({file,key,namespace,clock=Date.now,mode='read',verifyAuthenticatedCompletion,stage30ReceiptWriter=null}={}){"],
 [
 "  this.#key=Buffer.from(key);this.#namespace=namespace;this.#clock=clock;this.#verify=verifyAuthenticatedCompletion;",
 [
 "  if(stage30ReceiptWriter!==null&&typeof stage30ReceiptWriter!=='function')fail('STAGE30_CALLBACK_INVALID');",
 "  this.#key=Buffer.from(key);this.#namespace=namespace;this.#clock=clock;this.#verify=verifyAuthenticatedCompletion;this.#stage30Write=stage30ReceiptWriter;"
 ].join('\n')],
 [" recordAuthenticatedDeviceResult({recordId,resultDigest,hostEvidence}={}){",
  " recordAuthenticatedDeviceResult({recordId,resultDigest,hostEvidence,stage30Original=null}={}){"],
 [updateOld,updateNew]
];
const HOST=[
 ["import {DurableManualCircuitFence} from './durable-manual-circuit-fence.mjs';",
  ["import {DurableManualCircuitFence} from './stage30-durable-manual-circuit-fence-candidate.mjs';",
   "import {createStage30AtomicReceiptWriter} from '../jh168-mobile-unification/stage30-atomic-receipt-writer.mjs';"].join('\n')],
 [" const journal=new DurableManualCircuitFence({file,key,namespace,mode,",
  [" const stage30Writer=createStage30AtomicReceiptWriter({file,key,namespace});",
   " const journal=new DurableManualCircuitFence({file,key,namespace,mode,",
   "  stage30ReceiptWriter:stage30Writer.append,"].join('\n')],
 [
 "    journal.recordAuthenticatedDeviceResult({recordId:record.recordId,resultDigest,hostEvidence:evidence});",
 [
 "    const stage30Original=job.type==='split_screen_session_followup'&&",
 "      job.action==='CLICK'&&policy.kind==='JOURNAL'?",
 "      {job,result,identityPayload:policy.identityPayload}:null;",
 "    journal.recordAuthenticatedDeviceResult({recordId:record.recordId,resultDigest,",
 "      hostEvidence:evidence,stage30Original});"
 ].join('\n')],
 [
 "  close(){if(closed)return;closed=true;journal.close()}",
 "  close(){if(closed)return;closed=true;try{journal.close()}finally{stage30Writer.close()}}"
 ]
];
const RUNTIME=[[
 'import {createDurableNativeHooks} from "../deployment/durable-native-host.mjs";',
 'import {createDurableNativeHooks} from "../deployment/stage30-durable-native-host-candidate.mjs";'
]];
const patch=(source,pairs)=>{
 let s=source;
 for(const [oldText,newText]of pairs)s=exact(s,oldText,newText);
 return s;
};
const reverse=(source,pairs)=>{
 let s=source;
 for(const [oldText,newText]of [...pairs].reverse())s=exact(s,newText,oldText);
 return s;
};
export function applyStage30JournalCandidate(source){
 const out=patch(source,JOURNAL);
 if(reverseStage30JournalCandidate(out)!==source)fail('STAGE30_JOURNAL_SCOPE_CHANGED');
 return out;
}
export function reverseStage30JournalCandidate(source){return reverse(source,JOURNAL)}
export function applyStage30HostCandidate(source){
 const out=patch(source,HOST);
 if(reverseStage30HostCandidate(out)!==source)fail('STAGE30_HOST_SCOPE_CHANGED');
 return out;
}
export function reverseStage30HostCandidate(source){return reverse(source,HOST)}
export function applyStage30ServerRuntimeCandidate(source){
 if(!source.includes('durableNativeHooks56?.acceptedCompletion(')||
    !source.includes('const stage26Ack56=')||
    !source.includes('jhSplitFollowupReceipts56.read(')||
    !source.includes('if(!a||sid!==j.secureSessionId'))
  fail('STAGE30_SIGNED_ORIGINAL_STAGE26_OPERATOR_REQUIRED');
 const out=patch(source,RUNTIME);
 if(reverseStage30ServerRuntimeCandidate(out)!==source)fail('STAGE30_SERVER_SCOPE_CHANGED');
 const auth=out.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=out.indexOf('const stage26Ack56=');
 const hook=out.indexOf('durableNativeHooks56?.acceptedCompletion(');
 if(!(auth>=0&&auth<ack&&ack<hook))fail('STAGE30_SIGNED_AUTH_ORDER_CHANGED');
 return out;
}
export function reverseStage30ServerRuntimeCandidate(source){return reverse(source,RUNTIME)}
export function buildStage30CandidateSources(root,{publish=false}={}){
 const base=path.join(root,'deployment');
 const originalJournal=readFileSync(path.join(base,'durable-manual-circuit-fence.mjs'),'utf8');
 const originalHost=readFileSync(path.join(base,'durable-native-host.mjs'),'utf8');
 const journal=applyStage30JournalCandidate(originalJournal);
 const host=applyStage30HostCandidate(originalHost);
 const journalPath=path.join(base,'stage30-durable-manual-circuit-fence-candidate.mjs');
 const hostPath=path.join(base,'stage30-durable-native-host-candidate.mjs');
 if(publish){
  writeFileSync(journalPath,journal,{encoding:'utf8',flag:'wx',mode:0o600});
  try{writeFileSync(hostPath,host,{encoding:'utf8',flag:'wx',mode:0o600})}
  catch(e){unlinkSync(journalPath);throw e}
  if(readFileSync(journalPath,'utf8')!==journal||
     readFileSync(hostPath,'utf8')!==host)fail('STAGE30_GENERATED_CANDIDATE_READBACK_FAILED');
 }
 return Object.freeze({journalPath,hostPath,originalJournalSha:sha(originalJournal),
  originalHostSha:sha(originalHost),journalSha:sha(journal),hostSha:sha(host),
  phoneActions:0,serverDeployed:false,apkChanged:false});
}
