import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildJH168Stage22ServerCandidate} from './stage22-generated-server-candidate.mjs';
import {reverseJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';
import {reverseJH168SplitReadReceiptPatch} from './split-read-receipt-patch.mjs';
test('real pinned generated Secure56 runtime composes both readback patches without startup or replay',async()=>{
 const built=await buildJH168Stage22ServerCandidate();
 const text=readFileSync(built.runtimeFile,'utf8');
 assert.equal(built.status,'REVIEW_ONLY_NOT_DEPLOYED');
 assert.equal(built.productionEnabled,false);
 assert.equal(built.autoClickReplay,false);
 assert.ok(text.includes('jhSplitFollowupReceipts56.read('));
 assert.ok(text.includes('jhSplitFollowupReceipts56.issue('));
 assert.ok(text.includes("type==='split_screen_session_followup'"));
 assert.ok(text.includes("effect==='REVERSIBLE_WRITE'"));
 assert.ok(text.includes('durableNativeHooks56?.beforeDispatch('));
 const read=reverseJH168SplitFollowupReceiptPatch(text);
 const original=reverseJH168SplitReadReceiptPatch(read);
 assert.equal(original.includes('jhSplitFollowupReceipts56.read('),false);
 assert.ok(original.includes("registerOAuthTool('life_android_split_screen_assistant'"));
 const syntax=spawnSync(process.execPath,['--check',built.runtimeFile],{encoding:'utf8',timeout:20000});
 assert.equal(syntax.status,0,syntax.stderr||syntax.stdout);
});

