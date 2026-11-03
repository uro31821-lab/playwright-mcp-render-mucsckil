import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {patchStage61MobileRuntime56,reverseStage61MobileRuntime56} from './stage61-mobile-runtime-patch.mjs';

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
    return readFileSync(built.runtimeFile,'utf8');
  }finally{
    for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];
    for(const [key,value] of Object.entries(oldEnv))process.env[key]=value;
  }
}

const current=await buildCurrentMobileRuntime();
const secureCallAt=current.indexOf('function secureCall56(');
console.log('STAGE61_SECURE_CALL_SOURCE '+JSON.stringify(current.slice(secureCallAt,secureCallAt+1800)));

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

test('Stage61 applies to current generated runtime and reverses byte-for-byte',()=>{
  const patched=patchStage61MobileRuntime56(current);
  assert.notEqual(patched,current);
  assert.equal(reverseStage61MobileRuntime56(patched),current);
  assert.equal((patched.match(/stage61_route_token/g)||[]).length>=2,true);
  assert.equal((patched.match(/createStage61HostAdapter/g)||[]).length,2);
  assert.ok(patched.includes('stage61NextProvider'));
  assert.ok(patched.includes('PREVIOUS_EFFECT_UNCERTAIN')||patched.includes('automaticReplay:false'));
});

test('Stage61 changes only bounded mobile and Computer Use routing anchors',()=>{
  const patched=patchStage61MobileRuntime56(current);
  assert.ok(patched.startsWith('import {createStage61HostAdapter}'));
  assert.equal((patched.match(/registerOAuthTool\("life_web_navigate"/g)||[]).length,1);
  assert.equal((patched.match(/registerOAuthTool\("life_android_execute_computer_action"/g)||[]).length,1);
  assert.equal((patched.match(/jhStage61BeforeWeb56/g)||[]).length,2);
  assert.equal((patched.match(/jhStage61PrepareComputer56/g)||[]).length,2);
});

test('Stage61 refuses raw server before reviewed mobile composition',()=>{
  assert.throws(()=>patchStage61MobileRuntime56(raw),/STAGE61_MOBILE_RUNTIME_PREREQUISITES_MISSING/);
});
