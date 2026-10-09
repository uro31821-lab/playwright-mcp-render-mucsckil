/** Explicit final composition of EXISTING owner server + prepared Life store + live browser.
 * Does not initialize storage or issue credentials. Never used as an unconfigured
 * fallback for the currently deployed browser-only service.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {startConfiguredOwnerServer,safeErrorCode} from './owner-service-entry.mjs';
import {assertConfig,loadOwnerConfiguration,loadOwnerKey,privateBytes,fail} from './owner-config.mjs';
import {contentParse} from '../server-continuation/life-content-wire.mjs';
import {createProvisionedLifeBootstrap} from './life-storage-provision.mjs';
export async function startUnifiedOwnerServer({config,key,lifeStorage,storageObservations,port,bindAddress}={}){
 assertConfig(config);
 if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_SIZE_INVALID');
 if(!lifeStorage)fail('LIFE_REVIEWED_BOOTSTRAP_REQUIRED');
 // Do not let an alternate bootstrap skip storage inspection or registry validation.
 const life=createProvisionedLifeBootstrap(config,lifeStorage,storageObservations);
 const lifeKey=loadOwnerKey(lifeStorage.keyFile,config);
 try{if(timingSafeEqual(key,lifeKey))fail('LIFE_KEY_MUST_DIFFER_FROM_OWNER_KEY');}finally{lifeKey.fill(0);}
 return startConfiguredOwnerServer({config,key,life,storageObservations,port,bindAddress,runtimeMode:'unified'});
}
export function validateUnifiedEnvironment(env){
 if(env.JH_PC_OWNER_SETUP_ENABLED!==undefined||env.JH_PC_OWNER_SETUP_PLAN_FILE!==undefined)fail('PC_SETUP_OPERATIONAL_PHASE_CONFLICT');
 if(env.JH_OWNER_ENABLED!=='1'||env.JH_LIFE_ENABLED!=='1')fail('UNIFIED_EXPLICIT_ENABLE_REQUIRED');
 if(env.JH_LIFE_INITIALIZE!==undefined)fail('INITIALIZATION_NOT_ALLOWED_AT_START');
 const fields=['JH_OWNER_CONFIG_FILE','JH_OWNER_KEY_FILE','JH_LIFE_KEY_FILE','JH_LIFE_DATABASE_FILE','JH_LIFE_REGISTRY_FILE','JH_LIFE_POLICY_FILE'];
 if(!fields.every(k=>typeof env[k]==='string'&&path.isAbsolute(env[k])&&path.normalize(env[k])===env[k]&&!env[k].includes('\0')))fail('UNIFIED_PRIVATE_CONFIGURATION_REQUIRED');
 if(new Set(fields.map(k=>env[k])).size!==fields.length)fail('UNIFIED_CONFIGURATION_PATH_COLLISION');
 if(env.PORT!==undefined&&(!/^[0-9]{1,5}$/.test(env.PORT)||Number(env.PORT)<1||Number(env.PORT)>65535))fail('LISTENER_CONFIGURATION_INVALID');
 return true;
}
export async function main(env=process.env){
 validateUnifiedEnvironment(env);
 const config=loadOwnerConfiguration(env.JH_OWNER_CONFIG_FILE),key=loadOwnerKey(env.JH_OWNER_KEY_FILE,config);
 try{
  const lifeStorage={keyFile:env.JH_LIFE_KEY_FILE,databasePath:env.JH_LIFE_DATABASE_FILE,
   registryFile:env.JH_LIFE_REGISTRY_FILE,policy:contentParse(privateBytes(env.JH_LIFE_POLICY_FILE,4096))};
  const running=await startUnifiedOwnerServer({config,key,lifeStorage,port:Number(env.PORT||3000)});
  console.log('JH_UNIFIED_RUNTIME_STARTED '+JSON.stringify({ownerHostInstalled:true,lifeRuntimeInstalled:true,
   browserProbePerformed:false,credentialsCreated:false,workersStarted:0,productionDurabilityVerified:false}));
  const stop=()=>void running.close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});
  process.once('SIGTERM',stop);process.once('SIGINT',stop);return running;
 }finally{key.fill(0);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(e=>{console.error(safeErrorCode(e));process.exitCode=1;});
}
