/**
 * Stage25: explicit Secure56 operator entry for existing signed FOLLOW_UP
 * CLICK-result readback. Production startup is NOT changed by adding this file.
 *
 * The original durable/owner/Life startup chain stays authoritative.
 * No new click permission, approval, OAuth scope, device transport or retries.
 */
import path from 'node:path';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {
  buildDurableRoutedRuntime,buildDurableRoutedOperationalEntrypoint
} from '../deployment/durable-live-clean-restart-generated.mjs';
import {applyJH168SplitReadReceiptPatch,reverseJH168SplitReadReceiptPatch}
  from './split-read-receipt-patch.mjs';
import {applyJH168SplitFollowupReceiptPatch,reverseJH168SplitFollowupReceiptPatch}
  from './split-followup-receipt-patch.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
function one(source,oldText,newText,code){
  if(typeof source!=='string'||source.split(oldText).length!==2||source.includes(newText))
    throw Error(code);
  const changed=source.replace(oldText,newText);
  if(changed.replace(newText,oldText)!==source)throw Error(code+'_REVERSE');
  return changed;
}
function writeChecked(file,source){
  const tmp=file+'.stage25.tmp';
  writeFileSync(tmp,source,{encoding:'utf8',mode:0o600});
  renameSync(tmp,file);
  if(readFileSync(file,'utf8')!==source)throw Error('STAGE25_GENERATED_READBACK_FAILED');
}
/**
 * Synchronous runtime build: used by the original owner host BEFORE listen.
 * This chooses the same pinned Secure56 runtime as the proven Stage22 review
 * candidate; only the follow-up receipt paths are added.
 */
export function buildJH168Stage25Runtime(root=path.resolve(import.meta.dirname,'..')){
  const parent=buildDurableRoutedRuntime(root);
  if(parent.productionEnabled!==false||!parent.runtimeRoutePatched||
     !parent.file||!parent.candidateSha256)
    throw Error('STAGE25_PARENT_RUNTIME_NOT_PINNED');
  const original=readFileSync(parent.file,'utf8');
  if(hash(original)!==parent.candidateSha256||
     !original.includes('durableNativeHooks56?.beforeDispatch(')||
     !original.includes("registerOAuthTool('life_android_split_screen_assistant'")||
     !original.includes('jhRequireCommand56('))
    throw Error('STAGE25_ORIGINAL_SECURE56_GUARDS_REQUIRED');
  const withRead=applyJH168SplitReadReceiptPatch(original);
  const updated=applyJH168SplitFollowupReceiptPatch(withRead);
  if(reverseJH168SplitFollowupReceiptPatch(updated)!==withRead||
     reverseJH168SplitReadReceiptPatch(withRead)!==original)
    throw Error('STAGE25_ORIGINAL_RUNTIME_REVERSAL_FAILED');
  const file=path.join(root,'server-integration/server-jh168-split-followup56.mjs');
  writeChecked(file,updated);
  return Object.freeze({...parent,file,parentSha256:hash(original),
    candidateSha256:hash(updated),originalSecure56Guards:true,
    resultReadbackOnly:true,automaticReplayAllowed:false,
    defaultStartupChanged:false,productionEnabled:false});
}
/**
 * The original startConfiguredOwnerServer selects a runtime in the owner
 * wrapper. Patching ONLY a diagnostic runtime variable is insufficient.
 * This explicit candidate patches the owner selector, unified import and
 * operational import/call, keeping every current owner/volume/manual fence.
 */
export function buildJH168Stage25OperationalEntrypoint(root=path.resolve(import.meta.dirname,'..')){
  const base=buildDurableRoutedOperationalEntrypoint(root);
  const folder=path.join(root,'deployment');
  const importOld="import {buildDurableRoutedRuntime} from './durable-live-clean-restart-generated.mjs';";
  const importNew="import {buildJH168Stage25Runtime} from '../jh168-mobile-unification/stage25-split-followup-operational-entry.mjs';";
  const ownerSource=readFileSync(base.ownerFile,'utf8');
  let owner=one(ownerSource,importOld,importNew,'STAGE25_OWNER_IMPORT_DRIFT');
  owner=one(owner,
    "if(runtimeMode==='unified')serverPath=buildDurableRoutedRuntime(root).file;",
    "if(runtimeMode==='unified')serverPath=buildJH168Stage25Runtime(root).file;",
    'STAGE25_OWNER_SELECTOR_DRIFT');
  const ownerFile=path.join(folder,'owner-service-split-followup56.mjs');
  writeChecked(ownerFile,owner);

  const unifiedSource=readFileSync(base.unifiedFile,'utf8');
  const unified=one(unifiedSource,
    "from './owner-service-durable-return-route56.mjs';",
    "from './owner-service-split-followup56.mjs';",
    'STAGE25_UNIFIED_OWNER_DRIFT');
  const unifiedFile=path.join(folder,'unified-service-split-followup56.mjs');
  writeChecked(unifiedFile,unified);

  const operationalSource=readFileSync(base.file,'utf8');
  let operational=one(operationalSource,
    "from './unified-service-durable-return-route56.mjs';",
    "from './unified-service-split-followup56.mjs';",
    'STAGE25_OPERATIONAL_UNIFIED_DRIFT');
  operational=one(operational,importOld,importNew,
    'STAGE25_OPERATIONAL_IMPORT_DRIFT');
  operational=one(operational,
    'const runtime=buildDurableRoutedRuntime(ROOT).file;',
    'const runtime=buildJH168Stage25Runtime(ROOT).file;',
    'STAGE25_OPERATIONAL_RUNTIME_DRIFT');
  const file=path.join(folder,'operational-service-split-followup56.mjs');
  writeChecked(file,operational);

  const runtime=buildJH168Stage25Runtime(root);
  if(readFileSync(ownerFile,'utf8')!==owner||
     readFileSync(unifiedFile,'utf8')!==unified||
     readFileSync(file,'utf8')!==operational)
    throw Error('STAGE25_OPERATOR_SOURCE_CHANGED');
  return Object.freeze({file,ownerFile,unifiedFile,runtimeFile:runtime.file,
    sourceSha256:runtime.parentSha256,candidateSha256:runtime.candidateSha256,
    defaultStartupChanged:false,operatorSelectedOnly:true,
    originalSecurityAndApprovalPreserved:true,
    androidApkChanged:false,automaticReplayAllowed:false,
    productionEnabled:false});
}
/**
 * Explicit operator entry only. A controlled Render start-command change and
 * prior startup/rollback approvals are required to use this in production.
 * No CLI path in the default existing owner startup imports this main().
 */
export async function main(env=process.env){
  const root=path.resolve(import.meta.dirname,'..');
  const built=buildJH168Stage25OperationalEntrypoint(root);
  const mod=await import(pathToFileURL(built.file).href);
  const running=await mod.main(env); // existing owner/service/cutover verification
  if(running?.durableCircuitInstalled!==true){
    try{await running?.close?.()}catch{}
    throw Error('STAGE25_DURABLE_CIRCUIT_NOT_VERIFIED');
  }
  console.log('JH_SPLIT_FOLLOWUP_READBACK_ACTIVE '+JSON.stringify({
    schema:'JH168_STAGE25_SPLIT_FOLLOWUP_RECEIPT_V1',sha256:built.candidateSha256,
    secureBridgeVersion:56,originalDurableJournal:true,
    resultReadbackOnly:true,automaticReplayAllowed:false,
    androidApkChanged:false
  }));
  return running;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  main().catch(e=>{console.error(String(e?.code||e?.message||'STAGE25_OPERATOR_START_FAILED'));process.exitCode=1});
}
