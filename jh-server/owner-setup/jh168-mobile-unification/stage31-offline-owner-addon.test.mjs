import test from 'node:test';
import assert from 'node:assert/strict';
import {
 mkdtempSync,mkdirSync,chmodSync,rmSync,readdirSync,readFileSync,
 existsSync,lstatSync,symlinkSync,writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,hkdfSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {
 validateOwnerConfiguration,EXPECTED_ORIGIN,EXPECTED_CATALOG
} from '../deployment/owner-config.mjs';
import {
 initializeOwnerStorage,acquireOwnerRuntimeLock
} from '../deployment/owner-storage.mjs';
import {initializeOwnerDurableStorage}
 from '../deployment/durable-owner-storage.mjs';
import {DurableManualCircuitFence}
 from '../deployment/durable-manual-circuit-fence.mjs';
import {Stage29DurableCompletionReadback}
 from './stage29-durable-completion-readback.mjs';
import {
 STAGE31_CONFIRMATION,inspectStage31OwnerAddon,
 migrateStage31OwnerAddon,stage31RollbackDisposition
} from './stage31-offline-owner-addon.mjs';

const OWNER_KEY=Buffer.alloc(32,31);
const sha=x=>createHash('sha256').update(x).digest('hex');
const confirmation='EXPLICIT_ONE_TIME_NO_RETROSPECTIVE_CLAIM';
const rows=['owner-intents.sqlite','trusted-devices.sqlite','runtime-lock.sqlite',
 'volume-identity.json'];
const fixture=()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'jh-stage31-'));
 chmodSync(dir,0o700);
 const mount=path.join(dir,'mount');mkdirSync(mount,{mode:0o700});
 const input={version:1,serverOrigin:EXPECTED_ORIGIN,
  catalogDigest:EXPECTED_CATALOG,
  googleWebClientId:'synthetic-stage31.apps.googleusercontent.com',
  allowedPresenterClientIds:['synthetic-stage31.apps.googleusercontent.com'],
  ownerSubject:'synthetic-stage31-owner',ownerLabel:'Stage31 synthetic owner',
  storageMount:mount,storageEpoch:'synthetic_stage31_owner_2026'};
 const config=validateOwnerConfiguration(input);
 const storageObservations={mountInfo:'101 1 8:1 / '+mount+' rw,relatime - ext4 /dev/synthetic rw',
  filesystemType:0xef53};
 initializeOwnerStorage(config,OWNER_KEY,storageObservations);
 initializeOwnerDurableStorage({config,key:OWNER_KEY,
  confirmation,storageObservations});
 const file=path.join(config.stateDir,'manual-circuit.sqlite');
 const args={config,ownerKey:OWNER_KEY,storageObservations};
 const key=Buffer.from(hkdfSync('sha256',OWNER_KEY,
  Buffer.from(config.policyDigest,'hex'),
  Buffer.from('JH_DURABLE_NATIVE_KEY_V1'),32));
 const namespace=sha(JSON.stringify(['JH_DURABLE_OWNER_V1',config.accountDigest,
  config.serverOrigin,config.catalogDigest,config.policyDigest,config.storageEpoch]));
 return {dir,mount,input,config,file,args,key,namespace,
  close(){key.fill(0);rmSync(dir,{recursive:true,force:true})}};
};
const inspect=f=>inspectStage31OwnerAddon(f.args);
const migration=(f,plan,extra={})=>migrateStage31OwnerAddon({
 ...f.args,confirmation:STAGE31_CONFIRMATION,
 expectedPlanDigest:plan.planDigest,...extra
});
const backups=f=>{
 const d=path.join(f.config.stateDir,'stage31-private-backups');
 return existsSync(d)?readdirSync(d).filter(name=>name.endsWith('.sqlite')).map(name=>path.join(d,name)):[];
};
const oldFiles=f=>rows.map(n=>sha(readFileSync(path.join(f.config.stateDir,n))));
const pending=f=>{
 const journal=new DurableManualCircuitFence({
  file:f.file,key:f.key,namespace:f.namespace,mode:'read',
  verifyAuthenticatedCompletion:()=>true
 });
 const record=journal.reserveDispatch({deviceId:'fixture-original-phone',
  type:'split_screen_session_followup',
  payload:{contextId:'ssc_'+'0'.repeat(32),requestId:'1'.repeat(32),
   action:'CLICK',targetItemRef:'item_'+'2'.repeat(16),
   commandDigest:sha('synthetic original click')}});
 assert.equal(record.allowed,true);
 journal.close();
 return record.recordId;
};
const received=f=>{
 const journal=new DurableManualCircuitFence({
  file:f.file,key:f.key,namespace:f.namespace,mode:'read',
  verifyAuthenticatedCompletion:()=>true
 });
 const record=journal.reserveDispatch({deviceId:'fixture-original-phone',
  type:'split_screen_session_followup',
  payload:{contextId:'ssc_'+'3'.repeat(32),requestId:'4'.repeat(32),
   action:'CLICK',targetItemRef:'item_'+'5'.repeat(16),
   commandDigest:sha('original verified receipt')}});
 assert.equal(record.allowed,true);
 journal.recordAuthenticatedDeviceResult({recordId:record.recordId,
  resultDigest:sha('synthetic authenticated payload'),hostEvidence:{}});
 journal.close();
 return record.recordId;
};

