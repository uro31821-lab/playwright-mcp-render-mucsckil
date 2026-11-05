import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('Stage72 is install-only and never rebuilds or resigns',()=>{
  assert.equal(x.status,'READY_FOR_LOCAL_INSTALL_ONLY');
  assert.equal(x.safety.rebuildRequired,false);
  assert.equal(x.safety.newSigningKeyAllowed,false);
  assert.equal(x.safety.uninstallAllowed,false);
  assert.equal(x.safety.dataResetAllowed,false);
  assert.equal(x.safety.automaticReinstallAllowed,false);
});

test('server baseline remains Stage71 Android-manual live baseline',()=>{
  assert.equal(x.serverBaseline.mergeCommit,'a06e4643a036fa7cc121ef997bc332a43f2f85df');
  assert.equal(x.serverBaseline.routingModel,'ANDROID_THEN_MANUAL');
  assert.equal(x.serverBaseline.renderStatus,'live');
});

test('installer bundle is launcher-only and pinned to existing signed v168 artifact',()=>{
  assert.equal(x.installOnlyBundle.containsApk,false);
  assert.equal(x.installOnlyBundle.package,'com.koreanlifehub.bridge');
  assert.equal(x.installOnlyBundle.versionCode,168);
  assert.match(x.installOnlyBundle.expectedCertificateSha256,/^[0-9a-f]{64}$/);
  assert.match(x.installOnlyBundle.expectedSourceManifestSha256,/^[0-9a-f]{64}$/);
  assert.equal(x.safety.installCommand,'adb install -r <verified signed APK>');
});
