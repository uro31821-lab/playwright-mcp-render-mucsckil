/** Source-only reversible readback extension over actual generated Stage25/26 Secure56 operator.
 * Existing execution, OAuth, command, HMAC, phone approval and durable journal are preserved.
 */
const IMPORT='import {createComputerExecutionReceiptRegistry56} from "../jh168-mobile-unification/computer-execution-receipts.mjs";\n';
const OLD_STATE='const computerInspectReceipt56=createComputerInspectReceiptRegistry56();';
const NEW_STATE=OLD_STATE+'\nconst computerExecutionReceipts56=createComputerExecutionReceiptRegistry56();';
const OLD_OUT='    return textResult({...safeJobView56(j),...(receipt||inspectReceipt||{})});';
const NEW_OUT=[
 '    const executeReceipt=jobType==="computer_use_action_execute"&&',
 '      mcpToolName==="life_android_execute_computer_action"&&',
 '      effect==="MUTATION"?computerExecutionReceipts56.issue({',
 '        job:j,deviceId:x.deviceId,deviceDigest:meta?.deviceDigest,',
 '        sessionId:active?.sessionId,commandId:j.commandId,',
 '        taskDigest:String(args.task_digest||""),runDigest:String(args.run_digest||"")',
 '      }):null;',
 '    return textResult({...safeJobView56(j),...(receipt||inspectReceipt||executeReceipt||{})});'
].join('\n');
const OLD_READ='  if(/^cir_[A-Za-z0-9_-]{43}$/.test(String(args.receipt_token||""))){';
const NEW_READ=[
 '  if(/^cer_[A-Za-z0-9_-]{43}$/.test(String(args.receipt_token||""))){',
 '    const outcome=computerExecutionReceipts56.read({',
 '      receiptToken:args.receipt_token,deviceId,deviceDigest:meta.deviceDigest,',
 '      sessionId:active.sessionId,commandId,taskDigest:String(args.task_digest||""),',
 '      runDigest:String(args.run_digest||"")',
 '    },id=>jobs.get(id));',
 '    return textResult(outcome); // exact original job only, no dispatch',
 '  }',
 OLD_READ
].join('\n');
const OLD_DESC='description:"READ ONLY: use the returned receipt token to look up only the ORIGINAL queued approval or Computer Use inspect. Never request, execute, approve, or replay an Android action.",';
const NEW_DESC='description:"READ ONLY: recover only the ORIGINAL queued approval, Computer Use inspect, or in-progress signed EXECUTE result by scoped receipt token. Never dispatch, execute, approve, or replay Android actions.",';
const PAIRS=[[OLD_STATE,NEW_STATE],[OLD_OUT,NEW_OUT],[OLD_READ,NEW_READ],[OLD_DESC,NEW_DESC]];
export function applyComputerExecutionReceiptPatch(source){
 if(typeof source!=='string'||source.startsWith(IMPORT)||!source.includes('durableNativeHooks56?.acceptedCompletion(')||!source.includes('jhRequireCommand56(deviceId)')||!source.includes('computerInspectReceipt56.issue(')||!source.includes('pendingApprovalReceiptStatus56(args)'))
  throw Error('COMPUTER_EXECUTION_ORIGINAL_SECURE56_REQUIRED');
 let out=source;
 for(const [before,after]of PAIRS){
  if(out.split(before).length!==2||out.includes(after))throw Error('COMPUTER_EXECUTION_RECEIPT_ANCHOR_DRIFT');
  out=out.replace(before,after);
 }
 out=IMPORT+out;
 if(reverseComputerExecutionReceiptPatch(out)!==source)throw Error('COMPUTER_EXECUTION_RECEIPT_NOT_REVERSIBLE');
 return out;
}
export function reverseComputerExecutionReceiptPatch(source){
 if(typeof source!=='string'||!source.startsWith(IMPORT))throw Error('COMPUTER_EXECUTION_RECEIPT_PREFIX_MISSING');
 let out=source.slice(IMPORT.length);
 for(const [before,after]of PAIRS.slice().reverse()){
  if(out.split(after).length!==2)throw Error('COMPUTER_EXECUTION_RECEIPT_REVERSE_ANCHOR');
  out=out.replace(after,before);
 }
 return out;
}
