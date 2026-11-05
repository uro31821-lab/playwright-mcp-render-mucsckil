import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('input failure stopped before build sign or phone effects',()=>{
  assert.equal(x.inputFailure.lastStep,'ANDROID_TESTS_AND_RELEASE_BUILD');
  assert.equal(x.inputFailure.reason,'GRADLE_BUILD_OR_TEST_FAILED_EXIT_1');
  assert.equal(x.inputFailure.sourceCheck,'PASS');
  assert.equal(x.inputFailure.originalCertificateSearch,'MATCH');
  assert.equal(x.inputFailure.securityGate,'PASS_SAFE');
  assert.equal(x.inputFailure.build,'NOT_RUN');
  assert.equal(x.inputFailure.signing,'NOT_RUN');
  assert.equal(x.inputFailure.phoneInstall,'NOT_RUN');
  assert.equal(x.inputFailure.phoneReadback,'NOT_RUN');
});

test('FIX1 addresses the exact Kotlin expression-body direct-return blocker',()=>{
  assert.equal(x.rootCause.classification,'KOTLIN_EXPRESSION_BODY_DIRECT_RETURN');
  assert.match(x.rootCause.compilerMessage,/returns are not allowed/);
  assert.equal(x.repair.newForm,'if (matches) execute else gate ?: when');
  assert.equal(x.verification.beforeRegression,'EXPECTED_COMPILE_FAIL_EXACT_MESSAGE');
  assert.equal(x.verification.afterRegression,'3/3 PASS');
  assert.equal(x.verification.tripAndroid35FocusedCompile,'PASS');
});

test('merged app identity and feature safety remain intact',()=>{
  assert.equal(x.repair.versionCode,168);
  assert.equal(x.repair.versionName,'jh168-stage62-trip-location-native-select-fix3-keepalive-fix1');
  assert.equal(x.repair.permissionsChanged,false);
  assert.equal(x.repair.serverChanged,false);
  assert.equal(x.repair.automaticReplayChanged,false);
  assert.equal(x.safety.backgroundLocationPermission,false);
});

test('artifact is short-path source-only and pinned',()=>{
  assert.equal(x.artifact.name,'JH73_TRIP_FIX1.zip');
  assert.match(x.artifact.sha256,/^[0-9a-f]{64}$/);
  assert.equal(x.artifact.zipCrc,'PASS');
  assert.equal(x.artifact.freshExtractExact,true);
  assert.ok(x.artifact.maxInternalPath<=111);
  assert.equal(x.artifact.rootLauncher,'INSTALL.cmd');
  assert.equal(x.artifact.apkBundled,false);
  assert.equal(x.artifact.secretSigningMaterialBundled,false);
  assert.match(x.integrity.sourceManifestSha256,/^[0-9a-f]{64}$/);
  assert.match(x.integrity.validationManifestSha256,/^[0-9a-f]{64}$/);
});

test('installer remains one explicit update with original certificate',()=>{
  assert.match(x.safety.originalCertificateSha256,/^[0-9a-f]{64}$/);
  assert.equal(x.safety.newSigningKeyAllowed,false);
  assert.equal(x.safety.uninstallAllowed,false);
  assert.equal(x.safety.dataResetAllowed,false);
  assert.equal(x.safety.automaticReinstallAllowed,false);
  assert.equal(x.safety.install,'ONE_EXPLICIT_Y_THEN_ADB_INSTALL_R');
});

test('server remains Stage71 Android-manual with no deploy',()=>{
  assert.equal(x.server.routingModel,'ANDROID_THEN_MANUAL');
  assert.equal(x.server.renderStatus,'live');
  assert.equal(x.server.newDeployRequired,false);
});
