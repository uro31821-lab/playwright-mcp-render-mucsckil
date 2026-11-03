import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {patchStage61MobileRuntime56,reverseStage61MobileRuntime56} from './stage61-mobile-runtime-patch.mjs';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const raw=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
const oldEnv={...process.env};

async function withSyntheticEnv(fn){
  process.env.CI='true';
  process.env.NODE_ENV='test';
  process.env.JH_OWNER_DEFER_LISTEN='1';
  process.env.JH_MOBILE_WEB_13_MODE='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
  try{return await fn();}
  finally{
    for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];
    for(const [key,value] of Object.entries(oldEnv))process.env[key]=value;
  }
}

async function buildCurrentMobileRuntime(){
  return withSyntheticEnv(async()=>{
    const generated=buildCleanRestartRelease56();
    const release=await import(pathToFileURL(generated.file).href+'?stage61base='+generated.sha256);
    const built=release.buildDurableRoutedOperationalEntrypoint(ROOT);
    const syntax=spawnSync(process.execPath,['--check',built.runtimeFile],{encoding:'utf8'});
    assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||'base generated runtime syntax failed');
    await import(pathToFileURL(built.runtimeFile).href+'?stage61baseimport='+built.candidateSha256);
    return readFileSync(built.runtimeFile,'utf8');
  });
}

const current=await buildCurrentMobileRuntime();

test('current reviewed base runtime remains compatible and does not pre-apply Stage61',()=>{
  for(const marker of [
    'async function jhMobileWebFollow56(',
    'async function jhMobileWebRead56(',
    'function secureCall56(',
    'const cuSchema56={',
    'MOBILE_REQUEST_ID_REQUIRED',
    'automaticReplay:false'
  ]) assert.ok(current.includes(marker),marker);
  assert.equal(current.includes('const jhStage61Host56=createStage61HostAdapter('),false);
});

test('Stage61 final overlay applies and reverses byte-for-byte on current reviewed base runtime',()=>{
  const patched=patchStage61MobileRuntime56(current);
  assert.notEqual(patched,current);
  assert.equal(reverseStage61MobileRuntime56(patched),current);
  assert.equal((patched.match(/stage61_route_token/g)||[]).length>=2,true);
  assert.equal((patched.match(/createStage61HostAdapter/g)||[]).length,2);
  assert.ok(patched.includes('stage61NextProvider'));
  assert.ok(patched.includes('ACTION_APPROVAL_REQUEST'));
  assert.ok(patched.includes('SCREEN_CONSENT_STATUS'));
});

test('Stage61 final overlay changes only bounded mobile and Computer Use routing anchors',()=>{
  const patched=patchStage61MobileRuntime56(current);
  assert.ok(patched.startsWith('import {createStage61HostAdapter}'));
  assert.equal(patched.split('registerOAuthTool("life_web_navigate"').length-1,1);
  assert.equal(patched.split('registerOAuthTool("life_android_execute_computer_action"').length-1,1);
  assert.equal(patched.split('jhStage61BeforeWeb56').length-1,2);
  assert.equal(patched.split('jhStage61PrepareComputer56').length-1,2);
  assert.throws(()=>patchStage61MobileRuntime56(patched));
});

test('Stage61 refuses raw server before reviewed mobile composition',()=>{
  assert.throws(()=>patchStage61MobileRuntime56(raw),/STAGE61_MOBILE_RUNTIME_PREREQUISITES_MISSING/);
});

test('full pending-approval and Stage25 production overlay chain ends with exactly one Stage61 layer',async()=>{
  const env={
    CI:'true',
    NODE_ENV:'test',
    JH_OWNER_DEFER_LISTEN:'1',
    JH_MOBILE_WEB_13_MODE:'EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1',
    JH_STAGE26_SIGNED_COMPLETION_ACK:'EXPLICIT_IDENTICAL_SIGNED_RESULT_V1',
    JH_STAGE40_OWNER_ADMISSION_DIAGNOSTICS:'EXPLICIT_ORIGINAL_OWNER_REASON_V1',
    JH_STAGE41_COMMAND_LIFECYCLE_DIAGNOSTICS:'EXPLICIT_SIGNED_COMMAND_CAUSE_V1',
    JH_STAGE44_DEVICE_FOCUS:'EXPLICIT_SIGNED_WORKFLOW_FOCUS_V1',
    JH_MOBILE13_COMMAND_DIAGNOSTICS:'EXPLICIT_OWNER_DEVICE_READ_ONLY_V1'
  };
  const built=await buildStage25PendingOperatorEntrypoint56(ROOT,env);
  const runtime=readFileSync(built.runtimeFile,'utf8');
  assert.equal(built.stamp.stage61ApprovalRouting,true);
  assert.equal(runtime.split('const jhStage61Host56=createStage61HostAdapter(').length-1,1);
  assert.equal(runtime.split('stage61_route_token:z.string().optional()').length-1,1);
  for(const marker of [
    'pendingApprovalReceipts56',
    'jhSplitFollowupReceipts56',
    'computerExecutionReceipts56',
    'jhOwnerAdmissionNote40',
    'jhCommandCauses41',
    'jhFocus44',
    'commandDiagnostics'
  ]) assert.ok(runtime.includes(marker),marker);
  const syntax=spawnSync(process.execPath,['--check',built.runtimeFile],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||'full Stage25 runtime syntax failed');
  await import(pathToFileURL(built.runtimeFile).href+'?stage61final='+built.stamp.runtimeSha256);
});
