/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
/** Stage78 source candidate: preserve the original Stage25/Stage61 builder,
 * attestations and runtime selectors, then add the audio delta. No activation. */
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {composeAudioHostDelta} from './audio-compose-host.mjs';
import {AUDIO_CONTRACT_SHA256,AUDIO_ROUTES,fail} from './audio-contract.mjs';
import {createPinnedAudioReleaseAuthority} from './audio-release-authority.mjs';

export const AUDIO_SOURCE_COMMIT='8c9370f873d4312543310cb8aa1da2ed2b06b2c5';
export const AUDIO_RECORDED_RUNTIME_COMMIT='a06e4643a036fa7cc121ef997bc332a43f2f85df';
// Stage78 baseline reviewed separately from the audio implementation; see manifest.baselineReview.
const MANIFEST_SHA256='3d1cef853df3867eb693a765b316898dd3c51043997d482f82b21258f36251f3';
const VERSION='v05',DIRECTORY='ebiseo-audio-'+VERSION;
const sha=x=>createHash('sha256').update(x).digest('hex');
const moduleFiles=Object.freeze(['audio-contract.mjs','audio-extension-catalog.mjs',
  'audio-release-authority.mjs','audio-capability-authority.mjs','audio-durable-policy.mjs',
  'audio-completion-fence.mjs','audio-host-adapter.mjs','audio-host-integration.mjs',
  'audio-compose-host.mjs','audio-compose-current-host.mjs','audio-candidate-entry.mjs',
  'audio-upstream-sources.json']);
