import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));
const s77=JSON.parse(fs.readFileSync(new URL('../stage77/current.json',import.meta.url),'utf8'));

test('broken Stage77 package is explicitly superseded without phone replay',()=>{
  assert.equal(s77.status,'SUPERSEDED_BY_STAGE78_FIX1');
  assert.equal(s77.inputResult.status,'BLOCKED');
  assert.equal(s77.inputResult.phoneInstall,'NOT_RUN');
  assert.equal(s77.inputResult.phoneReadback,'NOT_RUN');
  assert.equal(s77.rootCause.phoneEffect,false);
  assert.equal(s77.rootCause.automaticReplay,false);
  assert.equal(s77.rejectedArtifact.mustNotUse,true);
});

test('FIX1 restores the exact missing parent source and changes no production logic',()=>{
  assert.equal(x.rootCause.type,'BUILD_SOURCE_MISSING_PARENT_FILE');
  assert.equal(x.rootCause.path,'app/src/main/java/com/koreanlifehub/bridge/VisualOneShotAnalysis.kt');
  assert.equal(x.rootCause.restoredFromInstalledParent,true);
  assert.match(x.rootCause.restoredSha256,/^[0-9a-f]{64}$/);
  assert.equal(x.rootCause.productionLogicChanged,false);
  assert.equal(x.verification.parentSourceClosure,'PASS_NO_MISSING_PARENT_SOURCES');
  assert.equal(x.integrity.sourceFiles,440);
});

test('focused source regressions pass and cloud cache gap is not claimed as source success',()=>{
  assert.equal(x.verification.locationPureJUnit,'9/9 PASS_NEW');
  assert.equal(x.verification.visualOneShotCore,'8/8 PASS_NEW');
  assert.equal(x.verification.installerStaticAudit,'19/19 PASS_NEW');
  assert.equal(x.verification.cloudFullGradle,'BLOCKED_MISSING_OFFLINE_DEPENDENCIES_NOT_SOURCE_FAILURE');
  assert.equal(x.verification.windowsFullGradle,'REQUIRED');
});

test('delivery is source-only, short-path and cryptographically pinned',()=>{
  assert.equal(x.status,'READY_FOR_WINDOWS_BUILD_SIGN_INSTALL');
  assert.equal(x.artifact.name,'JH77_LOCATION_ONCE_FIX1.zip');
  assert.match(x.artifact.sha256,/^[0-9a-f]{64}$/);
  assert.equal(x.artifact.zipCrc,'PASS');
  assert.equal(x.artifact.freshExtractHashAudit,'PASS');
  assert.ok(x.artifact.maxInternalPath<=120);
  assert.equal(x.artifact.apkBundled,false);
  assert.equal(x.artifact.secretSigningMaterialBundled,false);
  for(const v of [x.integrity.sourceManifestSha256,x.integrity.validationManifestSha256,x.integrity.packageContentManifestSha256]) assert.match(v,/^[0-9a-f]{64}$/);
});

test('location-once privacy and install safety remain fail-closed',()=>{
  assert.equal(x.privacy.backgroundLocationPermission,false);
  assert.equal(x.privacy.tripSessionStartedByLocationOnce,false);
  assert.equal(x.privacy.locationForegroundServiceStartedByLocationOnce,false);
  assert.equal(x.privacy.locationHistoryStored,false);
  assert.equal(x.safety.newSigningKeyAllowed,false);
  assert.equal(x.safety.uninstallAllowed,false);
  assert.equal(x.safety.dataResetAllowed,false);
  assert.equal(x.safety.automaticReplayAllowed,false);
  assert.equal(x.safety.install,'ONE_EXPLICIT_Y_THEN_ADB_INSTALL_R');
});

test('plugin and server do not require another update for this source-closure repair',()=>{
  assert.equal(x.plugin.version,'1.32.9');
  assert.equal(x.plugin.changeRequired,false);
  assert.equal(x.server.routingModel,'ANDROID_THEN_MANUAL');
  assert.equal(x.server.newDeployRequired,false);
});
