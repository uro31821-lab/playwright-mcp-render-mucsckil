import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  buildJH168Stage25Runtime,buildJH168Stage25OperationalEntrypoint
} from './stage25-split-followup-operational-entry.mjs';
import {
  reverseJH168SplitFollowupReceiptPatch
} from './split-followup-receipt-patch.mjs';
import {
  reverseJH168SplitReadReceiptPatch
} from './split-read-receipt-patch.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const checkFile=(file)=>{
 const p=spawnSync(process.execPath,['--check',file],{encoding:'utf8',timeout:25000});
 assert.equal(p.status,0,file+' '+(p.stderr||p.stdout));
};

test('exact owner-selected startup routes to same scoped Secure56 readback runtime',()=>{
 const built=buildJH168Stage25OperationalEntrypoint();
 assert.equal(built.productionEnabled,false);
 assert.equal(built.defaultStartupChanged,false);
 assert.equal(built.operatorSelectedOnly,true);
 assert.equal(built.originalSecurityAndApprovalPreserved,true);
 const owner=readFileSync(built.ownerFile,'utf8');
 const unified=readFileSync(built.unifiedFile,'utf8');
 const operational=readFileSync(built.file,'utf8');
 const runtime=readFileSync(built.runtimeFile,'utf8');
 const stage25Module='stage25-split-followup-operational-entry.mjs';
 assert.ok(owner.includes('serverPath=buildJH168Stage25Runtime(root).file;'));
 assert.ok(owner.includes(stage25Module));
 assert.ok(unified.includes("from './owner-service-split-followup56.mjs';"));
 assert.ok(operational.includes("from './unified-service-split-followup56.mjs';"));
 assert.ok(operational.includes('const runtime=buildJH168Stage25Runtime(ROOT).file;'));
 assert.ok(operational.includes(stage25Module));
 assert.ok(operational.includes('prepareOrVerifyDurableRelease({config,key,mode:env.JH_DURABLE_RELEASE})'));
 assert.ok(operational.includes('validateOperationalEnvironment(env)'));
 assert.ok(runtime.includes('jhSplitReadReceipts56.read('));
 assert.ok(runtime.includes('jhSplitFollowupReceipts56.read('));
 assert.ok(runtime.includes('jhSplitFollowupReceipts56.issue('));
 assert.ok(runtime.includes('durableNativeHooks56?.beforeDispatch('));
 assert.ok(runtime.includes('durableNativeHooks56?.acceptedCompletion('));
 assert.ok(runtime.includes('jhRequireCommand56('));
 assert.ok(!runtime.includes('automaticActionRetryEnabled:true'));
 assert.equal(hash(runtime),built.candidateSha256);
 for(const p of [built.ownerFile,built.unifiedFile,built.file,built.runtimeFile])checkFile(p);
 const stripped=reverseJH168SplitReadReceiptPatch(
   reverseJH168SplitFollowupReceiptPatch(runtime)
 );
 assert.ok(!stripped.includes('jhSplitFollowupReceipts56'));
 assert.ok(stripped.includes('durableNativeHooks56?.acceptedCompletion('));
});

test('runtime reuses existing durable signed-host contract and not a new browser executor',()=>{
 const built=buildJH168Stage25Runtime();
 assert.equal(built.resultReadbackOnly,true);
 assert.equal(built.defaultStartupChanged,false);
 assert.equal(built.automaticReplayAllowed,false);
 const text=readFileSync(built.file,'utf8');
 assert.equal(text.split('jhSplitFollowupReceipts56.issue(').length-1,1);
 assert.equal(text.split('jhSplitFollowupReceipts56.read(').length-1,1);
 assert.ok(text.includes("type==='split_screen_session_followup'"));
 assert.ok(text.includes("effect==='REVERSIBLE_WRITE'"));
 assert.ok(text.includes("secureToolName==='life_android_execute_computer_action'"));
 assert.ok(text.includes("args.context_id||args.request_id||args.command"));
 assert.ok(text.includes('newJobCreated:false'));
});

test('entry is not a default deployment and does not create listeners or phones in CI',()=>{
 const source=readFileSync(path.join(import.meta.dirname,'stage25-split-followup-operational-entry.mjs'),'utf8');
 assert.ok(source.includes('operatorSelectedOnly:true'));
 assert.ok(source.includes('defaultStartupChanged:false'));
 assert.ok(!source.includes('autoDeploy:true'));
 assert.ok(!source.includes('adb install'));
 assert.ok(!source.includes('triggerDeploy('));
});

