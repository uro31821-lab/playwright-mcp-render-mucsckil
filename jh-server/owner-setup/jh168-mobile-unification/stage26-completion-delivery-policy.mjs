/**
 * A completion ACK can be retried with a NEW Secure56 one-shot MAC/nonce.
 * This policy is called ONLY after the original Secure56 HMAC + nonce
 * verification succeeded. It never creates/queues jobs or executes UI.
 */
const H64=/^[0-9a-f]{64}$/;
export function decideExactSignedCompletionAck56(job,rawDigest) {
 if(!job||typeof job!=='object'||!H64.test(rawDigest||''))
   return 'DENY';
 if(job.status==='in_progress')return 'FIRST_COMPLETION';
 if(job.status!=='complete')return 'CONFLICT_OR_UNKNOWN';
 const prior=job.stage26CompletionDigest56;
 if(typeof job.secureSessionId!=='string'||!job.secureSessionId||
    !H64.test(prior||''))return 'CONFLICT_OR_UNKNOWN';
 return prior===rawDigest?'ACK_IDENTICAL':'CONFLICT_OR_UNKNOWN';
}

