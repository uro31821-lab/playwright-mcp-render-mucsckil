/**
 * JH168 Stage31 — explicit offline owner-journal add-on migration.
 *
 * This module is NOT imported by npm start, the phone bridge or the live MCP
 * server. No implicit migration, restore, deployment, trust/session issuance,
 * approval, replay, or screen access. The existing Stage27 APK is unchanged.
 *
 * All writes require current validated owner volume/key, the ORIGINAL
 * exclusive runtime lock and an exact, deliberate offline confirmation.
 */
import path from 'node:path';
import {
  createHash,createHmac,hkdfSync,timingSafeEqual,randomBytes
} from 'node:crypto';
import {
  mkdirSync,lstatSync,realpathSync,existsSync,chmodSync,
  openSync,closeSync,fsyncSync,readFileSync
} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {assertConfig} from '../deployment/owner-config.mjs';
import {
  checkOwnerStorage,acquireOwnerRuntimeLock
} from '../deployment/owner-storage.mjs';
import {DurableManualCircuitFence} from '../deployment/durable-manual-circuit-fence.mjs';
import {Stage29DurableCompletionReadback}
 from './stage29-durable-completion-readback.mjs';

export const STAGE31_CONFIRMATION='EXPLICIT_OFFLINE_STAGE31_ADDON_WITH_BACKUP_NO_REPLAY';
const SCHEMA='JH168_STAGE31_OFFLINE_OWNER_ADDON_V1';
const PREFIX='JH_STAGE31_OWNER_PLAN_V1|';
const BACKUP_DIR='stage31-private-backups';
const LIMIT=10000;
const sha=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const h64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const equal=(a,b)=>h64(a)&&h64(b)&&
 timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));

