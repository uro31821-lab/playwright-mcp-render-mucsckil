/** Explicit operator release. Reuses the saved-owner operational entry and its exact
 * authentication/storage checks. Initial preparation is a separately selected mode.
 * After first activation the operator must select SERVE_READY_V1; a missing journal
 * then prevents startup instead of silently replacing evidence. No APK or reconnect change.
 */
import path from 'node:path';
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildCutoverStartupCandidate} from './durable-cutover-startup-candidate.mjs';
import {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';
import {prepareDurableCutover,verifyDurableCutover} from './durable-cutover.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const SERVICE='srv-db0fjl2d0e5s73be114g';
const sha256=x=>createHash('sha256').update(x).digest('hex');
/** Exact route-only patch for the existing GENERATED Durable Secure56 host.
 * All sealed authentication, HMAC, approval, job journal and runtime pins remain
 * authoritative and are verified before any patched runtime is imported.
 */
function patchExistingDurableReturnRoute56(input){
 const edits=[],once=(oldText,newText)=>{
  if(input.split(oldText).length!==2||input.includes(newText))fail('JH_ROUTE_PATCH_ANCHOR_CHANGED');
  input=input.replace(oldText,newText);edits.push([oldText,newText]);
 };
 const original=input;
 const helper=String.raw`
  // Dispatch explicit JH previous-app returns to the EXISTING Android open_url.
  function jhNativeReturnTarget56(value){
    const s=String(value||"").trim().toLowerCase();
    if(["last_work_screen","마지막 작업 화면","마지막 작업화면"].includes(s)||
       (/마지막 작업 화면/.test(s)&&/(복귀|돌아|열어)/.test(s)))return "last_work_screen";
    if(["previous_work_app","이전 앱","이전 작업 앱","원래 앱"].includes(s))return "previous_work_app";
    if((/(이전 앱|이전 작업 앱|원래 앱)/.test(s)&&/(복귀|돌아|열어)/.test(s))||
       (/(jh로|jhmcp로|jh 브릿지로|jh bridge)/.test(s)&&/(복귀|돌아|되돌아)/.test(s)))
      return "previous_work_app";
    return null;
  }

 `;
 once('  registerOAuthTool("life_status",{',helper+'  registerOAuthTool("life_status",{');
 const nativeOld='const nativeHints=["카카오톡","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
 const nativeNew='const nativeHints=["카카오톡","카카오t","카카오티","kakao t","카카오 택시","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
 if(input.includes(nativeOld))once(nativeOld,nativeNew);
 else if(!input.includes(nativeNew))fail('JH_ROUTE_NATIVE_HINTS_CHANGED');
 once('(nativeHints.some(k=>s.includes(k))?"android":"web")','((nativeHints.some(k=>s.includes(k))||jhNativeReturnTarget56(s))?"android":"web")');
 const service=String.raw`  registerOAuthTool("life_open_service",{`;
 const next=String.raw`  registerOAuthTool("life_naver_mail",{`;
 let start=input.indexOf(service),end=input.indexOf(next,start);
 if(start<0||end<=start)fail('JH_ROUTE_SERVICE_CHANGED');
 let piece=input.slice(start,end);
 const sOld='    const s=raw.toLowerCase();\n    const webMap=[';
 const sNew=String.raw`    const s=raw.toLowerCase();
    const returnTarget=jhNativeReturnTarget56(s);
    if(returnTarget){
      const j=mk("open_url",{target:returnTarget,url:""});
      return textResult({route:"android",service:raw,queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId,registeredDevices:devices.size});
    }
    const webMap=[`;
 if(piece.split(sOld).length!==2)fail('JH_ROUTE_SERVICE_ANCHOR');
 piece=piece.replace(sOld,sNew);
 const qOld='return textResult({route:"android",service:raw,queued:true,jobId:j.id,registeredDevices:devices.size});';
 const qNew='return textResult({route:"android",service:raw,queued:j.status==="queued",jobId:j.id,registeredDevices:devices.size});';
 if(piece.split(qOld).length!==2)fail('JH_ROUTE_QUEUE_ANCHOR');
 piece=piece.replace(qOld,qNew);
 edits.push([input.slice(start,end),piece]);input=input.slice(0,start)+piece+input.slice(end);
 const nativeStart='  registerOAuthTool("life_android_open",{';
 const nativeEnd='  const cuSchema56={';
 start=input.indexOf(nativeStart);end=input.indexOf(nativeEnd,start);
 if(start<0||end<=start)fail('JH_ROUTE_NATIVE_CHANGED');
 const nativeBlock=input.slice(start,end);
 const nOld='    const s=raw.toLowerCase();\n    if(["last_work_screen"';
 const nNew=String.raw`    const s=raw.toLowerCase();
    const returnTarget=jhNativeReturnTarget56(s);
    if(returnTarget){const j=mk("open_url",{target:returnTarget,url:""});return textResult({route:"android",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId});}
    if(["last_work_screen"`;
 if(nativeBlock.split(nOld).length!==2)fail('JH_ROUTE_NATIVE_ANCHOR');
 const replacement=nativeBlock.replace(nOld,nNew);
 edits.push([nativeBlock,replacement]);input=input.slice(0,start)+replacement+input.slice(end);
 let restored=input;
 for(const [before,after] of edits.reverse()){
  if(restored.split(after).length!==2)fail('JH_ROUTE_REVERSAL_CHANGED');
  restored=restored.replace(after,before);
 }
 if(restored!==original)fail('JH_ROUTE_PATCH_SCOPE_CHANGED');
 return input;
}

export const INITIAL_MODE='EXPLICIT_INITIALIZE_AND_SERVE_V1';
export const READY_MODE='SERVE_READY_V1';
export function validateDurableReleaseMode(mode){
 if(![INITIAL_MODE,READY_MODE].includes(mode))fail('DURABLE_RELEASE_MODE_REQUIRED');
 return mode;
}
const exists=p=>{try{lstatSync(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}};
export function prepareOrVerifyDurableRelease({config,key,mode,storageObservations}={}){
 validateDurableReleaseMode(mode);
 try{return Object.freeze({initializedNow:false,...verifyDurableCutover({config,key,storageObservations})});}
 catch(e){
  if(mode!==INITIAL_MODE||e.code!=='CUTOVER_RECEIPT_REQUIRED')throw e;
  // Only this explicit first-install operation permits creation. Never repair partial state.
  for(const n of ['manual-circuit.sqlite','manual-circuit-ready.json','.manual-circuit-preparing'])
   if(exists(path.join(config.stateDir,n)))fail('DURABLE_EXISTING_STATE_REVIEW_REQUIRED');
  const r=prepareDurableCutover({config,key,storageObservations,confirmation:'EXPLICIT_OFFLINE_CUTOVER_PRESERVE_UNKNOWN_HISTORY'});
  return Object.freeze({initializedNow:true,...r});
 }
}
function exact(source,from,to){
 if(source.split(from).length!==2||source.includes(to))fail('DURABLE_LIVE_ENTRY_ANCHOR');
 const value=source.replace(from,to);if(value.replace(to,from)!==source)fail('DURABLE_LIVE_ENTRY_SCOPE');return value;
}
function writeChecked(file,text){writeFileSync(file,text,{mode:0o600});if(readFileSync(file,'utf8')!==text)fail('DURABLE_LIVE_ENTRY_READBACK');}
export function buildDurableOperationalEntrypoint(root){
 const owner=buildCutoverStartupCandidate(root),runtime=buildDurableNativeRuntime(root);
 const base=path.join(root,'deployment');
 const unified=readFileSync(path.join(base,'unified-service-entry.mjs'),'utf8');
 if(blob(unified)!=='afa80f6f7283e1bb0b3d42979c1160f5373ccc7a')fail('DURABLE_UNIFIED_ENTRY_CHANGED');
 const linked=exact(unified,"from './owner-service-entry.mjs';","from './owner-service-cutover-candidate.mjs';");
 writeChecked(path.join(base,'unified-service-durable-live.mjs'),linked);
 const original=readFileSync(path.join(base,'operational-service-entry.mjs'),'utf8');
 if(blob(original)!=='15177a6604902ad631daeb9c0a32be229ae42cda')fail('DURABLE_OPERATIONAL_ENTRY_CHANGED');
 let candidate=exact(original,"from './unified-service-entry.mjs';","from './unified-service-durable-live.mjs';");
 candidate=exact(candidate,'const runtime=assertFunctionalReleaseRuntime(ROOT);','const runtime=buildDurableNativeRuntime(ROOT).file;');
 candidate=exact(candidate,"  const key=loadOwnerKey(keyFiles.ownerKeyFile,config);\n  try{running=", "  const key=loadOwnerKey(keyFiles.ownerKeyFile,config);\n  try{\n   const cutover=prepareOrVerifyDurableRelease({config,key,mode:env.JH_DURABLE_RELEASE});\n   console.log('JH_DURABLE_CUTOVER_READY '+JSON.stringify({initializedNow:cutover.initializedNow,ready:cutover.ready,legacyTracked:cutover.legacyTrackedAtCutover,legacyUnresolved:cutover.legacyUnresolvedAtCutover,historyReconciled:false,automaticReplayAllowed:false}));\n   running=");
 candidate=exact(candidate,'return {close};','console.log("JH_DURABLE_RELEASE_READY "+JSON.stringify({durableCircuitInstalled:running.durableCircuitInstalled===true,productionMode:env.JH_DURABLE_RELEASE,automaticReconnectChanged:false,apkChanged:false}));\n  return {close,durableCircuitInstalled:running.durableCircuitInstalled===true};');
 candidate="import {prepareOrVerifyDurableRelease} from './durable-live-release.mjs';\nimport {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';\n"+candidate;
 const file=path.join(base,'operational-service-durable-live.mjs');writeChecked(file,candidate);
 return Object.freeze({file,ownerFile:owner.file,runtimeFile:runtime.file,baselineSha256:runtime.baselineSha256,candidateSha256:runtime.candidateSha256,exactEdits:5});
}

/** Preserve the existing durable result-verification engine; change only JH
 * routing and real queued-status reporting on the generated server file.
 */
export function buildDurableRoutedRuntime(root){
 const parent=buildDurableNativeRuntime(root);
 if(parent.productionEnabled!==false)fail('JH_DURABLE_ROUTE_PARENT_CHANGED');
 const input=readFileSync(parent.file,'utf8');
 if(sha256(input)!==parent.candidateSha256)fail('JH_DURABLE_ROUTE_PARENT_DIGEST');
 const output=patchExistingDurableReturnRoute56(input);
 const file=path.join(root,'server-integration/server-durable-native-return-route56.mjs');
 writeChecked(file,output);
 if(sha256(readFileSync(file))!==sha256(output))fail('JH_DURABLE_ROUTE_READBACK');
 return Object.freeze({...parent,file,parentSha256:parent.candidateSha256,
  candidateSha256:sha256(output),runtimeRoutePatched:true,productionEnabled:false});
}
export function buildDurableRoutedOperationalEntrypoint(root){
 const base=buildDurableOperationalEntrypoint(root);
 const folder=path.join(root,'deployment');

 // The original owner host selects the ACTUAL runtime inside
 // startConfiguredOwnerServer. Patch that pre-listen selection (not just a
 // diagnostic runtime variable in the operational wrapper).
 const originalOwner=readFileSync(base.ownerFile,'utf8');
 const ownerImportOld="import {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';";
 const ownerImportNew="import {buildDurableRoutedRuntime} from './durable-live-release.mjs';";
 const ownerSelectorOld="if(runtimeMode==='unified')serverPath=buildDurableNativeRuntime(root).file;";
 const ownerSelectorNew="if(runtimeMode==='unified')serverPath=buildDurableRoutedRuntime(root).file;";
 const ownerCandidate=exact(exact(originalOwner,ownerImportOld,ownerImportNew),ownerSelectorOld,ownerSelectorNew);
 if(ownerCandidate.replace(ownerSelectorNew,ownerSelectorOld).replace(ownerImportNew,ownerImportOld)!==originalOwner)
  fail('JH_DURABLE_ROUTE_OWNER_SCOPE');
 const ownerFile=path.join(folder,'owner-service-durable-return-route56.mjs');
 writeChecked(ownerFile,ownerCandidate);

 // Link the existing unified host to the corrected owner host.
 const originalUnified=readFileSync(path.join(folder,'unified-service-durable-live.mjs'),'utf8');
 const oldUnified="from './owner-service-cutover-candidate.mjs';";
 const newUnified="from './owner-service-durable-return-route56.mjs';";
 const unified=exact(originalUnified,oldUnified,newUnified);
 const unifiedFile=path.join(folder,'unified-service-durable-return-route56.mjs');
 writeChecked(unifiedFile,unified);

 // Link the existing operational wrapper; keep all owner/volume/session
 // identity, Durable fence and manual cutover logic unchanged.
 const original=readFileSync(base.file,'utf8');
 let candidate=exact(original,"from './unified-service-durable-live.mjs';",
  "from './unified-service-durable-return-route56.mjs';");
 const oldImport="import {buildDurableNativeRuntime} from './durable-native-runtime-candidate.mjs';";
 const newImport="import {buildDurableRoutedRuntime} from './durable-live-release.mjs';";
 const oldCall='const runtime=buildDurableNativeRuntime(ROOT).file;';
 const newCall='const runtime=buildDurableRoutedRuntime(ROOT).file;';
 candidate=exact(exact(candidate,oldImport,newImport),oldCall,newCall);
 if(candidate.replace(newCall,oldCall).replace(newImport,oldImport)
    .replace("from './unified-service-durable-return-route56.mjs';",
             "from './unified-service-durable-live.mjs';")!==original)
  fail('JH_DURABLE_ROUTE_OPERATIONAL_SCOPE');
 const file=path.join(folder,'operational-service-durable-return-route56.mjs');
 writeChecked(file,candidate);
 const routed=buildDurableRoutedRuntime(root);
 return Object.freeze({...base,file,ownerFile,unifiedFile,runtimeFile:routed.file,
  parentSha256:routed.parentSha256,candidateSha256:routed.candidateSha256,
  exactOwnerSelectorEdits:2,exactHostLinkEdits:1,routePatch:true});
}

export async function main(env=process.env){
 validateDurableReleaseMode(env.JH_DURABLE_RELEASE);
 if(env.RENDER_SERVICE_ID!==SERVICE)fail('DURABLE_RELEASE_SERVICE_MISMATCH');
 const root=path.resolve(import.meta.dirname,'..');
 const built=buildDurableRoutedOperationalEntrypoint(root);
 const entry=await import(pathToFileURL(built.file).href);
 const running=await entry.main(env);
 console.log('JH_DURABLE_ROUTE_PATCH_ACTIVE '+JSON.stringify({
  route:'existing_open_url',patchedRuntimeSha256:built.candidateSha256,
  parentRuntimeSha256:built.parentSha256,secureVersion:56,
  sessionExtensionChanged:false,approvalChanged:false,legacyHistoryReplayed:false}));
 return running;
}
