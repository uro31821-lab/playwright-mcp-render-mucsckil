/** Production composition. It installs the already-tested owner/trust modules
 * BEFORE opening a listener. This file performs no account login or enrollment.
 * Missing/mismatched config or storage is a startup error, never an implicit reset. */
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {loadOwnerConfiguration,loadOwnerKey,assertConfig,hostOptions,fail,sha} from './owner-config.mjs';
import {checkOwnerStorage,acquireOwnerRuntimeLock} from './owner-storage.mjs';
import {installConfiguredOwnerHost} from '../owner-enrollment/owner-host-bootstrap.mjs';
import {installConfiguredLifeRuntime} from './life-runtime-install.mjs';
import {assertUnifiedRuntime} from './unified-runtime-build.mjs';
import {assertFunctionalReleaseRuntime} from './functional-release-runtime.mjs';
import {createRegisteredLifeBootstrap} from './life-registered-bootstrap.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let startAttempted=false;
export async function startConfiguredOwnerServer({config,key,port=Number(process.env.PORT||3000),bindAddress='0.0.0.0',storageObservations,life,runtimeMode='owner'}={}) {
  assertConfig(config);
  if(!['owner','unified'].includes(runtimeMode))fail('RUNTIME_MODE_INVALID');
  if(startAttempted)fail('OWNER_START_ALREADY_ATTEMPTED');
  if(!Buffer.isBuffer(key)||key.length!==32)fail('KEY_SIZE_INVALID');
  if(!Number.isInteger(port)||port<0||port>65535||!['0.0.0.0','127.0.0.1'].includes(bindAddress))fail('LISTENER_CONFIGURATION_INVALID');
  if(process.env.PUBLIC_BASE_URL&&process.env.PUBLIC_BASE_URL!==config.serverOrigin)fail('PUBLIC_BASE_URL_MISMATCH');
  checkOwnerStorage(config,key,storageObservations);
  const identity=JSON.parse(readFileSync(path.join(root,'evidence/owner-runtime-identity.json'),'utf8'));
  let serverPath=path.join(root,'server-integration/server.mjs');
  if(identity.deferListenSupported!==true||identity.hostEnabledByDefault!==false||sha(readFileSync(serverPath))!==identity.candidate)fail('OWNER_RUNTIME_IDENTITY_MISMATCH');
  if(runtimeMode==='unified')serverPath=assertFunctionalReleaseRuntime(root);
  const runtimeLock=acquireOwnerRuntimeLock(config);
  startAttempted=true;
  // Only this internal, reviewed entry sets defer. Default historical startup remains unchanged.
  process.env.JH_OWNER_DEFER_LISTEN='1';process.env.PUBLIC_BASE_URL=config.serverOrigin;
  let runtime,host,lifeHost,closed=false;
  try{
    runtime=await import(pathToFileURL(serverPath).href);
    if(runtime.httpServer.listening)fail('OWNER_LISTENER_OPENED_BEFORE_AUTH');
    host=installConfiguredOwnerHost(runtime,hostOptions(config,key));
    if(host.enrollmentHostInstalled!==true||host.trustCreated!==false||host.sessionCreated!==false||host.actionApprovalGranted!==false)fail('OWNER_HOST_START_CONTRACT_INVALID');
    if(life!==undefined)lifeHost=await installConfiguredLifeRuntime(runtime,config,life);
    await new Promise((resolve,reject)=>{
      const onError=e=>{runtime.httpServer.off('listening',onListen);reject(e);};
      const onListen=()=>{runtime.httpServer.off('error',onError);resolve();};
      runtime.httpServer.once('error',onError);runtime.httpServer.once('listening',onListen);
      runtime.httpServer.listen(port,bindAddress);
    });
    const actualPort=runtime.httpServer.address().port;
    return Object.freeze({port:actualPort,hostInstalled:true,trustCreated:false,sessionCreated:false,lifeRuntimeInstalled:!!lifeHost,
      async close(){
        if(closed)return;closed=true;lifeHost?.quiesce();
        const timer=setTimeout(()=>runtime.httpServer.closeAllConnections(),3000);timer.unref();
        try{await new Promise((resolve,reject)=>runtime.httpServer.close(e=>e?reject(e):resolve()));}
        finally{clearTimeout(timer);try{await lifeHost?.close();}finally{try{host.close();}finally{runtimeLock.close();}}}
      }});
  }catch(e){lifeHost?.quiesce();try{runtime?.httpServer?.closeAllConnections();runtime?.httpServer?.close();}catch{}try{await lifeHost?.close();}catch{}try{host?.close();}catch{}runtimeLock.close();throw e;}
}
export async function main(env=process.env,lifeBootstrap) {
  // Explicit first-identity phase. Never an automatic fallback for missing owner config.
  if(env.JH_PC_OWNER_SETUP_ENABLED!==undefined||env.JH_PC_OWNER_SETUP_PLAN_FILE!==undefined){
    if(lifeBootstrap!==undefined)fail('PC_SETUP_OPERATIONAL_PHASE_CONFLICT');
    const {main:setupMain}=await import('./pc-owner-service-entry.mjs');
    return setupMain(env);
  }
  if(env.JH_LIFE_ENABLED!==undefined&&env.JH_LIFE_ENABLED!=='1')fail('LIFE_EXPLICIT_ENABLE_INVALID');
  const registered=env.JH_LIFE_ENABLED==='1'&&lifeBootstrap===undefined;
  const files=['JH_LIFE_REGISTRY_FILE','JH_LIFE_KEY_FILE','JH_LIFE_DATABASE_FILE'];
  if(registered&&!files.every(k=>typeof env[k]==='string'&&env[k]))fail('LIFE_REVIEWED_BOOTSTRAP_REQUIRED');
  if(!registered&&files.some(k=>env[k]!==undefined))fail('LIFE_AMBIGUOUS_BOOTSTRAP');
  if(env.JH_LIFE_ENABLED!=='1'&&lifeBootstrap!==undefined)fail('LIFE_REVIEWED_BOOTSTRAP_REQUIRED');
  if(env.JH_OWNER_ENABLED!=='1')fail('OWNER_EXPLICIT_ENABLE_REQUIRED');
  if(env.PORT!==undefined&&(!/^[0-9]{1,5}$/.test(env.PORT)||Number(env.PORT)<1||Number(env.PORT)>65535))fail('LISTENER_CONFIGURATION_INVALID');
  const config=loadOwnerConfiguration(env.JH_OWNER_CONFIG_FILE),key=loadOwnerKey(env.JH_OWNER_KEY_FILE,config);
  try{
    if(registered)lifeBootstrap=createRegisteredLifeBootstrap(config,{registryFile:env.JH_LIFE_REGISTRY_FILE,keyFile:env.JH_LIFE_KEY_FILE,databasePath:env.JH_LIFE_DATABASE_FILE});
    const running=await startConfiguredOwnerServer({config,key,life:lifeBootstrap});
    console.log('JH_OWNER_RUNTIME_READY '+JSON.stringify({hostInstalled:true,trustCreated:false,sessionCreated:false,actionApprovalGranted:false}));
    const stop=()=>void running.close().then(()=>{process.exitCode=0;},()=>{process.exitCode=1;});
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
    return running;
  }finally {key.fill(0);}
}
export function safeErrorCode(e){return typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'OWNER_STARTUP_FAILED';}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  main().catch(e=>{console.error(safeErrorCode(e));process.exitCode=1;});
}
