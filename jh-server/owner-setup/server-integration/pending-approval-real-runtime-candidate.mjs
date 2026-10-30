/** Strict CI-only assembly of the actual pinned JH Secure56 operational runtime.
 * The deployed owner baseline, hosted entry and signed phone are never changed.
 */
import path from "node:path";
import {readFileSync,writeFileSync,renameSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {buildCleanRestartRelease56} from "../deployment/durable-clean-restart-news-review-entry.mjs";
import {applyPendingApprovalReceiptPatch,reversePendingApprovalReceiptPatch} from "./pending-approval-receipt-patch.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const deny=code=>{throw Object.assign(Error(code),{code});};
export async function buildPendingApprovalRealRuntimeCandidate56(root,env=process.env){
 if(env.CI!=="true"||env.NODE_ENV!=="test"||env.JH_OWNER_DEFER_LISTEN!=="1"||
    env.RENDER_SERVICE_ID!==undefined||env.JH_DURABLE_RELEASE!==undefined)deny("PENDING_APPROVAL_REAL_CI_ONLY");
 if(typeof root!=="string"||path.resolve(root)!==root)deny("PENDING_APPROVAL_ROOT_INVALID");
 const builtClean=buildCleanRestartRelease56(); // enforces original live-release blob
 const entry=await import(pathToFileURL(builtClean.file).href+"?receiptSource="+builtClean.sha256);
 if(typeof entry.buildDurableRoutedOperationalEntrypoint!=="function")deny("PENDING_APPROVAL_ENTRY_MISSING");
 const result=entry.buildDurableRoutedOperationalEntrypoint(root);
 const expected=path.join(root,"server-integration/server-durable-native-return-route56.mjs");
 if(result.runtimeFile!==expected)deny("PENDING_APPROVAL_PARENT_PATH_CHANGED");
 const input=readFileSync(result.runtimeFile,"utf8");
 if(sha(input)!==result.candidateSha256)deny("PENDING_APPROVAL_PARENT_DIGEST_CHANGED");
 const output=applyPendingApprovalReceiptPatch(input);
 if(reversePendingApprovalReceiptPatch(output)!==input)deny("PENDING_APPROVAL_PATCH_OUT_OF_SCOPE");
 if(output.split('registerOAuthTool("life_android_pending_approval_receipt_status"').length!==2||
    !output.includes("durableNativeHooks56?.beforeDispatch(")||
    !output.includes("durableNativeHooks56?.acceptedCompletion(")||
    !output.includes("const SECURE56_TOOL_CATALOG_DIGEST="))deny("PENDING_APPROVAL_HOST_GUARD_MISSING");
 const file=path.join(root,"server-integration/server-jh168-pending-approval-ci-only.mjs");
 const tmp=file+".tmp";writeFileSync(tmp,output,{mode:0o600});renameSync(tmp,file);
 if(sha(readFileSync(file))!==sha(output)||sha(readFileSync(expected))!==result.candidateSha256)
   deny("PENDING_APPROVAL_SOURCE_READBACK_MISMATCH");
 return Object.freeze({file,parentFile:expected,parentSha256:result.candidateSha256,
  sourceSha256:sha(output),approvalPolicyChanged:false,productionEnabled:false,
  automaticReplayAllowed:false});
}
