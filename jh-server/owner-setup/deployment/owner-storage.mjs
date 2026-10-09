/** Real filesystem lifecycle. Mount observations do NOT prove a cloud provider
 * backup/SLA. Operator provisioning and restore/epoch policy remain required.
 * Production callers read real mountinfo; tests may supply synthetic observations. */
import {readFileSync,lstatSync,realpathSync,mkdirSync,openSync,writeSync,closeSync,fsyncSync,renameSync,unlinkSync,existsSync,statfsSync,accessSync,constants} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {assertConfig,fail,hostOptions,privateBytes} from './owner-config.mjs';
import {EnrollmentStore} from '../owner-enrollment/enrollment-store.mjs';
import {GoogleOwnerVerifier} from '../owner-enrollment/owner-enrollment.mjs';
import {createOwnerRegistryService} from '../owner-enrollment/owner-registry-service.mjs';
const allowedFs=new Set(['ext4','xfs','btrfs','zfs']);
const filesystemMagics=new Set([0xef53,0x58465342,0x9123683e,0x2fc12fc1]);
/** The provider mount is NOT an application-private state directory. This exact
 * service was observed with root:1000, mode 2775 and uid/gid 1000. Trust only
 * that service-local group for the mount root; never chmod/chown the platform
 * mount. Callers still verify the genuine writable filesystem and nested mounts.
 * All state directories/files retain their separate owner-only checks. This
 * is not isolation from another process running as the same service identity. */
export function isRenderManagedRoot(mount,st,{serviceId=process.env.RENDER_SERVICE_ID,uid=process.getuid?.(),gid=process.getgid?.()}={}){
 return mount==='/var/data'&&serviceId==='srv-db0fjl2d0e5s73be114g'&&uid===1000&&gid===1000&&
  st.isDirectory()&&!st.isSymbolicLink()&&st.uid===0&&st.gid===1000&&(st.mode&0o7777)===0o2775;
}
export function assertStorageRootAccess(mount,code='MOUNT_WRITABLE_BY_OTHER_USERS'){
 const st=lstatSync(mount);
 if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(mount)!==mount)fail(code);
 if((st.mode&0o022)!==0){
  if(!isRenderManagedRoot(mount,st))fail(code);
  accessSync(mount,constants.W_OK|constants.X_OK);
 }
 return st;
}

const decodeMount=s=>s.replace(/\\(040|011|012|134)/g,(_,n)=>String.fromCharCode(parseInt(n,8)));
export function parseMountInfo(text) {
  if(typeof text!=='string'||text.length>2*1024*1024)fail('MOUNT_METADATA_INVALID');
  return text.trim().split('\n').filter(Boolean).map(line=>{
    const [a,b,...extra]=line.split(' - '),left=a?.split(' '),right=b?.split(' ');
    if(extra.length||!left||left.length<6||!right||right.length<3||!/^\d+:\d+$/.test(left[2]))fail('MOUNT_METADATA_INVALID');
    return {mount:decodeMount(left[4]),options:left[5].split(','),filesystem:right[0],superOptions:right[2].split(',')};
  });
}
const under=(child,parent)=>child===parent||child.startsWith(parent+path.sep);
export function inspectOwnerMount(config,{mountInfo=readFileSync('/proc/self/mountinfo','utf8'),filesystemType}={}) {
  assertConfig(config);const mount=config.storageMount;
  if(realpathSync(mount)!==mount)fail('MOUNT_LINK_FORBIDDEN');
  assertStorageRootAccess(mount);
  const rows=parseMountInfo(mountInfo),matching=rows.filter(r=>r.mount===mount);
  if(matching.length!==1)fail('DISTINCT_PERSISTENT_MOUNT_REQUIRED');
  const row=matching[0];
  if(!allowedFs.has(row.filesystem)||!row.options.includes('rw')||row.superOptions.includes('ro'))fail('PERSISTENT_WRITABLE_FILESYSTEM_REQUIRED');
  if(rows.some(r=>r.mount!==mount&&under(r.mount,config.stateDir)))fail('NESTED_STATE_MOUNT_FORBIDDEN');
  const type=filesystemType??Number(statfsSync(mount).type);
  if(!filesystemMagics.has(type>>>0))fail('PERSISTENT_FILESYSTEM_OBSERVATION_MISMATCH');
  return Object.freeze({mountChecked:true,filesystem:row.filesystem,cloudDurabilityAttested:false});
}
function writePrivate(filename,bytes) {const fd=openSync(filename,'wx',0o600);try{let at=0;while(at<bytes.length){const n=writeSync(fd,bytes,at,bytes.length-at);if(n<=0)fail('SHORT_STORAGE_WRITE');at+=n;}fsyncSync(fd);}finally{closeSync(fd);}}
function syncDir(dir){const fd=openSync(dir,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
const mac=(config,key)=>createHmac('sha256',key).update('JH_OWNER_VOLUME_V1|'+config.policyDigest).digest('hex');
function stamp(config,key){return {version:1,policyDigest:config.policyDigest,mac:mac(config,key)};}
export function checkOwnerStorage(config,key,observations) {
  if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_SIZE_INVALID');
  inspectOwnerMount(config,observations);
  if(existsSync(path.join(config.storageMount,'.jh-owner-initialize.lock')))fail('INITIALIZATION_REVIEW_REQUIRED');
  const dir=config.stateDir;let st;
  try{st=lstatSync(dir);}catch(e){if(e.code==='ENOENT')fail('OWNER_STORAGE_NOT_INITIALIZED');throw e;}
  if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(dir)!==dir||st.uid!==process.getuid()||(st.mode&0o077)!==0)fail('STATE_DIRECTORY_INVALID');
  let saved;try{saved=JSON.parse(privateBytes(path.join(dir,'volume-identity.json'),4096));}catch{fail('VOLUME_IDENTITY_INVALID');}
  const expected=stamp(config,key);
  if(!saved||Object.keys(saved).sort().join('|')!=='mac|policyDigest|version'||saved.version!==1||saved.policyDigest!==expected.policyDigest||typeof saved.mac!=='string'||!/^[a-f0-9]{64}$/.test(saved.mac)||!timingSafeEqual(Buffer.from(saved.mac),Buffer.from(expected.mac)))fail('VOLUME_IDENTITY_MISMATCH');
  for(const filename of ['owner-intents.sqlite','trusted-devices.sqlite','runtime-lock.sqlite']){
    let s;try{s=lstatSync(path.join(dir,filename));}catch{fail('OWNER_DATABASE_MISSING');}
    if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.size<=0)fail('OWNER_DATABASE_INVALID');
  }
  return Object.freeze({storageFilesChecked:true,cloudDurabilityAttested:false});
}
/** Explicit one-time operator action, NOT called from server boot. Build both
 * original DBs in a private staging directory; publish the directory atomically.
 * A failed initializer keeps a lock and staging data for review; never resets. */
