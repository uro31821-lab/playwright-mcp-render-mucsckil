/** Data-only configured bootstrap. It opens pre-existing private state and scoped registrations.
 * No token issuance, login, grant creation, DB initialization, network provider or worker launch.
 */
import path from 'node:path';
import {privateBytes,loadOwnerKey,assertConfig,sha,fail} from './owner-config.mjs';
import {contentParse} from '../server-continuation/life-content-wire.mjs';
import {LifeRuntimeAuthority} from '../server-continuation/life-runtime-authority.mjs';
import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';
export function createRegisteredLifeBootstrap(config,options){
 assertConfig(config);
 if(!options||Object.keys(options).some(k=>!['registryFile','keyFile','databasePath','clock'].includes(k)))fail('LIFE_REGISTERED_CONFIGURATION_REQUIRED');
 const {registryFile,keyFile,databasePath,clock=Date.now}=options;
 if(!path.isAbsolute(registryFile||'')||!path.isAbsolute(keyFile||'')||!path.isAbsolute(databasePath||'')||
  path.normalize(databasePath)!==databasePath||path.dirname(databasePath)!==config.stateDir||new Set([registryFile,keyFile,databasePath]).size!==3||typeof clock!=='function')fail('LIFE_REGISTERED_CONFIGURATION_REQUIRED');
 let opened=false;
 return Object.freeze({enabled:true,remoteTasks:true,async open(binding){
  if(opened)fail('LIFE_REGISTERED_ALREADY_OPENED');opened=true;
  if(binding.ownerDigest!==config.accountDigest||binding.serverOrigin!==config.serverOrigin||binding.stateDirectory!==config.stateDir)fail('LIFE_REGISTERED_SCOPE_MISMATCH');
  let authority,store,key;
  try{
   authority=new LifeRuntimeAuthority({ownerDigest:config.accountDigest,serverDigest:sha(config.serverOrigin),clock,
    load(){return contentParse(privateBytes(registryFile,262144));}});
   key=loadOwnerKey(keyFile,config);store=new LifeCheckpointStore({databasePath,key,serverDigest:sha(config.serverOrigin),initialize:false});store.assertRuntimeReady();
   return Object.freeze({ownerDigest:config.accountDigest,serverOrigin:config.serverOrigin,store,clock,
    authenticate:req=>authority.authenticate(req),directory:p=>authority.directory(p),close(){authority.close();}});
  }catch(e){try{store?.close();}finally{authority?.close();}throw e;}finally{key?.fill(0);}
 }});
}
