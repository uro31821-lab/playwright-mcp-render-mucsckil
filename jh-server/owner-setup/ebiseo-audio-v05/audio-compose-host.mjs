/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPinnedAudioReleaseAuthority} from './audio-release-authority.mjs';
import {AUDIO_CONTRACT_SHA256,AUDIO_ROUTES,fail} from './audio-contract.mjs';

export const SOURCE_PINS=Object.freeze({
  runtime:'1ce1abf4088c547f4dd54225e812c2ce324ff1ccbbd64dc3cb301795c11c9960',
  durableHost:'c697aa4c3811fcd5dbf4baa41afb2d6328b7ad33cb04137e05cb45bb822cd12e',
  durablePolicy:'cad7cbb2458946900ac6ad3de5e942175da9d1e24a53922eb35851e6349a017e',
  journal:'7bf45d5ca86b8c62fef6bacf090afc6f4052efc5be09c87431d01598b7aefc30',
  releaseBuilder:'d325cea91d52523f32f63d7997e379a7e70031cd8e1f4708101d6a7c6cda04f5',
  releaseBase:'3c30c9fc22aec99bcac0cbc86104bb435f43eb065e62e8923e6b81439415b13c',
  publishedRouter:'9fd56e6cf08acd9fdad98ba3d0756492b7b3185f9b321a3b6035eb9f26cf2b71',
  owner:'59f2ad4c18b983c702cd9fd9cab6d7b7fd2ec16cd899293da1cfb6b2412acbf0',
  unified:'bc6040e48f3ac17c5c40e8b62c56a4bb6b966b9ec720548c259d1459f3946f7b',
  operational:'7050abbe33a8a043cd8d6eb3f6a9b9ea1721fef06f7f6a0a4aa2b01dbf5b1ad7'
});
const MODULE_FILES=Object.freeze(['audio-contract.mjs','audio-extension-catalog.mjs','audio-release-authority.mjs',
  'audio-capability-authority.mjs','audio-durable-policy.mjs','audio-completion-fence.mjs',
  'audio-host-adapter.mjs','audio-host-integration.mjs','audio-compose-host.mjs','audio-candidate-entry.mjs']);
const hash=x=>createHash('sha256').update(x).digest('hex');
function pinned(source,pin) {if(hash(source)!==pin)fail('AUDIO_BASELINE_SOURCE_CHANGED');return source;}
function replaceOne(source,old,next) {
  if(source.split(old).length!==2||source.includes(next))fail('AUDIO_HOST_COMPOSITION_ANCHOR');
  return source.replace(old,next);
}
const bindingSource=String.raw`
// Separate supplementary catalog. The original Secure56 pin, signer and trust
// session stay authoritative; this object cannot create a base session or grant.
function jhAudioBinding56(deviceId){
  const a=active56(deviceId),m=devices.get(deviceId);
  if(!a||m?.secureBridgeVersion!==56||m.deviceDigest!==a.deviceDigest||jhBlockedCommands56.has(deviceId))return null;
  return {deviceId,deviceDigest:a.deviceDigest,sessionId:a.sessionId,sessionExpiresAt:a.expiresAt,
    commandId:jhCommandVersion56(deviceId),processEpoch:a.processEpoch??m.processEpoch??null};
}
const jhAudioHost56=createAudioHostIntegration({
  getCatalogDigest:()=>SECURE56_TOOL_CATALOG_DIGEST,secureCall56,
  captureAdmission:explicit=>{const device=chooseDevice(explicit||null);jhRequireCommand56(device);return jhAudioBinding56(device);},
  currentBinding:jhAudioBinding56
});
`;
/** Pure source composition against the exact official generated runtime. */
export function composePinnedAudioHost({runtimeSource,durableHostSource}={}) {
  pinned(runtimeSource,SOURCE_PINS.runtime);pinned(durableHostSource,SOURCE_PINS.durableHost);
  return composeAudioHostDelta({runtimeSource,durableHostSource});
}
/** Pure delta only; this function grants no release authority. The v0.5 caller
 * verifies the reviewed upstream source manifest and ORIGINAL Stage25 attestation
 * before using it on the current Stage71 runtime. */
