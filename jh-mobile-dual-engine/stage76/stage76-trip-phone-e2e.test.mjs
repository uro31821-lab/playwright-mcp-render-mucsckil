import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('installed FIX1 identity and Secure Bridge are verified',()=>{
  assert.equal(x.status,'COMPLETE');
  assert.equal(x.app.versionCode,168);
  assert.equal(x.app.versionName,'jh168-stage62-trip-location-native-select-fix3-keepalive-fix1');
  assert.equal(x.app.secureBridgeActive,true);
  assert.deepEqual(x.app.tripCapabilities,[
    'TRIP_LOCATION_SESSION_V1','TRIP_AGENT_ACTIONS_V1'
  ]);
  assert.equal(x.installation.phoneInstall,'UPDATE_ACCEPTED');
  assert.equal(x.installation.phoneIdentityReadback,'PASS');
});

test('trip start requires user tap and becomes active only after it',()=>{
  assert.equal(x.tripPhoneE2E.initialStatus,'trip_inactive');
  assert.equal(x.tripPhoneE2E.startPrompt,'trip_start_user_tap_required');
  assert.equal(x.tripPhoneE2E.userTappedStartNotification,true);
  assert.equal(x.tripPhoneE2E.activeAfterTap,true);
  assert.equal(x.tripPhoneE2E.serviceRunningAfterTap,true);
});

test('location and notification path are verified without background permission',()=>{
  assert.equal(x.tripPhoneE2E.locationPermission,true);
  assert.equal(x.tripPhoneE2E.notificationPermission,true);
  assert.equal(x.tripPhoneE2E.locationEnabled,true);
  assert.equal(x.tripPhoneE2E.backgroundLocationPermissionRequested,false);
  assert.equal(x.tripPhoneE2E.locationHistoryStored,false);
  assert.equal(x.tripPhoneE2E.locationFixReceived,true);
  assert.ok(x.tripPhoneE2E.locationAccuracyMetersMax<=20);
  assert.equal(x.tripPhoneE2E.keepAliveHeartbeatObserved,true);
  assert.equal(x.tripPhoneE2E.deviceNotificationPosted,true);
  assert.equal(x.tripPhoneE2E.notificationReceipt,'USER_CONFIRMED');
});

test('trip stop clears active service and final status is inactive',()=>{
  assert.equal(x.tripPhoneE2E.stopResult,'trip_stopped');
  assert.equal(x.tripPhoneE2E.finalStatus,'trip_inactive');
  assert.equal(x.tripPhoneE2E.activeAfterStop,false);
  assert.equal(x.tripPhoneE2E.serviceRunningAfterStop,false);
});

test('privacy and routing remain fail-closed',()=>{
  assert.equal(x.privacy.exactCoordinatesPersistedInCheckpoint,false);
  assert.equal(x.privacy.backgroundLocationPermission,false);
  assert.equal(x.privacy.locationHistoryLongTermStorage,false);
  assert.equal(x.privacy.automaticRestartAfterForceStopOrReboot,false);
  assert.equal(x.server.routingModel,'ANDROID_THEN_MANUAL');
  // Validate every active-route count reported by this checkpoint schema.
  const routeCounts=Object.entries(x.server)
    .filter(([name])=>name.endsWith('ActiveRoutes'));
  assert.equal(routeCounts.length,1,'checkpoint must report exactly one active-route count');
  for(const [name,count] of routeCounts){
    assert.ok(Number.isSafeInteger(count),name+' must be an integer count');
    assert.equal(count,0,name+' must remain zero');
  }
  assert.equal(x.server.newDeployRequired,false);
  assert.equal(x.finalDecision,'TRIP_LOCATION_ANDROID_EXECUTION_COMPLETE');
});