// Reviewed inputs, never learned from a candidate at first install. The
// unchanged inputs retain their earlier reviewed hashes. Four inputs have
// independently reviewed v0.5.2 start/stop contract changes. This verifier itself is
// executable release code, protected by the outer delivered artifact manifest.
const REVIEWED_MODULE_PINS=Object.freeze({
  'audio-contract.mjs':'09ae7980e0d785dafe654e86028e314165cb734fff166b90965da100b0b5fc97',
  'audio-extension-catalog.mjs':'c2dee2dc7e8481a181a64b2f5aa07f8218d25cf9963bcbff9c63486758355867',
  'audio-release-authority.mjs':'26af6feb587082b23e7c5c86836d4acc03ef8f80044f147739bcd8cd134ea0e9',
  'audio-capability-authority.mjs':'027c98cf4da96eefaf12f5b950fb974a7d91ecfdb04536599b84693bf5cdb6e5',
  'audio-durable-policy.mjs':'6419a35cb93fd354a6b1e04a72ac9c960d8c998ed653ab938269d476ee9d8479',
  'audio-completion-fence.mjs':'4d61b00e5613aadd719b635a76c812f3a832a19efa69bfc4f92955243e120cb2',
  'audio-host-adapter.mjs':'11a29424c3d7643f14c47581bf7685ee57e9d34bd495fc542eae787d79eae47f',
  'audio-host-integration.mjs':'1d6d2f71ffa3872652644d23de89b26474ca1685a971aa9e0bddfc1f88fb6bea',
  'audio-compose-host.mjs':'271f79c0f9b7c6f262c17ee631aa137ea3af0b1ddb34863839da6c07549b36ab',
  'audio-candidate-entry.mjs':'ebd9c40900b6af59e07b76533dd1f0bf2d45d3fa15dc336c028c393a032f2283'
});
const selectorSource=String.raw`/* Original parent attestation always runs before the supplementary audio selector. */
import {selectStage25PendingOperatorRuntime56} from '../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs';
import {selectAttestedAudioRuntime} from './audio-compose-current-host.mjs';
export function selectAudioCandidateRuntime(root,env=process.env){
  return selectAttestedAudioRuntime(root,selectStage25PendingOperatorRuntime56(root,env));
}
`;
function checkedRoot(root){
  const full=path.resolve(root),s=lstatSync(full);
  if(path.basename(full)!=='owner-setup'||!s.isDirectory()||s.isSymbolicLink()||realpathSync(full)!==full)
    fail('AUDIO_OWNER_SOURCE_LAYOUT_REQUIRED');
  return full;
}
function sourceText(file){
  const s=lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||realpathSync(file)!==file)fail('AUDIO_SOURCE_LINK_FORBIDDEN');
  return readFileSync(file,'utf8');
}
function verifyReviewedModules(){
  for(const [name,digest] of Object.entries(REVIEWED_MODULE_PINS))
    if(sha(sourceText(path.join(import.meta.dirname,name)))!==digest)fail('AUDIO_REVIEWED_MODULE_CHANGED');
}
export function verifyCurrentAudioSources(ownerRoot){
  const root=checkedRoot(ownerRoot),hostRoot=path.dirname(root);
  const text=sourceText(path.join(import.meta.dirname,'audio-upstream-sources.json'));
  if(sha(text)!==MANIFEST_SHA256)fail('AUDIO_SOURCE_MANIFEST_CHANGED');
  const manifest=JSON.parse(text);
  if(manifest.sourceCommit!==AUDIO_SOURCE_COMMIT)fail('AUDIO_SOURCE_COMMIT_CHANGED');
  for(const [name,digest] of Object.entries(manifest.files)){
    const file=path.resolve(hostRoot,name);
    if(!file.startsWith(hostRoot+path.sep)||sha(sourceText(file))!==digest)
      fail('AUDIO_UPSTREAM_SOURCE_CHANGED');
  }
  return Object.freeze({sourceCommit:AUDIO_SOURCE_COMMIT,files:Object.keys(manifest.files).length});
}
function replaceOne(source,before,after){
  if(source.split(before).length!==2||source.includes(after))fail('AUDIO_CURRENT_STARTUP_ANCHOR');
  const next=source.replace(before,after);
  if(next.replace(after,before)!==source)fail('AUDIO_CURRENT_STARTUP_NOT_REVERSIBLE');
  return next;
}
function paths(root){return {
  parentRuntime:path.join(root,'server-integration/server-jh168-pending-approval-followup-operator.mjs'),
  parentOwner:path.join(root,'deployment/owner-service-stage25-followup-operator.mjs'),
  parentUnified:path.join(root,'deployment/unified-service-stage25-followup-operator.mjs'),
  parentEntry:path.join(root,'deployment/operational-service-stage25-followup-operator.mjs'),
  runtime:path.join(root,'server-integration/server-ebiseo-audio-v05-candidate.mjs'),
  owner:path.join(root,'deployment/owner-service-ebiseo-audio-v05.mjs'),
  unified:path.join(root,'deployment/unified-service-ebiseo-audio-v05.mjs'),
  entry:path.join(root,'deployment/operational-service-ebiseo-audio-v05.mjs'),
  durable:path.join(root,'deployment/ebiseo-audio-durable-host-v05.mjs'),
  stamp:path.join(root,'server-integration/ebiseo-audio-v05-attestation.json'),
  selector:path.join(root,DIRECTORY,'audio-current-selector.mjs')
};}
function linkStartup(p){
  const before='import {selectStage25PendingOperatorRuntime56} from "../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs";';
  const after='import {selectAudioCandidateRuntime} from "../ebiseo-audio-v05/audio-current-selector.mjs";';
  let owner=replaceOne(sourceText(p.parentOwner),before,after);
  owner=replaceOne(owner,"if(runtimeMode==='unified')serverPath=selectStage25PendingOperatorRuntime56(root,process.env).file;",
    "if(runtimeMode==='unified')serverPath=selectAudioCandidateRuntime(root,process.env).file;");
  const unified=replaceOne(sourceText(p.parentUnified),"from './owner-service-stage25-followup-operator.mjs';",
    "from './owner-service-ebiseo-audio-v05.mjs';");
  let entry=replaceOne(sourceText(p.parentEntry),before,after);
  entry=replaceOne(entry,"from './unified-service-stage25-followup-operator.mjs';",
    "from './unified-service-ebiseo-audio-v05.mjs';");
  entry=replaceOne(entry,'const runtime=selectStage25PendingOperatorRuntime56(ROOT,process.env).file;',
    'const runtime=selectAudioCandidateRuntime(ROOT,process.env).file;');
  return {owner,unified,entry};
}
function composeCurrent(p,root){
  const runtimeSource=sourceText(p.parentRuntime);
  if(!runtimeSource.includes('const jhStage61Host56=createStage61HostAdapter(')||
    !runtimeSource.includes('pendingApprovalReceipts56')||!runtimeSource.includes('jhSplitFollowupReceipts56')||
    !runtimeSource.includes('jhRegisterLearningTools56({'))fail('AUDIO_CURRENT_FEATURES_REQUIRED');
  return composeAudioHostDelta({runtimeSource,
    durableHostSource:sourceText(path.join(root,'deployment/durable-native-host.mjs')),candidateVersion:VERSION});
}
function writeNew(file,text){
  if(existsSync(file)){
    if(sourceText(file)!==text)fail('AUDIO_EXISTING_CANDIDATE_CHANGED');
    return;
  }
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(realpathSync(path.dirname(file))!==path.dirname(file))fail('AUDIO_OUTPUT_LINK_FORBIDDEN');
  writeFileSync(file,text,{flag:'wx',mode:0o600});
  if(sourceText(file)!==text)fail('AUDIO_CANDIDATE_READBACK_FAILED');
}
/** This is called only after the original selector has validated its complete
 * reversible attestation chain. Recompute the audio output instead of trusting
 * an arbitrary expected hash supplied by the caller or a stale generated stamp. */
