/** Candidate-only truth-preserving queue status patch for JH's Kakao T open-service route.
 * This module is not imported by operational startup and does not change any Android
 * session, approval, routing or dispatch logic until explicitly integrated.
 */
const BEFORE = [
  '      const j=mk("open_url",{target:"카카오T",url:"카카오T"});',
  '      return textResult({route:"android",service:raw,queued:true,jobId:j.id,registeredDevices:devices.size});'
].join('\n');
const AFTER = BEFORE.replace('queued:true','queued:j.status==="queued"');
const unique = (s,needle) => typeof s==="string" && s.split(needle).length===2;
export function applyNativeQueueTruthPatch(source){
  if(!unique(source,BEFORE)||source.includes(AFTER))throw Error('JH_NATIVE_QUEUE_STATUS_ANCHOR_MISMATCH');
  const patched=source.replace(BEFORE,AFTER);
  if(reverseNativeQueueTruthPatch(patched)!==source)throw Error('JH_NATIVE_QUEUE_STATUS_SCOPE');
  return patched;
}
export function reverseNativeQueueTruthPatch(source){
  if(!unique(source,AFTER)||source.includes(BEFORE))throw Error('JH_NATIVE_QUEUE_STATUS_REVERSE_ANCHOR');
  return source.replace(AFTER,BEFORE);
}
