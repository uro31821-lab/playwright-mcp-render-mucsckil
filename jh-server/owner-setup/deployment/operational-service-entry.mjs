/** Explicit operator transition after saved Google identity. Uses existing owner,
 * Life storage and sealed runtime, with an empty (deny-all) Life registry.
 * Merely setting the two secrets DOES NOT enable this entry. No phone trust,
 * workflow grant, provider request, worker or scheduler is created here.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {assertConfig,loadOwnerKey,privateBytes,sha,fail} from './owner-config.mjs';
import {loadPcOwnerSetupPlan} from './pc-owner-service-entry.mjs';
import {readPcOwnerConfiguration} from './pc-owner-handoff.mjs';
import {inspectOwnerMount,initializeOwnerStorage,checkOwnerStorage,acquireOwnerRuntimeLock} from './owner-storage.mjs';
import {initializeLifeStorage,inspectProvisionedLifeStorage} from './life-storage-provision.mjs';
import {startUnifiedOwnerServer} from './unified-service-entry.mjs';
import {preparePublishedStartup} from './published-service-entry.mjs';
import {contentCanonical,contentParse} from '../server-continuation/life-content-wire.mjs';
import {validateRuntimeRegistry} from '../server-continuation/life-runtime-authority.mjs';
import {workerPolicy} from '../server-continuation/life-worker-policy.mjs';
import {takeStorageSecrets,materializeStorageKeys,privateDirectory,syncDirectory,pathExists,writeExclusivePrivate} from './storage-secret-bridge.mjs';
const ROOT=path.resolve(import.meta.dirname,'..');
const SERVICE='srv-db0fjl2d0e5s73be114g';
// Conservative initial storage limits. No work can use them without a separate
// per-workflow scoped registration; this entry never creates such registrations.
export const INITIAL_STORAGE_POLICY=workerPolicy({maxActiveWorkflows:1,maxParallelTasks:1,maxTaskStarts:8,leaseMillis:30000,runtimeMillis:600000});
const encode=x=>Buffer.from(contentCanonical(x));
const mac=(key,p)=>createHmac('sha256',key).update('JH_OPERATION_READY_V1\0').update(contentCanonical(p)).digest('hex');
const equal=(a,b)=>a.length===b.length&&timingSafeEqual(a,b);
function readReady(config,keys,receipt,payload){
 const b=privateBytes(receipt,8192);let actual;
 try{actual=contentParse(b);}finally{b.fill(0);}
 const expected={...payload,ownerMac:mac(keys.owner,payload),lifeMac:mac(keys.life,payload)};
 if(!equal(encode(actual),encode(expected)))fail('OPERATION_RECEIPT_OR_KEYS_MISMATCH');
}
/** Internal provisioning unit. Only its explicit production caller supplies real
 * validated identity and mount data. Synthetic observations exist solely in tests. */
