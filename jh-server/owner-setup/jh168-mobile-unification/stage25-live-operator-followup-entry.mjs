/**
 * JH168 Stage25: additive CLICK receipt readback above the EXISTING JH
 * pending-approval, split-read, computer-inspect, and operational-learning
 * operator. NO default service route, HMAC, OAuth, approval, APK, or replay.
 *
 * This is an explicit alternate operator startup; original npm start
 * continues to select the unchanged published host router.
 */
import path from 'node:path';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {
  buildPendingApprovalOperatorEntrypoint56,
  selectPendingApprovalOperatorRuntime56
} from '../server-integration/pending-approval-operator-entry.mjs';
import {
  applyJH168SplitFollowupReceiptPatch,
  reverseJH168SplitFollowupReceiptPatch
} from './split-followup-receipt-patch.mjs';
import {
  applyStage26CompletionAckPatch56,reverseStage26CompletionAckPatch56
} from './stage26-completion-delivery-patch.mjs';
import {applyComputerExecutionReceiptPatch,reverseComputerExecutionReceiptPatch}
 from './computer-execution-receipt-patch.mjs';
import {applyStage40OwnerAdmissionDiagnostics,reverseStage40OwnerAdmissionDiagnostics}
 from './stage40-owner-admission-diagnostics-patch.mjs';
import {applyStage41CommandLifecyclePatch,reverseStage41CommandLifecyclePatch}
 from './stage41-command-lifecycle-patch.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const SERVICE='srv-db0fjl2d0e5s73be114g';
const APPROVAL='EXPLICIT_OPERATOR_APPROVAL_RECEIPT_V1';
const ENABLE='EXPLICIT_FOLLOWUP_CLICK_RECEIPT_V1';
const SUFFIX='-stage25-followup-operator';
const RUNTIME='server-jh168-pending-approval-followup-operator.mjs';
const STAMP='jh168-followup-operator-attestation.json';
const OWNER='owner-service-stage25-followup-operator.mjs';
const UNIFIED='unified-service-stage25-followup-operator.mjs';
const ENTRY='operational-service-stage25-followup-operator.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const ci=env=>env?.CI==='true'&&env.NODE_ENV==='test'&&
  env.JH_OWNER_DEFER_LISTEN==='1'&&env.RENDER_SERVICE_ID===undefined&&
  env.JH_DURABLE_RELEASE===undefined&&env.JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE===undefined;
const prod=env=>env?.CI!=='true'&&
  env.JH_SPLIT_FOLLOWUP_OPERATOR_ENABLE===ENABLE&&
  env.JH_PENDING_APPROVAL_OPERATOR_ENABLE===APPROVAL&&
  env.JH_DURABLE_RELEASE==='SERVE_READY_V1'&&env.RENDER_SERVICE_ID===SERVICE&&
  env.JH_OWNER_DEFER_LISTEN===undefined;
