/** Keep the exact published default entry, add explicit PC-first-setup selection.
 * No automatic fallback from configuration failure; no runtime owner promotion.
 * Uses the CURRENT observer/build chain, not an invented diagnostic substitute.
 */
import path from 'node:path';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertPublishedLineage,AUTH_BASE_SHA,PUBLISHED_COMMIT} from './published-lineage.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pub=path.join(root,'published-baseline');
const moduleUrl=file=>pathToFileURL(path.join(pub,file)).href;
const sha=b=>createHash('sha256').update(b).digest('hex');
let startAttempted=false;

/** Applies ONLY to the verified, already-generated published MCP runtime.
 * Published baseline, OAuth/nonce/auth checks, Android journal and phone consent
 * are never altered. Existing routing tools and native open_url dispatcher reused.
 */
function patchExistingPublishedReturnRoute56(input){
 const edits=[],once=(oldText,newText)=>{
  if(input.split(oldText).length!==2||input.includes(newText))fail('JH_ROUTE_PATCH_ANCHOR_CHANGED');
  input=input.replace(oldText,newText);edits.push([oldText,newText]);
 };
 const original=input;
 const helper=String.raw\`
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

 \`;
 once('  registerOAuthTool("life_status",{',helper+'  registerOAuthTool("life_status",{');
 const nativeOld='const nativeHints=["카카오톡","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
 const nativeNew='const nativeHints=["카카오톡","카카오t","카카오티","kakao t","카카오 택시","배달의민족","배민","앱 전용","native app","휴대폰 설정","전화 앱"];';
 once(nativeOld,nativeNew);
 once('(nativeHints.some(k=>s.includes(k))?"android":"web")','((nativeHints.some(k=>s.includes(k))||jhNativeReturnTarget56(s))?"android":"web")');
 const service=String.raw\`  registerOAuthTool("life_open_service",{\`;
 const next=String.raw\`  registerOAuthTool("life_naver_mail",{\`;
 let start=input.indexOf(service),end=input.indexOf(next,start);
 if(start<0||end<=start)fail('JH_ROUTE_SERVICE_CHANGED');
 let piece=input.slice(start,end);
 const sOld='    const s=raw.toLowerCase();\\n    const webMap=[';
 const sNew=String.raw\`    const s=raw.toLowerCase();
    const returnTarget=jhNativeReturnTarget56(s);
    if(returnTarget){
      const j=mk("open_url",{target:returnTarget,url:""});
      return textResult({route:"android",service:raw,queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId,registeredDevices:devices.size});
    }
    const webMap=[\`;
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
 const nOld='    const s=raw.toLowerCase();\\n    if(["last_work_screen"';
 const nNew=String.raw\`    const s=raw.toLowerCase();
    const returnTarget=jhNativeReturnTarget56(s);
    if(returnTarget){const j=mk("open_url",{target:returnTarget,url:""});return textResult({route:"android",queued:j.status==="queued",jobId:j.id,targetDeviceId:j.targetDeviceId});}
    if(["last_work_screen"\`;
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
function preparePublishedRouteRuntime56(){
 const file=path.join(pub,'verification-output/candidate/server-browser-persistence.mjs');
 const original=readFileSync(file,'utf8');
 // All parent generators have already validated their SHA-256 identities.
 const patched=patchExistingPublishedReturnRoute56(original);
 if(patched===original)fail('JH_ROUTE_NO_CHANGE');
 const target=path.join(pub,'verification-output/candidate/server-browser-route56.mjs');
 const temp=target+'.tmp';
 writeFileSync(temp,patched,{mode:0o600});renameSync(temp,target);
 if(!readFileSync(target,'utf8').includes('function jhNativeReturnTarget56(')||
    sha(readFileSync(target))!==sha(Buffer.from(patched)))fail('JH_ROUTE_READBACK');
 return {target,sha256:sha(Buffer.from(patched)),parentSha256:sha(Buffer.from(original))};
}

function fail(code){throw Object.assign(Error(code),{code});}
function emit(tag,data){try{console.log(tag+' '+JSON.stringify(data));}catch{}}
export function selectPublishedStartup(env){
 if(!env||typeof env!=='object')fail('PUBLISHED_ENVIRONMENT_REQUIRED');
 if(env.JH_PC_OWNER_SETUP_ENABLED===undefined&&env.JH_PC_OWNER_SETUP_PLAN_FILE===undefined)return 'published';
 if(env.JH_PC_OWNER_SETUP_ENABLED!=='1'||typeof env.JH_PC_OWNER_SETUP_PLAN_FILE!=='string'||!env.JH_PC_OWNER_SETUP_PLAN_FILE)fail('PC_SETUP_EXPLICIT_CONFIGURATION_REQUIRED');
 return 'pc-setup';
}
/** Re-run exact auth/transport/session/persistence GENERATORS; never import the
 * old auto-listening server on the PC path. The new runtime has the same auth
 * ancestor and exact browser modules, plus previously verified owner slots. */
export async function preparePublishedStartup(){
 const identity=assertPublishedLineage(root);
 await import(moduleUrl('verification/build-auth-candidate.mjs'));
 const auth=readFileSync(path.join(pub,'verification-output/candidate/server.mjs'));
 if(sha(auth)!==AUTH_BASE_SHA||!auth.equals(readFileSync(path.join(root,'server-base/server.after.mjs'))))fail('PUBLISHED_GENERATED_AUTH_MISMATCH');
 const {prepareBrowserRuntime}=await import(moduleUrl('browser-runtime.mjs'));
 const {prepareBrowserSessionRuntime}=await import(moduleUrl('browser-session-runtime.mjs'));
 const {prepareBrowserPersistenceRuntime}=await import(moduleUrl('browser-persistence-runtime.mjs'));
 const legacyUrl=prepareBrowserPersistenceRuntime(prepareBrowserSessionRuntime(prepareBrowserRuntime()));
 // Reassert pins after all generation. No package resolution changes or loosened hashes.
 assertPublishedLineage(root);
 return Object.freeze({...identity,publishedBrowserRuntimeSha256:sha(readFileSync(legacyUrl))});
}
/** Internal service factory. Fixtures may use existing internal verifier/mount
 * ports. The production CLI below exposes none of those ports via env or HTTP. */
export async function startObservedPcOwner(options={}){
 const {validatePcOwnerSetupPlan}=await import('./pc-owner-handoff.mjs');
 const {startPcOwnerSetupServer}=await import('./pc-owner-service-entry.mjs');
 const plan=validatePcOwnerSetupPlan(options.plan);
 if(startAttempted)fail('PUBLISHED_START_ALREADY_ATTEMPTED');
 startAttempted=true;
 const identity=await preparePublishedStartup();
 const {installDiagnostics}=await import(moduleUrl('connection-diagnostics.mjs'));
 const {emitRuntimeMetadata}=await import(moduleUrl('runtime-metadata.mjs'));
 let observer=installDiagnostics(),running,closing;
 const close=()=>{
  if(!closing)closing=(async()=>{try{await running?.close();}finally{observer?.close();observer=null;}})();
  return closing;
 };
 try{
  running=await startPcOwnerSetupServer({...options,plan});
  emit('JH_CONNECTION_DIAG',{schema:3,event:'observer_start',atUtc:new Date().toISOString(),
   revision:'connection-observer-v3-session-deadline',authenticationChanged:false,
   jobSignedExpiryCapped:true,sessionLifetimeChanged:false,authBaseSha256:AUTH_BASE_SHA,
   runtimeSha256:identity.selectedRuntimeSha256,mode:'pc-setup',publishedCommit:PUBLISHED_COMMIT});
  emit('JH_BROWSER_TRANSPORT',{revision:'render-browser-v4-heartbeat',configurationRequired:true,
   credentialsLogged:false,automaticActionRetry:false,eventChannelLifetimeMs:600000});
  emit('JH_PC_OWNER_SETUP_READY',{pcSetupInstalled:true,configurationCandidateSaved:running.configurationCandidateSaved,
   identityVerifiedNow:false,ownerHostInstalled:false,lifeRuntimeInstalled:false,trustCreated:false,actionApproved:false});
  emitRuntimeMetadata(); // Read-only metadata, never a readiness or ownership grant.
  const {close:innerClose,...state}=running;
  return Object.freeze({...state,mode:'pc-setup',diagnosticsInstalled:true,identity,close});
 }catch(e){try{await close();}catch{}throw e;}
}
export async function main(){
 const env=process.env,mode=selectPublishedStartup(env);
 if(mode==='published'){
  if(startAttempted)fail('PUBLISHED_START_ALREADY_ATTEMPTED');
  // Keep the exact published identity gates and chained browser/auth transforms.
  assertPublishedLineage(root);startAttempted=true;
  await preparePublishedStartup();
  const {installDiagnostics}=await import(moduleUrl('connection-diagnostics.mjs'));
  const {emitRuntimeMetadata}=await import(moduleUrl('runtime-metadata.mjs'));
  const result=preparePublishedRouteRuntime56();
  installDiagnostics();
  emit('JH_CONNECTION_DIAG',{schema:2,event:'observer_start',atUtc:new Date().toISOString(),
    revision:'connection-observer-v3-session-deadline',authenticationChanged:false,
    jobSignedExpiryCapped:true,sessionLifetimeChanged:false,runtimeSha256:AUTH_BASE_SHA});
  emit('JH_BROWSER_TRANSPORT',{revision:'render-browser-v4-heartbeat',
    configurationRequired:true,credentialsLogged:false,automaticActionRetry:false,eventChannelLifetimeMs:600000});
  emit('JH_ROUTE_PATCH_ACTIVE',{schema:1,route:'native_open_url',parentSha256:result.parentSha256,
    runtimeSha256:result.sha256,authAndApprovalsChanged:false,deviceActions:0});
  await import(pathToFileURL(result.target).href);
  emitRuntimeMetadata();
  return Object.freeze({mode,pcSetupInstalled:false});
 }
 const {validatePcOwnerSetupEnvironment,loadPcOwnerSetupPlan}=await import('./pc-owner-service-entry.mjs');
 validatePcOwnerSetupEnvironment(env);
 const plan=loadPcOwnerSetupPlan(env.JH_PC_OWNER_SETUP_PLAN_FILE);
 if(plan.storageMount!=='/var/data')fail('PC_SETUP_PRODUCTION_MOUNT_REQUIRED');
 const running=await startObservedPcOwner({plan,port:Number(env.PORT||3000)});
 const cleanup=()=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);};
 const stop=()=>void running.close().then(()=>{cleanup();process.exitCode=0;},()=>{cleanup();process.exitCode=1;});
 process.once('SIGTERM',stop);process.once('SIGINT',stop);return running;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(e=>{const code=typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'PUBLISHED_STARTUP_FAILED';
  console.error(code);process.exitCode=1;});
}
