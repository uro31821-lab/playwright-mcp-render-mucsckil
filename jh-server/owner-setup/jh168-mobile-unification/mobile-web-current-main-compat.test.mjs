/** JH168 current mobile/source review (NO RELEASE).
 * Preserve historical ORIGINAL/PR72 and the reviewed PR119 snapshot 8596f5ef.
 * Branch movement is permitted only with unchanged protected Git objects and
 * working files. Published host federation is pinned separately to its source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {reverseJH168Mobile13ActionPolicyHost56} from './mobile13-action-policy-patch.mjs';
import {assertReviewedSource} from './reviewed-source-audit.mjs';

const ORIGINAL='2c310f8b4a76d40604416e7dd4cb4976fdd1fc85';
const PRE_HOST_MEMORY='bd81675725609e67ca7bb2f8dc45f101f0820d8b';
const REVIEWED_MAIN='8596f5ef299d27fa7064ee40a64a99030196774a';
const REVIEWED_FEDERATION='c0190f6e9649bd5c5d13b9911c4933328808bbb2';
const MOBILE='c6142bd21ea299a4464124356e9da34b58001900';
const ROOT='jh-server/owner-setup/';
const show=(sha,path)=>execFileSync('git',['show',sha+':'+path],{
 encoding:'utf8',maxBuffer:16*1024*1024,timeout:15000});
const cmd=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const current=path=>readFileSync(path,'utf8');
const FEDERATION=ROOT+'operational-learning/';
const publishedFiles=[
 FEDERATION+'host-memory-federation.js', FEDERATION+'host-memory-federation.test.mjs',
 FEDERATION+'host-memory-federation-sources.md', FEDERATION+'verify.mjs'
];
const protectedPaths=[
 'jh-server/server.mjs',ROOT+'deployment',ROOT+'payment',ROOT+'server-integration',
 ROOT+'android-direct',ROOT+'trusted-server',ROOT+'owner-enrollment',
 ROOT+'operational-learning',ROOT+'jh168-mobile-unification',
 'jh-dev-tools/windows-delivery/fixtures/fix16',
 'package.json','package-lock.json','jh-server/package.json',
 ROOT+'package.json',ROOT+'package-lock.json',ROOT+'published-baseline/package.json',
 ...publishedFiles.map(p=>':(exclude)'+p),
 ...['mobile-web-current-main-compat.test.mjs','reviewed-source-audit.mjs',
  'reviewed-source-audit.test.mjs','CURRENT-SOURCE-AUDIT.md'].map(p=>':(exclude)'+ROOT+'jh168-mobile-unification/'+p)
];
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
test('reviewed provenance remains fixed while origin, candidate and worktree protected sources stay exact',()=>{
 for(const sha of [ORIGINAL,PRE_HOST_MEMORY,REVIEWED_MAIN,MOBILE,REVIEWED_FEDERATION])
  assert.equal(cmd(['cat-file','-t',sha]),'commit');
 assertReviewedSource({cwd:process.cwd(),baseline:REVIEWED_MAIN,paths:protectedPaths});
 assert.equal(cmd(['merge-base',ORIGINAL,REVIEWED_MAIN]),ORIGINAL);
 assert.equal(cmd(['merge-base',ORIGINAL,MOBILE]),ORIGINAL);
 assert.equal(cmd(['merge-base',REVIEWED_MAIN,'HEAD']),REVIEWED_MAIN);
});
test('PR119 exact sixteen-file historical delta remains pinned, not applied to unrelated later candidates',()=>{
 assert.equal(cmd(['rev-parse',REVIEWED_MAIN+'^']),PRE_HOST_MEMORY);
 const actual=cmd(['diff','--name-only',PRE_HOST_MEMORY,REVIEWED_MAIN]).split('\n').sort();
 const expected=[
  '.github/workflows/jh168-mobile13-command-diagnostics-review.yml',
  ...['host-memory-bridge.mjs','host-memory-bridge.test.mjs','host-memory-runtime.test.mjs',
   'mcp-tools.mjs','server-runtime.mjs','owner-host.mjs','runtime-patch.mjs','verify.mjs',
   'preflight.test.mjs','http-runtime.fixture.mjs','http-runtime.test.mjs','README.ko.md',
   'design-sources.md'].map(p=>FEDERATION+p),
  ROOT+'jh168-mobile-unification/mobile-web-current-main-compat.test.mjs',
  ROOT+'jh168-mobile-unification/stage42-protected-source-provenance.test.mjs'
 ].sort();
 assert.deepEqual(actual,expected,'PR119_HISTORICAL_EXACT_FILES_CHANGED');
});
test('published host-only federation has exact reviewed content; existing live learning runtime stays protected',()=>{
 const base=cmd(['rev-parse','refs/remotes/origin/jh-fix3-secure-server']);
 const entry=(ref,path)=>cmd(['ls-tree',ref,'--',path]);
 assert.equal(cmd(['-c','core.fileMode=true','diff','--raw',REVIEWED_FEDERATION,'--',...publishedFiles]),'');
 for(const path of publishedFiles){
  assert.equal(current(path),show(REVIEWED_FEDERATION,path),path);
  assert.equal(entry('HEAD',path),entry(REVIEWED_FEDERATION,path),path);
  // Before merge origin has PR119; after merge it may have exactly this reviewed
  // federation. No new version or changed mode is accepted through this exception.
  assert.ok([entry(REVIEWED_MAIN,path),entry(REVIEWED_FEDERATION,path)].includes(entry(base,path)),
   'UNREVIEWED_BASE_FEDERATION_'+path);
 }
 const overlay='host-client-plugin-overlay';
 assert.equal(cmd(['diff','--raw',REVIEWED_FEDERATION,'HEAD','--',overlay]),'');
 assert.equal(cmd(['-c','core.fileMode=true','diff','--raw',REVIEWED_FEDERATION,'--',overlay]),'');
 assert.equal(cmd(['ls-files','--others','--exclude-standard','--',overlay]),'');
 const originOverlay=cmd(['ls-tree',base,'--',overlay]);
 assert.ok(originOverlay==='' || originOverlay===cmd(['ls-tree',REVIEWED_FEDERATION,'--',overlay]));
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
test('legacy Stage42 protection also preserves PR72 producer contract and opt-in/no-replay boundaries',()=>{
 const producer=FEDERATION+'ANDROID-PRODUCER-COMPATIBILITY.md';
 assert.equal(current(producer),show(MOBILE,producer));
 for(const name of ['engine.mjs','store.mjs','host-observations.mjs','host-adapter.mjs',
  'instructions.mjs','curation.mjs','regression.mjs','decisions.mjs','progress.mjs','owner-patch.mjs'])
  assert.equal(current(FEDERATION+name),show(REVIEWED_MAIN,FEDERATION+name),name);
 assert.ok(current(FEDERATION+'owner-host.mjs').includes("process.env.JH_HOST_MEMORY_BRIDGE === 'EXPLICIT_OWNER_HOST_MEMORY_V1'"));
 const runtime=current(FEDERATION+'server-runtime.mjs');
 assert.ok(runtime.includes('hostMemoryEnabled = false'));
 assert.ok(runtime.includes("librarySync: 'not_connected'"));
 const focus=current(ROOT+'jh168-mobile-unification/STAGE44-SINGLE-COMMAND-FOCUS.md');
 assert.ok(focus.includes('120 seconds'));
 assert.ok(focus.includes('29 historical'));
 const patched=current(ROOT+'jh168-mobile-unification/stage44-device-focus-patch.mjs');
 for(const marker of ['const IMP=','DEVICE_FOCUS_PROTECTED_OTHER_BEGIN','function reverseStage44DeviceFocusPatch('])
  assert.ok(patched.includes(marker),marker);
});