test('read-only Stage31 plan verifies real synthetic owner volume and preserves all original bytes',()=>{
 const f=fixture();
 try{
  const before=oldFiles(f);
  const plan=inspect(f);
  assert.equal(plan.schema,'JH168_STAGE31_OFFLINE_OWNER_ADDON_V1');
  assert.match(plan.planDigest,/^[a-f0-9]{64}$/);
  assert.equal(plan.readyToMigrate,true);
  assert.equal(plan.addonAlreadyInstalled,false);
  assert.equal(plan.uncertainEffects,0);
  assert.equal(plan.originalDeviceActionsCreated,0);
  assert.equal(plan.automaticReplay,false);
  assert.deepEqual(oldFiles(f),before);
  assert.deepEqual(backups(f),[]);
  const copy=inspect(f);
  assert.equal(copy.planDigest,plan.planDigest);
 }finally{f.close()}
});

test('missing consent or pinned plan cannot initialize, back up, or grant a new action',()=>{
 const f=fixture();
 try{
  const plan=inspect(f);
  assert.throws(()=>migrateStage31OwnerAddon({...f.args,
   expectedPlanDigest:plan.planDigest}),/EXPLICIT_OFFLINE_CONFIRMATION_REQUIRED/);
  assert.throws(()=>migrateStage31OwnerAddon({...f.args,
   confirmation:'APPROVE_ME',expectedPlanDigest:plan.planDigest}),
   /EXPLICIT_OFFLINE_CONFIRMATION_REQUIRED/);
  assert.throws(()=>migrateStage31OwnerAddon({...f.args,
   confirmation:STAGE31_CONFIRMATION}),/PLAN_DIGEST_REQUIRED/);
  assert.deepEqual(backups(f),[]);
  assert.equal(inspect(f).addonAlreadyInstalled,false);
 }finally{f.close()}
});