export function composeAudioHostDelta({runtimeSource,durableHostSource,candidateVersion='v04'}={}) {
  if(!['v04','v05'].includes(candidateVersion))fail('AUDIO_CANDIDATE_VERSION_INVALID');
  pinned(durableHostSource,SOURCE_PINS.durableHost);
  createPinnedAudioReleaseAuthority();
  let runtime=runtimeSource,durableHost=durableHostSource;
  runtime=replaceOne(runtime,'import {createDurableNativeHooks} from "../deployment/durable-native-host.mjs";',
    'import {createDurableNativeHooks} from "../deployment/ebiseo-audio-durable-host-'+candidateVersion+'.mjs";\n'+
    'import {createAudioHostIntegration} from "../ebiseo-audio-'+candidateVersion+'/audio-host-integration.mjs";');
  runtime=replaceOne(runtime,'function cleanFrameWaiters56(){',bindingSource+'\nfunction cleanFrameWaiters56(){');
  runtime=replaceOne(runtime,'  const key=targetDeviceId+"|"+type+"|"+JSON.stringify(p||{});',
    '  jhAudioHost56.beforeMk(type,p,targetDeviceId);\n  const key=targetDeviceId+"|"+type+"|"+JSON.stringify(p||{});');
  runtime=replaceOne(runtime,'  registerOAuthTool("life_android_complete_401_summary",{',
    '  jhAudioHost56.register({z,registerOAuthTool});\n\n  registerOAuthTool("life_android_complete_401_summary",{');
  const dispatch='const next=jobs.get(q.shift());if(!next){res.writeHead(204).end();return;}';
  runtime=replaceOne(runtime,dispatch,dispatch+String.raw`
    const audioAdmission=jhAudioHost56.beforeDispatch(next);
    if(!audioAdmission.allowed){next.status="expired";next.error=audioAdmission.code;next.completedAt=new Date().toISOString();
      res.writeHead(audioAdmission.httpStatus,{"content-type":"application/json","cache-control":"no-store"});
      res.end(JSON.stringify({ok:false,code:audioAdmission.code}));return;}
    `);
  const originalHook=candidateVersion==='v05'?
    ' durableNativeHooks56=createDurableNativeHooks({...options,mobile13ActionMode:"EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1"});':
    ' durableNativeHooks56=createDurableNativeHooks(options);';
  const hookOptions=candidateVersion==='v05'?
    '{...options,mobile13ActionMode:"EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1",classifyExtension:jhAudioHost56.classify}':
    '{...options,classifyExtension:jhAudioHost56.classify}';
  runtime=replaceOne(runtime,originalHook,
    ' durableNativeHooks56=jhAudioHost56.wrapDurableHooks(createDurableNativeHooks('+hookOptions+'));');
  durableHost=replaceOne(durableHost,"export function createDurableNativeHooks({file,key,namespace,mode='read',mobile13ActionMode}={}){",
    "export function createDurableNativeHooks({file,key,namespace,mode='read',mobile13ActionMode,classifyExtension}={}){\n"+
    " if(typeof classifyExtension!=='function')throw Error('AUDIO_EXTENSION_POLICY_REQUIRED');");
  durableHost=replaceOne(durableHost,'capture(job,payload){policies.set(job,mobile13ActionMode===MOBILE13_ACTION_POLICY_MODE56?mobile13DurableJobPolicy(job,payload):durableNativeJobPolicy(job,payload));},',
    'capture(job,payload){policies.set(job,classifyExtension(job,payload)??(mobile13ActionMode===MOBILE13_ACTION_POLICY_MODE56?mobile13DurableJobPolicy(job,payload):durableNativeJobPolicy(job,payload)));},');
  // All original HMAC/session/nonce checks and the actual completion call remain
  // byte-for-byte in place; the installed durable hook adds post-verifier evidence.
  if(!runtime.includes('if(process.env.JH_OWNER_DEFER_LISTEN!=="1")throw Error("DURABLE_HOST_BOOTSTRAP_REQUIRED");')||
     !runtime.includes('const durableReceipt=durableNativeHooks56?.acceptedCompletion(j,body.result)')||
     runtime.indexOf('const audioAdmission=jhAudioHost56.beforeDispatch(next);')>
       runtime.indexOf('trustedSessionAuthority56.beforeDispatch(next);'))fail('AUDIO_HOST_GATE_ORDER_CHANGED');
  return Object.freeze({runtime,durableHost,runtimeSha256:hash(runtime),durableHostSha256:hash(durableHost),
    sourceRuntimeSha256:hash(runtimeSource),baseCatalogChanged:false,signingChanged:false,storageNamespaceChanged:false});
}
function rootDirectory(root) {
  const full=path.resolve(root);
  if(path.basename(full)!=='owner-setup'||!lstatSync(full).isDirectory()||lstatSync(full).isSymbolicLink()||
     realpathSync(full)!==full)fail('AUDIO_OWNER_SOURCE_LAYOUT_REQUIRED');
  return full;
}
function read(root,name,pin) {
  const file=path.join(root,name),st=lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||realpathSync(file)!==file)fail('AUDIO_SOURCE_LINK_FORBIDDEN');
  return pinned(readFileSync(file,'utf8'),pin);
}
function writeCandidate(file,text) {
  if(existsSync(file)) {
    const st=lstatSync(file);
    if(!st.isFile()||st.isSymbolicLink()||readFileSync(file,'utf8')!==text)fail('AUDIO_EXISTING_CANDIDATE_CHANGED');
    return;
  }
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(realpathSync(path.dirname(file))!==path.dirname(file))fail('AUDIO_OUTPUT_LINK_FORBIDDEN');
  writeFileSync(file,text,{flag:'wx',mode:0o600});
  if(readFileSync(file,'utf8')!==text)fail('AUDIO_CANDIDATE_READBACK_FAILED');
}
/** Called by both generated operational and ACTUAL owner runtime selectors.
 * The startup wrapper regenerates the original runtime before calling this.
 * Existing generated baselines and package startup are never overwritten here. */
