/** Operator-selectable Secure56 queued-approval runtime.
 * Existing JH startup never selects this entry. No implicit deploy or replay.
 */
import path from "node:path";
import {readFileSync,writeFileSync,renameSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
import {buildCleanRestartRelease56} from "../deployment/durable-clean-restart-news-review-entry.mjs";
import {applyPendingApprovalReceiptPatch,reversePendingApprovalReceiptPatch} from "./pending-approval-receipt-patch.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const fail=code=>{throw Object.assign(Error(code),{code});};
const SERVICE="srv-db0fjl2d0e5s73be114g";
const APPROVAL="EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1";
const RUNTIME="server-jh168-pending-approval-operator.mjs";
const STAMP="pending-approval-operator-attestation.json";
const OWNER="owner-service-pending-approval-operator.mjs";
const UNIFIED="unified-service-pending-approval-operator.mjs";
const ENTRY="operational-service-pending-approval-operator.mjs";

const ci=env=>env?.CI==="true"&&env.NODE_ENV==="test"&&env.JH_OWNER_DEFER_LISTEN==="1"&&env.RENDER_SERVICE_ID===undefined&&env.JH_DURABLE_RELEASE===undefined;
const operator=env=>env?.CI!=="true"&&env?.JH_PENDING_APPROVAL_OPERATOR_ENABLE===APPROVAL&&env.RENDER_SERVICE_ID===SERVICE&&env.JH_DURABLE_RELEASE==="SERVE_READY_V1";
function gate(env){if(!ci(env)&&!operator(env))fail("JH_PENDING_APPROVAL_OPERATOR_NOT_AUTHORIZED");}
function files(root){return {
 parent:path.join(root,"server-integration/server-durable-native-return-route56.mjs"),
 runtime:path.join(root,"server-integration",RUNTIME),
 stamp:path.join(root,"server-integration",STAMP),
 owner:path.join(root,"deployment",OWNER),
 unified:path.join(root,"deployment",UNIFIED),
 entry:path.join(root,"deployment",ENTRY)
};}
function publish(file,src){
 const tmp=file+".tmp";
 writeFileSync(tmp,src,{encoding:"utf8",mode:0o600});
 renameSync(tmp,file);
 if(readFileSync(file,"utf8")!==src)fail("JH_PENDING_APPROVAL_CANDIDATE_READBACK");
}
function exact(src,before,after){
 if(typeof src!=="string"||src.split(before).length!==2||src.includes(after))fail("JH_PENDING_APPROVAL_SOURCE_DRIFT");
 const next=src.replace(before,after);
 if(next.replace(after,before)!==src)fail("JH_PENDING_APPROVAL_SOURCE_NOT_REVERSIBLE");
 return next;
}
export function selectPendingApprovalOperatorRuntime56(root,env=process.env){
 gate(env);
 const p=files(root);
 let stamp;
 try{stamp=JSON.parse(readFileSync(p.stamp,"utf8"));}catch{fail("JH_PENDING_APPROVAL_ATTESTATION_MISSING");}
 if(stamp.schema!=="JH_PENDING_APPROVAL_OPERATOR_V1"||stamp.productionEnabled!==false||
   stamp.automaticReplayAllowed!==false||!/^[a-f0-9]{64}$/.test(stamp.parentSha256||"")||
   !/^[a-f0-9]{64}$/.test(stamp.runtimeSha256||""))fail("JH_PENDING_APPROVAL_ATTESTATION_INVALID");
 const original=readFileSync(p.parent),patched=readFileSync(p.runtime);
 if(sha(original)!==stamp.parentSha256||sha(patched)!==stamp.runtimeSha256||
   reversePendingApprovalReceiptPatch(patched.toString("utf8"))!==original.toString("utf8"))
   fail("JH_PENDING_APPROVAL_RUNTIME_DRIFT");
 return Object.freeze({file:p.runtime,sha256:stamp.runtimeSha256});
}
export async function buildPendingApprovalOperatorEntrypoint56(root,env=process.env){
 gate(env);
 if(typeof root!=="string"||root!==path.resolve(root))fail("JH_PENDING_APPROVAL_ROOT_INVALID");
 const clean=buildCleanRestartRelease56();
 const release=await import(pathToFileURL(clean.file).href+"?pending="+clean.sha256);
 const base=release.buildDurableRoutedOperationalEntrypoint(root);
 const p=files(root);
 if(base.runtimeFile!==p.parent)fail("JH_PENDING_APPROVAL_PARENT_PATH_CHANGED");
 const original=readFileSync(p.parent,"utf8");
 if(sha(original)!==base.candidateSha256)fail("JH_PENDING_APPROVAL_PARENT_SHA_CHANGED");
 const runtime=applyPendingApprovalReceiptPatch(original);
 if(reversePendingApprovalReceiptPatch(runtime)!==original||
   runtime.split('registerOAuthTool("life_android_pending_approval_receipt_status"').length!==2||
   !runtime.includes("durableNativeHooks56?.acceptedCompletion(")||
   !runtime.includes("jhRequireCommand56("))fail("JH_PENDING_APPROVAL_POLICY_CHANGED");
 publish(p.runtime,runtime);
 const fromOwner="if(runtimeMode==='unified')serverPath=buildDurableRoutedRuntime(root).file;";
 const toOwner="if(runtimeMode==='unified')serverPath=selectPendingApprovalOperatorRuntime56(root,process.env).file;";
 const preface='import {selectPendingApprovalOperatorRuntime56} from "../server-integration/pending-approval-operator-entry.mjs";\n';
 const owner=preface+exact(readFileSync(base.ownerFile,"utf8"),fromOwner,toOwner);
 publish(p.owner,owner);
 const unified=exact(readFileSync(base.unifiedFile,"utf8"),
   "from './owner-service-durable-return-route56.mjs';","from './"+OWNER+"';");
 publish(p.unified,unified);
 const op=preface+exact(exact(readFileSync(base.file,"utf8"),
   "from './unified-service-durable-return-route56.mjs';","from './"+UNIFIED+"';"),
   "const runtime=buildDurableRoutedRuntime(ROOT).file;",
   "const runtime=selectPendingApprovalOperatorRuntime56(ROOT,process.env).file;");
 publish(p.entry,op);
 const stamp={schema:"JH_PENDING_APPROVAL_OPERATOR_V1",parentSha256:base.candidateSha256,
   runtimeSha256:sha(runtime),ownerSha256:sha(owner),unifiedSha256:sha(unified),
   operationalSha256:sha(op),productionEnabled:false,automaticReplayAllowed:false};
 publish(p.stamp,JSON.stringify(stamp,null,2)+"\n");
 if(selectPendingApprovalOperatorRuntime56(root,env).sha256!==stamp.runtimeSha256||
   sha(readFileSync(p.parent))!==base.candidateSha256)fail("JH_PENDING_APPROVAL_OUTPUT_CHANGED");
 return Object.freeze({file:p.entry,runtimeFile:p.runtime,parentFile:p.parent,
   ownerFile:p.owner,unifiedFile:p.unified,stampFile:p.stamp,stamp,
   operatorActivated:false,listenerStarted:false});
}
export async function main(env=process.env){
 if(!operator(env))fail("JH_PENDING_APPROVAL_OPERATOR_EXPLICIT_ENABLE_REQUIRED");
 const root=path.resolve(import.meta.dirname,"..");
 const built=await buildPendingApprovalOperatorEntrypoint56(root,env);
 const operating=await import(pathToFileURL(built.file).href+"?sha="+built.stamp.operationalSha256);
 if(typeof operating.main!=="function")fail("JH_PENDING_APPROVAL_ORIGINAL_MAIN_MISSING");
 return operating.main(env);
}
