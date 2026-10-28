import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {inspectLegacyJHFiles,describeCutoverEvidence,CUTOVER_REQUIREMENTS}
  from './cutover-audit.mjs';
const root=path.resolve(import.meta.dirname,'../../../..');
test('existing JH web, payment and general-work Playwright references are inventoried',()=>{
  const r=inspectLegacyJHFiles(root);
  assert.equal(r.inspectedModules,7);
  assert.deepEqual(r.dependencies.filter(x=>x.missingSource),[]);
  assert.ok(r.dependencies.some(x=>x.id==='PAYMENT_EVALUATION'&&x.present));
  assert.ok(r.dependencies.some(x=>x.id==='WEB_INTERACTION'&&x.present));
  assert.ok(r.dependencies.some(x=>x.id==='LEGACY_RIGHT_PANE_ROUTING'&&x.present));
  assert.equal(r.canRemovePlaywrightNow,false);
});
test('even a forged complete checklist cannot grant deployment',()=>{
 const r=describeCutoverEvidence({verifiedRequirements:[...CUTOVER_REQUIREMENTS]});
 assert.equal(r.verifiedRequirements,CUTOVER_REQUIREMENTS.length);
 assert.equal(r.deployAuthorized,false);
 assert.equal(r.automaticServiceShutdown,false);
});
test('a passing Android unit suite is not payment/browser or signature parity',()=>{
 const r=describeCutoverEvidence({verifiedRequirements:[
   'UNFOLDED_LEFT_WEB_RIGHT_GPT_E2E',
   'CLICK_TYPE_SCROLL_AND_RESULT_E2E'
 ]});
 assert.ok(r.missing.includes('PAYMENT_BROWSER_REPLACEMENT_VERIFIED'));
 assert.ok(r.missing.includes('ORIGINAL_SIGNATURE_BUILD_VERIFIED'));
 assert.ok(r.missing.includes('NO_LEGACY_PLAYWRIGHT_DISPATCH_LEFT'));
 assert.equal(r.deployAuthorized,false);
});
