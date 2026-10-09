/** Explicit FIRST identity setup phase in the existing sealed HTTP runtime.
 * This entry needs no owner subject/key/DB. It never activates owner/Life after
 * saving a candidate. Production CLI cannot supply fixture clocks/verifiers or
 * synthetic mount observations. Run separately from configured owner startup. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {privateBytes,fail,EXPECTED_ORIGIN} from './owner-config.mjs';
import {parseOwnerJson} from '../owner-enrollment/owner-enrollment-http.mjs';
import {validatePcOwnerSetupPlan} from './pc-owner-handoff.mjs';
import {createPcOwnerSetupService} from './pc-owner-setup-service.mjs';
import {assertPcOwnerRuntime} from './pc-owner-runtime-build.mjs';
const root=path.resolve(import.meta.dirname,'..');
let startAttempted=false;
const operationalFields=['JH_OWNER_ENABLED','JH_OWNER_CONFIG_FILE','JH_OWNER_KEY_FILE',
 'JH_LIFE_ENABLED','JH_LIFE_KEY_FILE','JH_LIFE_DATABASE_FILE','JH_LIFE_REGISTRY_FILE',
 'JH_LIFE_POLICY_FILE','JH_LIFE_INITIALIZE'];
export function validatePcOwnerSetupEnvironment(env){
 if(!env||env.JH_PC_OWNER_SETUP_ENABLED!=='1')fail('PC_SETUP_EXPLICIT_ENABLE_REQUIRED');
 if(operationalFields.some(k=>env[k]!==undefined))fail('PC_SETUP_OPERATIONAL_PHASE_CONFLICT');
 const p=env.JH_PC_OWNER_SETUP_PLAN_FILE;
 if(typeof p!=='string'||!path.isAbsolute(p)||p===path.parse(p).root||path.normalize(p)!==p||/[\0\r\n]/.test(p))fail('PC_SETUP_PRIVATE_PLAN_REQUIRED');
 if(env.PUBLIC_BASE_URL!==undefined&&env.PUBLIC_BASE_URL!==EXPECTED_ORIGIN)fail('PUBLIC_BASE_URL_MISMATCH');
 if(env.PORT!==undefined&&(!/^[0-9]{1,5}$/.test(env.PORT)||Number(env.PORT)<1||Number(env.PORT)>65535))fail('LISTENER_CONFIGURATION_INVALID');
 return true;
}
export function loadPcOwnerSetupPlan(filename){
 const bytes=privateBytes(filename,8192);
 try{return validatePcOwnerSetupPlan(parseOwnerJson(bytes));}
 catch(e){if(e?.code==='PC_SETUP_PLAN_INVALID')throw e;fail('PC_SETUP_PLAN_JSON_INVALID');}
 finally{bytes.fill(0);}
}
export async function startPcOwnerSetupServer({plan:input,port=3000,bindAddress='0.0.0.0',storageObservations,oauthClient,clock=Date.now}={}){
 const plan=validatePcOwnerSetupPlan(input);
 if(startAttempted)fail('PC_SETUP_START_ALREADY_ATTEMPTED');
 if(!Number.isInteger(port)||port<0||port>65535||!['0.0.0.0','127.0.0.1'].includes(bindAddress))fail('LISTENER_CONFIGURATION_INVALID');
 if(process.env.PUBLIC_BASE_URL!==undefined&&process.env.PUBLIC_BASE_URL!==plan.serverOrigin)fail('PUBLIC_BASE_URL_MISMATCH');
 if(operationalFields.some(k=>process.env[k]!==undefined))fail('PC_SETUP_OPERATIONAL_PHASE_CONFLICT');
 const serverPath=assertPcOwnerRuntime(root); // validate exact dispatch before loading it
 const service=createPcOwnerSetupService({plan,storageObservations,oauthClient,clock});
 let candidateAlreadySaved;
 try{candidateAlreadySaved=service.configuration()!==null;}catch(e){service.close();throw e;}
 startAttempted=true;
 process.env.JH_OWNER_DEFER_LISTEN='1';process.env.PUBLIC_BASE_URL=plan.serverOrigin;
 let runtime,registration,ownsRuntime=false,closing;
 async function close(){
  if(closing)return closing;
  registration?.quiesce();service.close(); // fences proof completion BEFORE drain
  closing=(async()=>{
   if(!ownsRuntime)return;
   const timer=setTimeout(()=>runtime.httpServer.closeAllConnections(),3000);timer.unref();
   try{
    await new Promise((resolve,reject)=>runtime.httpServer.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?reject(e):resolve()));
   }finally{clearTimeout(timer);await registration?.drain();}
  })();
  return closing;
 }
 try{
  runtime=await import(pathToFileURL(serverPath).href);
  if(runtime.httpServer.listening)fail('PC_SETUP_LISTENER_ALREADY_OPEN');
  ownsRuntime=true;
  if(typeof runtime.installPcOwnerSetupHandler56!=='function')fail('PC_SETUP_RUNTIME_CONTRACT_INVALID');
  registration=runtime.installPcOwnerSetupHandler56(service.handler);
  await new Promise((resolve,reject)=>{
   const onError=e=>{runtime.httpServer.off('listening',onListen);reject(e);};
   const onListen=()=>{runtime.httpServer.off('error',onError);resolve();};
   runtime.httpServer.once('error',onError);runtime.httpServer.once('listening',onListen);
   runtime.httpServer.listen(port,bindAddress);
  });
  return Object.freeze({port:runtime.httpServer.address().port,pcSetupInstalled:true,
   configurationCandidateSaved:candidateAlreadySaved,identityVerifiedNow:false,
   ownerHostInstalled:false,lifeRuntimeInstalled:false,trustCreated:false,sessionCreated:false,
   actionApproved:false,close});
 }catch(e){try{await close();}catch{}throw e;}
}
function safeCode(e){return typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'PC_SETUP_STARTUP_FAILED';}
export async function main(env=process.env){
 validatePcOwnerSetupEnvironment(env);
 const plan=loadPcOwnerSetupPlan(env.JH_PC_OWNER_SETUP_PLAN_FILE);
 // The operator CLI is pinned to the existing production mount. No environment
 // flag enables synthetic filesystem observations or account verification.
 if(plan.storageMount!=='/var/data')fail('PC_SETUP_PRODUCTION_MOUNT_REQUIRED');
 const running=await startPcOwnerSetupServer({plan,port:Number(env.PORT||3000)});
 console.log('JH_PC_OWNER_SETUP_READY '+JSON.stringify({pcSetupInstalled:true,
  configurationCandidateSaved:running.configurationCandidateSaved,identityVerifiedNow:false,
  ownerHostInstalled:false,lifeRuntimeInstalled:false,trustCreated:false,actionApproved:false}));
 const stop=()=>void running.close().then(()=>{process.exitCode=0;cleanup();},()=>{process.exitCode=1;cleanup();});
 const cleanup=()=>{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);return running;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(e=>{console.error(safeCode(e));process.exitCode=1;});
}
