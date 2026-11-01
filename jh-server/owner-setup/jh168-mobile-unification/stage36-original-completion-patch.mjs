/**
 * Stage36 — reversible exact-source attachment of a Stage35 sealed handle to
 * the ORIGINAL Stage155 screen-verified FOLLOW_UP completion.
 *
 * No new device job, OAuth endpoint, approval, retry or screen read is created.
 * The original JH155 protected run has the FINAL authority on UI verification.
 * The handle was issued by the original Stage35 owner-bound result receipt.
 */
const PREFIX='import {createStage36InlineOriginalHandoff} from "../jh168-mobile-unification/stage36-inline-original-handoff.mjs";\n';
const STATE_OLD='const jhSplitFollowupReceipts56=createSplitFollowupReceiptRegistry56();';
const STATE_NEW=STATE_OLD+
 '\nconst stage36InlineOriginalHandoff56=createStage36InlineOriginalHandoff();';
const ORIGINAL_DISPATCH=[
 '    return {...result,jobDigest:sha56(j.id),taskDigest};',
 '    };',
 "    return type==='split_screen_session_followup' ? jhSplitScreenOnce155(device,commandId,type,payload,dispatch) : dispatch();"
].join('\n');
const STAGED_DISPATCH=[
 '    const stage36Response56={...result,jobDigest:sha56(j.id),taskDigest};',
 "    if(type==='split_screen_session_followup'&&",
 "       effect==='REVERSIBLE_WRITE'&&",
 "       secureToolName==='life_android_execute_computer_action'&&",
 "       payload?.action==='CLICK'&&",
 "       result.ok===true&&result.resultVerified===true&&",
 "       j.status==='complete'&&j.action==='CLICK'&&",
 "       j.targetDeviceId===device&&j.targetDeviceDigest===targetDeviceDigest&&",
 "       j.secureSessionId===auth.sessionId&&",
 "       j.commandId===commandId&&",
 "       active56(device)?.sessionId===auth.sessionId&&",
 "       jhRequireCommand56(device)===commandId&&",
 "       typeof durableNativeHooks56?.issueOriginalReceiptHandle==='function'){",
 "      stage36InlineOriginalHandoff56.stage({",
 "        receipt:stage36Response56,deviceResult:result,",
 "        scope:{type,effect,tool:secureToolName,action:payload.action,",
 "          originalAction:j.action,jobStatus:j.status,",
 "          originalJobId:j.id,deviceId:device,originalDeviceId:j.targetDeviceId,",
 "          deviceDigest:targetDeviceDigest,originalDeviceDigest:j.targetDeviceDigest,",
 "          originalSessionId:j.secureSessionId,currentSessionId:auth.sessionId,",
 "          originalCommandId:j.commandId,currentCommandId:commandId},",
 "        issue:()=>durableNativeHooks56.issueOriginalReceiptHandle(j,{",
 "          deviceId:device,deviceDigest:targetDeviceDigest,",
 "          sessionId:auth.sessionId,commandId,secureBridgeVersion:56",
 "        })",
 "      });",
 "    }",
 "    return stage36Response56;",
 '    };',
 "    return type==='split_screen_session_followup' ? jhSplitScreenOnce155(device,commandId,type,payload,dispatch) : dispatch();"
].join('\n');
const PROTECTED_RETURN='    return {...(receipt||{}),ok:receipt?receipt.ok===true:verified.verified===true,';
const PROTECTED_RETURN_NEW=[
 '    // Only the ORIGINAL protected JH155 screen-verification result can',
 '    // release a sealed reference created during this same signed dispatch.',
 '    const stage36CompletionHandoff56=stage36InlineOriginalHandoff56.finish({receipt,verified});',
 '    return {...(receipt||{}),',
 '      ...(stage36CompletionHandoff56?{originalReceiptHandoff:stage36CompletionHandoff56}:{}),',
 '      ok:receipt?receipt.ok===true:verified.verified===true,'
].join('\n');
const PAIRS=[[STATE_OLD,STATE_NEW],[ORIGINAL_DISPATCH,STAGED_DISPATCH],
 [PROTECTED_RETURN,PROTECTED_RETURN_NEW]];
const fail=code=>{throw Object.assign(Error(code),{code});};
const count=(s,needle)=>s.split(needle).length-1;
export function reverseStage36InlineHandoffPatch(source){
 if(typeof source!=='string'||!source.startsWith(PREFIX))
  fail('STAGE36_PREFIX_MISSING');
 let current=source.slice(PREFIX.length);
 for(const [from,to]of [...PAIRS].reverse()){
  if(count(current,to)!==1)fail('STAGE36_REVERSE_SOURCE_CHANGED');
  current=current.replace(to,from);
 }
 return current;
}
export function applyStage36InlineHandoffPatch(source){
 if(typeof source!=='string'||source.startsWith(PREFIX)||
    !source.includes('jhSplitFollowupReceipts56.read(')||
    !source.includes('jhSplitScreenOnce155(device,commandId,type,payload,dispatch)')||
    !source.includes('runProtectedJHAction(')||
    !source.includes('jhResultVerificationSummary56(verified)')||
    !source.includes('registerOAuthTool("life_android_original_completion_handle_issue"')||
    !source.includes('registerOAuthTool("life_android_original_completion_handle_status"')||
    !source.includes('if(!a||sid!==j.secureSessionId')||
    !source.includes('durableNativeHooks56?.acceptedCompletion(')||
    !source.includes('const stage26Ack56='))
  fail('STAGE36_EXACT_SIGNED_STAGE35_PROTECTED_OPERATOR_REQUIRED');
 let current=source;
 for(const [from,to]of PAIRS){
  if(count(current,from)!==1||current.includes(to))
   fail('STAGE36_SOURCE_ANCHOR_CHANGED');
  current=current.replace(from,to);
 }
 current=PREFIX+current;
 if(reverseStage36InlineHandoffPatch(current)!==source)
  fail('STAGE36_NOT_REVERSIBLE');
 const signed=current.indexOf('if(!a||sid!==j.secureSessionId');
 const ack=current.indexOf('const stage26Ack56=');
 const durable=current.indexOf('durableNativeHooks56?.acceptedCompletion(');
 const protectedScreen=current.indexOf('const verified=await runProtectedJHAction(');
 const finish=current.indexOf('stage36InlineOriginalHandoff56.finish({receipt,verified})');
 if(!(signed>=0&&signed<ack&&ack<durable&&protectedScreen>=0&&protectedScreen<finish))
  fail('STAGE36_ORIGINAL_SECURITY_OR_PROOF_ORDER_CHANGED');
 return current;
}
