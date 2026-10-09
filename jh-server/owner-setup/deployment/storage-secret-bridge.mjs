/** Deployment-only bridge from two operator-generated secrets to existing 32-byte
 * storage-key files. No login, token issuance, rotation or state-volume key backup.
 * Key bytes are derived deterministically; changes are rejected, never overwritten.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import {hkdfSync,timingSafeEqual} from 'node:crypto';
import {assertConfig,privateBytes,fail} from './owner-config.mjs';
export const STORAGE_SECRET_NAMES=Object.freeze(['JH_OWNER_STORAGE_SECRET','JH_LIFE_STORAGE_SECRET']);
const same=(a,b)=>a.length===b.length&&timingSafeEqual(a,b);
export function takeStorageSecrets(env){
 const values=STORAGE_SECRET_NAMES.map(k=>env[k]);
 for(const k of STORAGE_SECRET_NAMES)delete env[k];
 if(values.some(x=>typeof x!=='string'||!/^[A-Za-z0-9+/_=-]{32,512}$/.test(x)))fail('STORAGE_SECRET_PAIR_REQUIRED');
 const [owner,life]=values.map(x=>Buffer.from(x,'utf8'));
 if(same(owner,life)){owner.fill(0);life.fill(0);fail('STORAGE_SECRETS_MUST_DIFFER');}
 return {owner,life};
}
export function privateDirectory(dir){
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||fs.realpathSync(dir)!==dir||s.uid!==process.getuid()||(s.mode&0o077)!==0)fail('OPERATION_PRIVATE_DIRECTORY_REQUIRED');
 return s;
}
export function syncDirectory(dir){
 const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
export function pathExists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export function writeExclusivePrivate(file,bytes){
 const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{let offset=0;while(offset<bytes.length){const n=fs.writeSync(fd,bytes,offset,bytes.length-offset);if(n<1)fail('OPERATION_PRIVATE_WRITE_FAILED');offset+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
/** Internal filesystem function; production always uses a fixed path outside /var/data.
 * Caller owns clearing the supplied buffers. No paths or key digests are logged. */
export function materializeStorageKeys(config,secrets,directory){
 assertConfig(config);
 if(!Buffer.isBuffer(secrets?.owner)||!Buffer.isBuffer(secrets?.life)||secrets.owner.length<32||secrets.life.length<32||same(secrets.owner,secrets.life))fail('STORAGE_SECRET_PAIR_INVALID');
 if(!path.isAbsolute(directory||'')||path.normalize(directory)!==directory||directory===path.parse(directory).root||fs.realpathSync(path.dirname(directory))!==path.dirname(directory))fail('STORAGE_KEY_DIRECTORY_INVALID');
 if(directory===config.storageMount||directory.startsWith(config.storageMount+path.sep))fail('KEY_MUST_BE_OUTSIDE_STATE_VOLUME');
 const keys=['owner','life'].map(role=>Buffer.from(hkdfSync('sha256',secrets[role],'JH_STORAGE_SECRET_BRIDGE_V1',role+'|'+config.policyDigest,32)));
 const files=['owner.key','life.key'],marker=path.join(directory,'.creating');
 try{
  if(!pathExists(directory)){fs.mkdirSync(directory,{mode:0o700});syncDirectory(path.dirname(directory));}
  privateDirectory(directory);
  if(pathExists(marker))fail('STORAGE_KEY_CREATION_INTERRUPTED');
  const entries=fs.readdirSync(directory).sort();
  if(entries.length){
   if(entries.join('|')!==[...files].sort().join('|'))fail('STORAGE_KEY_DIRECTORY_REVIEW_REQUIRED');
   files.forEach((name,i)=>{const b=privateBytes(path.join(directory,name),32);try{if(!same(b,keys[i]))fail('STORAGE_KEY_CHANGED_REVIEW_REQUIRED');}finally{b.fill(0);}});
   return Object.freeze({ownerKeyFile:path.join(directory,files[0]),lifeKeyFile:path.join(directory,files[1]),created:false});
  }
  writeExclusivePrivate(marker,Buffer.from('JH_STORAGE_KEYS_V1\n'));syncDirectory(directory);
  files.forEach((name,i)=>writeExclusivePrivate(path.join(directory,name),keys[i]));syncDirectory(directory);
  files.forEach((name,i)=>{const b=privateBytes(path.join(directory,name),32);try{if(!same(b,keys[i]))fail('STORAGE_KEY_READBACK_FAILED');}finally{b.fill(0);}});
  fs.unlinkSync(marker);syncDirectory(directory);
  return Object.freeze({ownerKeyFile:path.join(directory,files[0]),lifeKeyFile:path.join(directory,files[1]),created:true});
 }finally{for(const b of keys)b.fill(0);}
}
