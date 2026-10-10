/** Keep the exact published default entry, add explicit PC-first-setup selection.
 * No automatic fallback from configuration failure; no runtime owner promotion.
 * Uses the CURRENT observer/build chain, not an invented diagnostic substitute.
 */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assertPublishedLineage,AUTH_BASE_SHA,PUBLISHED_COMMIT} from './published-lineage.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pub=path.join(root,'published-baseline');
const moduleUrl=file=>pathToFileURL(path.join(pub,file)).href;
const sha=b=>createHash('sha256').update(b).digest('hex');
let startAttempted=false;
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
  // New files must not silently replace any byte of the running baseline.
  assertPublishedLineage(root);startAttempted=true;
  await import(moduleUrl('auth-diagnostics-entry.mjs'));
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
