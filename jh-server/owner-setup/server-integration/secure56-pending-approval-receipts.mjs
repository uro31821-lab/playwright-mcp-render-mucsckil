/* Secure56 queued local approval receipts. This store has NO Android dispatch.
 * The receipt is not an approval; a phone-local approval is still mandatory.
 */
import {createHash,randomBytes} from "node:crypto";
const allowed=new Set(["computer_use_screen_consent_request","computer_use_action_approval_request"]);
const isHex=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const isToken=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43,128}$/.test(x);
const hash=x=>createHash("sha256").update(x).digest("hex");
const unavailable=()=>({ok:false,code:"PENDING_APPROVAL_RECEIPT_UNAVAILABLE"});
export function createPendingApprovalReceiptRegistry56({now=()=>Date.now(),newToken=()=>randomBytes(32).toString("base64url"),ttlMs=600000,maxEntries=256}={}){
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>600000||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>1024)throw TypeError("RECEIPT_BOUNDS_INVALID");
  const records=new Map();
  function clean(){const t=now();for(const [k,v] of records)if(t>=v.expiresAtMs)records.delete(k);while(records.size>maxEntries)records.delete(records.keys().next().value);}
  function issue({job,deviceId,deviceDigest,sessionId,taskDigest,runDigest=""}={}){
    clean();
    if(!job||!allowed.has(job.type)||!["queued","in_progress"].includes(job.status)||typeof job.id!=="string"||
       !deviceId||!sessionId||!isHex(deviceDigest)||!isHex(taskDigest)||(runDigest!==""&&!isHex(runDigest))||
       (job.type==="computer_use_screen_consent_request"&&!isHex(runDigest))||
       job.targetDeviceId!==deviceId||job.targetDeviceDigest!==deviceDigest||job.secureSessionId!==sessionId||
       job.taskDigest!==taskDigest||String(job.runDigest||"")!==runDigest)return null;
    const receiptToken=newToken();if(!isToken(receiptToken))throw TypeError("RECEIPT_TOKEN_INVALID");
    const key=hash(receiptToken);if(records.has(key))throw Error("RECEIPT_TOKEN_COLLISION");
    const receiptExpiresAtMs=now()+ttlMs;
    records.set(key,{jobId:job.id,kind:job.type,deviceId,deviceDigest,sessionId,taskDigest,runDigest,expiresAtMs:receiptExpiresAtMs});
    clean();
    return {receiptToken,receiptExpiresAtMs};
  }
  function read({receiptToken,deviceId,deviceDigest,sessionId,taskDigest,runDigest=""}={},findJob){
    clean();if(!isToken(receiptToken)||typeof findJob!=="function")return unavailable();
    const record=records.get(hash(receiptToken));
    if(!record||record.deviceId!==deviceId||record.deviceDigest!==deviceDigest||record.sessionId!==sessionId||
       record.taskDigest!==taskDigest||record.runDigest!==runDigest)return unavailable();
    const job=findJob(record.jobId); // read ONLY: no mk(), enqueue, UI prompt, or approved action
    if(!job||job.id!==record.jobId||job.type!==record.kind||
       job.targetDeviceId!==deviceId||job.targetDeviceDigest!==deviceDigest||job.secureSessionId!==sessionId||
       job.taskDigest!==taskDigest||String(job.runDigest||"")!==runDigest)return unavailable();
    return {ok:true,job,receiptExpiresAtMs:record.expiresAtMs};
  }
  return Object.freeze({issue,read});
}
