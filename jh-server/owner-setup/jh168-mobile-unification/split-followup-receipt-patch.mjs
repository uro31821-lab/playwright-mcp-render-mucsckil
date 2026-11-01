/**
 * Reversible, source-only extension to the existing split READBACK_PENDING path.
 * CLICK requests are still admitted by the ORIGINAL Secure56 and durable
 * one-click journal. This patch adds only readback of that SAME original job.
 * Apply after applyJH168SplitReadReceiptPatch; do not deploy automatically.
 */
const IMPORT='import {createSplitFollowupReceiptRegistry56} from "../jh168-mobile-unification/split-followup-receipts.mjs";\n';
const STATE_OLD='const jhSplitReadReceipts56=createSplitReadReceiptRegistry56();';
const STATE_NEW=STATE_OLD+'\nconst jhSplitFollowupReceipts56=createSplitFollowupReceiptRegistry56();';
const HELPER_ANCHOR='  function jhSplitReadStatus56(receiptRef){';
const HELPER=[
 '  function jhSplitFollowupStatus56(receiptRef){',
 '    const device=chooseDevice(),auth=device&&active56(device);',
 '    if(!device||!auth||devices.get(device)?.secureBridgeVersion!==56)',
 "      return {ok:false,code:'active_secure56_device_required',automaticReplay:false};",
 '    const commandId=jhRequireCommand56(device);',
 '    const binding={deviceId:device,deviceDigest:devices.get(device)?.deviceDigest,',
 '      sessionId:auth.sessionId,commandId};',
 '    let learningJob=null;',
 '    const receipt=jhSplitFollowupReceipts56.read({receiptRef,...binding},',
 '      id=>{learningJob=jobs.get(id);return learningJob;},',
 '      screen=>jhInspectSplitEvidence155(screen).ok===true);',
 '    try{',
 "      if(typeof jhLearningObserveFollowupReceipt56==='function')",
 '        Promise.resolve(jhLearningObserveFollowupReceipt56(learningJob,receipt,',
 '          Object.freeze({...binding,taskDigest:learningJob?.taskDigest,',
 '            requestId:learningJob?.requestId,contextId:learningJob?.contextId,',
 '            targetItemRef:learningJob?.targetItemRef}))).catch(()=>{});',
 '    }catch{} // Observation cannot change the original readback result.',
 '    return receipt;',
 '  }',
 ''
].join('\n');
const WAIT_OLD='    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));';
const WAIT_NEW=[
 "    const followupReceipt=type==='split_screen_session_followup'&&",
 "      effect==='REVERSIBLE_WRITE'&&",
 "      secureToolName==='life_android_execute_computer_action'&&",
 "      payload?.action==='CLICK'?jhSplitFollowupReceipts56.issue({",
 '        job:j,deviceId:device,deviceDigest:targetDeviceDigest,',
 '        sessionId:auth.sessionId,commandId:j.commandId,taskDigest',
 '      }):null;',
 WAIT_OLD
].join('\n');
const RETURN_OLD="      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed',\n        ...(receipt?{...receipt,jobStatus:completed.status}:{}),\n        automaticReplay:false};";
const RETURN_NEW=[
 "      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed',",
 '        ...(receipt?{...receipt,jobStatus:completed.status}:{}),',
 "        ...(followupReceipt?{...followupReceipt,jobStatus:completed?.status||'unknown'}:{}),",
 '        automaticReplay:false};'
].join('\n');
const READBACK_ANCHOR="    if(mode==='READBACK_PENDING'||";
const READBACK_NEW=[
 "    if(mode==='READBACK_PENDING'&&typeof args.receipt_ref==='string'&&",
 "       /^sfr_[A-Za-z0-9_-]{32}$/.test(args.receipt_ref)){",
 '      if(args.context_id||args.request_id||args.command||args.action||args.value||',
 '         args.target_item_ref||args.goal||args.summary_text||args.comparison_text||',
 '         args.recommended_item_ref||args.compared_item_refs)',
 "        return textResult({ok:false,code:'split_followup_receipt_arguments_invalid',",
 '          automaticReplay:false});',
 '      return textResult(jhSplitFollowupStatus56(args.receipt_ref));',
 '    }',
 READBACK_ANCHOR
].join('\n');
const PAIRS=[
 [STATE_OLD,STATE_NEW],
 [HELPER_ANCHOR,HELPER+HELPER_ANCHOR],
 [WAIT_OLD,WAIT_NEW],
 [RETURN_OLD,RETURN_NEW],
 [READBACK_ANCHOR,READBACK_NEW]
];
export function applyJH168SplitFollowupReceiptPatch(source){
 if(typeof source!=='string'||source.startsWith(IMPORT)||
    !source.includes('jhSplitReadReceipts56')||
    !source.includes('jhSplitReadStatus56')||
    !source.includes('durableNativeHooks56?.beforeDispatch(')||
    !source.includes('jhInspectSplitEvidence155')||
    !source.includes('jhRequireCommand56(device)'))
   throw Error('JH168_SPLIT_FOLLOWUP_ORIGINAL_GUARDS_REQUIRED');
 let out=source;
 for(const [before,after] of PAIRS){
   if(out.split(before).length!==2||out.includes(after))
     throw Error('JH168_SPLIT_FOLLOWUP_ANCHOR_DRIFT');
   out=out.replace(before,after);
 }
 out=IMPORT+out;
 if(reverseJH168SplitFollowupReceiptPatch(out)!==source)
   throw Error('JH168_SPLIT_FOLLOWUP_NOT_REVERSIBLE');
 return out;
}
export function reverseJH168SplitFollowupReceiptPatch(source){
 if(typeof source!=='string'||!source.startsWith(IMPORT))
   throw Error('JH168_SPLIT_FOLLOWUP_PREFIX_MISSING');
 let out=source.slice(IMPORT.length);
 for(const [before,after] of PAIRS.slice().reverse()){
  if(out.split(after).length!==2)
    throw Error('JH168_SPLIT_FOLLOWUP_REVERSE_ANCHOR');
  out=out.replace(after,before);
 }
 return out;
}

