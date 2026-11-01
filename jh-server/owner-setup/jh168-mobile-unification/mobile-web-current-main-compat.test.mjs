/**
 * Verify PR72's exact 9+4 routing diff against LATEST reviewed main (2026-11-01),
 * and record ALL mismatches before any functional code modification.
 *
 * This test never builds an Android APK, starts a server, performs a phone
 * action, grants approval, updates SQLite or alters production source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const UPSTREAM='86cfa35e4f6be6ba1b6a7f9797533a88f6406a87';
const root='jh-server/owner-setup/';
const deps=[
 'jh-server/server.mjs',
 root+'deployment/durable-live-release.mjs',
 root+'deployment/durable-clean-restart-news-review-entry.mjs',
 root+'deployment/jh167-right-pane-orchestrator-repair.mjs',
 root+'deployment/jh167-open-completion.mjs',
 root+'deployment/jh167-connection-v2-runtime.mjs',
 root+'deployment/durable-native-host.mjs',
 root+'deployment/durable-manual-circuit-fence.mjs',
 root+'deployment/jh155-split-integration-patch.mjs',
 root+'server-integration/pending-approval-operator-entry.mjs'
];
const show=path=>execFileSync('git',['show',UPSTREAM+':'+path],{
 encoding:'utf8',maxBuffer:12*1024*1024,timeout:15000
});
const current=path=>readFileSync(path,'utf8');
const original='jh-server/owner-setup/deployment/jh167-article-operational-review-composition.mjs';
const importMobile="import {patchJH168MobileWebCommands56} from '../jh168-mobile-unification/mobile-web-tool-patch.mjs';\n";
const oldReturn=' return patchJH167OpenCompletion56(patchJH167RightPaneOrchestrator56(patchJH167OfficialWebServiceNames56(patchJH167RightWebUrl56(patchJH167ConnectionV2Runtime(candidate)))));';
const newReturn=' return patchJH168MobileWebCommands56(patchJH167OpenCompletion56(patchJH167RightPaneOrchestrator56(patchJH167OfficialWebServiceNames56(patchJH167RightWebUrl56(patchJH167ConnectionV2Runtime(candidate))))));';

test('reviewed current main commit is available with full history (NO source update)',()=>{
 const type=execFileSync('git',['cat-file','-t',UPSTREAM],{encoding:'utf8'}).trim();
 assert.equal(type,'commit');
 const checkout=execFileSync('git',['rev-parse','refs/remotes/origin/jh-fix3-secure-server'],{encoding:'utf8'}).trim();
 assert.equal(checkout,UPSTREAM,'Main advanced: STOP and refresh this source audit before deploying');
});
test('10 original Secure56, Bridge/approval and startup dependencies are BYTE IDENTICAL',()=>{
 for(const path of deps){
  const upstream=show(path),legacy=current(path);
  assert.equal(legacy,upstream,'DO_NOT_OVERWRITE_UPDATED_MAIN_DEPENDENCY: '+path);
 }
});
test('mobile alias routing changes ONLY the original composition import + final wrapper',()=>{
 const latest=show(original),candidate=current(original);
 assert.equal(candidate.split(importMobile).length,2,'one added mobile import');
 assert.equal(candidate.split(newReturn).length,2,'one mobile wrapper');
 const reconstructed=candidate.replace(importMobile,'').replace(newReturn,oldReturn);
 assert.equal(reconstructed,latest,'EVERY OTHER COMPOSITION BYTE MUST MATCH LATEST MAIN');
 assert.equal((candidate.match(/patchJH168MobileWebCommands56\(/g)||[]).length,1);
 assert.equal((latest.match(/patchJH168MobileWebCommands56\(/g)||[]).length,0);
});
test('protected original main route metadata is not masquerading as migrated phone E2E',()=>{
 const raw=show('jh-server/server.mjs');
 const names=['navigate','snapshot','click','type','select','press_key','wait','back','screenshot'];
 for(const n of names){
  const at=raw.indexOf('  registerOAuthTool("life_web_'+n+'",{');
  assert.ok(at>=0);
  const end=raw.indexOf('  registerOAuthTool(',at+24);
  const body=raw.slice(at,end>at?end:at+3000);
  assert.ok(body.includes('browserTool('),
   'Original main unexpectedly changed; need fresh runtime audit: '+n);
 }
 // New signed RIGHT handling is reviewed separately, not active in main.
 assert.equal(current(root+'jh168-mobile-unification/mobile-web-tool-patch.mjs')
  .includes('Never silently switch to the unrelated cloud Chromium profile'),true);
});
test('release boundaries remain NOT_RUN until full 13 phone validation',()=>{
 const audit=current(root+'jh168-mobile-unification/JH168-MOBILE-13-DEFECT-LEDGER.md');
 for(const rule of ['0/13','NOT_RUN','G12','G13','G14'])assert.ok(audit.includes(rule));
});
