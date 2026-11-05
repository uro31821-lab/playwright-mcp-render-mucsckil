import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(rel)=>JSON.parse(fs.readFileSync(new URL(rel,import.meta.url),'utf8'));
const x=read('./current.json');
const superseded=x.status==='SUPERSEDED_BY_STAGE78_FIX1';
const active=superseded?read('../stage78/current.json'):x;

test('Stage77 is either the original ready candidate or explicitly superseded by Stage78 FIX1',()=>{
  assert.ok(['READY_FOR_WINDOWS_BUILD_SIGN_INSTALL','SUPERSEDED_BY_STAGE78_FIX1'].includes(x.status));
  if(superseded){
    assert.equal(x.inputResult.status,'BLOCKED');
    assert.equal(x.inputResult.lastStep,'ANDROID_TESTS_AND_RELEASE_BUILD');
    assert.equal(x.inputResult.androidBuild,'NOT_RUN');
    assert.equal(x.inputResult.signing,'NOT_RUN');
    assert.equal(x.inputResult.phoneInstall,'NOT_RUN');
    assert.equal(x.inputResult.phoneReadback,'NOT_RUN');
    assert.equal(x.rootCause.type,'BUILD_SOURCE_MISSING_PARENT_FILE');
    assert.equal(x.rootCause.phoneEffect,false);
    assert.equal(x.rootCause.automaticReplay,false);
    assert.equal(x.rejectedArtifact.mustNotUse,true);
    assert.equal(x.replacement.stage,78);
    assert.equal(x.replacement.artifact,'JH77_LOCATION_ONCE_FIX1.zip');
  }
});

test('ordinary location questions remain one-shot and continuous travel remains optional',()=>{
  if(!superseded){
    assert.equal(active.userDecision,'LOCATION_DEPENDENT_QUESTIONS_USE_ONE_SHOT_CURRENT_LOCATION_BY_DEFAULT');
    assert.equal(active.behavior.default,'location_once');
    assert.equal(active.behavior.statusAction,'location_once_status');
    assert.equal(active.behavior.continuousTripMode,'PRESERVED_OPTIONAL_EXPLICIT_ONLY');
  }else{
    assert.match(active.candidate,/LOCATION-ONCE/);
    assert.equal(active.plugin.version,'1.32.9');
    assert.equal(active.plugin.changeRequired,false);
  }
});

test('one-shot path starts neither trip session nor location foreground service',()=>{
  if(!superseded){
    assert.equal(active.behavior.tripSessionStarted,false);
    assert.equal(active.behavior.locationForegroundServiceStarted,false);
    assert.equal(active.behavior.backgroundLocationPermissionRequested,false);
    assert.equal(active.behavior.locationHistoryStored,false);
    assert.equal(active.behavior.resultRetention,'PROCESS_MEMORY_ONE_STATUS_READ_OR_120_SECONDS');
  }else{
    assert.equal(active.privacy.tripSessionStartedByLocationOnce,false);
    assert.equal(active.privacy.locationForegroundServiceStartedByLocationOnce,false);
    assert.equal(active.privacy.backgroundLocationPermission,false);
    assert.equal(active.privacy.locationHistoryStored,false);
    assert.equal(active.privacy.resultRetention,'PROCESS_MEMORY_ONE_STATUS_READ_OR_120_SECONDS');
  }
});

test('source-only active package is short-path, CRC checked and pinned',()=>{
  assert.match(active.artifact.sha256,/^[0-9a-f]{64}$/);
  assert.equal(active.artifact.zipCrc,'PASS');
  assert.ok(active.artifact.maxInternalPath<=120);
  assert.equal(active.artifact.apkBundled,false);
  assert.equal(active.artifact.secretSigningMaterialBundled,false);
  assert.match(active.integrity.sourceManifestSha256,/^[0-9a-f]{64}$/);
  assert.match(active.integrity.validationManifestSha256,/^[0-9a-f]{64}$/);
  if(superseded){
    assert.equal(active.artifact.name,'JH77_LOCATION_ONCE_FIX1.zip');
    assert.equal(active.artifact.freshExtractHashAudit,'PASS');
    assert.equal(active.verification.parentSourceClosure,'PASS_NO_MISSING_PARENT_SOURCES');
  }else{
    assert.equal(active.artifact.name,'JH77_LOCATION_ONCE.zip');
  }
});

test('active candidate has the required focused prebuild evidence',()=>{
  if(!superseded){
    assert.equal(active.prebuild.combinedPolicyRegression,'22/22 PASS');
    assert.equal(active.prebuild.oneShotPolicyMemory,'9/9 PASS');
    assert.equal(active.prebuild.transportRouting,'1/1 PASS');
    assert.equal(active.prebuild.android35FocusedCompile,'PASS');
    assert.equal(active.prebuild.staticAudit,'18/18 PASS');
    assert.equal(active.prebuild.installerAudit,'16/16 PASS');
    assert.equal(active.prebuild.freshExtractHashAudit,'PASS');
  }else{
    assert.equal(active.verification.locationPureJUnit,'9/9 PASS_NEW');
    assert.equal(active.verification.visualOneShotCore,'8/8 PASS_NEW');
    assert.equal(active.verification.combinedLocationPolicy,'22/22 PASS_REUSED');
    assert.equal(active.verification.transportRouting,'1/1 PASS_REUSED');
    assert.equal(active.verification.android35FocusedCompile,'PASS_REUSED');
    assert.equal(active.verification.installerStaticAudit,'19/19 PASS_NEW');
    assert.equal(active.verification.windowsFullGradle,'REQUIRED');
  }
});

test('release remains original-certificate update-only with no server deploy',()=>{
  assert.match(active.safety.originalCertificateSha256,/^[0-9a-f]{64}$/);
  assert.equal(active.safety.newSigningKeyAllowed,false);
  assert.equal(active.safety.uninstallAllowed,false);
  assert.equal(active.safety.dataResetAllowed,false);
  assert.equal(active.safety.automaticReplayAllowed,false);
  assert.equal(active.safety.install,'ONE_EXPLICIT_Y_THEN_ADB_INSTALL_R');
  assert.equal(active.server.newDeployRequired,false);
});