export function prepareOperationalStorage(config,keyFiles,{confirmation,storageObservations}={}){
 assertConfig(config);
 if(confirmation!=='EXPLICIT_ONE_TIME')fail('OPERATION_EXPLICIT_PREPARATION_REQUIRED');
 inspectOwnerMount(config,storageObservations);
 const base=path.join(config.storageMount,'jh-pc-bootstrap');privateDirectory(base);
 const marker=path.join(base,'.operational-preparing'),receipt=path.join(base,'operational-ready.json');
 const lifeStorage={keyFile:keyFiles.lifeKeyFile,databasePath:path.join(config.stateDir,'life.sqlite'),registryFile:path.join(config.stateDir,'life-registry.json'),policy:INITIAL_STORAGE_POLICY};
 const payload={version:1,keyScheme:'HKDF_SHA256_JH_STORAGE_SECRET_BRIDGE_V1',ownerPolicyDigest:config.policyDigest,policy:INITIAL_STORAGE_POLICY};
 const keys={owner:loadOwnerKey(keyFiles.ownerKeyFile,config),life:undefined};
 try{
  keys.life=loadOwnerKey(keyFiles.lifeKeyFile,config);
  if(equal(keys.owner,keys.life))fail('LIFE_KEY_MUST_DIFFER_FROM_OWNER_KEY');
  if(pathExists(marker))fail('OPERATION_PREPARATION_INTERRUPTED');
  let created=false;
  if(pathExists(receipt)){
   readReady(config,keys,receipt,payload);
   checkOwnerStorage(config,keys.owner,storageObservations);
  }else{
   // Never treat unrelated, partially initialized or existing storage as empty.
   if(pathExists(config.stateDir)||pathExists(path.join(config.storageMount,'.jh-owner-initialize.lock'))||fs.readdirSync(config.storageMount).some(n=>n.startsWith('.jh-owner-stage-')))fail('EXISTING_STORAGE_REVIEW_REQUIRED');
   writeExclusivePrivate(marker,Buffer.from('JH_EXPLICIT_OPERATION_PREPARATION_V1\n'));syncDirectory(base);
   initializeOwnerStorage(config,keys.owner,storageObservations);
   const {registryFile,...storageOptions}=lifeStorage;
   initializeLifeStorage(config,keys.owner,storageOptions,'EXPLICIT_ONE_TIME',storageObservations);
   const registry={version:1,epoch:'initial_'+sha(config.storageEpoch).slice(0,24),revision:1,ownerDigest:config.accountDigest,serverDigest:sha(config.serverOrigin),registrations:[]};
   validateRuntimeRegistry(registry,{ownerDigest:config.accountDigest,serverDigest:sha(config.serverOrigin)});
   writeExclusivePrivate(lifeStorage.registryFile,encode(registry));syncDirectory(config.stateDir);
   // Publish receipt only after the existing storage checks and empty registry readback.
   checkOwnerStorage(config,keys.owner,storageObservations);
   const lock=acquireOwnerRuntimeLock(config);
   try{inspectProvisionedLifeStorage(config,storageOptions,storageObservations);}finally{lock.close();}
   const savedRegistry=contentParse(privateBytes(lifeStorage.registryFile,262144));
   if(!equal(encode(savedRegistry),encode(registry)))fail('OPERATION_REGISTRY_READBACK_FAILED');
   writeExclusivePrivate(receipt,encode({...payload,ownerMac:mac(keys.owner,payload),lifeMac:mac(keys.life,payload)}));syncDirectory(base);
   readReady(config,keys,receipt,payload);
   fs.unlinkSync(marker);syncDirectory(base);created=true;
  }
  const lock=acquireOwnerRuntimeLock(config);
  try{
   const {registryFile,...storageOptions}=lifeStorage;
   inspectProvisionedLifeStorage(config,storageOptions,storageObservations);
   validateRuntimeRegistry(contentParse(privateBytes(registryFile,262144)),{ownerDigest:config.accountDigest,serverDigest:sha(config.serverOrigin)});
  }finally{lock.close();}
  return Object.freeze({created,lifeStorage,identityVerifiedNow:false,trustCreated:false,credentialsCreated:false,workersStarted:0});
 }finally{keys.owner.fill(0);keys.life?.fill(0);}
}
export function validateOperationalEnvironment(env){
 if(env.JH_OPERATIONAL_START!=='PREPARE_AND_SERVE_V1'||env.RENDER_SERVICE_ID!==SERVICE)fail('OPERATION_EXPLICIT_SERVICE_REQUIRED');
 if(typeof env.JH_OPERATIONAL_ACCOUNT_DIGEST!=='string'||!/^[a-f0-9]{64}$/.test(env.JH_OPERATIONAL_ACCOUNT_DIGEST))fail('OPERATION_ACCOUNT_PIN_REQUIRED');
 if(env.JH_PC_OWNER_SETUP_ENABLED!=='1'||env.JH_PC_OWNER_SETUP_PLAN_FILE!=='/var/data/jh-pc-bootstrap/plan.json')fail('OPERATION_SAVED_SETUP_REQUIRED');
 const forbidden=['JH_OWNER_ENABLED','JH_OWNER_CONFIG_FILE','JH_OWNER_KEY_FILE','JH_OWNER_INITIALIZE','JH_LIFE_ENABLED','JH_LIFE_KEY_FILE','JH_LIFE_DATABASE_FILE','JH_LIFE_REGISTRY_FILE','JH_LIFE_POLICY_FILE','JH_LIFE_INITIALIZE'];
 if(forbidden.some(k=>env[k]!==undefined))fail('OPERATION_EXISTING_SETTINGS_REVIEW_REQUIRED');
 if(env.PUBLIC_BASE_URL!==undefined&&env.PUBLIC_BASE_URL!=='https://jh-secure-bridge-fix4.onrender.com')fail('PUBLIC_BASE_URL_MISMATCH');
 if(env.PORT!==undefined&&(!/^[0-9]{1,5}$/.test(env.PORT)||Number(env.PORT)<1||Number(env.PORT)>65535))fail('LISTENER_CONFIGURATION_INVALID');
}
export async function main(env=process.env){
 validateOperationalEnvironment(env);
 const secrets=takeStorageSecrets(env);let running,observer;
 try{
  const plan=loadPcOwnerSetupPlan(env.JH_PC_OWNER_SETUP_PLAN_FILE);
  if(plan.storageMount!=='/var/data')fail('OPERATION_PRODUCTION_MOUNT_REQUIRED');
  const config=readPcOwnerConfiguration(plan);
  if(!config||config.accountDigest!==env.JH_OPERATIONAL_ACCOUNT_DIGEST)fail('OPERATION_SAVED_IDENTITY_MISMATCH');
  // Validate all published ancestry and the exact runtime before any provisioning.
  await preparePublishedStartup();
  const {assertFunctionalReleaseRuntime}=await import('./functional-release-runtime.mjs');
  const runtime=assertFunctionalReleaseRuntime(ROOT);
  const keyFiles=materializeStorageKeys(config,secrets,'/tmp/jh-storage-keys-v1');
  const prepared=prepareOperationalStorage(config,keyFiles,{confirmation:'EXPLICIT_ONE_TIME'});
  const {installDiagnostics}=await import('../published-baseline/connection-diagnostics.mjs');observer=installDiagnostics();
  const key=loadOwnerKey(keyFiles.ownerKeyFile,config);
  try{running=await startUnifiedOwnerServer({config,key,lifeStorage:prepared.lifeStorage,port:Number(env.PORT||3000)});}finally{key.fill(0);}
  let closing;
  const close=()=>closing??=(async()=>{try{await running.close();}finally{observer.close();}})();
  const stop=()=>void close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{console.log('JH_OPERATIONAL_READY '+JSON.stringify({ownerHostInstalled:true,lifeRuntimeInstalled:true,storageCreated:prepared.created,storageReadbackVerified:true,identityVerifiedNow:false,trustCreated:false,credentialsCreated:false,workersStarted:0,runtimeSha256:sha(fs.readFileSync(runtime))}));}catch{}
  return {close};
 }catch(e){try{await running?.close();}finally{observer?.close();}throw e;}
 finally{secrets.owner.fill(0);secrets.life.fill(0);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){main().catch(e=>{console.error(typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'OPERATION_START_FAILED');process.exitCode=1;});}