export function selectAttestedAudioRuntime(ownerRoot,parent){
  verifyReviewedModules();
  const root=checkedRoot(ownerRoot);verifyCurrentAudioSources(root);
  const p=paths(root);
  if(parent?.file!==p.parentRuntime||sha(sourceText(p.parentRuntime))!==parent.sha256)
    fail('AUDIO_ORIGINAL_PARENT_REQUIRED');
  const composed=composeCurrent(p,root),linked=linkStartup(p);
  const stamp=JSON.parse(sourceText(p.stamp));
  if(stamp.schema!=='EBISEO_AUDIO_STAGE71_CANDIDATE_V1'||stamp.sourceCommit!==AUDIO_SOURCE_COMMIT||
    stamp.parentRuntimeSha256!==parent.sha256||stamp.runtimeSha256!==composed.runtimeSha256||
    stamp.productionEnabled!==false||stamp.automaticReplayAllowed!==false)
    fail('AUDIO_CURRENT_ATTESTATION_CHANGED');
  for(const [file,expected] of [[p.runtime,composed.runtime],[p.durable,composed.durableHost],
    [p.owner,linked.owner],[p.unified,linked.unified],[p.entry,linked.entry],[p.selector,selectorSource]])
    if(sourceText(file)!==expected)fail('AUDIO_CURRENT_CANDIDATE_DRIFT');
  for(const name of moduleFiles)
    if(sha(sourceText(path.join(root,DIRECTORY,name)))!==stamp.modules?.[name])fail('AUDIO_CURRENT_MODULE_DRIFT');
  return Object.freeze({file:p.runtime,sha256:composed.runtimeSha256,sourceCommit:AUDIO_SOURCE_COMMIT,
    originalOperatorVerified:true,routingModel:'ANDROID_THEN_MANUAL',automaticReplayAllowed:false});
}
/** Original CI/prod gates remain in the upstream builder; env is passed without
 * adding or overriding feature flags. The signed Android mode is mandatory. */
