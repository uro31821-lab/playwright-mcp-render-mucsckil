/**
 * Stage35 — sealed original Secure56 receipt reference.
 *
 * Client-carried, short-lived AES-256-GCM token. Unlike a bearer grant this
 * token is NOT authorization: every issue/read invokes the ORIGINAL Stage34
 * owner-bound signed device-result reader under fresh current owner/device
 * authorization. The Stage29 SQLite ledger remains HMAC-only and unchanged.
 *
 * No endpoint, execution, approval, server restart, Android job or file write.
 */
import {
 createCipheriv,createDecipheriv,hkdfSync,randomBytes
} from 'node:crypto';
import {createStage34OriginalReceiptReader} from './stage34-original-receipt-reader.mjs';

const PREFIX='s35_v1_';
const MAX_LENGTH=1800;
const MAX_PLAINTEXT_BYTES=1024;
const VERSION=1;
const REFERENCE_FIELDS=[
 'deviceId','deviceDigest','secureSessionId','jobId',
 'commandId','taskDigest','requestId','contextId',
 'targetItemRef','commandDigest','expiresAtMs'
];
const fail=code=>{throw Object.assign(Error(code),{code});};
const referenceOk=x=>x!==null&&typeof x==='object'&&
 !Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype&&
 Object.keys(x).length===REFERENCE_FIELDS.length&&
 REFERENCE_FIELDS.every(k=>Object.hasOwn(x,k));
const unknown=code=>Object.freeze({
 ok:false,code,readOnly:true,executionStatus:'UNKNOWN',
 resultReceived:false,taskSuccessVerified:false,
 uiTransitionVerified:false,originalJobReexecuted:false,
 newJobCreated:false,automaticReplay:false,
 replayAllowed:false,originalSessionRebound:false,
 sealedHandleIssued:false
});
const sealAad=namespace=>Buffer.from('JH_STAGE35_SEALED_ORIGINAL_REF_V1|'+namespace);
const isValidHandle=x=>typeof x==='string'&&
 x.length>=PREFIX.length+40&&x.length<=MAX_LENGTH&&
 x.startsWith(PREFIX)&&/^[A-Za-z0-9_-]+$/.test(x.slice(PREFIX.length));
const validNow=clock=>{
 const n=clock();
 if(!Number.isSafeInteger(n)||n<=0)return null;
 return n;
};

/**
 * Security contract:
 * - key is original owner-bound 32-byte key, NEVER exposed or logged.
 * - a handle only contains a sealed canonical original reference, not grants.
 * - caller must retain the handle; no server-side handle/identity database.
 * - expiry is original signed job expiry (usually short), NOT renewed.
 */
