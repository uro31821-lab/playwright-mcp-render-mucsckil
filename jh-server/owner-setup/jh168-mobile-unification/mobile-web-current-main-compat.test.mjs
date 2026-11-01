/** JH168 verified-current-MAIN mobile/source review (NO RELEASE).
 * Preserve BOTH historical PR72 / 2c310f8 source evidence and the reviewed
 * deployed diagnostic main bd816757. The new host-memory transport changes
 * only the separately reviewed learning boundary; mobile execution is fixed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {reverseJH168Mobile13ActionPolicyHost56} from './mobile13-action-policy-patch.mjs';

const ORIGINAL='2c310f8b4a76d40604416e7dd4cb4976fdd1fc85';
const REVIEWED_MAIN='bd81675725609e67ca7bb2f8dc45f101f0820d8b';
const MOBILE='c6142bd21ea299a4464124356e9da34b58001900';
const ROOT='jh-server/owner-setup/';
const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{
 encoding:'utf8',maxBuffer:16*1024*1024,timeout:15000});
const cmd=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const current=path=>readFileSync(path,'utf8');
const deps=[
 'jh-server/server.mjs',
 ROOT+'deployment/durable-live-release.mjs',
 ROOT+'deployment/durable-clean-restart-news-review-entry.mjs',
 ROOT+'deployment/jh167-right-pane-orchestrator-repair.mjs',
 ROOT+'deployment/jh167-open-completion.mjs',
 ROOT+'deployment/jh167-connection-v2-runtime.mjs',
 ROOT+'deployment/durable-manual-circuit-fence.mjs',
 ROOT+'deployment/jh155-split-integration-patch.mjs',
 ROOT+'server-integration/pending-approval-operator-entry.mjs',
 ROOT+'deployment/durable-mcp-workflow-patch.mjs',
 ROOT+'deployment/durable-native-job-policy.mjs',
 ROOT+'deployment/jh155-all-modules-patch.mjs',
 ROOT+'payment/payment-runtime-patch.mjs'
];
test('re-reviewed current MAIN and historical pre-mobile source are pinned EXACT, no unapproved advancement',()=>{
 for(const sha of [ORIGINAL,REVIEWED_MAIN,MOBILE])
  assert.equal(cmd(['cat-file','-t',sha]),'commit');
 assert.equal(cmd(['rev-parse','refs/remotes/origin/jh-fix3-secure-server']),REVIEWED_MAIN,
  'MAIN_ADVANCED_REFRESH_SOURCE_AUDIT');
 assert.equal(cmd(['merge-base',ORIGINAL,REVIEWED_MAIN]),ORIGINAL);
 assert.equal(cmd(['merge-base',ORIGINAL,MOBILE]),ORIGINAL);
 assert.equal(cmd(['merge-base',REVIEWED_MAIN,'HEAD']),REVIEWED_MAIN);
});
test('original Secure56, Android, workflow cancel and owner duplicate protection are BYTE IDENTICAL to reviewed deployed MAIN',()=>{
 for(const path of deps)assert.equal(current(path),show(REVIEWED_MAIN,path),
  'ORIGINAL_SIGNED_RUNTIME_CHANGED_'+path);
});
test('current MAIN host contains EXACT originally reviewed PR72 mobile patches with verifiable reversal',()=>{
 const host=ROOT+'deployment/durable-native-host.mjs';
 assert.equal(current(host),show(REVIEWED_MAIN,host));
 assert.equal(current(host),show(MOBILE,host));
 assert.equal(reverseJH168Mobile13ActionPolicyHost56(current(host)),show(ORIGINAL,host));
});
test('mobile 9+4 composition is reviewed PR72 and ALREADY in MAIN, not duplicated by diagnostics',()=>{
 const p=ROOT+'deployment/jh167-article-operational-review-composition.mjs';
 const s=current(p);
 assert.equal(s,show(MOBILE,p));
 assert.equal(s,show(REVIEWED_MAIN,p));
 assert.equal(s.split("import {patchJH168MobileWeb13VerifiedMode56}").length,2);
 assert.equal((s.match(/patchJH168MobileWeb13VerifiedMode56\(/g)||[]).length,1);
 const raw=show(ORIGINAL,p);
 assert.equal((raw.match(/patchJH168MobileWeb13VerifiedMode56\(/g)||[]).length,0);
});
test('raw Secure56 signing engine unchanged; nine RIGHT mobile aliases remain opt-in, no remote Playwright fallback in actual mobile patch',()=>{
 const raw=current('jh-server/server.mjs');
 assert.equal(raw,show(ORIGINAL,'jh-server/server.mjs'));
 const mobile=current(ROOT+'jh168-mobile-unification/mobile-web-tool-patch.mjs');
 assert.equal(mobile,show(MOBILE,ROOT+'jh168-mobile-unification/mobile-web-tool-patch.mjs'));
 assert.ok(mobile.includes('EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1'));
 assert.ok(mobile.includes('jhMobileWebFollow56'));
 assert.ok(mobile.includes('MOBILE_REQUEST_ID_REQUIRED'));
 assert.ok(mobile.includes('Never silently switch to the unrelated cloud Chromium profile'));
});
test('reviewed original 9+4 fixture E2E ledger remains explicitly incomplete until full real-phone test',()=>{
 const path=ROOT+'jh168-mobile-unification/JH168-MOBILE-13-DEFECT-LEDGER.md';
 assert.equal(current(path),show(REVIEWED_MAIN,path));
 for(const label of ['0/13','NOT_RUN','G12','G13','G14'])
  assert.ok(current(path).includes(label),label);
});
test('original Connection V2 mode-toggle test is byte-exact reviewed PR72 version only',()=>{
 const p=ROOT+'deployment/jh167-connection-v2-assembled-preflight.test.mjs';
 assert.equal(current(p),show(MOBILE,p));
 assert.equal(current(p),show(REVIEWED_MAIN,p));
 const original=show(ORIGINAL,p);
 const newer=current(p);
 const oldSnippet=" assert.ok(click.includes('RIGHT_PHONE_ITEM_REQUIRES_ANDROID_COMPUTER_USE'));\n assert.ok(click.includes('browserTool(\"browser_click\",args)'));\n";
 const newSnippet=" // Legacy execution remains intact when the temporary candidate mode is OFF.\n // Explicit mobile test mode alone removes the cloud Playwright CLICK route.\n const migrationEnabled=process.env.JH_MOBILE_WEB_13_MODE==='EXPLICIT_SIGNED_ANDROID_RIGHT_13_V1';\n if(migrationEnabled){\n   assert.ok(click.includes('jhMobileWebFollow56(args,\"CLICK\"'));\n   assert.ok(!click.includes('browserTool(\"browser_click\",args)'));\n   assert.ok(generated.includes('MOBILE_REQUEST_ID_REQUIRED'));\n   assert.ok(generated.includes('requestId,command,targetItemRef:bound.itemRef,action'));\n   assert.ok(generated.includes('jhSplitScreenOnce155(device,commandId,type,payload,dispatch)'));\n }else{\n   assert.ok(click.includes('RIGHT_PHONE_ITEM_REQUIRES_ANDROID_COMPUTER_USE'));\n   assert.ok(click.includes('browserTool(\"browser_click\",args)'));\n   assert.ok(!generated.includes('MOBILE_REQUEST_ID_REQUIRED'));\n }\n";
 assert.equal(newer.split(newSnippet).length,2);
 assert.equal(newer.replace(newSnippet,oldSnippet),original);
});
