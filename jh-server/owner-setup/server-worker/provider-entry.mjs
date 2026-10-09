/** Explicit SERVER ONLY subprocess entry. Fixed source, private operator files, no env credentials,
 * plugin URLs, downloads, dynamic imports, background worker registration or OpenAI key creation.
 * Changing/removing the config or key file invalidates this process; it will not reload credentials.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {privateBytes} from '../deployment/owner-config.mjs';
import {strictJson,check,exact} from '../server-adapter/provider-json.mjs';
import {createProviderSession,serveProviderPipe} from './provider-session.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function loadProviderSession(configFile,{clock=Date.now,expectedScope=null}={}){
 check(path.isAbsolute(configFile||''),'provider_private_configuration');
 const raw=privateBytes(configFile,65536),configHash=hash(raw);
 let c;try{c=strictJson(raw);}finally{raw.fill(0);}
 exact(c,['version','executionLocation','owner','workflow','expiresAt','actions','model','responseModels','maxOutputTokens','memoriaEndpoint','memoriaCredentialFile','gptCredentialFile']);
 check(c.version===1&&c.executionLocation==='SERVER_WORKER'&&(c.gptCredentialFile===null||path.isAbsolute(c.gptCredentialFile))&&
  (c.memoriaCredentialFile===null||path.isAbsolute(c.memoriaCredentialFile)),'provider_private_configuration');
 // Optional exact worker task binding supplied by reviewed JVM composition, NOT by a model.
 // This is checked before any credential file read or metadata request.
 if(expectedScope!==null){
  exact(expectedScope,['owner','workflow','action','model','expiresAt']);
  check(typeof expectedScope.owner==='string'&&typeof expectedScope.workflow==='string'&&
   ['memory_search','memory_answer','book_preview'].includes(expectedScope.action)&&
   typeof expectedScope.model==='string'&&Number.isSafeInteger(expectedScope.expiresAt)&&
   expectedScope.expiresAt>clock(),'provider_task_scope');
  check(c.owner===expectedScope.owner&&c.workflow===expectedScope.workflow&&c.model===expectedScope.model&&
   Array.isArray(c.actions)&&c.actions.length===1&&c.actions[0]===expectedScope.action&&
   Number.isSafeInteger(c.expiresAt)&&c.expiresAt<=expectedScope.expiresAt,'provider_task_configuration_mismatch');
 }
 function secret(file){
  const b=privateBytes(file,4096);try{
   const s=new TextDecoder('utf-8',{fatal:true}).decode(b).trim();
   check(/^[!-~]{16,4096}$/.test(s),'provider_secret_format');return s;
  }finally{b.fill(0);}
 }
 const needGpt=c.actions.some(a=>a!=='memory_search');
 const gptKey=needGpt?secret(c.gptCredentialFile):null;
 const memoriaToken=c.actions.includes('memory_search')?secret(c.memoriaCredentialFile):null;
 const hashes={gpt:gptKey?hash(gptKey):null,memory:memoriaToken?hash(memoriaToken):null};
 function current(){
  let b;try{
   b=privateBytes(configFile,65536);
   return clock()<c.expiresAt&&hash(b)===configHash&&(!gptKey||hash(secret(c.gptCredentialFile))===hashes.gpt)&&
    (!memoriaToken||hash(secret(c.memoriaCredentialFile))===hashes.memory);
  }catch{return false;}finally{b?.fill(0);}
 }
 return createProviderSession({...c,gptKey,memoriaAuthorization:()=>memoriaToken?'Bearer '+memoriaToken:null,current,clock});
}
export async function main(args=process.argv.slice(2)){
 check(args.length===1||args.length===2,'provider_configuration_path_required');
 const expectedScope=args.length===2?strictJson(args[1],4096):null;
 const session=loadProviderSession(args[0],{expectedScope});await serveProviderPipe(session);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main().catch(()=>{console.error('PROVIDER_PROCESS_FAILED_NO_RETRY');process.exitCode=1;});
}