export function createStage35OriginalReferenceHandoff({
 file,key,namespace,authorizeCurrentOwner,clock=Date.now
}={}){
 if(!Buffer.isBuffer(key)||key.length!==32||
   typeof namespace!=='string'||!/^[a-f0-9]{64}$/.test(namespace)||
   typeof authorizeCurrentOwner!=='function'||typeof clock!=='function')
  fail('STAGE35_EXISTING_OWNER_KEY_AND_AUTH_REQUIRED');
 const derived=Buffer.from(hkdfSync('sha256',key,
   Buffer.from(namespace,'hex'),
   Buffer.from('JH_STAGE35_ORIGINAL_REFERENCE_AEAD_V1'),32));
 const aad=sealAad(namespace);
 let reader;
 try{
  reader=createStage34OriginalReceiptReader({
   file,key,namespace,authorizeCurrentOwner,clock
  });
 }catch(e){derived.fill(0);aad.fill(0);throw e}
 let closed=false;
 function issue({reference,principal}={}){
  if(closed)return unknown('STAGE35_HANDOFF_CLOSED');
  if(!referenceOk(reference))return unknown('STAGE35_EXACT_ORIGINAL_REFERENCE_REQUIRED');
  const at=validNow(clock);
  if(at===null)return unknown('STAGE35_CLOCK_INVALID');
  if(reference.expiresAtMs<=at)return unknown('STAGE35_ORIGINAL_REFERENCE_EXPIRED');
  const original=reader.read({reference,principal});
  if(original.ok!==true||original.resultReceived!==true)
   return unknown('STAGE35_ORIGINAL_AUTHENTICATED_RESULT_NOT_PROVEN');
  const fields=REFERENCE_FIELDS.map(k=>reference[k]);
  const data=Buffer.from(JSON.stringify([VERSION,...fields]),'utf8');
  if(data.length>MAX_PLAINTEXT_BYTES){
   data.fill(0);
   return unknown('STAGE35_ORIGINAL_REFERENCE_OVERSIZE');
  }
  try{
   const iv=randomBytes(12);
   const cipher=createCipheriv('aes-256-gcm',derived,iv,{authTagLength:16});
   cipher.setAAD(aad);
   const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
   const tag=cipher.getAuthTag();
   const encoded=Buffer.concat([iv,encrypted,tag]).toString('base64url');
   const handle=PREFIX+encoded;
   if(!isValidHandle(handle))return unknown('STAGE35_HANDLE_LENGTH_INVALID');
   return Object.freeze({
    ok:true,code:'STAGE35_SEALED_ORIGINAL_REFERENCE_ISSUED',
    sealedHandle:handle,sealedHandleIssued:true,
    expiresAtMs:reference.expiresAtMs,
    expiresAtNotExtended:true,
    resultReceived:true,taskSuccessVerified:false,
    uiTransitionVerified:false,automaticReplay:false,
    originalJobReexecuted:false,newJobCreated:false,
    originalSessionRebound:false,replayAllowed:false
   });
  }finally{data.fill(0)}
 }
 function read({sealedHandle,principal}={}){
  if(closed)return unknown('STAGE35_HANDOFF_CLOSED');
  if(!isValidHandle(sealedHandle))return unknown('STAGE35_SEALED_HANDLE_INVALID');
  let data=null;
  try{
   const encoded=sealedHandle.slice(PREFIX.length);
   const raw=Buffer.from(encoded,'base64url');
   // Node accepts noncanonical base64url tails/pad bits. They can decode to
   // the exact same authenticated ciphertext; reject textual aliases before
   // attempting AES-GCM to preserve one exact opaque handle representation.
   if(raw.toString('base64url')!==encoded)
    return unknown('STAGE35_SEALED_HANDLE_NONCANONICAL');
   if(raw.length<12+16+4||raw.length>MAX_PLAINTEXT_BYTES+28)
    return unknown('STAGE35_SEALED_HANDLE_INVALID');
   const nonce=raw.subarray(0,12),tag=raw.subarray(raw.length-16);
   const ciphertext=raw.subarray(12,raw.length-16);
   const decipher=createDecipheriv('aes-256-gcm',derived,nonce,{authTagLength:16});
   decipher.setAAD(aad);decipher.setAuthTag(tag);
   data=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
   if(data.length>MAX_PLAINTEXT_BYTES)
    return unknown('STAGE35_SEALED_HANDLE_INVALID');
   const parsed=JSON.parse(data.toString('utf8'));
   if(!Array.isArray(parsed)||parsed.length!==REFERENCE_FIELDS.length+1||
      parsed[0]!==VERSION)
    return unknown('STAGE35_SEALED_HANDLE_INVALID');
   const ref=Object.fromEntries(REFERENCE_FIELDS.map((k,i)=>[k,parsed[i+1]]));
   if(!referenceOk(ref))return unknown('STAGE35_SEALED_HANDLE_INVALID');
   const now=validNow(clock);
   if(now===null)return unknown('STAGE35_CLOCK_INVALID');
   if(!Number.isSafeInteger(ref.expiresAtMs)||ref.expiresAtMs<=now)
    return unknown('STAGE35_ORIGINAL_REFERENCE_EXPIRED');
   // Stage34 will *again* check current authenticated owner/device, the
   // private original SQLite operation/result HMACs, and original expiry.
   const evidence=reader.read({reference:ref,principal});
   if(evidence.ok!==true||evidence.resultReceived!==true)
    return unknown('STAGE35_ORIGINAL_AUTHENTICATED_RESULT_NOT_PROVEN');
   return Object.freeze({
    ok:true,code:'STAGE35_ORIGINAL_RECEIPT_READ_BY_SEALED_HANDLE',
    resultReceived:true,
    receiptScope:'EXACT_ORIGINAL_SIGNED_COMPLETION_ONLY',
    taskSuccessVerified:false,uiTransitionVerified:false,
    readOnly:true,automaticReplay:false,replayAllowed:false,
    newJobCreated:false,originalJobReexecuted:false,
    originalSessionRebound:false
   });
  }catch{
   return unknown('STAGE35_SEALED_HANDLE_NOT_AUTHENTIC');
  }finally{if(data)data.fill(0)}
 }
 function close(){
  if(closed)return;closed=true;
  try{reader.close()}finally{derived.fill(0);aad.fill(0)}
 }
 return Object.freeze({issue,read,close,
   requiresCurrentOwnerAuth:true,requiresOriginalSQLiteReceipt:true,
   originalExpiryRequired:true,noPersistentHandleStore:true,
   noAndroidAction:true,automaticReplay:false});
}
