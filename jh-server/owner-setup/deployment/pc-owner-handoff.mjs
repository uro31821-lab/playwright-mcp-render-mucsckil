/** Verified PC identity -> existing owner-config schema, stored as a PRIVATE
 * review candidate. No live config replacement, DB, keys, grants or startup.
 * The ID token is never accepted or persisted by this module. */
import * as fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assertPcIdentityEvidence} from '../owner-enrollment/pc-owner-proof.mjs';
import {ownerConfigurationProposal} from './pc-owner-proof-config.mjs';
import {EXPECTED_ORIGIN,loadOwnerConfiguration,validateOwnerConfiguration} from './owner-config.mjs';
import {parseMountInfo,inspectOwnerMount} from './owner-storage.mjs';
const plans=new WeakSet(),used=new WeakSet();
const CLIENT=/^[-a-zA-Z0-9.]{1,220}\.apps\.googleusercontent\.com$/;
const names=['version','serverOrigin','googleWebClientId','androidClientId','expectedGmail','ownerLabel','storageMount','storageEpoch'];
const configNames=['version','serverOrigin','catalogDigest','googleWebClientId','allowedPresenterClientIds','ownerSubject','ownerLabel','storageMount','storageEpoch'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=x=>createHash('sha256').update(x).digest('hex');
export function validatePcOwnerSetupPlan(value){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join('|')!==names.slice().sort().join('|'))fail('PC_SETUP_PLAN_INVALID');
 const p={...value};
 if(p.version!==1||p.serverOrigin!==EXPECTED_ORIGIN||!CLIENT.test(p.googleWebClientId||'')||!CLIENT.test(p.androidClientId||'')||p.androidClientId===p.googleWebClientId||typeof p.expectedGmail!=='string'||!/^[a-z0-9][a-z0-9.+_-]{0,63}@gmail\.com$/.test(p.expectedGmail))fail('PC_SETUP_PLAN_INVALID');
 if(typeof p.ownerLabel!=='string'||!p.ownerLabel||p.ownerLabel!==p.ownerLabel.trim()||p.ownerLabel.length>100||/[\p{Cc}\p{Cf}]/u.test(p.ownerLabel))fail('PC_SETUP_PLAN_INVALID');
 if(typeof p.storageEpoch!=='string'||!/^[-a-zA-Z0-9_]{16,128}$/.test(p.storageEpoch)||typeof p.storageMount!=='string'||p.storageMount==='/'||!path.isAbsolute(p.storageMount)||path.normalize(p.storageMount)!==p.storageMount||/[\0\r\n]/.test(p.storageMount))fail('PC_SETUP_PLAN_INVALID');
 Object.freeze(p);plans.add(p);return p;
}
function assertPlan(p){if(!plans.has(p))fail('PC_SETUP_VALIDATED_PLAN_REQUIRED');}
function locations(p){return {dir:path.join(p.storageMount,'jh-owner-setup'),file:path.join(p.storageMount,'jh-owner-setup','owner-config.review.json'),marker:path.join(p.storageMount,'jh-owner-setup','.owner-config-writing'),stage:path.join(p.storageMount,'jh-owner-setup','.owner-config-stage')};}
function stat(p){try{return fs.lstatSync(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function directory(p){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||fs.realpathSync(p)!==p)fail('PC_SETUP_PRIVATE_DIRECTORY_REQUIRED');return s;}
function syncDir(p){const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function writeExclusive(p,bytes){const fd=fs.openSync(p,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{let i=0;while(i<bytes.length){const n=fs.writeSync(fd,bytes,i,bytes.length-i);if(n<1)fail('PC_SETUP_SHORT_WRITE');i+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function inspectPcOwnerSetupTarget(p,observations={}){
 assertPlan(p);const mount=p.storageMount,s=fs.lstatSync(mount);
 if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(mount)!==mount||(s.mode&0o022))fail('PC_SETUP_MOUNT_INVALID');
 const rows=parseMountInfo(observations.mountInfo??fs.readFileSync('/proc/self/mountinfo','utf8')),found=rows.filter(x=>x.mount===mount);
 if(found.length!==1||!['ext4','xfs','btrfs','zfs'].includes(found[0].filesystem)||!found[0].options.includes('rw')||found[0].superOptions.includes('ro'))fail('PC_SETUP_PERSISTENT_MOUNT_REQUIRED');
 if(!new Set([0xef53,0x58465342,0x9123683e,0x2fc12fc1]).has((observations.filesystemType??Number(fs.statfsSync(mount).type))>>>0))fail('PC_SETUP_FILESYSTEM_MISMATCH');
 const {dir,marker,stage}=locations(p);
 if(rows.some(x=>x.mount===dir||x.mount.startsWith(dir+path.sep)))fail('PC_SETUP_NESTED_MOUNT_FORBIDDEN');
 if(stat(dir)){directory(dir);if(stat(marker)||stat(stage))fail('PC_SETUP_INTERRUPTED_REVIEW_REQUIRED');}
 return {mountChecked:true,cloudDurabilityVerified:false};
}
const rawConfig=c=>Object.fromEntries(configNames.map(k=>[k,c[k]]));
const bytesConfig=c=>Buffer.from(JSON.stringify(rawConfig(c))+'\n');
function boundConfig(c,p){
 if(c.serverOrigin!==p.serverOrigin||c.googleWebClientId!==p.googleWebClientId||c.ownerLabel!==p.ownerLabel||c.storageMount!==p.storageMount||c.storageEpoch!==p.storageEpoch||JSON.stringify(c.allowedPresenterClientIds)!==JSON.stringify([p.googleWebClientId,p.androidClientId].sort()))fail('PC_SETUP_CONFIG_BINDING_MISMATCH');
 return c;
}
/** The returned config is a configuration record, never a fresh login proof. */
export function readPcOwnerConfiguration(p,{storageObservations}={}){
 inspectPcOwnerSetupTarget(p,storageObservations);
 const {file}=locations(p);if(!stat(file))return null;
 return boundConfig(loadOwnerConfiguration(file),p);
}
export function pcOwnerConfigurationStatus(p,options){const c=readPcOwnerConfiguration(p,options);return Object.freeze({configurationCandidateSaved:!!c,identityVerifiedNow:false,operationallyApplied:false,trustCreated:false,actionApproved:false});}
export function persistPcOwnerConfiguration(evidence,p,{clock=Date.now,signal,storageObservations}={}){
 assertPlan(p);assertPcIdentityEvidence(evidence);
 const selection=hash('JH_PC_ACCOUNT_SELECTION_V1|'+p.expectedGmail+'|'+p.googleWebClientId);
 if(evidence.accountSelectionDigest!==selection||evidence.googleWebClientId!==p.googleWebClientId)fail('PC_SETUP_EVIDENCE_BINDING_MISMATCH');
 if(used.has(evidence))fail('PC_SETUP_EVIDENCE_ALREADY_USED');
 const start=clock();
 const fresh=()=>{const n=clock();if(signal?.aborted)fail('PC_SETUP_CANCELED');if(!Number.isSafeInteger(n)||n<start||n<evidence.verifiedAt||n>=evidence.expiresAt)fail('PC_SETUP_EVIDENCE_EXPIRED');};fresh();
 const proposal=ownerConfigurationProposal(evidence,{ownerLabel:p.ownerLabel,storageEpoch:p.storageEpoch,androidClientId:p.androidClientId,storageMount:p.storageMount},start),config=boundConfig(proposal.config,p);
 inspectOwnerMount(config,storageObservations);inspectPcOwnerSetupTarget(p,storageObservations);
 used.add(evidence); // A failed publication is not automatically retried with this proof.
 const loc=locations(p);
 const previous=readPcOwnerConfiguration(p,{storageObservations});
 if(previous){
  if(!bytesConfig(previous).equals(bytesConfig(config)))fail('PC_SETUP_EXISTING_OWNER_CONFLICT');
  fresh();return Object.freeze({code:'PC_OWNER_CONFIGURATION_ALREADY_SAVED',configurationCandidateSaved:true,readbackVerified:true,created:false,operationallyApplied:false,trustCreated:false,actionApproved:false});
 }
 if(!stat(loc.dir)){try{fs.mkdirSync(loc.dir,{mode:0o700});syncDir(p.storageMount);}catch(e){if(e.code!=='EEXIST')throw e;}}
 directory(loc.dir);
 if(stat(loc.marker)||stat(loc.stage))fail('PC_SETUP_INTERRUPTED_REVIEW_REQUIRED');
 try{writeExclusive(loc.marker,Buffer.from('PC_OWNER_CONFIGURATION_WRITE_V1\n'));}catch(e){if(e.code==='EEXIST')fail('PC_SETUP_INTERRUPTED_REVIEW_REQUIRED');throw e;}
 syncDir(loc.dir);
 // On any error after claiming the marker, leave it for explicit review. No
 // timeout-based lock removal, overwrite, partial recovery, or automatic retry.
 writeExclusive(loc.stage,bytesConfig(config));fresh();directory(loc.dir);
 // Same filesystem hard link atomically publishes without replacing any target.
 fs.linkSync(loc.stage,loc.file);fs.unlinkSync(loc.stage);syncDir(loc.dir);
 const created=true;
 const readback=boundConfig(loadOwnerConfiguration(loc.file),p);
 if(!bytesConfig(readback).equals(bytesConfig(config)))fail('PC_SETUP_READBACK_MISMATCH');fresh();
 fs.unlinkSync(loc.marker);syncDir(loc.dir);
 return Object.freeze({code:created?'PC_OWNER_CONFIGURATION_SAVED':'PC_OWNER_CONFIGURATION_ALREADY_SAVED',configurationCandidateSaved:true,readbackVerified:true,created,operationallyApplied:false,trustCreated:false,actionApproved:false});
}
