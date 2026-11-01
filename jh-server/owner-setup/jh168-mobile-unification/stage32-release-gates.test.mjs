import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assessStage32} from './stage32-release-gates.mjs';
const file=new URL('./stage32-inspection-evidence.json',import.meta.url);
const evidence=JSON.parse(readFileSync(file,'utf8'));
const run=()=>assessStage32(evidence);
const codes=result=>result.blockingConditions.map(x=>x.code);
test('real Render/GitHub observation is pinned, read-only, with no rollout',()=>{
 const v=run();
 assert.equal(v.sourceReviewOnly,true);
 assert.equal(v.existingRenderServiceTouched,false);
 assert.equal(v.deploymentPermitted,false);
 assert.equal(v.liveMigrationPermitted,false);
 assert.equal(v.existingClickReexecutionPermitted,false);
 assert.equal(v.knownLiveCommit,'473e8ed20b5d651d7c05f05c2af97f1779038ecb');
 assert.equal(evidence.render.generatedRuntimeSha256,
   '7d2f120cb4a7f0f730d638e53e65a8ead342d0ca3833f05e33947568adb8121c');
 assert.equal(evidence.render.autoDeploy,'no');
 assert.equal(evidence.render.disk.provisionedGB,1);
});
test('unknown owner journal count and disk capacity both block live migration',()=>{
 const c=codes(run());
 assert.ok(c.includes('ORIGINAL_MANUAL_CIRCUIT_PENDING_COUNT_UNKNOWN'));
 assert.ok(c.includes('OWNER_DISK_FREE_SPACE_OR_SNAPSHOT_MARGIN_UNKNOWN'));
 assert.ok(c.includes('PRIVATE_OWNER_DISK_BACKUP_NOT_ATTESTED'));
});
test('57 quarantined trust entries are NOT 57 manual-circuit unknowns',()=>{
 const r=run(),c=codes(r);
 assert.equal(r.trustRecoveryCountIsNotManualCircuitCount,true);
 assert.equal(evidence.render.recoveryQuarantineObservation.ledgerKind,'TRUST_RECOVERY');
 assert.equal(evidence.render.disk.liveOwnerJournalUncertainCount,null);
 assert.ok(c.includes('TRUST_RECOVERY_QUARANTINE_SEPARATE_REVIEW'));
});
test('source stack remains unmerged and behind current main; no automatic deploy',()=>{
 const c=codes(run());
 assert.ok(c.includes('STAGE29_30_31_UNMERGED_REVIEW'));
 assert.ok(c.includes('STAGED_BRANCH_BEHIND_LATEST_MAIN'));
 assert.equal(evidence.github.legacyPlaywrightConsolidation.scope,'SEPARATE_UNRELATED_9_AND_4');
 assert.equal(evidence.github.stage28SeparatePr.alreadyInStage29Ancestry,true);
});
test('Stage25 and Stage26 live flags are not Stage29/30/31 activation proof',()=>{
 const c=codes(run());
 assert.equal(evidence.render.startupFlagsObserved.stage25Followup,true);
 assert.equal(evidence.render.startupFlagsObserved.stage26IdenticalAck,true);
 assert.equal(evidence.render.startupFlagsObserved.stage29Active,false);
 assert.ok(c.includes('ATOMIC_SIGNED_ORIGINAL_HOST_NOT_ACTIVATED'));
 assert.ok(c.includes('OWNER_SQLITE_STAGE29_ADDON_NOT_MIGRATED'));
 assert.ok(c.includes('ORIGINAL_OWNER_AUTHENTICATED_READBACK_API_NOT_VERIFIED'));
});
test('identity change and fabricated positive CI do not bypass original service',()=>{
 for(const edit of [
   e=>e.render.serviceId='other-service',
   e=>e.render.autoDeploy='yes',
   e=>e.github.prStack[0].number=72,
   e=>e.github.ci[1].conclusion='not_run',
   e=>e.render.latestLiveDeploy.commit='untrusted'
 ]){
  const item=structuredClone(evidence);edit(item);
  assert.throws(()=>assessStage32(item),/STAGE32_/);
 }
});
test('all owner-side check booleans cannot authorize actions through this report',()=>{
 const item=structuredClone(evidence);
 item.github.stage31BehindMainCommits=0;
 item.github.prStack.forEach(x=>{x.draft=false;x.merged=true});
 item.render.disk.availableBytes=Number.MAX_SAFE_INTEGER;
 item.render.disk.liveOwnerJournalUncertainCount=0;
 item.render.disk.backupCapacityVerified=true;
 item.render.startupFlagsObserved.operatorEnvironmentExactRead=true;
 item.render.recoveryQuarantineObservation.count=0;
 item.render.privateOwnerBackupPolicyReviewed=true;
 item.render.actualDiskSnapshotVerified=true;
 Object.keys(item.releaseReadiness).forEach(k=>item.releaseReadiness[k]=true);
 const out=assessStage32(item);
 // A report is not executable authorization, even with fabricated green booleans.
 assert.equal(out.deploymentPermitted,false);
 assert.equal(out.liveMigrationPermitted,false);
 assert.equal(out.protectedAndroidActionPermitted,false);
 assert.equal(out.existingClickReexecutionPermitted,false);
});
test('historical exact review commits remain available as evidence after current-main content replay',()=>{
 const seq=[
 '473e8ed20b5d651d7c05f05c2af97f1779038ecb',
 '6cf8ad81ab84ba5366341a190435696103dfdfe8',
 'e852d735e70b763ab10c5924a8de96f9e93a7e51',
 'b213600c126063a9e1f49cb1d4cb1abaf8c8cfcd',
 '2b6ab1a918e837211d586dcc547885580c998e29'
 ];
 for(const sha of seq){
  // Rebased review HEAD does NOT make former feature commits ancestors.
  const p=spawnSync('git',['cat-file','-t',sha],{encoding:'utf8'});
  assert.equal(p.status,0,sha+' '+p.stderr);
  assert.equal(p.stdout.trim(),'commit');
 }
});
test('source is pure and cannot invoke phone or network effect tools',()=>{
 const text=readFileSync(new URL('./stage32-release-gates.mjs',import.meta.url),'utf8');
 for(const s of ['registerOAuthTool(','httpServer.listen(','executeRightPane(',
     'spawnSync(','execFileSync(','trigger_deploy(','update_environment_variables('])
  assert.equal(text.includes(s),false,s);
});
