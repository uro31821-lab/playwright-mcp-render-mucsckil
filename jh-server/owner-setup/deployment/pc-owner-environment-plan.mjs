/** Explicit deployment configuration only. Materializes the operator-supplied
 * plan in a private, no-replace file; never verifies identity or grants trust.
 * Google tokens, passwords, and signing keys are not accepted here. */
import * as fs from 'node:fs';
import path from 'node:path';
import {privateBytes} from './owner-config.mjs';
import {parseOwnerJson} from '../owner-enrollment/owner-enrollment-http.mjs';
import {validatePcOwnerSetupPlan,inspectPcOwnerSetupTarget} from './pc-owner-handoff.mjs';
import {validatePcOwnerSetupEnvironment} from './pc-owner-service-entry.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const exists=p=>{try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const encode=p=>Buffer.from(JSON.stringify(p)+'\n');
function directory(p){
 const s=fs.lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||fs.realpathSync(p)!==p)fail('PC_PLAN_PRIVATE_DIRECTORY_REQUIRED');
}
function sync(p){const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function exclusive(p,b){
 const fd=fs.openSync(p,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{let offset=0;while(offset<b.length){const n=fs.writeSync(fd,b,offset,b.length-offset);if(n<=0)fail('PC_PLAN_WRITE_FAILED');offset+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
/** File primitive, also tested with a private temporary mount. This does not
 * prove a production mount; the production entry checks it before calling. */
export function persistPcOwnerPlan(input){
 const plan=validatePcOwnerSetupPlan(input),mount=plan.storageMount;
 if(fs.realpathSync(mount)!==mount||!fs.lstatSync(mount).isDirectory()||(fs.lstatSync(mount).mode&0o022))fail('PC_PLAN_MOUNT_PATH_INVALID');
 const dir=path.join(mount,'jh-pc-bootstrap'),file=path.join(dir,'plan.json');
 const marker=path.join(dir,'.plan-writing'),stage=path.join(dir,'.plan-stage');
 if(!exists(dir)){fs.mkdirSync(dir,{mode:0o700});sync(mount);}
 directory(dir);
 if(exists(marker)||exists(stage))fail('PC_PLAN_INTERRUPTED_REVIEW_REQUIRED');
 const bytes=encode(plan);
 const check=()=>{
  const b=privateBytes(file,8192);
  try{const saved=validatePcOwnerSetupPlan(parseOwnerJson(b));if(!encode(saved).equals(bytes))fail('PC_PLAN_EXISTING_CONFIG_CONFLICT');}
  finally{b.fill(0);}
 };
 if(exists(file)){check();return Object.freeze({privatePlanReady:true,created:false,identityVerified:false,authorityGranted:false});}
 exclusive(marker,Buffer.from('PC_SETUP_PLAN_WRITE_V1\n'));sync(dir);
 exclusive(stage,bytes);directory(dir);
 fs.linkSync(stage,file);fs.unlinkSync(stage);sync(dir);check();
 fs.unlinkSync(marker);sync(dir);
 return Object.freeze({privatePlanReady:true,created:true,identityVerified:false,authorityGranted:false});
}
export function preparePcOwnerPlanFromEnvironment(env=process.env){
 const raw=env.JH_PC_OWNER_SETUP_PLAN_JSON;
 if(raw===undefined)return Object.freeze({materialized:false});
 validatePcOwnerSetupEnvironment(env);
 if(env.JH_PC_OWNER_SETUP_PLAN_FILE!=='/var/data/jh-pc-bootstrap/plan.json')fail('PC_PLAN_DESTINATION_REQUIRED');
 if(typeof raw!=='string'||Buffer.byteLength(raw)>8192||raw.length<2)fail('PC_PLAN_ENVIRONMENT_INVALID');
 const bytes=Buffer.from(raw);let plan;
 try{plan=validatePcOwnerSetupPlan(parseOwnerJson(bytes));}catch{fail('PC_PLAN_ENVIRONMENT_INVALID');}finally{bytes.fill(0);}
 if(plan.storageMount!=='/var/data')fail('PC_SETUP_PRODUCTION_MOUNT_REQUIRED');
 inspectPcOwnerSetupTarget(plan); // real kernel mount + filesystem observations only
 const result=persistPcOwnerPlan(plan);
 delete env.JH_PC_OWNER_SETUP_PLAN_JSON; // avoid propagation to child processes
 return result;
}
