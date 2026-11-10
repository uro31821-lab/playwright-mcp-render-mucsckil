import {
  createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes,
} from 'node:crypto';
import * as fs from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/**
 * Encrypted owner-to-device PUBLIC-key enrollment registry.
 * Stage 11 source candidate ONLY: not wired to JH production.
 *
 * Explicitly requires existing, non-networked, single-process private storage
 * and an independently provisioned 32-byte key. Never generate the data key
 * inside this class, never put it into an APK or GitHub.
 *
 * Stored: hashed owner, device digest, P-256 public key, expiration.
 * NOT stored: private keys, API tokens, photos, upload credentials, consent UI.
 */
const OWNER=/^owner:[0-9a-f]{64}$/;
const HEX64=/^[0-9a-f]{64}$/;
const B64URL=/^[A-Za-z0-9_-]+$/;
const MAX_ENCRYPTED=512*1024;
const MAX_OWNERS=64;
const VERSION=1;

function decodeB64(value, min, max) {
  if(typeof value!=='string'||!B64URL.test(value))return null;
  const buf=Buffer.from(value,'base64url');
  return buf.length>=min && buf.length<=max && buf.toString('base64url')===value ? buf : null;
}
function normalizeRecord(r) {
  if(!r||typeof r!=='object'||!OWNER.test(r.ownerId||'')||
      !HEX64.test(r.deviceDigest||'')||!HEX64.test(r.publicKeyDigest||'')||
      !Number.isSafeInteger(r.expiresAt)||r.expiresAt<=0) throw new Error('UNSAFE_TRUST_RECORD');
  const buf=decodeB64(r.publicKeyBase64url,80,512);
  if(!buf || createHash('sha256').update(buf).digest('hex')!==r.publicKeyDigest) throw new Error('UNSAFE_P256_KEY_DIGEST');
  try {
    const key=createPublicKey({key:buf,type:'spki',format:'der'});
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')
      throw new Error('UNSAFE_CURVE');
  } catch {throw new Error('UNSAFE_P256_PUBLIC_KEY');}
  return Object.freeze({
    ownerId:r.ownerId,deviceDigest:r.deviceDigest,publicKeyBase64url:r.publicKeyBase64url,
    publicKeyDigest:r.publicKeyDigest,expiresAt:r.expiresAt
  });
}

export function createEncryptedGlassDeviceStore({filePath,keyBase64url,serverDigest}={}) {
  if(typeof filePath!=='string'||!isAbsolute(filePath)||filePath.length>512)
    throw new TypeError('ABSOLUTE_PRIVATE_STORE_PATH_REQUIRED');
  if(!HEX64.test(serverDigest||'')) throw new TypeError('PINNED_SERVER_DIGEST_REQUIRED');
  const key=decodeB64(keyBase64url,32,32);
  if(!key) throw new TypeError('EXPLICIT_256_BIT_ENCRYPTION_KEY_REQUIRED');
  const aad=Buffer.from('JH-GLASS-DEVICE-TRUST-V1|'+serverDigest,'utf8');
  const verifyFile=()=>{
    if(!fs.existsSync(filePath)) return false;
    const st=fs.lstatSync(filePath);
    if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_ENCRYPTED||st.size<50)
      throw new Error('INVALID_PRIVATE_STORE_FILE');
    if(process.platform!=='win32' && (st.mode&0o077)!==0) throw new Error('INSECURE_STORE_FILE_PERMISSIONS');
    return true;
  };
  function decodeRecords() {
    if(!verifyFile())return [];
    const raw=fs.readFileSync(filePath);
    if(raw.length>MAX_ENCRYPTED)throw new Error('STORE_TOO_LARGE');
    let doc;try{doc=JSON.parse(raw.toString('utf8'));}catch{throw new Error('STORE_DOCUMENT_INVALID');}
    if(doc?.version!==VERSION||doc?.serverDigest!==serverDigest||
       typeof doc?.iv!=='string'||typeof doc?.tag!=='string'||typeof doc?.ciphertext!=='string')
      throw new Error('STORE_IDENTITY_MISMATCH');
    const iv=decodeB64(doc.iv,12,12),tag=decodeB64(doc.tag,16,16),
      ciphertext=decodeB64(doc.ciphertext,2,MAX_ENCRYPTED);
    if(!iv||!tag||!ciphertext)throw new Error('STORE_CIPHERTEXT_INVALID');
    let data;
    try{
      const dec=createDecipheriv('aes-256-gcm',key,iv);
      dec.setAAD(aad);dec.setAuthTag(tag);
      data=Buffer.concat([dec.update(ciphertext),dec.final()]);
    }catch{throw new Error('STORE_AUTHENTICATION_FAILED');}
    let recs;
    try{
      const doc=JSON.parse(data.toString('utf8'));
      if(doc?.version!==VERSION||!Array.isArray(doc.records)||doc.records.length>MAX_OWNERS)
        throw new Error('STORE_RECORDS_INVALID');
      recs=doc.records.map(normalizeRecord);
      const owners=recs.map(x=>x.ownerId);
      if(new Set(owners).size!==owners.length)throw new Error('DUPLICATE_OWNER_IN_STORE');
    }finally {data?.fill(0);}
    return recs;
  }
  function atomicWrite(records) {
    if(!Array.isArray(records)||records.length>MAX_OWNERS)throw new Error('STORE_CAPACITY_EXCEEDED');
    const normalized=records.map(normalizeRecord).sort((a,b)=>a.ownerId.localeCompare(b.ownerId));
    const plain=Buffer.from(JSON.stringify({version:VERSION,records:normalized}));
    const iv=randomBytes(12);
    const enc=createCipheriv('aes-256-gcm',key,iv);
    enc.setAAD(aad);
    const cipher=Buffer.concat([enc.update(plain),enc.final()]);
    plain.fill(0);
    const body=Buffer.from(JSON.stringify({
      version:VERSION,serverDigest,iv:iv.toString('base64url'),
      tag:enc.getAuthTag().toString('base64url'),ciphertext:cipher.toString('base64url')
    }));
    cipher.fill(0);
    if(body.length>MAX_ENCRYPTED)throw new Error('STORE_CAPACITY_EXCEEDED');
    const dir=dirname(filePath);
    const temp=join(dir,'.jh-glass-trust-'+randomBytes(12).toString('hex')+'.tmp');
    let fd;
    try {
      fd=fs.openSync(temp,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);
      fs.writeFileSync(fd,body);
      fs.fsyncSync(fd);
      fs.closeSync(fd);fd=undefined;
      fs.renameSync(temp,filePath);
      // Best effort directory sync for durable rename on Linux.
      try{const dirfd=fs.openSync(dir,fs.constants.O_RDONLY);try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}}catch{}
    } finally {
      body.fill(0);
      if(fd!==undefined)fs.closeSync(fd);
      try{if(fs.existsSync(temp))fs.unlinkSync(temp)}catch{}
    }
  }
  return Object.freeze({
    loadAll(){return decodeRecords();},
    upsert(record){
      const r=normalizeRecord(record);
      const records=decodeRecords().filter(x=>x.ownerId!==r.ownerId);
      records.push(r);atomicWrite(records);return true;
    },
    remove(ownerId){
      if(!OWNER.test(ownerId||''))throw new TypeError('OWNER_ID_INVALID');
      const all=decodeRecords();const next=all.filter(x=>x.ownerId!==ownerId);
      if(next.length!==all.length)atomicWrite(next);
      return next.length!==all.length;
    },
    verifyReadiness(){decodeRecords();return true;}
  });
}
