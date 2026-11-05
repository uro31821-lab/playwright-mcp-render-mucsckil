import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('Stage72 blocks obsolete Stage61 InstallOnly over current Stage62 FIX3',()=>{
  assert.equal(x.status,'SKIP_INSTALL_SUPERSEDED_BY_CURRENT_APP');
  assert.equal(x.currentPhone.secureActive,true);
  assert.equal(x.currentPhone.deviceResponded,true);
  assert.equal(x.currentPhone.appVersionCode,168);
  assert.match(x.currentPhone.appVersionName,/stage62.*fix3/i);
  assert.equal(x.installOnlyBundle.targetVersionCode,168);
  assert.match(x.installOnlyBundle.candidate,/STAGE61/);
  assert.equal(x.decision.installNow,false);
});

test('server remains live Stage71 Android-manual baseline',()=>{
  assert.equal(x.serverBaseline.runtimeCommit,'a06e4643a036fa7cc121ef997bc332a43f2f85df');
  assert.equal(x.serverBaseline.renderStatus,'live');
  assert.equal(x.serverBaseline.routingModel,'ANDROID_THEN_MANUAL');
});

test('safety stays fail-closed with no rebuild, uninstall, reset or auto reinstall',()=>{
  assert.equal(x.decision.rebuildRequired,false);
  assert.equal(x.decision.uninstallAllowed,false);
  assert.equal(x.decision.dataResetAllowed,false);
  assert.equal(x.decision.automaticReinstallAllowed,false);
});
