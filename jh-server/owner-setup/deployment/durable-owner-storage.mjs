/** Host-only owner/volume binding for the candidate journal. No login or enrollment.
 * Production code does not select this module. Initial setup is an explicit offline action;
 * normal installation always opens an existing journal and never silently resets one.
 */
import path from 'node:path';
import {hkdfSync,createHash} from 'node:crypto';
import {openSync,closeSync,fsyncSync} from 'node:fs';
import {assertConfig} from './owner-config.mjs';
import {checkOwnerStorage,acquireOwnerRuntimeLock} from './owner-storage.mjs';
import {DurableManualCircuitFence} from './durable-manual-circuit-fence.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
function options(config,key,storageObservations){
 assertConfig(config);
 if(!Buffer.isBuffer(key)||key.length!==32)fail('DURABLE_OWNER_KEY_INVALID');
 checkOwnerStorage(config,key,storageObservations);
 const material=JSON.stringify(['JH_DURABLE_OWNER_V1',config.accountDigest,config.serverOrigin,config.catalogDigest,config.policyDigest,config.storageEpoch]);
 const namespace=createHash('sha256').update(material).digest('hex');
 const derived=Buffer.from(hkdfSync('sha256',key,Buffer.from(config.policyDigest,'hex'),Buffer.from('JH_DURABLE_NATIVE_KEY_V1'),32));
 return {file:path.join(config.stateDir,'manual-circuit.sqlite'),key:derived,namespace};
}
export function initializeOwnerDurableStorage({config,key,confirmation,storageObservations}={}){
 if(confirmation!=='EXPLICIT_ONE_TIME_NO_RETROSPECTIVE_CLAIM')fail('DURABLE_INITIALIZATION_CONFIRMATION_REQUIRED');
 const settings=options(config,key,storageObservations);
 let lock,journal;
 try{
  lock=acquireOwnerRuntimeLock(config);
  journal=new DurableManualCircuitFence({...settings,mode:'EXPLICIT_ONE_TIME',verifyAuthenticatedCompletion:()=>false});
  const counts=journal.counts();
  if(counts.uncertain!==0||counts.received!==0)fail('DURABLE_INITIALIZATION_NOT_EMPTY');
  journal.close();journal=null;
  const fd=openSync(config.stateDir,'r');try{fsyncSync(fd)}finally{closeSync(fd)}
  return Object.freeze({initialized:true,existingHistoryReconciled:false,sessionCreated:false,actionApprovalGranted:false});
 }finally{journal?.close();lock?.close();settings.key.fill(0)}
}
/** Caller must already hold the original owner runtime lock. Existing candidate install
 * rejects listening servers or non-empty job/device state. No key/options are returned.
 */
export function installOwnerBoundDurableCircuit(runtime,{config,key,storageObservations}={}){
 if(!runtime||typeof runtime.installDurableNativeCircuit56!=='function'||runtime.httpServer?.listening!==false)fail('DURABLE_OWNER_PRELISTEN_REQUIRED');
 const settings=options(config,key,storageObservations);
 try{
  const host=runtime.installDurableNativeCircuit56({...settings,mode:'read'});
  if(host?.installed!==true||typeof host.close!=='function')fail('DURABLE_OWNER_INSTALL_CONTRACT');
  return Object.freeze({installed:true,initialized:false,sessionCreated:false,actionApprovalGranted:false,close:()=>host.close()});
 }finally{settings.key.fill(0)}
}
