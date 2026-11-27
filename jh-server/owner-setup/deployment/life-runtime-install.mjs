/** Reviewed in-process bootstrap, not an untrusted module path or a general login grant.
 * Parent owner startup has checked the mounted storage and acquired the existing runtime lock.
 * Caller explicitly opens a PREPROVISIONED continuation DB and supplies its current authenticator.
 * No credentials/scope/token are manufactured here; all endpoint checks remain in force. */
import path from 'node:path';
import {assertConfig,fail,sha} from './owner-config.mjs';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
import {createLifeContinuationHost} from '../server-continuation/life-continuation-host.mjs';
export async function installConfiguredLifeRuntime(runtime,config,options) {
 assertConfig(config);
 if(!options||options.enabled!==true||typeof options.open!=='function'||
  Object.keys(options).some(k=>!['enabled','open','remoteTasks'].includes(k))||typeof options.remoteTasks!=='boolean')fail('LIFE_EXPLICIT_CONFIGURATION_REQUIRED');
 if(runtime?.httpServer?.listening||typeof runtime?.installLifeContinuationHandler56!=='function')fail('LIFE_RUNTIME_SLOT_REQUIRED');
 let resources,slot,closed=false,closePromise;
 function close(){if(!closePromise)closePromise=(async()=>{closed=true;try{await slot?.drain();}finally{try{resources?.store?.close();}finally{await resources?.close?.();}}})();return closePromise;}
 try{
  resources=await options.open(Object.freeze({ownerDigest:config.accountDigest,serverOrigin:config.serverOrigin,stateDirectory:config.stateDir}));
  if(!resources||!(resources.store instanceof LifeCheckpointStore)||typeof resources.authenticate!=='function'||typeof resources.close!=='function')fail('LIFE_BOOTSTRAP_RESOURCES_REQUIRED');
  if(resources.ownerDigest!==config.accountDigest||resources.serverOrigin!==config.serverOrigin||
    resources.store.serverDigest!==sha(config.serverOrigin)||path.dirname(resources.store.databasePath)!==config.stateDir)fail('LIFE_BOOTSTRAP_IDENTITY_MISMATCH');
  resources.store.assertRuntimeReady();
  // Authenticators are invoked for every endpoint's before/after body check, NOT cached.
  const authenticate=async req=>{
   if(closed)return null;
   const p=await resources.authenticate(req);
   if(!p||p.ownerDigest!==config.accountDigest)return null;
   return structuredClone(p); // preserve independent before/after Set/Map snapshots against in-place grant mutation.
  };
  const clock=resources.clock??(()=>Date.now());
  if(typeof clock!=='function')fail('LIFE_CLOCK_REQUIRED');
  const handler=createLifeContinuationHost({store:resources.store,authenticate,clock,directory:resources.directory,enableQueue:true,enableRemoteTasks:options.remoteTasks});
  slot=runtime.installLifeContinuationHandler56(handler);
  if(!slot||typeof slot.quiesce!=='function'||typeof slot.drain!=='function')fail('LIFE_SLOT_CONTRACT_INVALID');
  return Object.freeze({installed:true,remoteTasks:options.remoteTasks,workersStarted:0,credentialsCreated:false,
   quiesce(){slot.quiesce();},close});
 }catch(e){await close();throw e;}
}
