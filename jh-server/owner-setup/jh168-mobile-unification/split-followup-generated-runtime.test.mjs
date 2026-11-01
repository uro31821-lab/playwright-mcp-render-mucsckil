import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-release.mjs';
import {applyJH168SplitReadReceiptPatch} from './split-read-receipt-patch.mjs';
import {applyJH168SplitFollowupReceiptPatch,reverseJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';

test('actual pinned generated runtime admits exact source-only followup readback extension',async()=>{
  const built=buildCleanRestartRelease56();
  const mod=await import(pathToFileURL(built.file).href+'?jh168-split-followup-source-review');
  const root=path.resolve(import.meta.dirname,'..');
  const runtime=mod.buildDurableRoutedOperationalEntrypoint(root);
  const baseline=readFileSync(runtime.runtimeFile,'utf8');
  const withRead=applyJH168SplitReadReceiptPatch(baseline);
  const withFollowup=applyJH168SplitFollowupReceiptPatch(withRead);
  assert.equal(reverseJH168SplitFollowupReceiptPatch(withFollowup),withRead);
  assert.ok(withFollowup.includes('jhSplitFollowupReceipts56.read('));
  assert.ok(withFollowup.includes("type==='split_screen_session_followup'"));
  assert.ok(withFollowup.includes("effect==='REVERSIBLE_WRITE'"));
  assert.ok(withFollowup.includes('durableNativeHooks56?.beforeDispatch('));
  assert.ok(withFollowup.includes('jhSplitReadReceipts56.read('));
  assert.equal(withFollowup.split('jhSplitFollowupReceipts56.read(').length-1,1);
  assert.equal(withFollowup.split('jhSplitFollowupReceipts56.issue(').length-1,1);
  assert.ok(!withFollowup.includes('automaticActionRetryEnabled:true'));
});

