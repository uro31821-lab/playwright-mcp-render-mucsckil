/** Non-operational integration over the existing pinned durable JH runtime.
 * This preserves the production baseline and authentication, journaling and
 * Computer Use policies. It is not selected by a deployed entrypoint.
 */
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';
import {applyNativeQueueTruthPatch,reverseNativeQueueTruthPatch} from './native-queue-truth.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function buildNativeQueueTruthCandidate(root){
  const prior=buildDurableNativeRuntime(root);
  if(prior.productionEnabled!==false)throw Error('QUEUE_TRUTH_NON_OPERATIONAL_ONLY');
  const baseline=readFileSync(prior.file,'utf8');
  if(sha(baseline)!==prior.candidateSha256)throw Error('QUEUE_TRUTH_PARENT_DIGEST');
  const patched=applyNativeQueueTruthPatch(baseline);
  if(reverseNativeQueueTruthPatch(patched)!==baseline)throw Error('QUEUE_TRUTH_PATCH_SCOPE');
  const output=path.join(root,'server-integration/server-native-queue-truth-candidate.mjs');
  writeFileSync(output,patched,{mode:0o600});
  if(readFileSync(output,'utf8')!==patched)throw Error('QUEUE_TRUTH_READBACK');
  return Object.freeze({file:output,parentSha256:prior.candidateSha256,candidateSha256:sha(patched),
    productionEnabled:false,onlyChange:'life_open_service Kakao T queued status'});
}
