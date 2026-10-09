/** Explicit operator CLI, never called from build/start/postinstall hooks. */
import {pathToFileURL} from 'node:url';import path from 'node:path';
import {loadOwnerConfiguration,loadOwnerKey,privateBytes,fail} from './owner-config.mjs';
import {checkOwnerStorage,acquireOwnerRuntimeLock} from './owner-storage.mjs';
import {contentParse} from '../server-continuation/life-content-wire.mjs';
import {initializeLifeStorage,inspectProvisionedLifeStorage} from './life-storage-provision.mjs';
export function main(args=process.argv.slice(2),env=process.env){
  if(args.length!==1||!['inspect','initialize'].includes(args[0]))fail('LIFE_STORAGE_COMMAND_REQUIRED');
  const config=loadOwnerConfiguration(env.JH_OWNER_CONFIG_FILE),ownerKey=loadOwnerKey(env.JH_OWNER_KEY_FILE,config);
  let lock;
  try{
    const options={keyFile:env.JH_LIFE_KEY_FILE,databasePath:env.JH_LIFE_DATABASE_FILE,
      policy:contentParse(privateBytes(env.JH_LIFE_POLICY_FILE,4096))};
    if(args[0]==='initialize')return initializeLifeStorage(config,ownerKey,options,env.JH_LIFE_INITIALIZE);
    checkOwnerStorage(config,ownerKey);lock=acquireOwnerRuntimeLock(config);
    return inspectProvisionedLifeStorage(config,options);
  }finally{try{lock?.close();}finally{ownerKey.fill(0);}}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{console.log(JSON.stringify(main()));}catch(e){
    // Never emit raw fs errors containing operator paths, or private values.
    console.error(typeof e?.code==='string'&&/^[A-Z_]{3,80}$/.test(e.code)?e.code:'LIFE_STORAGE_OPERATION_FAILED');process.exitCode=1;
  }
}
