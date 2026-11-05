import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('merged candidate preserves current native FIX3 lineage and adds TripLocation',()=>{
  assert.equal(x.status,'READY_FOR_WINDOWS_BUILD_SIGN_INSTALL');
  assert.equal(x.merge.versionCode,168);
  assert.equal(x.merge.versionName,'jh168-stage62-trip-location-native-select-fix3-keepalive');
  assert.match(x.merge.installedParent,/native-select-pick-fix3-keepalive/);
  assert.match(x.merge.tripSource,/TRIP-LOCATION/);
  assert.equal(x.prebuildVerification.tripDecisionPolicy,'7/7 PASS');
  assert.equal(x.prebuildVerification.nativeSelectPolicy,'3/3 PASS');
  assert.equal(x.prebuildVerification.mergedStaticAudit,'22/22 PASS');
});

test('corrected delivery is source-only, short-path and cryptographically pinned',()=>{
  assert.equal(x.artifact.name,'JH73_TRIP_INSTALL_FIXED.zip');
  assert.match(x.artifact.sha256,/^[0-9a-f]{64}$/);
  assert.equal(x.artifact.zipCrc,'PASS');
  assert.equal(x.artifact.apkBundled,false);
  assert.equal(x.artifact.secretSigningMaterialBundled,false);
  assert.equal(x.artifact.installerType,'BUILD_SIGN_INSTALL_LAUNCHER');
  assert.equal(x.artifact.rootLauncher,'INSTALL.cmd');
  assert.equal(x.artifact.rootReadme,'00_README_FIRST.txt');
  assert.equal(x.artifact.outerWrapperDirectory,false);
  assert.ok(x.artifact.maxInternalPath<=120);
  assert.equal(x.artifact.shortPathDeliveryVerified,true);
  assert.match(x.merge.sourceManifestSha256,/^[0-9a-f]{64}$/);
  assert.match(x.merge.validationManifestSha256,/^[0-9a-f]{64}$/);
});

test('rejected long-path delivery is explicitly blocked',()=>{
  assert.equal(x.rejectedDelivery.mustNotUse,true);
  assert.match(x.rejectedDelivery.reason,/Long outer wrapper directory/);
  assert.notEqual(x.rejectedDelivery.sha256,x.artifact.sha256);
});

test('Stage71 server is reused with Android-manual routing and no deploy',()=>{
  assert.equal(x.server.routingModel,'ANDROID_THEN_MANUAL');
  assert.equal(x.server.renderStatus,'live');
  assert.equal(x.server.newDeployRequired,false);
});

test('location and install safety remain fail-closed',()=>{
  assert.equal(x.permissions.backgroundLocation,false);
  assert.equal(x.permissions.locationMode,'APP_IN_USE_ONLY');
  assert.equal(x.permissions.remotePermissionGrant,false);
  assert.equal(x.permissions.remoteTripStart,false);
  assert.equal(x.safety.newSigningKeyAllowed,false);
  assert.equal(x.safety.uninstallAllowed,false);
  assert.equal(x.safety.dataResetAllowed,false);
  assert.equal(x.safety.automaticReinstallAllowed,false);
  assert.equal(x.safety.install,'ONE_EXPLICIT_Y_THEN_ADB_INSTALL_R');
  assert.match(x.safety.whyNoApkInZip,/built and signed on the verified Windows signing PC/);
});
