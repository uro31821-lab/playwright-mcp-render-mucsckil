/** Developer/operator command, not a user installer. Credentials come from
 * private local files. Stdout contains status codes only, never config/key data. */
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync,writeFileSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {loadOwnerConfiguration,loadOwnerKey,renderAppResources,fail} from './owner-config.mjs';
import {initializeOwnerStorage,checkOwnerStorage} from './owner-storage.mjs';
import {safeErrorCode} from './owner-service-entry.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function main(args=process.argv.slice(2),env=process.env) {
  if(args.length<1||!['inspect','initialize','export-app'].includes(args[0]))fail('OWNER_COMMAND_REQUIRED');
  const config=loadOwnerConfiguration(env.JH_OWNER_CONFIG_FILE);
  if(args[0]==='export-app'){
    if(args.length!==2||!path.isAbsolute(args[1]))fail('APP_OUTPUT_PATH_REQUIRED');
    const baseline=path.join(root,'candidate/app/src/main/res/values/owner_enrollment_strings.xml');
    if(path.resolve(args[1])===baseline)fail('BASELINE_APP_WRITE_FORBIDDEN');
    const xml=renderAppResources(readFileSync(baseline,'utf8'),config);
    const fd=openSync(args[1],'wx',0o600);try{writeFileSync(fd,xml);fsyncSync(fd);}finally{closeSync(fd);}
    return {code:'APP_POLICY_EXPORTED_NOT_INSTALLED',secretsExported:false,accountActuallyVerified:false};
  }
  if(args.length!==1)fail('OWNER_COMMAND_ARGUMENTS_INVALID');
  const key=loadOwnerKey(env.JH_OWNER_KEY_FILE,config);
  try{
    if(args[0]==='initialize'){
      if(env.JH_OWNER_INITIALIZE!=='EXPLICIT_ONE_TIME')fail('EXPLICIT_STORAGE_INITIALIZATION_REQUIRED');
      return initializeOwnerStorage(config,key);
    }
    checkOwnerStorage(config,key);return {code:'OWNER_STORAGE_FILES_CHECKED',cloudDurabilityAttested:false,trustCreated:false};
  }finally{key.fill(0);}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{console.log(JSON.stringify(main()));}catch(e){console.error(safeErrorCode(e));process.exitCode=1;}
}