export function buildAudioCandidateRuntime(ownerRoot) {
  const root=rootDirectory(ownerRoot);
  read(root,'deployment/durable-native-job-policy.mjs',SOURCE_PINS.durablePolicy);
  read(root,'deployment/durable-manual-circuit-fence.mjs',SOURCE_PINS.journal);
  const result=composePinnedAudioHost({
    runtimeSource:read(root,'server-integration/server-durable-native-return-route56.mjs',SOURCE_PINS.runtime),
    durableHostSource:read(root,'deployment/durable-native-host.mjs',SOURCE_PINS.durableHost)});
  for(const name of MODULE_FILES)writeCandidate(path.join(root,'ebiseo-audio-v04',name),readFileSync(path.join(import.meta.dirname,name),'utf8'));
  const file=path.join(root,'server-integration/server-ebiseo-audio-v04-candidate.mjs');
  writeCandidate(path.join(root,'deployment/ebiseo-audio-durable-host-v04.mjs'),result.durableHost);
  writeCandidate(file,result.runtime);
  return Object.freeze({file,candidateSha256:result.runtimeSha256,productionEnabled:false,
    baseCatalogChanged:false,signingChanged:false,storageNamespaceChanged:false});
}
/** Historical durable-only composition retained for the 16 regression fixtures.
 * The v0.5 entry MUST use buildCurrentAudioReleaseCandidate; this earlier layer
 * omits later Stage25/Stage71 features and is never a supported startup fallback.
 * Build only: no owner configuration/key/database reads, listeners or phone calls. */
export async function buildAudioReleaseCandidate(ownerRoot) {
  const root=rootDirectory(ownerRoot);
  read(root,'deployment/durable-clean-restart-news-review-entry.mjs',SOURCE_PINS.releaseBuilder);
  read(root,'deployment/durable-live-release.mjs',SOURCE_PINS.releaseBase);
  read(root,'deployment/published-host-router.mjs',SOURCE_PINS.publishedRouter);
  const {buildCleanRestartRelease56}=await import(pathToFileURL(path.join(root,'deployment/durable-clean-restart-news-review-entry.mjs')).href);
  const original=buildCleanRestartRelease56();
  const release=await import(pathToFileURL(original.file).href+'?sha256='+original.sha256);
  const base=release.buildDurableRoutedOperationalEntrypoint(root);
  const host=buildAudioCandidateRuntime(root);
  let owner=pinned(readFileSync(base.ownerFile,'utf8'),SOURCE_PINS.owner);
  let unified=pinned(readFileSync(base.unifiedFile,'utf8'),SOURCE_PINS.unified);
  let operational=pinned(readFileSync(base.file,'utf8'),SOURCE_PINS.operational);
  const oldImport="import {buildDurableRoutedRuntime} from './durable-live-news-review-generated.mjs';";
  const newImport="import {buildAudioCandidateRuntime} from '../ebiseo-audio-v04/audio-compose-host.mjs';";
  owner=replaceOne(replaceOne(owner,oldImport,newImport),
    "if(runtimeMode==='unified')serverPath=buildDurableRoutedRuntime(root).file;",
    "if(runtimeMode==='unified')serverPath=buildAudioCandidateRuntime(root).file;");
  unified=replaceOne(unified,"from './owner-service-durable-return-route56.mjs';",
    "from './owner-service-ebiseo-audio-v04.mjs';");
  operational=replaceOne(replaceOne(replaceOne(operational,oldImport,newImport),
    'const runtime=buildDurableRoutedRuntime(ROOT).file;','const runtime=buildAudioCandidateRuntime(ROOT).file;'),
    "from './unified-service-durable-return-route56.mjs';","from './unified-service-ebiseo-audio-v04.mjs';");
  const ownerFile=path.join(root,'deployment/owner-service-ebiseo-audio-v04.mjs');
  const unifiedFile=path.join(root,'deployment/unified-service-ebiseo-audio-v04.mjs');
  const entryFile=path.join(root,'deployment/operational-service-ebiseo-audio-v04.mjs');
  for(const [file,text] of [[ownerFile,owner],[unifiedFile,unified],[entryFile,operational]])writeCandidate(file,text);
  const releaseBinding=createPinnedAudioReleaseAuthority().requireAudioRoutes({routes:AUDIO_ROUTES,contractSha256:AUDIO_CONTRACT_SHA256});
  return Object.freeze({...host,entryFile,ownerFile,unifiedFile,releaseBinding,
    ownerSelectorChanged:true,originalRuntimeRegeneratedFirst:true,originalPublishedRouterChanged:false,
    originalAuthenticationGatesPreserved:true,activated:false,networkRequests:0});
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  throw Error('AUDIO_LEGACY_CLI_DISABLED_USE_AUDIO_COMPOSE_CURRENT_HOST');
}
