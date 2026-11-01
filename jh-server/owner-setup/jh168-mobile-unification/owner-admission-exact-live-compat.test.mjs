/** Reproduce exact already-deployed live 4c Mobile13 generated owner source,
 * then apply/reverse diagnostic in memory. Requires a separate pinned CI checkout.
 * Never import/start the generated network operator.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {
 ORIGINAL_OWNER_ADMISSION155,
 patchOriginalOwnerAdmissionDiagnostic155,
 reverseOriginalOwnerAdmissionDiagnostic155
} from './owner-admission-diagnostic-candidate.mjs';

const LIVE_COMMIT='4c71890021fc299838e6a8ce45ccf5f64712f354';
const EXPECTED_MOBILE_SHA='a25982af7c31f71fcb875176d9431be6c226e348bc0f3c48b478c503b0c3f45f';
const sha=x=>createHash('sha256').update(x).digest('hex');
const liveRoot=process.env.JH_EXACT_LIVE_ROOT;
const moduleFile=liveRoot?
 path.join(path.resolve(liveRoot),'jh-server/owner-setup/jh168-mobile-unification/stage25-live-operator-followup-entry.mjs'):
 null;
test('exact live 4c PHONE_RIGHT generated operator retains owner helper and reversible diagnostics',async()=>{
 assert.ok(liveRoot,'CI must provide separate original 4c checkout');
 const real=execFileSync('git',['-C',path.resolve(liveRoot),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(real,LIVE_COMMIT,'never substitute a moving branch for original live');
 const {buildStage25PendingOperatorEntrypoint56}=
  await import(pathToFileURL(moduleFile).href);
 const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
  JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
  JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1'};
 const root=path.dirname(path.dirname(moduleFile));
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 assert.equal(built.productionEnabled,false);
 assert.equal(built.listenerStarted,false);
 assert.equal(built.apkChanged,false);
 const source=readFileSync(built.runtimeFile,'utf8');
 assert.equal(sha(source),built.stamp.runtimeSha256);
 assert.equal(sha(source),EXPECTED_MOBILE_SHA,'current live PHONE_RIGHT must match known original attestation');
 assert.equal(source.split(ORIGINAL_OWNER_ADMISSION155).length,2);
 const patched=patchOriginalOwnerAdmissionDiagnostic155(source);
 assert.equal(reverseOriginalOwnerAdmissionDiagnostic155(patched),source);
 assert.equal(patched.split('async function jhOwnerAdmission155(').length,2);
 for(const marker of ['durableNativeHooks56?.beforeDispatch(next)',
   'durableNativeHooks56?.acceptedCompletion(j,body.result)',
   'jhSplitFollowupReceipts56.issue(',
   'jhSplitFollowupReceipts56.read(',
   'jhRequireCommand56(device)']){
   assert.ok(source.includes(marker),'original '+marker);
   assert.ok(patched.includes(marker),'candidate '+marker);
 }
 const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{
  input:patched,encoding:'utf8',timeout:30000});
 assert.equal(syntax.status,0,syntax.stderr);
 console.log('JH_EXACT_LIVE_OWNER_ADMISSION_REVIEW_ONLY',JSON.stringify({
  liveSourceSha:LIVE_COMMIT,originalRuntimeSha256:sha(source),
  candidateRuntimeSha256:sha(patched),sourceReversible:true,
  ownerAdmittedActions:0,phoneDispatches:0,sqliteWrites:0,productionActivated:false}));
});