test('offline migration creates a consistent private SQLite backup and retains original tables',()=>{
 const f=fixture();
 try{
  received(f);
  const before=inspect(f);
  const originalOwnerHashes=oldFiles(f);
  const migrated=migration(f,before);
  assert.equal(migrated.code,'STAGE31_ADDON_MIGRATED_OFFLINE');
  assert.equal(migrated.backupCreated,true);
  assert.equal(migrated.oldRowsPreserved,true);
  assert.equal(migrated.restorePerformed,false);
  assert.equal(migrated.releaseActivated,false);
  assert.equal(migrated.autoReplay,false);
  assert.equal(migrated.taskSuccessVerified,false);
  const backupPaths=backups(f);
  assert.equal(backupPaths.length,1);
  const st=lstatSync(backupPaths[0]);
  assert.equal(st.mode&0o077,0);
  assert.equal(sha(readFileSync(backupPaths[0])),migrated.backupSha256);
  const backup=new DatabaseSync(backupPaths[0],{readOnly:true});
  try{
   assert.equal(Object.values(backup.prepare('PRAGMA integrity_check').get())[0],'ok');
   assert.equal(backup.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
   assert.equal(backup.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='stage29_received_results'").get().n,0);
  }finally{backup.close()}
  const after=inspect(f);
  assert.equal(after.addonAlreadyInstalled,true);
  assert.equal(after.journalFingerprint,before.journalFingerprint);
  assert.equal(after.originalResultsReceived,before.originalResultsReceived);
  assert.deepEqual(oldFiles(f),originalOwnerHashes);
  const original=new DurableManualCircuitFence({file:f.file,key:f.key,
    namespace:f.namespace,mode:'read',verifyAuthenticatedCompletion:()=>false});
  assert.equal(original.counts().received,1);
  original.close();
  const reader=new Stage29DurableCompletionReadback({file:f.file,key:f.key,
   namespace:f.namespace,mode:'read',authorizeRead:()=>false});
  reader.close();
 }finally{f.close()}
});

test('second migration is a verified read-only reuse; no new snapshot or table writes',()=>{
 const f=fixture();
 try{
  migration(f,inspect(f));
  const oldBackup=backups(f);
  const before=inspect(f);
  const again=migration(f,before);
  assert.equal(again.code,'STAGE31_ALREADY_MIGRATED_READ_ONLY');
  assert.equal(again.backupCreated,false);
  assert.deepEqual(backups(f),oldBackup);
  assert.equal(inspect(f).planDigest,before.planDigest);
 }finally{f.close()}
});

test('owner runtime lock blocks inspect and migration while owner service is active',()=>{
 const f=fixture();
 try{
  const plan=inspect(f);
  const lock=acquireOwnerRuntimeLock(f.config);
  try{
   assert.throws(()=>inspect(f),/OWNER_RUNTIME_ALREADY_RUNNING/);
   assert.throws(()=>migration(f,plan),/OWNER_RUNTIME_ALREADY_RUNNING/);
   assert.deepEqual(backups(f),[]);
  }finally{lock.close()}
 }finally{f.close()}
});

test('pending original dispatched action forbids schema change and even backup creation',()=>{
 const f=fixture();
 try{
  pending(f);
  const plan=inspect(f);
  assert.equal(plan.uncertainEffects,1);
  assert.equal(plan.readyToMigrate,false);
  assert.throws(()=>migration(f,plan),/UNCERTAIN_DISPATCHES_RECONCILE_REQUIRED/);
  assert.deepEqual(backups(f),[]);
  assert.equal(inspect(f).addonAlreadyInstalled,false);
 }finally{f.close()}
});

test('stale plan after another original result is received cannot migrate',()=>{
 const f=fixture();
 try{
  const old=inspect(f);
  received(f);
  const fresh=inspect(f);
  assert.notEqual(old.planDigest,fresh.planDigest);
  assert.throws(()=>migration(f,old),/PLAN_CHANGED_NO_MIGRATION/);
  assert.deepEqual(backups(f),[]);
 }finally{f.close()}
});

test('wrong owner key, owner binding, and mount observation fail closed',()=>{
 const f=fixture();
 try{
  const plan=inspect(f);
  assert.throws(()=>migrateStage31OwnerAddon({...f.args,
   ownerKey:Buffer.alloc(32,18),confirmation:STAGE31_CONFIRMATION,
   expectedPlanDigest:plan.planDigest}),/VOLUME_IDENTITY_MISMATCH/);
  const altered=validateOwnerConfiguration({...f.input,ownerSubject:'other-owner'});
  assert.throws(()=>inspectStage31OwnerAddon({...f.args,config:altered}),
   /VOLUME_IDENTITY_MISMATCH/);
  assert.throws(()=>inspectStage31OwnerAddon({...f.args,
   storageObservations:{...f.args.storageObservations,filesystemType:0}}),
   /PERSISTENT_FILESYSTEM_OBSERVATION_MISMATCH/);
  assert.deepEqual(backups(f),[]);
 }finally{f.close()}
});

test('partial existing addon is not repaired by hidden SQL and never overwritten',()=>{
 const f=fixture();
 try{
  const db=new DatabaseSync(f.file);
  try{db.exec('CREATE TABLE stage29_receipt_meta(k TEXT PRIMARY KEY,v TEXT NOT NULL)')}
  finally{db.close()}
  assert.throws(()=>inspect(f),/PARTIAL_EXISTING_ADDON_REVIEW_REQUIRED/);
  const all=new DatabaseSync(f.file,{readOnly:true});
  try{assert.equal(all.prepare('SELECT COUNT(*) n FROM stage29_receipt_meta').get().n,0)}
  finally{all.close()}
  assert.deepEqual(backups(f),[]);
 }finally{f.close()}
});

test('unsafe backup-directory permissions block migration without touching old rows',()=>{
 const f=fixture();
 try{
  const before=inspect(f);
  const dir=path.join(f.config.stateDir,'stage31-private-backups');
  mkdirSync(dir,{mode:0o755});
  assert.throws(()=>migration(f,before),/BACKUP_DIRECTORY_NOT_PRIVATE/);
  assert.equal(inspect(f).journalFingerprint,before.journalFingerprint);
  assert.deepEqual(backups(f),[]);
 }finally{f.close()}
});

test('rollback is previous operator selection only and never restores a stale backup',()=>{
 const f=fixture();
 try{
  const before=inspect(f);
  migration(f,before);
  const oldBackups=backups(f);
  const plan=stage31RollbackDisposition({productionRuntimeActive:false,
   operatorMode:'ORIGINAL'});
  assert.equal(plan.ok,true);
  assert.equal(plan.restoreDatabase,false);
  assert.equal(plan.dropAddon,false);
  assert.equal(plan.autoReplay,false);
  assert.equal(stage31RollbackDisposition({productionRuntimeActive:true}).ok,false);
  assert.equal(stage31RollbackDisposition({operatorMode:'STAGE30'}).ok,false);
  assert.equal(inspect(f).addonAlreadyInstalled,true);
  assert.deepEqual(backups(f),oldBackups);
 }finally{f.close()}
});

test('schema migration preserves original old actions with no backfilled verified result',()=>{
 const f=fixture();
 try{
  received(f);
  const before=inspect(f);
  migration(f,before);
  const db=new DatabaseSync(f.file,{readOnly:true});
  try{
   assert.equal(db.prepare('SELECT COUNT(*) n FROM stage29_received_results').get().n,0);
   assert.equal(db.prepare('SELECT COUNT(*) n FROM circuit_actions').get().n,1);
  }finally{db.close()}
 }finally{f.close()}
});

test('Stage31 source cannot call live runtime, Android, approval or database restoration',()=>{
 const s=readFileSync(new URL('./stage31-offline-owner-addon.mjs',import.meta.url),'utf8');
 for(const value of ['registerOAuthTool(','httpServer.listen(',
  'executeRightPane(','restoreDatabaseFromBackup(', 'unlinkSync(backupFile)'])
  assert.equal(s.includes(value),false,value);
 assert.equal(s.includes('STAGE31_CONFIRMATION'),true);
 assert.equal(s.includes('VACUUM INTO'),true);
 assert.equal(s.includes('acquireOwnerRuntimeLock(config)'),true);
});
