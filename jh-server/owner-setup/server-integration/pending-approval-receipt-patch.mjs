/* Apply a reversible, isolated patch AFTER the pinned Secure56 owner/unified
 * runtime and existing native-readback patch are verified. This never changes
 * the immutable baseline server-integration/server.mjs.
 */
const PREFIX='import {createPendingApprovalReceiptRegistry56} from "./secure56-pending-approval-receipts.mjs";\n';
const STATE_OLD="const recentWeb=new Map();";
const STATE_NEW=STATE_OLD+"\nconst pendingApprovalReceipts56=createPendingApprovalReceiptRegistry56();";
const CALL_OLD=`function secureCall56(mcpToolName,jobType,effect,args,extra={}){
  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));
  return waitJob(x.job,15000).then(secureResult56);
}`;
const CALL_NEW=`function secureCall56(mcpToolName,jobType,effect,args,extra={}){
  const x=exactEnvelope56(mcpToolName,jobType,effect,args,extra);if(x.error)return Promise.resolve(textResult({ok:false,code:x.error,deviceDigest:x.deviceDigest||null}));
  return waitJob(x.job,15000).then(j=>{
    if(!["queued","in_progress"].includes(j.status))return secureResult56(j);
    const active=active56(x.deviceId),meta=devices.get(x.deviceId);
    const receipt=pendingApprovalReceipts56.issue({job:j,deviceId:x.deviceId,deviceDigest:meta?.deviceDigest,
      sessionId:active?.sessionId,taskDigest:String(args.task_digest||""),runDigest:String(args.run_digest||""),
      commandId:j.commandId});
    return textResult({...safeJobView56(j),...(receipt||{})});
  });
}
function pendingApprovalReceiptStatus56(args){
  const deviceId=chooseDevice(args.device_id||null);
  if(!deviceId)return textResult({ok:false,code:"secure_bridge_device_not_active"});
  const meta=devices.get(deviceId),active=active56(deviceId);
  if(!meta||meta.secureBridgeVersion!==56||!active)return textResult({ok:false,code:"secure_bridge_device_not_active"});
  const commandId=jhRequireCommand56(deviceId); // enforce CURRENT JH command binding, never old commands
  cleanupJobs();
  const result=pendingApprovalReceipts56.read({receiptToken:args.receipt_token,deviceId,
    deviceDigest:meta.deviceDigest,sessionId:active.sessionId,
    taskDigest:String(args.task_digest||""),runDigest:String(args.run_digest||""),commandId},
    jobId=>jobs.get(jobId));
  if(!result.ok)return textResult(result);
  return textResult({ok:true,lookupOnly:true,...safeJobView56(result.job)});
}`;
const TOOL_OLD='  registerOAuthTool("life_android_screen_consent_status",{title:"Read local screen consent status",description:"Read-only status for a task-scoped phone-local screen consent request.",inputSchema:{device_id:z.string().optional(),task_digest:z.string(),request_token:z.string()}},async(args)=>secureCall56("life_android_screen_consent_status","computer_use_screen_consent_status","READ_ONLY",args));';
const TOOL_NEW=TOOL_OLD+`
  registerOAuthTool("life_android_pending_approval_receipt_status",{
    title:"Read original queued local approval request",
    description:"READ ONLY: for a queued approval REQUEST with receiptToken. Never request, resend or grant approval; never execute Android actions.",
    inputSchema:{device_id:z.string().optional(),task_digest:z.string(),run_digest:z.string().optional(),receipt_token:z.string()},
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
  },async(args)=>pendingApprovalReceiptStatus56(args));`;
const PAIRS=[[STATE_OLD,STATE_NEW],[CALL_OLD,CALL_NEW],[TOOL_OLD,TOOL_NEW]];
export function applyPendingApprovalReceiptPatch(source){
  if(typeof source!=="string"||source.startsWith(PREFIX))throw Error("PENDING_RECEIPT_PATCH_SOURCE_INVALID");
  let out=source;
  for(const [before,after]of PAIRS){if(out.split(before).length!==2||out.includes(after))throw Error("PENDING_RECEIPT_PATCH_ANCHOR");out=out.replace(before,after);}
  out=PREFIX+out;
  if(reversePendingApprovalReceiptPatch(out)!==source)throw Error("PENDING_RECEIPT_PATCH_SCOPE");
  return out;
}
export function reversePendingApprovalReceiptPatch(source){
  if(!source.startsWith(PREFIX))throw Error("PENDING_RECEIPT_PATCH_PREFIX");
  let out=source.slice(PREFIX.length);
  for(const [before,after]of PAIRS.slice().reverse()){if(out.split(after).length!==2)throw Error("PENDING_RECEIPT_REVERSE_ANCHOR");out=out.replace(after,before);}
  return out;
}