function settings(config,ownerKey,storageObservations){
 assertConfig(config);
 if(!Buffer.isBuffer(ownerKey)||ownerKey.length!==32)
  fail('STAGE31_ORIGINAL_OWNER_KEY_REQUIRED');
 checkOwnerStorage(config,ownerKey,storageObservations);
 const material=JSON.stringify([
  'JH_DURABLE_OWNER_V1',config.accountDigest,config.serverOrigin,
  config.catalogDigest,config.policyDigest,config.storageEpoch
 ]);
 const namespace=sha(material);
 const derived=Buffer.from(hkdfSync('sha256',ownerKey,
  Buffer.from(config.policyDigest,'hex'),
  Buffer.from('JH_DURABLE_NATIVE_KEY_V1'),32));
 return {file:path.join(config.stateDir,'manual-circuit.sqlite'),
  derived,namespace,config};
}
function samePrivateFile(file){
 const dir=path.dirname(file),d=lstatSync(dir);
 if(!d.isDirectory()||d.isSymbolicLink()||realpathSync(dir)!==dir||
   (d.mode&0o077)!==0||(typeof process.getuid==='function'&&d.uid!==process.getuid()))
  fail('STAGE31_OWNER_STATE_DIRECTORY_UNSAFE');
 if(!existsSync(file))fail('STAGE31_ORIGINAL_JOURNAL_MISSING_NO_INITIALIZATION');
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  fail('STAGE31_ORIGINAL_JOURNAL_UNSAFE');
}
function readOriginal(settings){
 const {file,derived,namespace}=settings;
 samePrivateFile(file);
 let original;
 try {
  original=new DurableManualCircuitFence({file,key:derived,namespace,
   mode:'read',verifyAuthenticatedCompletion:()=>false});
  return original.counts();
 }finally{original?.close()}
}
function sqlRead(file,fn){
 const db=new DatabaseSync(file,{readOnly:true,timeout:3000});
 try {
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON;');
  return fn(db);
 }finally{db.close()}
}
function legacyState(file){
 return sqlRead(file,db=>{
  const check=db.prepare('PRAGMA integrity_check').all();
  if(check.length!==1||Object.values(check[0])[0]!=='ok')
   fail('STAGE31_JOURNAL_INTEGRITY_CHECK_FAILED');
  const rows=db.prepare('SELECT record_id,operation_hmac,status,created_ms,'+
   'completed_ms,result_hmac FROM circuit_actions ORDER BY record_id').all();
  if(rows.length>LIMIT)fail('STAGE31_JOURNAL_CAPACITY_REVIEW_REQUIRED');
  const fingerprint=sha(JSON.stringify(rows));
  const addonRows=db.prepare(
   "SELECT name FROM sqlite_master WHERE name IN "+
   "('stage29_receipt_meta','stage29_received_results',"+
   "'stage29_no_receipt_update','stage29_no_receipt_delete') ORDER BY name"
  ).all();
  if(addonRows.length!==0&&addonRows.length!==4)
   fail('STAGE31_PARTIAL_EXISTING_ADDON_REVIEW_REQUIRED');
  const installed=addonRows.length===4;
  return {fingerprint,rowCount:rows.length,installed};
 });
}
function inspectLocked(st){
 const counts=readOriginal(st);
 const legacy=legacyState(st.file);
 if(counts.uncertain+counts.received!==legacy.rowCount)
  fail('STAGE31_JOURNAL_ROW_COUNT_INCONSISTENT');
 if(legacy.installed){
  const reader=new Stage29DurableCompletionReadback({
   file:st.file,key:st.derived,namespace:st.namespace,
   mode:'read',authorizeRead:()=>false
  });
  reader.close();
 }
 const planDigest=sha(PREFIX+JSON.stringify({
  schema:SCHEMA,ownerPolicyDigest:st.config.policyDigest,
  journalFingerprint:legacy.fingerprint,
  uncertain:counts.uncertain,received:counts.received,
  addonAlreadyInstalled:legacy.installed
 }));
 return Object.freeze({schema:SCHEMA,planDigest,
  journalFingerprint:legacy.fingerprint,
  originalRecords:legacy.rowCount,uncertainEffects:counts.uncertain,
  originalResultsReceived:counts.received,
  addonAlreadyInstalled:legacy.installed,
  readyToMigrate:!legacy.installed&&counts.uncertain===0,
  oldActionsBackfilled:false,rollbackDisposition:'ORIGINAL_OPERATOR_KEEP_ADDON_TABLE',
  originalDeviceActionsCreated:0,automaticReplay:false,
  ownerLockRequired:true,backupRequired:true,liveServiceTouched:false});
}
export function inspectStage31OwnerAddon({
 config,ownerKey,storageObservations
}={}){
 const st=settings(config,ownerKey,storageObservations);
 let lock;
 try{
  lock=acquireOwnerRuntimeLock(config);
  return inspectLocked(st);
 }finally{try{lock?.close()}finally{st.derived.fill(0)}}
}
function syncHandle(filename){
 const fd=openSync(filename,'r');
 try{fsyncSync(fd)}finally{closeSync(fd)}
}
function privateBackupDir(stateDir){
 const dest=path.join(stateDir,BACKUP_DIR);
 if(!existsSync(dest))mkdirSync(dest,{mode:0o700});
 const st=lstatSync(dest);
 if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(dest)!==dest||
    (st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  fail('STAGE31_BACKUP_DIRECTORY_NOT_PRIVATE');
 return dest;
}
function snapshotOriginal(st,expectedPlan){
 const dir=privateBackupDir(st.config.stateDir);
 const backupFile=path.join(dir,'manual-circuit-stage31-'+
  randomBytes(12).toString('hex')+'.sqlite');
 if(existsSync(backupFile))fail('STAGE31_BACKUP_FILE_EXISTS');
 let db;
 try {
  db=new DatabaseSync(st.file,{timeout:4000});
  db.exec('PRAGMA trusted_schema=OFF;');
  // SQLite VACUUM INTO produces a CONSISTENT snapshot even if the original
  // journal uses WAL. The original owner lock prevents a live writer.
  db.exec("VACUUM INTO '"+backupFile.replaceAll("'","''")+"'");
 }finally{db?.close()}
 if(!existsSync(backupFile))fail('STAGE31_SNAPSHOT_NOT_CREATED');
 chmodSync(backupFile,0o600);
 samePrivateFile(backupFile);
 syncHandle(backupFile);
 syncHandle(dir);
 const backupLegacy=legacyState(backupFile);
 if(backupLegacy.installed||
    backupLegacy.fingerprint!==expectedPlan.journalFingerprint||
    backupLegacy.rowCount!==expectedPlan.originalRecords)
  fail('STAGE31_SNAPSHOT_ORIGINAL_ROWS_CHANGED');
 // HMAC check against original owner-derived key/namespace in the snapshot.
 const snapshot=readOriginal({...st,file:backupFile});
 if(snapshot.uncertain!==expectedPlan.uncertainEffects||
    snapshot.received!==expectedPlan.originalResultsReceived)
  fail('STAGE31_SNAPSHOT_OWNER_FENCE_CHANGED');
 return {file:backupFile,sha256:sha(readFileSync(backupFile)),
  originalRowFingerprint:backupLegacy.fingerprint};
}
/** Offline migration is strictly opt-in: no auto-rollback, deletion,
 * restoration or retry if the result cannot be verified.
 *
 * Confirmation must be separately supplied to this function by an
 * authenticated operator process; a plan digest is NOT authorization.
 */
export function migrateStage31OwnerAddon({
 config,ownerKey,storageObservations,
 confirmation,expectedPlanDigest
}={}){
 if(confirmation!==STAGE31_CONFIRMATION)
  fail('STAGE31_EXPLICIT_OFFLINE_CONFIRMATION_REQUIRED');
 if(!h64(expectedPlanDigest))
  fail('STAGE31_PLAN_DIGEST_REQUIRED');
 const st=settings(config,ownerKey,storageObservations);
 let lock;
 try {
  lock=acquireOwnerRuntimeLock(config);
  const plan=inspectLocked(st);
  if(plan.planDigest!==expectedPlanDigest)
   fail('STAGE31_PLAN_CHANGED_NO_MIGRATION');
  if(plan.addonAlreadyInstalled)
   return Object.freeze({code:'STAGE31_ALREADY_MIGRATED_READ_ONLY',
    addonInstalled:true,backupCreated:false,oldRowsPreserved:true,
    autoReplay:false,liveServiceTouched:false});
  if(!plan.readyToMigrate)
   fail('STAGE31_UNCERTAIN_DISPATCHES_RECONCILE_REQUIRED');
  const snapshot=snapshotOriginal(st,plan);
  // Must never overwrite the original journal or reset any owner tables.
  const addon=new Stage29DurableCompletionReadback({
   file:st.file,key:st.derived,namespace:st.namespace,
   mode:'EXPLICIT_ONE_TIME_ADDON',authorizeRead:()=>false
  });
  addon.close();
  const after=inspectLocked(st);
  if(!after.addonAlreadyInstalled||
     after.journalFingerprint!==plan.journalFingerprint||
     after.originalRecords!==plan.originalRecords||
     after.uncertainEffects!==plan.uncertainEffects||
     after.originalResultsReceived!==plan.originalResultsReceived)
    fail('STAGE31_POST_MIGRATION_REVIEW_REQUIRED_NO_AUTO_RESTORE');
  syncHandle(st.file);
  syncHandle(st.config.stateDir);
  return Object.freeze({
   code:'STAGE31_ADDON_MIGRATED_OFFLINE',
   addonInstalled:true,backupCreated:true,
   backupSha256:snapshot.sha256,
   backupFileKeptPrivate:true,originalLegacyRowFingerprint:plan.journalFingerprint,
   oldRowsPreserved:true,oldActionsBackfilled:false,
   taskSuccessVerified:false,uiTransitionVerified:false,
   autoReplay:false,liveServiceTouched:false,
   rollbackDisposition:'RESELECT_PREVIOUS_VERIFIED_OPERATOR_KEEP_ADDON',
   restorePerformed:false,releaseActivated:false
  });
 }finally{try{lock?.close()}finally{st.derived.fill(0)}}
}
/** Rollback plan is a CODE SELECTION only. An additive schema can safely
 * coexist with the original unchanged server. Never auto-restore an old DB
 * snapshot over potentially newer journal evidence. */
export function stage31RollbackDisposition({
 productionRuntimeActive=false,operatorMode='ORIGINAL'
}={}){
 if(productionRuntimeActive||operatorMode!=='ORIGINAL')
  return Object.freeze({ok:false,code:'STAGE31_OFFLINE_ORIGINAL_OPERATOR_REQUIRED',
   backupRestoreAllowed:false,autoReplay:false});
 return Object.freeze({ok:true,code:'STAGE31_ROLLBACK_TO_ORIGINAL_CODE_ONLY',
  dropAddon:false,restoreDatabase:false,eraseActions:false,
  autoReplay:false,taskSuccessVerified:false});
}
