/**
 * Explicit owner-authorized deletion of the 56 pre-cutover unresolved dispatch rows.
 *
 * This migration does not archive, export, replay, acknowledge, or mark the old
 * work complete. It deletes only unresolved rows at or before the already signed
 * legacy cutover boundary, compacts SQLite with secure_delete, and rewrites the
 * authenticated cutover receipt so the retained aggregate is zero.
 *
 * It is deliberately idempotent: the only accepted starting states are the exact
 * legacy set (56 tracked / 0 received / 56 unresolved) or the already-purged zero
 * state. Current and future post-cutover rows are never selected.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,hkdfSync,timingSafeEqual} from 'node:crypto';
import {assertConfig,loadOwnerKey,privateBytes,fail} from './owner-config.mjs';
import {loadPcOwnerSetupPlan} from './pc-owner-service-entry.mjs';
import {readPcOwnerConfiguration} from './pc-owner-handoff.mjs';
import {checkOwnerStorage} from './owner-storage.mjs';
import {takeStorageSecrets,materializeStorageKeys,syncDirectory,pathExists,writeExclusivePrivate} from './storage-secret-bridge.mjs';

const SERVICE='srv-db0fjl2d0e5s73be114g';
const EXPECTED_LEGACY_COUNT=56;
const READY_FILE='manual-circuit-ready.json';
const READY_NEXT_FILE='.manual-circuit-ready.purge56.next';
const MANUAL_DB='manual-circuit.sqlite';
const TRUST_DB='trusted-devices.sqlite';
const CUTOVER_META='legacy_dispatch_cutoff_ms';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id32=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const safe=x=>Number.isSafeInteger(x)&&x>0;
const sameHex=(a,b)=>hex(a)&&hex(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const json=x=>JSON.stringify(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const exactKeys=(value,names,code)=>{
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==[...names].sort().join('|'))fail(code);
};
function settings(config,key,storageObservations){
 assertConfig(config);
 if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_SIZE_INVALID');
 checkOwnerStorage(config,key,storageObservations);
 const namespace=sha(json(['JH_DURABLE_OWNER_V1',config.accountDigest,config.serverOrigin,config.catalogDigest,config.policyDigest,config.storageEpoch]));
 const derived=Buffer.from(hkdfSync('sha256',key,Buffer.from(config.policyDigest,'hex'),Buffer.from('JH_DURABLE_NATIVE_KEY_V1'),32));
 return {
  stateDir:config.stateDir,
  trusted:path.join(config.stateDir,TRUST_DB),
  manual:path.join(config.stateDir,MANUAL_DB),
  ready:path.join(config.stateDir,READY_FILE),
  next:path.join(config.stateDir,READY_NEXT_FILE),
  namespace,derived
 };
}
const cutoverMac=(key,payload)=>createHmac('sha256',key).update('JH_CUTOVER_RECEIPT_V1\0').update(json(payload)).digest('hex');
const emptyLegacyDigest=key=>createHmac('sha256',key).update('JH_LEGACY_SNAPSHOT_V1\0').update(json([[],[]])).digest('hex');
function parseReceipt(file,key,namespace){
 let bytes,record;
 try{bytes=privateBytes(file,8192);record=JSON.parse(bytes.toString('utf8'));}
 catch{fail('LEGACY_PURGE_RECEIPT_INVALID');}
 finally{bytes?.fill(0);}
 exactKeys(record,['payload','mac'],'LEGACY_PURGE_RECEIPT_INVALID');
 exactKeys(record.payload,['version','activationId','namespace','createdAtMs','legacy','manualHistory','retroactiveReconciliation'],'LEGACY_PURGE_RECEIPT_INVALID');
 exactKeys(record.payload.legacy,['digest','received','tracked','unresolved'],'LEGACY_PURGE_RECEIPT_INVALID');
 const p=record.payload,l=p.legacy;
 if(p.version!==1||!id32(p.activationId)||p.namespace!==namespace||!safe(p.createdAtMs)||
    p.manualHistory!=='UNKNOWN_NOT_IMPORTED'||p.retroactiveReconciliation!==false||
    !hex(l.digest)||![l.tracked,l.received,l.unresolved].every(x=>Number.isSafeInteger(x)&&x>=0)||
    l.unresolved>l.tracked||!hex(record.mac)||!sameHex(record.mac,cutoverMac(key,p)))fail('LEGACY_PURGE_RECEIPT_INVALID');
 return record;
}
function privateRegularFile(file,code){
 const s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o077)!==0||fs.realpathSync(file)!==file)fail(code);
 return s;
}
function manualBoundary(file){
 privateRegularFile(file,'LEGACY_PURGE_MANUAL_DB_INVALID');
 const db=new DatabaseSync(file,{timeout:5000});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
  const generation=db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('cutover_generation')?.v;
  const boundary=db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('cutover_boundary')?.v;
  return {generation,boundary};
 }finally{db.close();}
}
function recoverPreparedReplacement(s,current){
 if(!pathExists(s.next))return current;
 const next=parseReceipt(s.next,s.derived,s.namespace);
 const manual=manualBoundary(s.manual);
 if(manual.generation!==next.payload.activationId)fail('LEGACY_PURGE_RECOVERY_GENERATION_MISMATCH');
 if(manual.boundary===next.mac){
  fs.renameSync(s.next,s.ready);syncDirectory(s.stateDir);
  return next;
 }
 if(manual.boundary===current.mac){
  fs.unlinkSync(s.next);syncDirectory(s.stateDir);
  return current;
 }
 fail('LEGACY_PURGE_RECOVERY_BOUNDARY_MISMATCH');
}
function trustedLegacyState(s,cutoff){
 privateRegularFile(s.trusted,'LEGACY_PURGE_TRUST_DB_INVALID');
 const db=new DatabaseSync(s.trusted,{timeout:5000});
 try{
  db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;');
  const tracked=db.prepare('SELECT COUNT(*) n FROM trusted_dispatches WHERE created<=?').get(cutoff).n;
  const received=db.prepare(`SELECT COUNT(*) n FROM trusted_dispatches d WHERE d.created<=? AND EXISTS(
   SELECT 1 FROM trusted_dispatch_receipts r WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)`).get(cutoff).n;
  const unresolved=db.prepare(`SELECT COUNT(*) n FROM trusted_dispatches d WHERE d.created<=? AND NOT EXISTS(
   SELECT 1 FROM trusted_dispatch_receipts r WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)`).get(cutoff).n;
  return {tracked,received,unresolved};
 }finally{db.close();}
}
function deleteLegacyRows(s,cutoff){
 const db=new DatabaseSync(s.trusted,{timeout:5000});let committed=false,deleted=0;
 try{
  db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; BEGIN IMMEDIATE;');
  const before={
   tracked:db.prepare('SELECT COUNT(*) n FROM trusted_dispatches WHERE created<=?').get(cutoff).n,
   received:db.prepare(`SELECT COUNT(*) n FROM trusted_dispatches d WHERE d.created<=? AND EXISTS(
    SELECT 1 FROM trusted_dispatch_receipts r WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)`).get(cutoff).n,
   unresolved:db.prepare(`SELECT COUNT(*) n FROM trusted_dispatches d WHERE d.created<=? AND NOT EXISTS(
    SELECT 1 FROM trusted_dispatch_receipts r WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)`).get(cutoff).n
  };
  const legacyExact=before.tracked===EXPECTED_LEGACY_COUNT&&before.received===0&&before.unresolved===EXPECTED_LEGACY_COUNT;
  const alreadyZero=before.tracked===0&&before.received===0&&before.unresolved===0;
  if(!legacyExact&&!alreadyZero)fail('LEGACY_PURGE_SCOPE_MISMATCH');
  if(legacyExact){
   const r=db.prepare(`DELETE FROM trusted_dispatches AS d WHERE d.created<=? AND NOT EXISTS(
    SELECT 1 FROM trusted_dispatch_receipts r WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)`).run(cutoff);
   deleted=Number(r.changes);
   if(deleted!==EXPECTED_LEGACY_COUNT)fail('LEGACY_PURGE_DELETE_COUNT_MISMATCH');
  }
  const after=db.prepare('SELECT COUNT(*) n FROM trusted_dispatches WHERE created<=?').get(cutoff).n;
  if(after!==0)fail('LEGACY_PURGE_ROWS_REMAIN');
  db.exec('COMMIT;');committed=true;
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  return deleted;
 }finally{
  if(!committed)try{db.exec('ROLLBACK');}catch{}
  db.close();
 }
}
function publishZeroReceipt(s,current){
 const p=current.payload;
 const payload={version:1,activationId:p.activationId,namespace:p.namespace,createdAtMs:p.createdAtMs,
  legacy:{tracked:0,received:0,unresolved:0,digest:emptyLegacyDigest(s.derived)},
  manualHistory:p.manualHistory,retroactiveReconciliation:false};
 const next={payload,mac:cutoverMac(s.derived,payload)};
 const currentZero=p.legacy.tracked===0&&p.legacy.received===0&&p.legacy.unresolved===0&&
  p.legacy.digest===payload.legacy.digest&&current.mac===next.mac;
 const boundary=manualBoundary(s.manual);
 if(boundary.generation!==p.activationId)fail('LEGACY_PURGE_JOURNAL_GENERATION_MISMATCH');
 if(currentZero){
  if(boundary.boundary!==current.mac)fail('LEGACY_PURGE_JOURNAL_BOUNDARY_MISMATCH');
  return false;
 }
 if(boundary.boundary!==current.mac)fail('LEGACY_PURGE_JOURNAL_BOUNDARY_MISMATCH');
 if(pathExists(s.next))fail('LEGACY_PURGE_NEXT_FILE_UNEXPECTED');
 writeExclusivePrivate(s.next,Buffer.from(json(next)));syncDirectory(s.stateDir);
 const staged=parseReceipt(s.next,s.derived,s.namespace);
 if(staged.mac!==next.mac)fail('LEGACY_PURGE_NEXT_READBACK_FAILED');
 const db=new DatabaseSync(s.manual,{timeout:5000});let committed=false;
 try{
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
  const row=db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('cutover_boundary');
  if(row?.v!==current.mac)fail('LEGACY_PURGE_JOURNAL_BOUNDARY_CHANGED');
  const changed=db.prepare('UPDATE circuit_meta SET v=? WHERE k=? AND v=?').run(next.mac,'cutover_boundary',current.mac);
  if(changed.changes!==1)fail('LEGACY_PURGE_JOURNAL_UPDATE_FAILED');
  db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');committed=true;
 }finally{
  if(!committed)try{db.exec('ROLLBACK');}catch{}
  db.close();
 }
 fs.renameSync(s.next,s.ready);syncDirectory(s.stateDir);
 const saved=parseReceipt(s.ready,s.derived,s.namespace),savedBoundary=manualBoundary(s.manual);
 if(saved.mac!==next.mac||savedBoundary.generation!==payload.activationId||savedBoundary.boundary!==next.mac)fail('LEGACY_PURGE_FINAL_READBACK_FAILED');
 return true;
}
export function purgeLegacyUnresolvedHistory({config,key,storageObservations}={}){
 const s=settings(config,key,storageObservations);
 try{
  let current=parseReceipt(s.ready,s.derived,s.namespace);
  current=recoverPreparedReplacement(s,current);
  const metaDb=new DatabaseSync(s.trusted,{timeout:5000});let rawCutoff;
  try{
   metaDb.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
   rawCutoff=metaDb.prepare('SELECT v FROM meta WHERE k=?').get(CUTOVER_META)?.v;
  }finally{metaDb.close();}
  if(typeof rawCutoff!=='string'||!/^[1-9][0-9]{0,15}$/.test(rawCutoff))fail('LEGACY_PURGE_CUTOVER_MISSING');
  const cutoff=Number(rawCutoff);
  if(!safe(cutoff)||cutoff!==current.payload.createdAtMs)fail('LEGACY_PURGE_CUTOVER_MISMATCH');
  const before=trustedLegacyState(s,cutoff);
  const legacyExact=before.tracked===EXPECTED_LEGACY_COUNT&&before.received===0&&before.unresolved===EXPECTED_LEGACY_COUNT;
  const alreadyZero=before.tracked===0&&before.received===0&&before.unresolved===0;
  if(!legacyExact&&!alreadyZero)fail('LEGACY_PURGE_SCOPE_MISMATCH');
  if(!((current.payload.legacy.tracked===EXPECTED_LEGACY_COUNT&&current.payload.legacy.received===0&&current.payload.legacy.unresolved===EXPECTED_LEGACY_COUNT)||
       (current.payload.legacy.tracked===0&&current.payload.legacy.received===0&&current.payload.legacy.unresolved===0)))fail('LEGACY_PURGE_RECEIPT_SCOPE_MISMATCH');
  const deleted=deleteLegacyRows(s,cutoff);
  const receiptRewritten=publishZeroReceipt(s,current);
  const after=trustedLegacyState(s,cutoff),finalReceipt=parseReceipt(s.ready,s.derived,s.namespace);
  if(after.tracked!==0||after.received!==0||after.unresolved!==0||
     finalReceipt.payload.legacy.tracked!==0||finalReceipt.payload.legacy.received!==0||finalReceipt.payload.legacy.unresolved!==0)fail('LEGACY_PURGE_NOT_ZERO');
  return Object.freeze({purged:true,deleted,legacyTracked:0,legacyReceived:0,legacyUnresolved:0,
   currentUnresolved:0,receiptRewritten,backupCreated:false,automaticReplayAllowed:false});
 }finally{s.derived.fill(0);}
}
export function runOwnerAuthorizedLegacyPurge(env=process.env){
 if(env.RENDER_SERVICE_ID!==SERVICE)fail('LEGACY_PURGE_SERVICE_MISMATCH');
 if(!['SERVE_READY_V1','EXPLICIT_INITIALIZE_AND_SERVE_V1'].includes(env.JH_DURABLE_RELEASE))fail('LEGACY_PURGE_RELEASE_MODE_REQUIRED');
 if(env.JH_PC_OWNER_SETUP_ENABLED!=='1'||env.JH_PC_OWNER_SETUP_PLAN_FILE!=='/var/data/jh-pc-bootstrap/plan.json')fail('LEGACY_PURGE_SAVED_SETUP_REQUIRED');
 const secrets=takeStorageSecrets(env),keyDirectory='/tmp/jh-legacy-purge-keys-v1';let key;
 try{
  const plan=loadPcOwnerSetupPlan(env.JH_PC_OWNER_SETUP_PLAN_FILE);
  if(plan.storageMount!=='/var/data')fail('LEGACY_PURGE_PRODUCTION_MOUNT_REQUIRED');
  const config=readPcOwnerConfiguration(plan);
  if(!config||config.accountDigest!==env.JH_OPERATIONAL_ACCOUNT_DIGEST)fail('LEGACY_PURGE_OWNER_MISMATCH');
  const files=materializeStorageKeys(config,secrets,keyDirectory);
  key=loadOwnerKey(files.ownerKeyFile,config);
  return purgeLegacyUnresolvedHistory({config,key});
 }finally{
  key?.fill(0);secrets.owner.fill(0);secrets.life.fill(0);
  try{fs.rmSync(keyDirectory,{recursive:true,force:true});}catch{}
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const r=runOwnerAuthorizedLegacyPurge();
  console.log('JH_LEGACY_HISTORY_PURGED '+json({purged:r.purged,currentUnresolved:0,storedLegacyTracked:0,storedLegacyUnresolved:0,backupCreated:false,automaticReplayAllowed:false}));
 }catch(e){
  console.error(typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'LEGACY_PURGE_FAILED');
  process.exitCode=1;
 }
}
