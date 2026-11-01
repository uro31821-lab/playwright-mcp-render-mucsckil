/**
 * Stage32 pure release review gate — never authorizes or triggers a deployment.
 *
 * The input is a read-only historical snapshot; no successful answer from this
 * function is proof of a current server/disk or owner-session state.
 * No filesystem, HTTP, Android, GitHub or Render mutation or secret input.
 */
const sha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const unknownCount=x=>Number.isSafeInteger(x)&&x>=0;
const fail=x=>Object.freeze({code:x,severity:'BLOCK_RELEASE'});
export function assessStage32(snapshot){
 if(!snapshot||snapshot.schema!=='JH168_STAGE32_DEPLOYMENT_INSPECTION_V1')
  throw Error('STAGE32_EVIDENCE_SCHEMA_REQUIRED');
 const r=snapshot.render,g=snapshot.github,v=snapshot.releaseReadiness;
 if(!r||!g||!v||r.serviceId!=='srv-db0fjl2d0e5s73be114g'||
    r.repository!=='uro31821-lab/playwright-mcp-render-mucsckil'||
    r.branch!=='jh-fix3-secure-server'||
    r.disk?.mountPath!=='/var/data'||
    r.autoDeploy!=='no'||r.nodeStartCommand!=='cd jh-server && npm start')
  throw Error('STAGE32_ORIGINAL_SERVICE_IDENTITY_MISMATCH');
 if(!sha(r.latestLiveDeploy?.commit)||!sha(g.mainHeadAtObservation)||
    ![g.stage29Head,g.stage30Head,g.stage31Head].every(sha)||
    !Array.isArray(g.prStack)||g.prStack.length!==3||
    g.prStack.map(x=>x.number).join(',')!=='93,94,96')
  throw Error('STAGE32_SOURCE_LINEAGE_INVALID');
 if(!Array.isArray(g.ci)||g.ci.length!==4||
    g.ci.some((x,i)=>x.stage!==i+28||x.conclusion!=='success'))
  throw Error('STAGE32_PRIOR_CI_EVIDENCE_INVALID');
 const blocks=[];
 const put=(condition,code)=>{if(condition)blocks.push(fail(code))};
 put(!snapshot.verifiedReadOnly,'LIVE_READ_ONLY_PROVENANCE_MISSING');
 put(r.latestLiveDeploy.status!=='live','LIVE_DEPLOY_IDENTITY_NOT_CONFIRMED');
 put(r.runningInstanceCount!==1,'ORIGINAL_SINGLE_INSTANCE_NOT_CONFIRMED');
 put(r.disk.provisionedGB!==1,'ORIGINAL_1GB_DISK_CONFIGURATION_CHANGED');
 put(r.startupFlagsObserved?.stage25Followup!==true||
     r.startupFlagsObserved?.stage26IdenticalAck!==true||
     r.startupFlagsObserved?.automaticReplay!==false,
     'ORIGINAL_STAGE25_STAGE26_SECURE_RUNTIME_NOT_CONFIRMED');
 put(r.startupFlagsObserved?.operatorEnvironmentExactRead!==true,
     'PRODUCTION_OPERATOR_FLAGS_NOT_INDEPENDENTLY_READ');
 put(g.stage31BehindMainCommits!==0,'STAGED_BRANCH_BEHIND_LATEST_MAIN');
 put(g.prStack.some(x=>x.draft||!x.merged),'STAGE29_30_31_UNMERGED_REVIEW');
 put(!Number.isSafeInteger(r.disk.availableBytes)||r.disk.availableBytes<=0||
     !r.disk.backupCapacityVerified,'OWNER_DISK_FREE_SPACE_OR_SNAPSHOT_MARGIN_UNKNOWN');
 put(!unknownCount(r.disk.liveOwnerJournalUncertainCount),
     'ORIGINAL_MANUAL_CIRCUIT_PENDING_COUNT_UNKNOWN');
 put(unknownCount(r.disk.liveOwnerJournalUncertainCount)&&
     r.disk.liveOwnerJournalUncertainCount!==0,
     'ORIGINAL_MANUAL_CIRCUIT_HAS_UNCERTAIN_ACTIONS');
 // Different historical trust-recovery counts must NOT be treated as
 // the manual-circuit count. They demand a separate reconciliation review.
 put(r.recoveryQuarantineObservation?.count>0,
     'TRUST_RECOVERY_QUARANTINE_SEPARATE_REVIEW');
 put(!r.privateOwnerBackupPolicyReviewed||!r.actualDiskSnapshotVerified,
     'PRIVATE_OWNER_DISK_BACKUP_NOT_ATTESTED');
 put(!v.stage30SelectedHostIntegratedInProduction,
     'ATOMIC_SIGNED_ORIGINAL_HOST_NOT_ACTIVATED');
 put(!v.stage31OwnerVolumeMigrated,'OWNER_SQLITE_STAGE29_ADDON_NOT_MIGRATED');
 put(!v.historicalReceiptOwnerReadEndpointVerified,
     'ORIGINAL_OWNER_AUTHENTICATED_READBACK_API_NOT_VERIFIED');
 put(!v.rollbackPreflightVerified,'OWNER_ROLLBACK_READINESS_NOT_VERIFIED');
 put(!v.explicitlyApprovedLiveMigration||!v.explicitlyApprovedDeploy,
     'LIVE_OWNER_CHANGE_APPROVAL_REQUIRED');
 return Object.freeze({
  schema:'JH168_STAGE32_RELEASE_GATES_V1',
  inspectedSnapshotAtUtc:snapshot.observedAtUtc,
  inspectionScope:'PRIOR_EXTERNAL_READ_ONLY_SNAPSHOT',
  sourceReviewOnly:true,liveMigrationPermitted:false,
  deploymentPermitted:false,protectedAndroidActionPermitted:false,
  existingClickReexecutionPermitted:false,autoReplay:false,
  previousStage27ApkMustRemainInstalled:true,
  existingRenderServiceTouched:false,
  trustRecoveryCountIsNotManualCircuitCount:true,
  knownLiveCommit:r.latestLiveDeploy.commit,
  knownSourceHead:g.mainHeadAtObservation,
  blockingConditions:blocks,
  nextDecision:'READ_ONLY_OWNER_JOURNAL_AND_DISK_PREFLIGHT_THEN_SEPARATE_APPROVAL'
 });
}
