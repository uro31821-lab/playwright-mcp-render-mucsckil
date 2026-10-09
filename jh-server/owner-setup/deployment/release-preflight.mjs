/** Read-only FINAL configuration review, not a server launcher or release approval.
 * Reuses the existing strict owner/registry/mount validators. Does not read key files,
 * open databases, authenticate, call providers, initialize storage or alter files.
 * A positive metadata check never proves OAuth registration, credentials or device E2E.
 */
import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadOwnerConfiguration,privateBytes,renderAppResources,sha} from './owner-config.mjs';
import {inspectOwnerMount} from './owner-storage.mjs';
import {validateRuntimeRegistry} from '../server-continuation/life-runtime-authority.mjs';
import {contentParse} from '../server-continuation/life-content-wire.mjs';

function publicResource(filename){
 if(typeof filename!=='string'||!path.isAbsolute(filename)||path.normalize(filename)!==filename||filename.includes('\0')||realpathSync(path.dirname(filename))!==path.dirname(filename))throw Error('resource_path');
 const before=lstatSync(filename);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1)throw Error('resource_file');
 const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const st=fstatSync(fd);if(st.dev!==before.dev||st.ino!==before.ino||st.size<1||st.size>65536)throw Error('resource_size');
  const bytes=readFileSync(fd),after=fstatSync(fd);
  if(bytes.length!==st.size||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs)throw Error('resource_changed');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(text)||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text))throw Error('resource_entity');
  // Deliberately narrow Android owner-resource profile, not a permissive XML parser.
  // Reject malformed documents/duplicates instead of treating matching text as valid XML.
  const cleaned=text.replace(/<!--[\s\S]*?-->/g,'').replace(/^\s*<\?xml version="1\.0"(?: encoding="utf-8")?\?>/,'');
  const root=/^\s*<resources>([\s\S]*)<\/resources>\s*$/.exec(cleaned);
  if(!root)throw Error('resource_root');
  const names=new Set();
  const leftovers=root[1].replace(/<string name="([a-z][a-z0-9_]*)"(?: translatable="(?:false|true)")?>([^<]*)<\/string>/g,(_,name,value)=>{
   if(names.has(name)||/&(?!(?:amp|lt|gt|quot|apos);)/.test(value))throw Error('resource_content');
   names.add(name);return '';
  });
  if(leftovers.trim())throw Error('resource_markup');
  return text;
 }finally{closeSync(fd);}
}

export function inspectReleaseConfiguration(options={}){
 const checks=[];
 const add=(id,status,code)=>checks.push(Object.freeze({id,status,code}));
 const allowed=['ownerConfigFile','appResourcesFile','registryFile'];
 const valid=options&&Object.getPrototypeOf(options)===Object.prototype&&!Object.keys(options).some(k=>!allowed.includes(k));
 let config,ownerPolicyDigest;
 if(!valid)add('configuration','BLOCKED','PREFLIGHT_OPTIONS_INVALID');
 else {
  if(!options.ownerConfigFile)add('owner_policy','BLOCKED','OWNER_CONFIGURATION_NOT_SUPPLIED');
  else try{config=loadOwnerConfiguration(options.ownerConfigFile);ownerPolicyDigest=config.policyDigest;add('owner_policy','PASS','OWNER_POLICY_SHAPE_CHECKED');}
  catch{add('owner_policy','BLOCKED','OWNER_CONFIGURATION_UNREADABLE_OR_INVALID');}
  if(!config){
   for(const id of ['app_owner_binding','registry_policy','persistent_mount','owner_policy_unchanged'])add(id,'NOT_CHECKED','OWNER_POLICY_REQUIRED');
  }else{
   try{
    const xml=publicResource(options.appResourcesFile);
    if(renderAppResources(xml,config)!==xml)throw Error('app_not_matching');
    add('app_owner_binding','PASS','PUBLIC_APP_POLICY_MATCHES');
   }catch{add('app_owner_binding','BLOCKED','APP_RESOURCES_UNCONFIGURED_OR_MISMATCHED');}
   if(!options.registryFile)add('registry_policy','BLOCKED','RUNTIME_REGISTRY_NOT_SUPPLIED');
   else {
    let bytes;
    try{
     bytes=privateBytes(options.registryFile,262144);
     const registry=validateRuntimeRegistry(contentParse(bytes),{ownerDigest:config.accountDigest,serverDigest:sha(config.serverOrigin)});
     const now=Date.now(),active=registry.registrations.filter(r=>r.enabled);
     if(!active.length)add('registry_policy','BLOCKED','NO_ENABLED_REGISTRATIONS');
     else if(active.some(r=>r.issuedAt>now||r.expiresAt<=now))add('registry_policy','BLOCKED','REGISTRATIONS_NOT_CURRENT');
     else add('registry_policy','PASS','REGISTRY_SHAPE_AND_TIME_CHECKED_NOT_AUTHENTICATED');
    }catch{add('registry_policy','BLOCKED','RUNTIME_REGISTRY_UNREADABLE_OR_INVALID');}
    finally{bytes?.fill(0);}
   }
   try{inspectOwnerMount(config);add('persistent_mount','PASS','MOUNT_OBSERVED_NOT_DURABILITY_ATTESTATION');}
   catch{add('persistent_mount','BLOCKED','PERSISTENT_MOUNT_NOT_VERIFIED');}
   // Prevent reporting positive checks against an owner policy changed during inspection.
   try{if(loadOwnerConfiguration(options.ownerConfigFile).policyDigest!==ownerPolicyDigest)throw Error('changed');add('owner_policy_unchanged','PASS','OWNER_POLICY_UNCHANGED_DURING_CHECK');}
   catch{add('owner_policy_unchanged','BLOCKED','OWNER_POLICY_CHANGED_OR_UNREADABLE');}
  }
 }
 return Object.freeze({version:1,observedAt:Date.now(),scope:'LOCAL_READ_ONLY_CONFIGURATION_METADATA',
  checks:Object.freeze(checks),configurationChecksPassed:checks.length>0&&checks.every(x=>x.status==='PASS'),
  releaseReady:false,activationPerformed:false,keyFileContentsRead:false,databaseOpened:false,
  networkRequests:0,fileContentWrites:0,phoneOperations:0,
  stillRequired:Object.freeze(['ACTUAL_OAUTH_AND_SIGNING_IDENTITY','KEY_DATABASE_AND_STORAGE_READBACK',
   'CURRENT_PROVIDER_CREDENTIALS_AND_REAL_ORIGINAL_READER','REAL_PROVIDER_AND_PHONE_END_TO_END',
   'FINAL_SIGNED_UPDATE_VERIFIED_WITH_EXISTING_SIGNER'])});
}
export function main(args=process.argv.slice(2),env=process.env){
 if(args.length) return inspectReleaseConfiguration({unexpected:true});
 return inspectReleaseConfiguration({ownerConfigFile:env.JH_OWNER_CONFIG_FILE,
  appResourcesFile:env.JH_PREFLIGHT_APP_RESOURCES,registryFile:env.JH_LIFE_REGISTRY_FILE});
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const result=main();console.log(JSON.stringify(result));process.exitCode=result.configurationChecksPassed?0:2;
}
