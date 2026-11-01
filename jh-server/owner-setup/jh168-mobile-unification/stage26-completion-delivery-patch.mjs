/**
 * Revocable source-only patch for an EXACT generated Stage25 Secure56 runtime.
 * Original Secure56 HMAC and nonce are verified BEFORE duplicate ACK logic.
 * Original durable acceptedCompletion is the sole first-result authority.
 */
const PREFIX='import {decideExactSignedCompletionAck56} from "../jh168-mobile-unification/stage26-completion-delivery-policy.mjs";\n';
const SIGNED_AUTH_GUARD='if(!a||sid!==j.secureSessionId||sid!==a.sessionId||dev!==a.deviceDigest||rd!==actual||!validToken56(nonce)||exp<Date.now()||exp-Date.now()>60000||!eqHex56(mac,hmac56(a.secret,"complete|"+sid+"|"+j.id+"|"+dev+"|"+nonce+"|"+exp+"|"+rd))||!seen56(a.seenComplete,nonce))';
const JSON_OLD='    let body;try{body=JSON.parse(raw.toString("utf8")||"{}");}catch{raw.fill(0);res.writeHead(400).end("invalid json");return;}raw.fill(0);';
const ACK=[
 '    const stage26RawDigest56=sha56(raw);',
 '    // Original HMAC + one-shot nonce checked above; no original UI replay.',
 '    const stage26Ack56=decideExactSignedCompletionAck56(j,stage26RawDigest56);',
 "    if(stage26Ack56==='ACK_IDENTICAL'){",
 '      raw.fill(0);res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"})',
 '        .end(\'{"ok":true,"duplicateCompletion":true}\');return;',
 '    }',
 "    if(stage26Ack56!=='FIRST_COMPLETION'){",
 '      raw.fill(0);res.writeHead(409,{"content-type":"application/json","cache-control":"no-store"})',
 '        .end(\'{"ok":false,"code":"completion_result_conflict_or_unknown"}\');return;',
 '    }',
 ''
].join('\n');
const JOB_OLD='    j.status="complete";j.result=body.result;j.completedAt=new Date().toISOString();';
const JOB_NEW='    j.stage26CompletionDigest56=stage26RawDigest56;\n'+JOB_OLD;
const PAIRS=[[JSON_OLD,ACK+JSON_OLD],[JOB_OLD,JOB_NEW]];
const count=(s,what)=>s.split(what).length-1;
export function applyStage26CompletionAckPatch56(source){
 if(typeof source!=='string'||source.startsWith(PREFIX)||
    !source.includes('jhSplitFollowupReceipts56.read(')||
    !source.includes('durableNativeHooks56?.acceptedCompletion(')||
    !source.includes(SIGNED_AUTH_GUARD))
   throw Error('STAGE26_SIGNED_ORIGINAL_RUNTIME_REQUIRED');
 let next=source;
 for(const [from,to] of PAIRS){
   if(count(next,from)!==1||next.includes(to))
     throw Error('STAGE26_COMPLETE_ACK_ANCHOR_CHANGED');
   next=next.replace(from,to);
 }
 const auth=next.indexOf(SIGNED_AUTH_GUARD),ack=next.indexOf('const stage26Ack56=');
 const durable=next.indexOf('durableNativeHooks56?.acceptedCompletion(');
 const record=next.indexOf('j.stage26CompletionDigest56=stage26RawDigest56;');
 if(!(auth>=0&&auth<ack&&ack<durable&&durable<record))
   throw Error('STAGE26_COMPLETE_ACK_VERIFIER_ORDER_CHANGED');
 next=PREFIX+next;
 if(reverseStage26CompletionAckPatch56(next)!==source)
   throw Error('STAGE26_COMPLETE_ACK_SCOPE_MISMATCH');
 return next;
}
export function reverseStage26CompletionAckPatch56(source){
 if(typeof source!=='string'||!source.startsWith(PREFIX))
   throw Error('STAGE26_COMPLETE_ACK_PREFIX_MISSING');
 let next=source.slice(PREFIX.length);
 for(const [from,to] of PAIRS.slice().reverse()){
   if(count(next,to)!==1)throw Error('STAGE26_COMPLETE_ACK_REVERSE_CHANGED');
   next=next.replace(to,from);
 }
 return next;
}

