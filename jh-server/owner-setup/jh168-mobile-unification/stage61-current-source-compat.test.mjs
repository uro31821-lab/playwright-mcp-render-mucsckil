import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {patchStage61MobileRuntime56,reverseStage61MobileRuntime56} from './stage61-mobile-runtime-patch.mjs';
import {buildStage25PendingOperatorEntrypoint56} from './stage25-live-operator-followup-entry.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const raw=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
const oldEnv={...process.env};
async function buildCurrentMobileRuntime(){
  process.env.CI='true';
  process.env.NODE_ENV='test';
  process.env.JH_OWNER_DEFER_LISTEN='1';
  process.env.JH_MOBILE_WEB_13_MODE='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';
  try{
    const generated=buildCleanRestartRelease56();
    const release=await import(pathToFileURL(generated.file).href+'?stage61='+generated.sha256);
    const built=release.buildDurableRoutedOperationalEntrypoint(ROOT);
    const syntax=spawnSync(process.execPath,['--check',built.runtimeFile],{encoding:'utf8'});
    assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||'generated runtime syntax failed');
    await import(pathToFileURL(built.runtimeFile).href+'?stage61runtime='+built.candidateSha256);
    return readFileSync(built.runtimeFile,'utf8');
  }finally{
    for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];
    for(const [key,value] of Object.entries(oldEnv))process.env[key]=value;
  }
}

const current=await buildCurrentMobileRuntime();

test('current reviewed JH release builder composes the signed Android RIGHT mobile runtime',()=>{
  for(const marker of [
    'async function jhMobileWebFollow56(',
    'async function jhMobileWebRead56(',
    'function secureCall56(',
    'const cuSchema56={',
    'MOBILE_REQUEST_ID_REQUIRED',
    'automaticReplay:false'
  ]) assert.ok(current.includes(marker),marker);
});

test('Stage61 is already composed by the reviewed runtime and reverses/reapplies byte-for-byte',()=>{
  const base=reverseStage61MobileRuntime56(current);
  assert.notEqual(base,current);
  assert.equal(patchStage61MobileRuntime56(base),current);
  assert.equal((current.match(/stage61_route_token/g)||[]).length>=2,true);
  assert.equal((current.match(/createStage61HostAdapter/g)||[]).length,2);
  assert.ok(current.includes('stage61NextProvider'));
  assert.ok(current.includes('ACTION_APPROVAL_REQUEST'));
  assert.ok(current.includes('SCREEN_CONSENT_STATUS'));
});

test('Stage61 deployed composition changes only bounded mobile and Computer Use routing anchors',()=>{
  assert.ok(current.startsWith('import {createStage61HostAdapter}'));
  assert.equal((current.match(/registerOAuthTool\("life_web_navigate"/g)||[]).length,1);
  assert.equal((current.match(/registerOAuthTool\("life_android_execute_computer_action"/g)||[]).length,1);
  assert.equal((current.match(/jhStage61BeforeWeb56/g)||[]).length,2);
  assert.equal((current.match(/jhStage61PrepareComputer56/g)||[]).length,2);
  assert.throws(()=>patchStage61MobileRuntime56(current));
});

test('Stage61 refuses raw server before reviewed mobile composition',()=>{
  assert.throws(()=>patchStage61MobileRuntime56(raw),/STAGE61_MOBILE_RUNTIME_PREREQUISITES_MISSING/);
});


test('Stage61 composes through the full current pending-approval and Stage25 production overlay chain',async()=>{
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
  assert.ok(runtime.includes('stage61RouteToken'));
  assert.ok(runtime.includes('pendingApprovalReceipts56'));
  assert.ok(runtime.includes('jhSplitFollowupReceipts56'));
  assert.ok(runtime.includes('JH168_STAGE26_SIGNED_COMPLETION_ACK_V1')||runtime.includes('completionAck'));
  assert.ok(runtime.includes('jhOwnerAdmissionNote40'));
  assert.ok(runtime.includes('jhCommandCauses41'));
  assert.ok(runtime.includes('jhFocus44'));
  assert.ok(runtime.includes('commandDiagnostics'));
  const syntax=spawnSync(process.execPath,['--check',built.runtimeFile],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr||syntax.stdout||'full Stage25 runtime syntax failed');
  await import(pathToFileURL(built.runtimeFile).href+'?stage61full='+built.stamp.runtimeSha256);
});
