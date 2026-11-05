import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('installed app exposes the location_once capabilities',()=>{
  assert.equal(x.status,'COMPLETE');
  assert.equal(x.installedApp.versionCode,168);
  assert.equal(x.installedApp.versionName,'jh168-stage77-location-once-native-select-fix3-keepalive-fix1');
  assert.equal(x.installedApp.secure56,true);
  assert.ok(x.installedApp.capabilities.includes('LOCATION_ONCE_V1'));
  assert.ok(x.installedApp.capabilities.includes('LOCATION_ONCE_TAP_FALLBACK_V1'));
});

test('Windows build, original signing, update install and identity readback passed',()=>{
  assert.equal(x.inputResult.androidBuild,'PASS');
  assert.equal(x.inputResult.originalKeySigning,'PASS');
  assert.equal(x.inputResult.phoneInstall,'UPDATE_ACCEPTED');
  assert.match(x.inputResult.phoneReadback,/IDENTITY_READBACK_PASS/);
});

test('exactly one one-shot location request succeeded without starting a trip service',()=>{
  assert.equal(x.phoneE2E.locationOnceRequestCount,1);
  assert.equal(x.phoneE2E.result,'location_once_ok');
  assert.equal(x.phoneE2E.oneShot,true);
  assert.equal(x.phoneE2E.tripSessionStarted,false);
  assert.equal(x.phoneE2E.locationForegroundServiceStarted,false);
  assert.equal(x.phoneE2E.backgroundLocationPermissionRequested,false);
  assert.equal(x.phoneE2E.locationHistoryStored,false);
  assert.equal(x.phoneE2E.automaticReplay,false);
});

test('direct response leaves no retained status result and trip remains inactive',()=>{
  assert.equal(x.phoneE2E.resultRetention,'DIRECT_RESPONSE_THEN_NO_RETAINED_STATUS_RESULT');
  assert.equal(x.phoneE2E.followupStatus,'location_once_request_not_found');
  assert.equal(x.postCheck.tripStatus,'trip_inactive');
  assert.equal(x.postCheck.active,false);
  assert.equal(x.postCheck.serviceRunning,false);
  assert.equal(x.postCheck.locationHistoryStored,false);
});

test('checkpoint stores no exact coordinates or continuous tracking state',()=>{
  const raw=fs.readFileSync(new URL('./current.json',import.meta.url),'utf8');
  assert.equal(x.phoneE2E.exactCoordinatesStored,false);
  assert.equal(x.privacy.exactCoordinatesInCheckpoint,false);
  assert.equal(x.privacy.longTermLocationStorage,false);
  assert.equal(x.privacy.continuousTrackingStarted,false);
  assert.equal(x.privacy.alwaysAllowPermissionRequested,false);
  assert.doesNotMatch(raw,/latitude|longitude|33\.504|126\.522/i);
});

test('여비서 default is on-demand one-shot and continuous mode remains explicit only',()=>{
  assert.equal(x.plugin.version,'1.32.9');
  assert.equal(x.plugin.default,'ON_DEMAND_ONE_SHOT');
  assert.equal(x.plugin.continuousMode,'EXPLICIT_ONLY');
  assert.equal(x.server.routingModel,'ANDROID_THEN_MANUAL');
  assert.equal(x.server.renderDeployRequired,false);
  assert.equal(x.next,'LOCATION_ONCE_DEFAULT_READY_FOR_REAL_QUESTIONS');
});
