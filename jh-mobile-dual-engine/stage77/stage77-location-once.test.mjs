import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('ordinary location questions use one-shot location by default',()=>{
  assert.equal(x.status,'READY_FOR_WINDOWS_BUILD_SIGN_INSTALL');
  assert.equal(x.userDecision,'LOCATION_DEPENDENT_QUESTIONS_USE_ONE_SHOT_CURRENT_LOCATION_BY_DEFAULT');
  assert.equal(x.behavior.default,'location_once');
  assert.equal(x.behavior.statusAction,'location_once_status');
  assert.equal(x.behavior.continuousTripMode,'PRESERVED_OPTIONAL_EXPLICIT_ONLY');
});

test('one-shot path starts neither trip session nor location foreground service',()=>{
  assert.equal(x.behavior.tripSessionStarted,false);
  assert.equal(x.behavior.locationForegroundServiceStarted,false);
  assert.equal(x.behavior.backgroundLocationPermissionRequested,false);
  assert.equal(x.behavior.locationHistoryStored,false);
  assert.equal(x.behavior.resultRetention,'PROCESS_MEMORY_ONE_STATUS_READ_OR_120_SECONDS');
});

test('request correlation and tap fallback are fail-closed',()=>{
  assert.equal(x.behavior.strictRequestCorrelation,true);
  assert.equal(x.behavior.userTapFallback,true);
  assert.equal(x.behavior.appOpenFallback,'PENDING_REQUEST_ONLY');
  assert.equal(x.safety.automaticReplayAllowed,false);
});

test('source-only package is short-path, CRC checked and pinned',()=>{
  assert.equal(x.artifact.name,'JH77_LOCATION_ONCE.zip');
  assert.match(x.artifact.sha256,/^[0-9a-f]{64}$/);
  assert.equal(x.artifact.zipCrc,'PASS');
  assert.ok(x.artifact.maxInternalPath<=120);
  assert.equal(x.artifact.apkBundled,false);
  assert.equal(x.artifact.secretSigningMaterialBundled,false);
  assert.match(x.integrity.sourceManifestSha256,/^[0-9a-f]{64}$/);
  assert.match(x.integrity.validationManifestSha256,/^[0-9a-f]{64}$/);
});

test('all prebuild checks passed before Windows release boundary',()=>{
  assert.equal(x.prebuild.combinedPolicyRegression,'22/22 PASS');
  assert.equal(x.prebuild.oneShotPolicyMemory,'9/9 PASS');
  assert.equal(x.prebuild.transportRouting,'1/1 PASS');
  assert.equal(x.prebuild.android35FocusedCompile,'PASS');
  assert.equal(x.prebuild.staticAudit,'18/18 PASS');
  assert.equal(x.prebuild.installerAudit,'16/16 PASS');
  assert.equal(x.prebuild.freshExtractHashAudit,'PASS');
  assert.equal(x.prebuild.conflictMarkers,0);
});

test('plugin is updated without claiming Android install',()=>{
  assert.equal(x.plugin.version,'1.32.9');
  assert.equal(x.plugin.defaultLocationRule,'ON_DEMAND_ONE_SHOT');
  assert.equal(x.plugin.continuousMode,'EXPLICIT_ONLY');
  assert.equal(x.currentPhone.unchangedUntilInstall,true);
});

test('release remains original-certificate update-only',()=>{
  assert.match(x.safety.originalCertificateSha256,/^[0-9a-f]{64}$/);
  assert.equal(x.safety.newSigningKeyAllowed,false);
  assert.equal(x.safety.uninstallAllowed,false);
  assert.equal(x.safety.dataResetAllowed,false);
  assert.equal(x.safety.install,'ONE_EXPLICIT_Y_THEN_ADB_INSTALL_R');
  assert.equal(x.server.newDeployRequired,false);
});
