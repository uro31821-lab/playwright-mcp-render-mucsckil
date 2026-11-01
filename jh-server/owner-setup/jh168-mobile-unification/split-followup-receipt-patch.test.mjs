import test from 'node:test';
import assert from 'node:assert/strict';
import {applyJH168SplitFollowupReceiptPatch,reverseJH168SplitFollowupReceiptPatch} from './split-followup-receipt-patch.mjs';

const baseline=()=>[
 'const recentWeb=new Map();',
 'const jhSplitReadReceipts56=createSplitReadReceiptRegistry56();',
 'function jhRequireCommand56(device){return device}',
 'const durableNativeHooks56={}; // durableNativeHooks56?.beforeDispatch(',
 'function jhInspectSplitEvidence155(screen){return {ok:!!screen}}',
 "registerOAuthTool('life_android_split_screen_assistant'",
 '  function jhSplitReadStatus56(receiptRef){',
 '    const device=chooseDevice(),auth=device&&active56(device);',
 '  }',
 '  async function jhSplitScreenJob56(type,payload,effect,secureToolName,waitMs=26000){',
 '    const completed=await waitJob(j,Math.min(Number(waitMs)||26000,43000));',
 "      return {ok:false,code:completed?.error||'split_screen_device_result_unconfirmed',",
 '        ...(receipt?{...receipt,jobStatus:completed.status}:{}),',
 '        automaticReplay:false};',
 "    if(mode==='READBACK_PENDING'||",
 "       (mode==='STATUS'&&typeof args.context_id==='string'&&",
 "        /^srr_[A-Za-z0-9_-]{32}$/.test(args.context_id))){"
].join('\n');

test('FOLLOWUP readback patch applies/reverses on exact generated source',()=>{
 const base=baseline(),p=applyJH168SplitFollowupReceiptPatch(base);
 assert.equal(reverseJH168SplitFollowupReceiptPatch(p),base);
 assert.match(p,/split_followup_receipt_arguments_invalid/);
 assert.match(p,/READBACK_PENDING/);
 assert.match(p,/createSplitFollowupReceiptRegistry56/);
 assert.match(p,/type==='split_screen_session_followup'/);
 assert.match(p,/effect==='REVERSIBLE_WRITE'/);
 assert.match(p,/payload\?\.action==='CLICK'/);
 assert.match(p,/jhSplitFollowupReceipts56\.read\(/);
 assert.match(p,/id=>jobs\.get\(id\)/);
 assert.match(p,/jhRequireCommand56\(device\)/);
 assert.match(p,/jhInspectSplitEvidence155\(screen\)\.ok===true/);
 assert.match(p,/automaticReplay:false/);
 assert.throws(()=>applyJH168SplitFollowupReceiptPatch(p),/GUARDS|ANCHOR/);
});

test('followup receipt-only lookup does not create a job or dispatch action',()=>{
 const p=applyJH168SplitFollowupReceiptPatch(baseline());
 const start=p.indexOf("if(mode==='READBACK_PENDING'&&typeof args.receipt_ref");
 const end=p.indexOf("    if(mode==='READBACK_PENDING'||",start);
 const route=p.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(route,/jhSplitFollowupStatus56\(args\.receipt_ref\)/);
 assert.ok(!/\bmk\(|waitJob\(|execute_computer_action\(|beforeDispatch\(/.test(route));
 assert.match(route,/args\.context_id\|\|args\.request_id\|\|args\.command/);
 assert.match(route,/args\.target_item_ref/);
});

test('new code preserves existing read-only receipt and fails closed on missing anchors',()=>{
 const s=baseline(),p=applyJH168SplitFollowupReceiptPatch(s);
 assert.match(p,/jhSplitReadStatus56/);
 assert.match(p,/jhSplitReadReceipts56/);
 assert.match(p, /\.\.\.\(receipt\?\{\.\.\.receipt,jobStatus:completed\.status\}:\{\}\)/);
 for(const mutation of [
  s.replace('jhSplitReadReceipts56','other'),
  s.replace('durableNativeHooks56?.beforeDispatch(','somethingElse('),
  s.replace('const completed=await waitJob','const missing=await waitJob'),
  s.replace('jhInspectSplitEvidence155','noProof')
 ])assert.throws(()=>applyJH168SplitFollowupReceiptPatch(mutation));
});