export async function buildCurrentAudioReleaseCandidate(ownerRoot,env=process.env){
  verifyReviewedModules();
  const root=checkedRoot(ownerRoot),provenance=verifyCurrentAudioSources(root);
  if(env.JH_MOBILE_WEB_13_MODE!=='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1')
    fail('AUDIO_STAGE71_ANDROID_MODE_REQUIRED');
  const upstream=await import(pathToFileURL(path.join(root,
    'jh168-mobile-unification/stage25-live-operator-followup-entry.mjs')).href);
  const base=await upstream.buildStage25PendingOperatorEntrypoint56(root,env);
  const parent=upstream.selectStage25PendingOperatorRuntime56(root,env);
  if(parent.file!==base.runtimeFile||parent.sha256!==base.stamp.runtimeSha256||
    base.stamp.stage61ApprovalRouting!==true)fail('AUDIO_STAGE71_PARENT_REQUIRED');
  verifyCurrentAudioSources(root);
  const p=paths(root),composed=composeCurrent(p,root),linked=linkStartup(p),modules={};
  for(const name of moduleFiles){
    const text=sourceText(path.join(import.meta.dirname,name));
    modules[name]=sha(text);writeNew(path.join(root,DIRECTORY,name),text);
  }
  for(const [file,text] of [[p.runtime,composed.runtime],[p.durable,composed.durableHost],
    [p.owner,linked.owner],[p.unified,linked.unified],[p.entry,linked.entry],[p.selector,selectorSource]])writeNew(file,text);
  const stamp={schema:'EBISEO_AUDIO_STAGE71_CANDIDATE_V1',sourceCommit:AUDIO_SOURCE_COMMIT,
    parentRuntimeSha256:parent.sha256,runtimeSha256:composed.runtimeSha256,
    parentStamp:base.stamp,modules,productionEnabled:false,automaticReplayAllowed:false};
  writeNew(p.stamp,JSON.stringify(stamp,null,2)+'\n');
  const selected=selectAttestedAudioRuntime(root,upstream.selectStage25PendingOperatorRuntime56(root,env));
  const releaseBinding=createPinnedAudioReleaseAuthority().requireAudioRoutes({routes:AUDIO_ROUTES,contractSha256:AUDIO_CONTRACT_SHA256});
  const audioResult=Object.freeze({...provenance,file:p.runtime,entryFile:p.entry,ownerFile:p.owner,unifiedFile:p.unified,
    stampFile:p.stamp,parentRuntimeFile:parent.file,parentRuntimeSha256:parent.sha256,
    candidateSha256:selected.sha256,releaseBinding,routingModel:'ANDROID_THEN_MANUAL',
    parentFeatureFlagsPreserved:true,baseCatalogChanged:false,signingChanged:false,
    storageNamespaceChanged:false,originalPublishedRouterChanged:false,
    originalAuthenticationGatesPreserved:true,ownerSelectorChanged:true,
    activated:false,listenerStarted:false,networkRequests:0,runtimeVerifiedLive:false});
  const cameraFlag=env?.JH_KABISEO_CAMERA_ENABLE;
  if(cameraFlag!==undefined&&cameraFlag!==''){
    const camera=await import('../kabiseo-camera-v0256/camera-compose-audio-host.mjs');
    if(!camera.cameraActivationEnabled(env))fail('CAMERA_ACTIVATION_REQUIRED');
    return camera.buildCameraOverlayFromVerifiedAudio(root,audioResult,env);
  }
  return audioResult;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  if(process.argv.length!==4||process.argv[3]!=='--local-test-profile')
    throw Error('Usage: node audio-compose-current-host.mjs /isolated/copy/jh-server/owner-setup --local-test-profile');
  const env={CI:'true',NODE_ENV:'test',JH_OWNER_DEFER_LISTEN:'1',
    JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
    JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
    JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
    JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
    JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
    JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'};
  console.log(JSON.stringify(await buildCurrentAudioReleaseCandidate(process.argv[2],env)));
}
