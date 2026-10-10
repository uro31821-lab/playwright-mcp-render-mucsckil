/** Offline first-activation candidate. Not imported by the production router.
 * Never imports or resolves historical actions into a fresh journal. The legacy
 * snapshot is evidence of the cutover boundary, NOT evidence of task completion.
 * Ordinary startup requires a signed ready receipt and the same journal generation.
 */
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,hkdfSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {lstatSync,existsSync,mkdirSync,renameSync,openSync,writeSync,closeSync,fsyncSync,unlinkSync,rmdirSync} from 'node:fs';
import {assertConfig,privateBytes} from './owner-config.mjs';
import {checkOwnerStorage,acquireOwnerRuntimeLock} from './owner-storage.mjs';
import {DurableManualCircuitFence} from './durable-manual-circuit-fence.mjs';
import {installOwnerBoundDurableCircuit} from './durable-owner-storage.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=x=>JSON.stringify(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validId=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const CONFIRM='EXPLICIT_OFFLINE_CUTOVER_PRESERVE_UNKNOWN_HISTORY';
const present=p=>{try{lstatSync(p);return true}catch(e){if(e.code==='ENOENT')return false;throw e}};
function syncDir(dir){const f=openSync(dir,'r');try{fsyncSync(f)}finally{closeSync(f)}}
function writeExclusive(file,text){
 const fd=openSync(file,'wx',0o600),bytes=Buffer.from(text);let offset=0;
 try{while(offset<bytes.length){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)fail('CUTOVER_SHORT_WRITE');offset+=n}fsyncSync(fd)}finally{closeSync(fd)}
}
function settings(config,key,storageObservations){
 assertConfig(config);
 if(!Buffer.isBuffer(key)||key.length!==32)fail('DURABLE_OWNER_KEY_INVALID');
 checkOwnerStorage(config,key,storageObservations);
 const namespace=sha(json(['JH_DURABLE_OWNER_V1',config.accountDigest,config.serverOrigin,config.catalogDigest,config.policyDigest,config.storageEpoch]));
 const derived=Buffer.from(hkdfSync('sha256',key,Buffer.from(config.policyDigest,'hex'),Buffer.from('JH_DURABLE_NATIVE_KEY_V1'),32));
 return {file:path.join(config.stateDir,'manual-circuit.sqlite'),ready:path.join(config.stateDir,'manual-circuit-ready.json'),
  marker:path.join(config.stateDir,'.manual-circuit-preparing'),key:derived,namespace};
}
const sign=(s,p)=>createHmac('sha256',s.key).update('JH_CUTOVER_RECEIPT_V1\0').update(json(p)).digest('hex');
function legacySnapshot(config,s){
 const db=new DatabaseSync(path.join(config.stateDir,'trusted-devices.sqlite'),{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; BEGIN;');
  const entries=db.prepare('SELECT job_digest,trust_id,created FROM trusted_dispatches ORDER BY job_digest').all();
  const receipts=db.prepare('SELECT job_digest,trust_id,kind,evidence_digest,recorded FROM trusted_dispatch_receipts ORDER BY job_digest').all();
  const unresolved=db.prepare('SELECT COUNT(*) n FROM trusted_dispatches d WHERE NOT EXISTS (SELECT 1 FROM trusted_dispatch_receipts r WHERE r.job_digest=d.job_digest AND r.trust_id=d.trust_id)').get().n;
  const fingerprint=createHmac('sha256',s.key).update('JH_LEGACY_SNAPSHOT_V1\0').update(json([entries,receipts])).digest('hex');
  db.exec('ROLLBACK');
  return {tracked:entries.length,received:receipts.length,unresolved,digest:fingerprint};
 }finally{db.close()}
}
function readReady(config,s){
 if(present(s.marker))fail('CUTOVER_INTERRUPTED_REVIEW_REQUIRED');
 if(!present(s.ready))fail('CUTOVER_RECEIPT_REQUIRED');
 let r;try{r=JSON.parse(privateBytes(s.ready,8192).toString('utf8'))}catch{fail('CUTOVER_RECEIPT_INVALID')}
 if(!r||Object.keys(r).sort().join('|')!=='mac|payload'||!r.payload||!hex(r.mac))fail('CUTOVER_RECEIPT_INVALID');
 const p=r.payload;
 if(Object.keys(p).sort().join('|')!=='activationId|createdAtMs|legacy|manualHistory|namespace|retroactiveReconciliation|version'||p.version!==1||
   !validId(p.activationId)||!Number.isSafeInteger(p.createdAtMs)||p.createdAtMs<=0||p.namespace!==s.namespace||
   p.manualHistory!=='UNKNOWN_NOT_IMPORTED'||p.retroactiveReconciliation!==false||!p.legacy||
   Object.keys(p.legacy).sort().join('|')!=='digest|received|tracked|unresolved'||!hex(p.legacy.digest)||
   !['tracked','received','unresolved'].every(k=>Number.isSafeInteger(p.legacy[k])&&p.legacy[k]>=0)||p.legacy.unresolved>p.legacy.tracked)fail('CUTOVER_RECEIPT_INVALID');
 const expected=sign(s,p);
 if(!timingSafeEqual(Buffer.from(r.mac,'hex'),Buffer.from(expected,'hex')))fail('CUTOVER_RECEIPT_AUTH_FAILED');
 const journal=new DurableManualCircuitFence({file:s.file,key:s.key,namespace:s.namespace,mode:'read',verifyAuthenticatedCompletion:()=>false});
 try{journal.counts()}finally{journal.close()}
 const db=new DatabaseSync(s.file,{readOnly:true});
 try{
  const generation=db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('cutover_generation')?.v;
  const boundary=db.prepare('SELECT v FROM circuit_meta WHERE k=?').get('cutover_boundary')?.v;
  if(generation!==p.activationId||boundary!==r.mac)fail('CUTOVER_JOURNAL_GENERATION_MISMATCH');
 }finally{db.close()}
 return Object.freeze({ready:true,activationId:p.activationId,legacyTrackedAtCutover:p.legacy.tracked,
  legacyUnresolvedAtCutover:p.legacy.unresolved,manualHistory:'UNKNOWN_NOT_IMPORTED',existingHistoryReconciled:false,automaticReplayAllowed:false});
}
/** Offline only. The existing owner runtime lock prevents initialization while live.
 * Any interruption leaves the marker/staging data for explicit review; never erase them.
 */
export function prepareDurableCutover({config,key,confirmation,storageObservations}={}){
 if(confirmation!==CONFIRM)fail('CUTOVER_CONFIRMATION_REQUIRED');
 const s=settings(config,key,storageObservations);let lock;
 try{
  lock=acquireOwnerRuntimeLock(config);
  if(present(s.marker))fail('CUTOVER_INTERRUPTED_REVIEW_REQUIRED');
  if(present(s.ready)||present(s.file))fail('CUTOVER_EXISTING_STATE_NO_RESET');
  const old=legacySnapshot(config,s),activationId=randomBytes(16).toString('hex');
  const payload={version:1,activationId,namespace:s.namespace,createdAtMs:Date.now(),legacy:old,
   manualHistory:'UNKNOWN_NOT_IMPORTED',retroactiveReconciliation:false};
  const receipt={payload,mac:sign(s,payload)};
  writeExclusive(s.marker,json({version:1,activationId}));syncDir(config.stateDir);
  const stage=path.join(config.stateDir,'.manual-circuit-stage-'+activationId);mkdirSync(stage,{mode:0o700});
  const staged=path.join(stage,'manual-circuit.sqlite');
  const journal=new DurableManualCircuitFence({file:staged,key:s.key,namespace:s.namespace,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});
  try{if(journal.counts().uncertain!==0||journal.counts().received!==0)fail('CUTOVER_NEW_JOURNAL_NOT_EMPTY')}finally{journal.close()}
  const db=new DatabaseSync(staged);
  try{
   db.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE;');
   db.prepare('INSERT INTO circuit_meta VALUES(?,?)').run('cutover_generation',activationId);
   db.prepare('INSERT INTO circuit_meta VALUES(?,?)').run('cutover_boundary',receipt.mac);
   db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
  }finally{db.close()}
  syncDir(stage);
  if(json(legacySnapshot(config,s))!==json(old))fail('CUTOVER_LEGACY_CHANGED_DURING_PREPARE');
  if(present(s.file)||present(s.ready))fail('CUTOVER_STATE_CHANGED');
  renameSync(staged,s.file);syncDir(config.stateDir);
  writeExclusive(s.ready,json(receipt));syncDir(config.stateDir);
  rmdirSync(stage);unlinkSync(s.marker);syncDir(config.stateDir);
  return Object.freeze({prepared:true,...readReady(config,s),sessionCreated:false,actionApprovalGranted:false});
 }finally{try{lock?.close()}finally{s.key.fill(0)}}
}
export function verifyDurableCutover({config,key,storageObservations}={}){
 const s=settings(config,key,storageObservations);try{return readReady(config,s)}finally{s.key.fill(0)}
}
/** Existing original owner identity and process lock must already be held by startup. */
export function installCutoverReadyCircuit(runtime,options){
 if(!runtime||runtime.httpServer?.listening!==false)fail('DURABLE_OWNER_PRELISTEN_REQUIRED');
 verifyDurableCutover(options);
 return installOwnerBoundDurableCircuit(runtime,options);
}
