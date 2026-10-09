/** Execution ownership for the existing checkpoint store, not an autonomous scheduler.
 * The trusted host supplies worker identity + permitted read-only task IDs. A lease is
 * a fencing/coordination receipt, never a replacement for provider authentication.
 */
import {exact,fail,isId,isHex} from './life-checkpoint-wire.mjs';
export function workerPolicy(p) {
  exact(p,'maxActiveWorkflows maxParallelTasks maxTaskStarts leaseMillis runtimeMillis');
  const bounds={maxActiveWorkflows:[1,8],maxParallelTasks:[1,4],maxTaskStarts:[1,64],leaseMillis:[1000,120000],runtimeMillis:[1000,600000]};
  for(const [key,[lo,hi]] of Object.entries(bounds))
    if(!Number.isSafeInteger(p[key])||p[key]<lo||p[key]>hi)fail('worker_policy_invalid');
  if(p.leaseMillis>p.runtimeMillis)fail('worker_policy_invalid');
  return Object.freeze({...p});
}
export function workerContext(context,needLease=true) {
  if(!context||!isHex(context.workerDigest)||!(context.readOnlyTasks instanceof Set)||context.readOnlyTasks.size>16||
    [...context.readOnlyTasks].some(x=>!isId(x)))fail('worker_identity_required');
  if(needLease) {
    const proof=context.proof;
    exact(proof,'leaseId fence');
    if(!isId(proof.leaseId)||!Number.isSafeInteger(proof.fence)||proof.fence<1)fail('worker_proof_invalid');
  }
  return context;
}
export function workerClock(now,last=0){
  if(!Number.isSafeInteger(now)||now<0||now<last||now>Number.MAX_SAFE_INTEGER-600000)fail('worker_clock_invalid');
}
export function workerRequest(x) {
  if(!x||x.version!==1||!isId(x.requestId)||!isId(x.workflowId)||!isHex(x.planDigest))fail('worker_request_invalid');
  const extra={acquire:'',inspect:'',renew:' proof',release:' proof',dispatch:' proof taskId actionDigest providerId toolName descriptorDigest'}[x.operation];
  if(extra===undefined)fail('worker_operation_invalid');
  exact(x,'version requestId operation workflowId planDigest'+extra);
  return x;
}
