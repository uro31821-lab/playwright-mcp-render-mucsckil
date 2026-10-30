/** Reversible, source-only addition to the already generated JH168 operator.
 * Recovers queued Computer Use INSPECT via existing authenticated receipt STATUS
 * tool; reuses the ORIGINAL secureCall56, HMAC completion and command fence.
 * No new executor or authority, no Android manifest change, no retries.
 */
const IMPORT='import {createComputerInspectReceiptRegistry56} from "../jh168-mobile-unification/computer-inspect-receipts.mjs";\n';
const STATE_OLD='const pendingApprovalReceipts56=createPendingApprovalReceiptRegistry56();';
const STATE_NEW=STATE_OLD+'\nconst computerInspectReceipt56=createComputerInspectReceiptRegistry56();';
const OUT_OLD='    return textResult({...safeJobView56(j),...(receipt||{})});';
const OUT_NEW=[
'    const inspectReceipt=jobType==="computer_use_inspect"&&',
'      mcpToolName==="life_android_computer_inspect"&&',
'      effect==="READ_ONLY"?computerInspectReceipt56.issue({',
'        job:j,deviceId:x.deviceId,deviceDigest:meta?.deviceDigest,',
'        sessionId:active?.sessionId,commandId:j.commandId,',
'        taskDigest:String(args.task_digest||""),',
'        runDigest:String(args.run_digest||"")',
'      }):null;',
'    return textResult({...safeJobView56(j),...(receipt||inspectReceipt||{})});'
].join('\n');
const READ_OLD='  const result=pendingApprovalReceipts56.read({receiptToken:args.receipt_token,deviceId,';
const READ_NEW=[
'  if(/^cir_[A-Za-z0-9_-]{43}$/.test(String(args.receipt_token||""))){',
'    const scoped=computerInspectReceipt56.read({',
'      receiptToken:args.receipt_token,deviceId,deviceDigest:meta.deviceDigest,',
'      sessionId:active.sessionId,',
'      taskDigest:String(args.task_digest||""),',
'      runDigest:String(args.run_digest||""),commandId',
'    },id=>jobs.get(id));',
'    if(!scoped.ok)return textResult(scoped);',
'    return textResult({ok:true,lookupOnly:true,readOnly:true,',
'      automaticReplay:false,newJobCreated:false,...safeJobView56(scoped.job)});',
'  }',
READ_OLD
].join('\n');
const DESC_OLD='description:"READ ONLY: for a queued approval REQUEST with receiptToken. Never request, resend or grant approval; never execute Android actions.",';
const DESC_NEW='description:"READ ONLY: use the returned receipt token to look up only the ORIGINAL queued approval or Computer Use inspect. Never request, execute, approve, or replay an Android action.",';
const PAIRS=[[STATE_OLD,STATE_NEW],[OUT_OLD,OUT_NEW],[READ_OLD,READ_NEW],[DESC_OLD,DESC_NEW]];
export function applyComputerInspectReceiptPatch(source){
 if(typeof source!=='string'||source.startsWith(IMPORT)||
   !source.includes('function pendingApprovalReceiptStatus56(args)')||
   !source.includes('function secureCall56(')||
   !source.includes('jhRequireCommand56(deviceId)')||
   !source.includes('durableNativeHooks56?.beforeDispatch(')||
   !source.includes('jhSplitReadReceipts56'))
  throw Error('JH168_COMPUTER_INSPECT_ORIGINAL_OPERATOR_REQUIRED');
 let out=source;
 for(const [before,after]of PAIRS){
  if(out.split(before).length!==2||out.includes(after))
   throw Error('JH168_COMPUTER_INSPECT_PATCH_ANCHOR_DRIFT');
  out=out.replace(before,after);
 }
 out=IMPORT+out;
 if(reverseComputerInspectReceiptPatch(out)!==source)
   throw Error('JH168_COMPUTER_INSPECT_PATCH_NOT_REVERSIBLE');
 return out;
}
export function reverseComputerInspectReceiptPatch(source){
 if(typeof source!=='string'||!source.startsWith(IMPORT))
  throw Error('JH168_COMPUTER_INSPECT_PREFIX');
 let out=source.slice(IMPORT.length);
 for(const [before,after] of PAIRS.slice().reverse()){
  if(out.split(after).length!==2)throw Error('JH168_COMPUTER_INSPECT_REVERSE_ANCHOR');
  out=out.replace(after,before);
 }
 return out;
}
