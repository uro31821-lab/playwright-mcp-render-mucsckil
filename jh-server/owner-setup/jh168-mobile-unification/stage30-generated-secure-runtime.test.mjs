import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildStage25PendingOperatorEntrypoint56,
 selectStage26CompletionAck56} from './stage25-live-operator-followup-entry.mjs';
import {buildStage30CandidateSources,applyStage30ServerRuntimeCandidate,
 reverseStage30ServerRuntimeCandidate} from './stage30-candidate-compose.mjs';

const root=path.resolve(import.meta.dirname,'..');
const sha=x=>createHash('sha256').update(x).digest('hex');
const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
 JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};

test('pinned generated Secure56 Stage25/26 source uses original HMAC/nonce, durable hook and Stage30 import only',async()=>{
 assert.equal(selectStage26CompletionAck56(env),true);
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(built.originalOperatorPreserved,true);
 assert.equal(built.listenerStarted,false);
 assert.equal(built.productionEnabled,false);
 assert.equal(built.stamp.signedCompletionAckStage26,true);
 const original=readFileSync(built.runtimeFile,'utf8');
 assert.equal(sha(original),built.stamp.runtimeSha256);
 for(const k of ['jhSplitFollowupReceipts56.read(',
  'durableNativeHooks56?.acceptedCompletion(',
  'const stage26Ack56=decideExactSignedCompletionAck56(j,stage26RawDigest56)',
  'pendingApprovalReceipts56','computerInspectReceipt56',
  'if(!a||sid!==j.secureSessionId'])
  assert.ok(original.includes(k),'original Secure56 guard not present: '+k);
 const patched=applyStage30ServerRuntimeCandidate(original);
 assert.equal(reverseStage30ServerRuntimeCandidate(patched),original);
 assert.equal(patched.split('stage30-durable-native-host-candidate.mjs').length-1,1);
 assert.equal(patched.split('durableNativeHooks56?.acceptedCompletion(').length-1,1);
 const sourceDiff=patched.replace(
  'import {createDurableNativeHooks} from "../deployment/stage30-durable-native-host-candidate.mjs";',
  'import {createDurableNativeHooks} from "../deployment/durable-native-host.mjs";');
 assert.equal(sourceDiff,original,'one exact import is the entire Stage30 server diff');
 const candidate=buildStage30CandidateSources(root,{publish:false});
 assert.ok(candidate.journalSha!==candidate.originalJournalSha);
 assert.ok(candidate.hostSha!==candidate.originalHostSha);
 const temp=path.join(root,'server-integration/stage30-generated-runtime-syntax-check.mjs');
 try {
  writeFileSync(temp,patched,{encoding:'utf8',flag:'wx',mode:0o600});
  const r=spawnSync(process.execPath,['--check',temp],{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);
 } finally {try{unlinkSync(temp)}catch{}}
 assert.equal(readFileSync(built.runtimeFile,'utf8'),original,
  'source-only test must never replace selected Stage26 operator');
});
