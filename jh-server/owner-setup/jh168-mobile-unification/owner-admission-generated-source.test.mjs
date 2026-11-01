/** Source-only integration proof against REAL generated original Stage25/26.
 * No device, UI, listener, live database, owner login or production deploy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';
import {
  ORIGINAL_OWNER_ADMISSION155,INSTRUMENTED_OWNER_ADMISSION155,
  patchOriginalOwnerAdmissionDiagnostic155,reverseOriginalOwnerAdmissionDiagnostic155
} from './owner-admission-diagnostic-candidate.mjs';

const root=path.resolve(import.meta.dirname,'..');
const sha=value=>createHash('sha256').update(value).digest('hex');

for(const ackEnabled of [false,true]){
 test('real Stage25 generated owner admission diagnostic is reversible (Stage26 ACK '+ackEnabled+')',async()=>{
  const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
   ...(ackEnabled?{JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'}:{})};
  const built=await buildStage25PendingOperatorEntrypoint56(root,env);
  assert.equal(built.productionEnabled,false);
  assert.equal(built.listenerStarted,false);
  assert.equal(built.apkChanged,false);
  const original=readFileSync(built.runtimeFile,'utf8');
  assert.equal(sha(original),built.stamp.runtimeSha256);
  assert.equal(original.split(ORIGINAL_OWNER_ADMISSION155).length,2);
  assert.equal(original.includes('jhOwnerAdmissionCodes155'),false);
  const patched=patchOriginalOwnerAdmissionDiagnostic155(original);
  assert.equal(reverseOriginalOwnerAdmissionDiagnostic155(patched),original);
  assert.equal(patched.split(INSTRUMENTED_OWNER_ADMISSION155).length,2);
  assert.equal(patched.split('async function jhOwnerAdmission155(').length,2);
  for(const marker of [
    'durableNativeHooks56?.beforeDispatch(next)',
    'durableNativeHooks56?.acceptedCompletion(j,body.result)',
    'jhSplitFollowupReceipts56.issue(',
    'jhSplitFollowupReceipts56.read(',
    'jhRequireCommand56(device)',
    'runProtectedJHAction('
  ])assert.ok(original.includes(marker)&&patched.includes(marker),'protected '+marker);
  const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{
    input:patched,encoding:'utf8',timeout:30000});
  assert.equal(syntax.status,0,'generated candidate must parse: '+syntax.stderr);
  console.log('JH_OWNER_ADMISSION_REVIEW_ONLY',JSON.stringify({
    stage26Ack:ackEnabled,originalRuntimeSha256:sha(original),
    candidateSha256:sha(patched),reversible:true,
    deviceActions:0,autoReplay:false,ownerVolumeWrites:0,
    productionSelected:false
  }));
 });
}
