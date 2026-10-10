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
export async function main(env=process.env){
 validateDurableReleaseMode(env.JH_DURABLE_RELEASE);
 if(env.RENDER_SERVICE_ID!==SERVICE)fail('DURABLE_RELEASE_SERVICE_MISMATCH');
 const root=path.resolve(import.meta.dirname,'..');
 const built=buildDurableOperationalEntrypoint(root);
 const entry=await import(pathToFileURL(built.file).href);
 return entry.main(env);
}