function gate(env){if(!ci(env)&&!prod(env))fail('JH_STAGE25_FOLLOWUP_OPERATOR_NOT_AUTHORIZED');}
const STAGE41_DIAG_FLAG='EXPLICIT_SIGNED_COMMAND_CAUSE_V1';
export function selectStage41CommandLifecycle56(env=process.env){
 const flag=env?.JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS;
 if(flag===undefined||flag==='')return false;
 if(flag!==STAGE41_DIAG_FLAG)fail('STAGE41_DIAGNOSTICS_FLAG_INVALID');
 if(!ci(env)&&!prod(env))fail('STAGE41_ORIGINAL_OPERATOR_REQUIRED');
 if(env.JH_MOBILE_WEB_13_MODE!=='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'||
   env.JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS!=='EXPLICIT_ORIGINAL_OWNER_REASON_V1')
   fail('STAGE41_SIGNED_MOBILE40_SCOPE_REQUIRED');
 return true;
}
const STAGE40_DIAG_FLAG='EXPLICIT_ORIGINAL_OWNER_REASON_V1';
export function selectStage40OwnerAdmissionDiagnostics56(env=process.env){
 const flag=env?.JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS;
 if(flag===undefined||flag==='')return false;
 if(flag!==STAGE40_DIAG_FLAG)fail('STAGE40_DIAGNOSTICS_FLAG_INVALID');
 if(!ci(env)&&!prod(env))fail('STAGE40_ORIGINAL_OPERATOR_REQUIRED');
 if(env.JH_MOBILE_WEB_13_MODE!=='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1')
   fail('STAGE40_MOBILE_RIGHT_SCOPE_REQUIRED');
 return true;
}
const STAGE26_ACK_FLAG='EXPLICIT_IDENTICAL_SIGNED_RESULT_V1';
export function selectStage26CompletionAck56(env=process.env){
 const flag=env?.JH_STAGE26_SIGNED_COMPLETION_ACK;
 if(flag===undefined||flag==='')return false;
 if(flag!==STAGE26_ACK_FLAG)fail('JH_STAGE26_ACK_FLAG_INVALID');
 if(!ci(env)&&!prod(env))fail('JH_STAGE26_ACK_ORIGINAL_OPERATOR_REQUIRED');
 return true;
}
const exact=(src,oldText,newText)=>{
 if(typeof src!=='string'||src.split(oldText).length!==2||src.includes(newText))
  fail('JH_STAGE25_ORIGINAL_OPERATOR_SOURCE_DRIFT');
 const output=src.replace(oldText,newText);
 if(output.replace(newText,oldText)!==src)fail('JH_STAGE25_OPERATOR_SOURCE_NOT_REVERSIBLE');
 return output;
};
function emit(file,content){
 const tmp=file+'.tmp';writeFileSync(tmp,content,{encoding:'utf8',mode:0o600});
 renameSync(tmp,file);
 if(readFileSync(file,'utf8')!==content)fail('JH_STAGE25_OPERATOR_WRITE_MISMATCH');
}
function paths(root){
 return {
  runtime:path.join(root,'server-integration',RUNTIME),
  stamp:path.join(root,'server-integration',STAMP),
  owner:path.join(root,'deployment',OWNER),
  unified:path.join(root,'deployment',UNIFIED),
  entry:path.join(root,'deployment',ENTRY)
 };
}
const selectors={
 old:"selectPendingApprovalOperatorRuntime56",
 newer:"selectStage25PendingOperatorRuntime56",
 oldImport:'import {selectPendingApprovalOperatorRuntime56} from "../server-integration/pending-approval-operator-entry.mjs";',
 newImport:'import {selectStage25PendingOperatorRuntime56} from "../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs";'
};
export function selectStage25PendingOperatorRuntime56(root,env=process.env){
 gate(env);
 const old=selectPendingApprovalOperatorRuntime56(root,env); // complete existing attestation
 const p=paths(root);let stamp;
 try{stamp=JSON.parse(readFileSync(p.stamp,'utf8'))}
 catch{fail('JH_STAGE25_FOLLOWUP_ATTESTATION_MISSING')}
 if(stamp.schema!=='JH168_STAGE25_FOLLOWUP_OPERATOR_V1'||
    stamp.productionEnabled!==false||stamp.automaticReplayAllowed!==false||
    !/^[a-f0-9]{64}$/.test(stamp.parentSha256||'')||
    !/^[a-f0-9]{64}$/.test(stamp.runtimeSha256||'')||
    stamp.computerExecutionReceiptStage38!==true||
    stamp.stage40OwnerAdmissionDiagnostics!==selectStage40OwnerAdmissionDiagnostics56(env)||
    stamp.stage41CommandLifecycleDiagnostics!==selectStage41CommandLifecycle56(env)||
    ![stamp.ownerSha256,stamp.unifiedSha256,stamp.operationalSha256]
      .every(s=>/^[a-f0-9]{64}$/.test(s||'')))
  fail('JH_STAGE25_FOLLOWUP_ATTESTATION_INVALID');
 if(old.sha256!==stamp.parentSha256)fail('JH_STAGE25_ORIGINAL_OPERATOR_CHANGED');
 const stage26Ack=selectStage26CompletionAck56(env);
 const stage40=selectStage40OwnerAdmissionDiagnostics56(env);
 const stage41=selectStage41CommandLifecycle56(env);
 const original=readFileSync(old.file,'utf8');
 const runtime=readFileSync(p.runtime,'utf8');
 if(sha(original)!==stamp.parentSha256||
    sha(runtime)!==stamp.runtimeSha256||
    sha(readFileSync(p.owner,'utf8'))!==stamp.ownerSha256||
    sha(readFileSync(p.unified,'utf8'))!==stamp.unifiedSha256||
    sha(readFileSync(p.entry,'utf8'))!==stamp.operationalSha256||
    reverseJH168SplitFollowupReceiptPatch(stage26Ack?
      reverseStage26CompletionAckPatch56(reverseComputerExecutionReceiptPatch(stage40?reverseStage40OwnerAdmissionDiagnostics(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime):(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime))):
      reverseComputerExecutionReceiptPatch(stage40?reverseStage40OwnerAdmissionDiagnostics(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime):(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime)))!==original)
  fail('JH_STAGE25_FOLLOWUP_ATTESTATION_SCOPE_CHANGED');
 return Object.freeze({file:p.runtime,sha256:stamp.runtimeSha256,
  noNewExecutor:true,automaticReplayAllowed:false,originalOperatorVerified:true});
}
export async function buildStage25PendingOperatorEntrypoint56(
 root=path.resolve(import.meta.dirname,'..'),env=process.env
){
 gate(env);
 if(root!==path.resolve(root))fail('JH_STAGE25_INVALID_ROOT');
 const base=await buildPendingApprovalOperatorEntrypoint56(root,env);
 const p=paths(root);
 const old=selectPendingApprovalOperatorRuntime56(root,env);
 if(old.sha256!==base.stamp.runtimeSha256||old.file!==base.runtimeFile)
  fail('JH_STAGE25_BASE_OPERATOR_MISMATCH');
 const original=readFileSync(base.runtimeFile,'utf8');
 if(sha(original)!==base.stamp.runtimeSha256||
    !original.includes('pendingApprovalReceipts56')||
    !original.includes('jhSplitReadReceipts56')||
    !original.includes('computerInspectReceipt56')||
    !original.includes('durableNativeHooks56?.acceptedCompletion(')||
    !original.includes('jhRequireCommand56('))
  fail('JH_STAGE25_EXISTING_OPERATOR_GUARDS_REQUIRED');
 const stage26Ack=selectStage26CompletionAck56(env);
 const stage40=selectStage40OwnerAdmissionDiagnostics56(env);
 const stage41=selectStage41CommandLifecycle56(env);
 const withFollowup=applyJH168SplitFollowupReceiptPatch(original);
 const stage26Runtime=stage26Ack?applyStage26CompletionAckPatch56(withFollowup):withFollowup;
 const afterReceipt=applyComputerExecutionReceiptPatch(stage26Runtime);
 const afterStage40=stage40?applyStage40OwnerAdmissionDiagnostics(afterReceipt):afterReceipt;
 const runtime=stage41?applyStage41CommandLifecyclePatch(afterStage40):afterStage40;
 if(reverseJH168SplitFollowupReceiptPatch(stage26Ack?
       reverseStage26CompletionAckPatch56(reverseComputerExecutionReceiptPatch(stage40?reverseStage40OwnerAdmissionDiagnostics(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime):(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime))):
       reverseComputerExecutionReceiptPatch(stage40?reverseStage40OwnerAdmissionDiagnostics(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime):(stage41?reverseStage41CommandLifecyclePatch(runtime):runtime)))!==original||
    runtime.split('jhSplitFollowupReceipts56.issue(').length!==2||
    runtime.split('jhSplitFollowupReceipts56.read(').length!==2||
    runtime.split('computerExecutionReceipts56.issue(').length!==2||
    runtime.split('computerExecutionReceipts56.read(').length!==2||
    (stage40 && (runtime.split('jhOwnerAdmissionNote40(').length!==3||
      runtime.split('jhOwnerAdmissionTake40(').length!==3))||
    (stage41&&(runtime.split('const jhCommandCauses41=new Map();').length!==2||
      runtime.split('function jhCommandCause41(').length!==2)))
  fail('JH_STAGE25_FOLLOWUP_PATCH_NOT_EXACT');
 emit(p.runtime,runtime);

 const ownerBase=readFileSync(base.ownerFile,'utf8');
 let owner=exact(ownerBase,selectors.oldImport,selectors.newImport);
 owner=exact(owner,
  "if(runtimeMode==='unified')serverPath=selectPendingApprovalOperatorRuntime56(root,process.env).file;",
  "if(runtimeMode==='unified')serverPath=selectStage25PendingOperatorRuntime56(root,process.env).file;");
 emit(p.owner,owner);

 const unified=exact(readFileSync(base.unifiedFile,'utf8'),
  "from './owner-service-pending-approval-operator.mjs';",
  "from './"+OWNER+"';");
 emit(p.unified,unified);

 let entry=exact(readFileSync(base.file,'utf8'),
   selectors.oldImport,selectors.newImport);
 entry=exact(entry,
   "from './unified-service-pending-approval-operator.mjs';",
   "from './"+UNIFIED+"';");
 entry=exact(entry,
   'const runtime=selectPendingApprovalOperatorRuntime56(ROOT,process.env).file;',
   'const runtime=selectStage25PendingOperatorRuntime56(ROOT,process.env).file;');
 emit(p.entry,entry);
 const stamp=Object.freeze({
   schema:'JH168_STAGE25_FOLLOWUP_OPERATOR_V1',
   parentSha256:base.stamp.runtimeSha256,
   runtimeSha256:sha(runtime),ownerSha256:sha(owner),
   unifiedSha256:sha(unified),operationalSha256:sha(entry),
   originalPendingApprovalOperator:true,
   originalSplitRead:true,originalComputerInspect:true,
   originalOperationalLearning:true,
   computerExecutionReceiptStage38:true,
   stage40OwnerAdmissionDiagnostics:stage40,
   stage41CommandLifecycleDiagnostics:stage41,
   ...(stage26Ack?{signedCompletionAckStage26:true}:{}),
   productionEnabled:false,automaticReplayAllowed:false
 });
 emit(p.stamp,JSON.stringify(stamp,null,2)+'\n');
 if(selectStage25PendingOperatorRuntime56(root,env).sha256!==stamp.runtimeSha256)
  fail('JH_STAGE25_FOLLOWUP_OPERATOR_READBACK');
 return Object.freeze({file:p.entry,runtimeFile:p.runtime,ownerFile:p.owner,
  unifiedFile:p.unified,stampFile:p.stamp,stamp,originalOperatorPreserved:true,
  listenerStarted:false,apkChanged:false,productionEnabled:false});
}
export async function main(env=process.env){
 if(!prod(env))fail('JH_STAGE25_EXPLICIT_PENDING_OPERATOR_REQUIRED');
 // Owner startup sets JH_OWNER_DEFER_LISTEN=1 before opening its listener.
 // Capture the exact checked enablement BEFORE that known internal mutation.
 const stage26EnabledAtBootstrap=selectStage26CompletionAck56(env);
 const stage40EnabledAtBootstrap=selectStage40OwnerAdmissionDiagnostics56(env);
 const stage41EnabledAtBootstrap=selectStage41CommandLifecycle56(env);
 const root=path.resolve(import.meta.dirname,'..');
 const built=await buildStage25PendingOperatorEntrypoint56(root,env);
 const module=await import(pathToFileURL(built.file).href+'?sha='+built.stamp.operationalSha256);
 if(typeof module.main!=='function')fail('JH_STAGE25_ORIGINAL_OPERATOR_MAIN_MISSING');
 const running=await module.main(env);
 console.log('JH_SPLIT_FOLLOWUP_READBACK_ACTIVE '+JSON.stringify({
  schema:built.stamp.schema,sha256:built.stamp.runtimeSha256,
  existingPendingApprovalPreserved:true,existingLearningPreserved:true,
  automaticReplayAllowed:false,apkChanged:false
 }));
 if(stage26EnabledAtBootstrap){
  console.log('JH_STAGE26_SIGNED_COMPLETION_ACK_ACTIVE '+JSON.stringify({
   schema:'JH168_STAGE26_SIGNED_COMPLETION_ACK_V1',
   sha256:built.stamp.runtimeSha256,
   originalStage25Preserved:true,automaticClickReplay:false,
   additionalHttpCompletionAckOnly:true,apkChanged:false
  }));
 }
 if(stage40EnabledAtBootstrap){
  console.log('JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS_ACTIVE '+JSON.stringify({
   schema:'JH168_STAGE40_ORIGINAL_OWNER_DIAGNOSTICS_V1',
   originalOwnerAuthorityPreserved:true,automaticReplayAllowed:false,apkChanged:false,
   diagnosticValuesOnly:true,phoneApprovalUnchanged:true
  }));
 }
 if(stage41EnabledAtBootstrap){
    console.log('JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS_ACTIVE '+JSON.stringify({
      originalCommandVersionFencePreserved:true,originalDiscardSignaturePreserved:true,
      fullIdsLogged:false,autoReplay:false,apkChanged:false
    }));
  }
  return running;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(e=>{console.error(typeof e?.code==='string'?e.code:'JH_STAGE25_OPERATOR_START_FAILED');process.exitCode=1;});
}
