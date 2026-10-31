/** Exact, reversible composition of the generated owner service only.
 * The pinned owner entry, its identity checks, lock, and trust code are intact.
 */
const PREFIX = 'import {installOwnerLearning} from "../operational-learning/owner-host.mjs";\n';
const HOST_VALIDATED = "    if(host.enrollmentHostInstalled!==true||host.trustCreated!==false||host.sessionCreated!==false||host.actionApprovalGranted!==false)fail('OWNER_HOST_START_CONTRACT_INVALID');";
const PAIRS = [
  ['let runtime,host,lifeHost,durableHost,closed=false;',
    'let runtime,host,lifeHost,durableHost,learningHost,closed=false;'],
  [HOST_VALIDATED, HOST_VALIDATED + '\n    learningHost=await installOwnerLearning(runtime,{config});'],
  ['durableCircuitInstalled:!!durableHost,',
    'durableCircuitInstalled:!!durableHost,operationalLearningInstalled:learningHost?.installed===true,'],
  ['try{durableHost?.close();}finally{try{host.close();}finally{runtimeLock.close();}}',
    'try{await learningHost?.close();}finally{try{durableHost?.close();}finally{try{host.close();}finally{runtimeLock.close();}}}'],
  ['try{durableHost?.close();}catch{}try{host?.close();}catch{}runtimeLock.close();throw e;',
    'try{await learningHost?.close();}catch{}try{durableHost?.close();}catch{}try{host?.close();}catch{}runtimeLock.close();throw e;'],
];

export function applyOwnerLearningPatch(source) {
  if (typeof source !== 'string' || source.includes('installOwnerLearning')) {
    throw Error('LEARNING_OWNER_PATCH_SOURCE');
  }
  let output = source;
  for (const [before, after] of PAIRS) {
    if (output.split(before).length !== 2 || output.includes(after)) {
      throw Error('LEARNING_OWNER_PATCH_ANCHOR');
    }
    output = output.replace(before, after);
  }
  output = PREFIX + output;
  if (reverseOwnerLearningPatch(output) !== source) throw Error('LEARNING_OWNER_PATCH_SCOPE');
  return output;
}

export function reverseOwnerLearningPatch(source) {
  if (typeof source !== 'string' || !source.startsWith(PREFIX)) {
    throw Error('LEARNING_OWNER_PATCH_PREFIX');
  }
  let output = source.slice(PREFIX.length);
  for (const [before, after] of PAIRS.slice().reverse()) {
    if (output.split(after).length !== 2) throw Error('LEARNING_OWNER_REVERSE_ANCHOR');
    output = output.replace(after, before);
  }
  return output;
}
