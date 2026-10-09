/** Operator-only preparation for the EXISTING encrypted LifeCheckpointStore.
 * No listener, worker, provider, credential issuer, implicit initialization or migration.
 * Production uses actual mount observations; synthetic observations are test inputs only.
 */
import path from 'node:path';
import {lstatSync,readFileSync,mkdirSync,openSync,closeSync,fsyncSync,writeFileSync,
  linkSync,unlinkSync,rmdirSync,readdirSync} from 'node:fs';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {assertConfig,loadOwnerKey,privateBytes,sha,fail} from './owner-config.mjs';
import {checkOwnerStorage,acquireOwnerRuntimeLock,inspectOwnerMount} from './owner-storage.mjs';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {workerPolicy} from '../server-continuation/life-worker-policy.mjs';
import {contentCanonical,contentParse} from '../server-continuation/life-content-wire.mjs';
import {createRegisteredLifeBootstrap} from './life-registered-bootstrap.mjs';

export const LIFE_DATABASE_NAME='life.sqlite';
const MARKER='.jh-life-initialize.lock', BINDING='life-storage-binding.json';
const exists=p=>{try{lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function syncDir(p){const fd=openSync(p,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function writePrivate(p,b){const fd=openSync(p,'wx',0o600);try{writeFileSync(fd,b);fsyncSync(fd);}finally{closeSync(fd);}}
function checked(config,options){
  assertConfig(config);
  if(!options||Object.keys(options).some(k=>!['keyFile','databasePath','policy'].includes(k)))fail('LIFE_STORAGE_OPTIONS_INVALID');
  if(options.databasePath!==path.join(config.stateDir,LIFE_DATABASE_NAME))fail('LIFE_STORAGE_PATH_MISMATCH');
  const policy=workerPolicy(options.policy);
  return {...options,policy};
}
function proof(config,key,policy){
  const payload={version:1,ownerPolicyDigest:config.policyDigest,serverDigest:sha(config.serverOrigin),databaseName:LIFE_DATABASE_NAME,policy};
  const mac=createHmac('sha256',key).update('JH_LIFE_STORAGE_BINDING_V1\0'+contentCanonical(payload)).digest('hex');
  return {...payload,mac};
}
function noResidue(config){
  if(exists(path.join(config.stateDir,MARKER))||readdirSync(config.stateDir).some(n=>n.startsWith('.jh-life-stage-')))
    fail('LIFE_INITIALIZATION_REVIEW_REQUIRED');
}
function inspectWithKey(config,o,key){
  noResidue(config);
  const bindingPath=path.join(config.stateDir,BINDING);
  if(!exists(o.databasePath)||!exists(bindingPath))fail('LIFE_STORAGE_NOT_PROVISIONED');
  let actual;
  try{actual=contentParse(privateBytes(bindingPath,8192));}catch{fail('LIFE_STORAGE_BINDING_INVALID');}
  const expected=Buffer.from(contentCanonical(proof(config,key,o.policy))),got=Buffer.from(contentCanonical(actual));
  if(expected.length!==got.length||!timingSafeEqual(expected,got))fail('LIFE_STORAGE_BINDING_MISMATCH');
  let store;
  try{
    store=new LifeCheckpointStore({databasePath:o.databasePath,key,serverDigest:sha(config.serverOrigin),initialize:false});
    store.assertRuntimeReady();
  }finally{store?.close();}
  return Object.freeze({code:'LIFE_STORAGE_INSPECTED',created:false,credentialsCreated:false,workersStarted:0,
    productionDurabilityVerified:false});
}
/** Run while the existing owner runtime lock is held by the caller. No lock bypass
 * is added to the CLI. This checks configuration, filesystem and existing data. */
export function inspectProvisionedLifeStorage(config,options,observations){
  const o=checked(config,options);inspectOwnerMount(config,observations);
  const key=loadOwnerKey(o.keyFile,config);
  try{return inspectWithKey(config,o,key);}finally{key.fill(0);}
}
/** Explicit one-time preparation. Any crash during publication leaves a review marker.
 * Hard-link publication is no-replace; remove the temporary link before normal DB open.
 * Existing work is NEVER erased, migrated, or reinitialized to make readiness green. */
export function initializeLifeStorage(config,ownerKey,options,confirmation,observations){
  if(confirmation!=='EXPLICIT_ONE_TIME')fail('LIFE_EXPLICIT_INITIALIZATION_REQUIRED');
  const o=checked(config,options);checkOwnerStorage(config,ownerKey,observations);
  const key=loadOwnerKey(o.keyFile,config);
  let lock,store;
  try{
    if(timingSafeEqual(ownerKey,key))fail('LIFE_KEY_MUST_DIFFER_FROM_OWNER_KEY');
    lock=acquireOwnerRuntimeLock(config);noResidue(config);
    const bindingPath=path.join(config.stateDir,BINDING);
    if(exists(o.databasePath)||exists(bindingPath)){
      inspectWithKey(config,o,key);
      return Object.freeze({code:'LIFE_STORAGE_ALREADY_PROVISIONED',created:false,credentialsCreated:false,workersStarted:0});
    }
    for(const suffix of ['-journal','-wal','-shm'])if(exists(o.databasePath+suffix))fail('LIFE_ORPHAN_DATABASE_FILES');
    const marker=path.join(config.stateDir,MARKER);
    writePrivate(marker,Buffer.from('JH_LIFE_INITIALIZATION_REVIEW_REQUIRED\n'));syncDir(config.stateDir);
    const stage=path.join(config.stateDir,'.jh-life-stage-'+randomBytes(12).toString('hex'));
    mkdirSync(stage,{mode:0o700});syncDir(config.stateDir);
    const stagedDb=path.join(stage,LIFE_DATABASE_NAME),stagedBinding=path.join(stage,BINDING);
    store=new LifeCheckpointStore({databasePath:stagedDb,key,serverDigest:sha(config.serverOrigin),initialize:true});
    store.initializeContentStorage();store.initializeWorkerStorage(o.policy);store.initializeQueueStorage();
    store.assertRuntimeReady();store.close();store=null;
    writePrivate(stagedBinding,Buffer.from(contentCanonical(proof(config,key,o.policy))));syncDir(stage);
    // linkSync throws EEXIST rather than replacing an unexpected destination.
    linkSync(stagedDb,o.databasePath);unlinkSync(stagedDb);syncDir(stage);syncDir(config.stateDir);
    linkSync(stagedBinding,bindingPath);unlinkSync(stagedBinding);syncDir(stage);syncDir(config.stateDir);
    rmdirSync(stage);syncDir(config.stateDir);
    unlinkSync(marker);syncDir(config.stateDir);
    inspectWithKey(config,o,key);
    return Object.freeze({code:'LIFE_STORAGE_PROVISIONED',created:true,credentialsCreated:false,workersStarted:0,
      taskResultsCreated:0,productionDurabilityVerified:false});
  }finally{try{store?.close();}finally{try{lock?.close();}finally{key.fill(0);}}}
}
/** Optional adapter for installConfiguredLifeRuntime's already-existing open() slot.
 * Parent owner startup still checks its storage and holds the runtime lock.
 * A prepared database does not grant authorization: the original private registry
 * remains the authenticator, and an empty registry authorizes nobody. */
export function createProvisionedLifeBootstrap(config,options,observations){
  if(!options||Object.keys(options).some(k=>!['keyFile','databasePath','policy','registryFile'].includes(k)))fail('LIFE_STORAGE_OPTIONS_INVALID');
  const o=checked(config,{keyFile:options.keyFile,databasePath:options.databasePath,policy:options.policy});
  const original=createRegisteredLifeBootstrap(config,{keyFile:o.keyFile,databasePath:o.databasePath,registryFile:options.registryFile});
  return Object.freeze({enabled:true,remoteTasks:true,async open(binding){
    if(binding?.ownerDigest!==config.accountDigest||binding?.serverOrigin!==config.serverOrigin||binding?.stateDirectory!==config.stateDir)
      fail('LIFE_STORAGE_OWNER_BINDING_MISMATCH');
    inspectProvisionedLifeStorage(config,o,observations);
    return original.open(binding);
  }});
}