export function initializeOwnerStorage(config,key,observations) {
  if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_SIZE_INVALID');
  inspectOwnerMount(config,observations);
  if(existsSync(config.stateDir)){
    checkOwnerStorage(config,key,observations);const lock=acquireOwnerRuntimeLock(config);let store,service;
    try{
      const options=hostOptions(config,key);
      const verifier=new GoogleOwnerVerifier({clientId:options.googleClientId,allowedSubjects:options.allowedOwnerSubjects,allowedPresenters:options.allowedPresenters});
      store=new EnrollmentStore({filename:options.ownerJournalPath,key,epoch:config.storageEpoch,initialize:false});
      service=createOwnerRegistryService({store,verifier,serverOrigin:config.serverOrigin,catalogDigest:config.catalogDigest,registryPath:options.registryPath,initializeRegistry:false});
      return {code:'ALREADY_INITIALIZED',created:false};
    }finally{try{service?.close();}finally{try{store?.close();}finally{lock.close();}}}
  }
  const lock=path.join(config.storageMount,'.jh-owner-initialize.lock');let fd;
  try{fd=openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('INITIALIZATION_REVIEW_REQUIRED');throw e;}
  try{fsyncSync(fd);}finally{closeSync(fd);}syncDir(config.storageMount);
  const stage=path.join(config.storageMount,'.jh-owner-stage-'+randomBytes(12).toString('hex'));
  let store,service;
  try{
    if(existsSync(config.stateDir))fail('INITIALIZATION_STATE_CHANGED');
    mkdirSync(stage,{mode:0o700});
    const options=hostOptions(config,key,stage);
    const verifier=new GoogleOwnerVerifier({clientId:options.googleClientId,allowedSubjects:options.allowedOwnerSubjects,allowedPresenters:options.allowedPresenters});
    store=new EnrollmentStore({filename:options.ownerJournalPath,key,epoch:config.storageEpoch,initialize:true});
    service=createOwnerRegistryService({store,verifier,serverOrigin:config.serverOrigin,catalogDigest:config.catalogDigest,registryPath:options.registryPath,initializeRegistry:true});
    service.close();service=null;store.close();store=null;
    writePrivate(path.join(stage,'runtime-lock.sqlite'),Buffer.alloc(0));
    const lockDb=new DatabaseSync(path.join(stage,'runtime-lock.sqlite'));
    try{lockDb.exec('PRAGMA synchronous=FULL; CREATE TABLE runtime_lock(version INTEGER NOT NULL); INSERT INTO runtime_lock VALUES (1);');}finally{lockDb.close();}
    writePrivate(path.join(stage,'volume-identity.json'),Buffer.from(JSON.stringify(stamp(config,key))));syncDir(stage);
    if(existsSync(config.stateDir))fail('INITIALIZATION_STATE_CHANGED');
    renameSync(stage,config.stateDir);syncDir(config.storageMount);
    unlinkSync(lock);syncDir(config.storageMount);
    checkOwnerStorage(config,key,observations);
    return {code:'OWNER_STORAGE_INITIALIZED',created:true,trustCreated:false,sessionCreated:false};
  }finally {try{service?.close();}finally{store?.close();}}
}

/** A separate SQLite EXCLUSIVE transaction supplies an OS-released process lock.
 * It holds no trust, identity, credential or session data. Unlike a PID file,
 * an ordinary process crash releases the lock without guessing a stale timeout. */
export function acquireOwnerRuntimeLock(config) {
  assertConfig(config);const file=path.join(config.stateDir,'runtime-lock.sqlite');
  const st=lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()||(st.mode&0o077)!==0)fail('RUNTIME_LOCK_FILE_INVALID');
  const db=new DatabaseSync(file);let acquired=false;
  try{
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;');acquired=true;
    const rows=db.prepare('SELECT version FROM runtime_lock').all();
    if(rows.length!==1||rows[0].version!==1)fail('RUNTIME_LOCK_SCHEMA_INVALID');
    let closed=false;
    return {close(){if(closed)return;closed=true;try{db.exec('ROLLBACK');}finally{db.close();}}};
  }catch(e){try{if(acquired)db.exec('ROLLBACK');}catch{}db.close();if(e?.errcode===5)fail('OWNER_RUNTIME_ALREADY_RUNNING');throw e;}
}
