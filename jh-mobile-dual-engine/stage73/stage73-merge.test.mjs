import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const x=JSON.parse(fs.readFileSync(new URL('./current.json',import.meta.url),'utf8'));

test('Stage73 blocked result is retained instead of being retried',()=>{
  assert.equal(x.status,'BLOCKED_SUPERSEDED_BY_STAGE75_FIX1');
  assert.equal(x.inputResult.status,'BLOCKED');
  assert.equal(x.inputResult.lastStep,'ANDROID_TESTS_AND_RELEASE_BUILD');
  assert.equal(x.inputResult.reason,'GRADLE_BUILD_OR_TEST_FAILED_EXIT_1');
  assert.equal(x.inputResult.phoneInstall,'NOT_RUN');
  assert.equal(x.inputResult.phoneReadback,'NOT_RUN');
  assert.equal(x.phoneEffect,false);
  assert.equal(x.serverEffect,false);
});

test('failed Stage73 delivery is explicitly retired in favor of Stage75',()=>{
  assert.equal(x.mustNotRerun,'JH73_TRIP_INSTALL_FIXED.zip');
  assert.match(x.rootCause,/expression-bodied function/);
  assert.equal(x.supersededBy,'JH168-STAGE62-TRIP-LOCATION-NATIVE-SELECT-FIX3-KEEPALIVE-FIX1-20261105');
  assert.equal(x.next,'USE_STAGE75_FIX1_ONLY');
});
