import { createHash, createPublicKey, verify as verifyEcdsa } from 'node:crypto';
import { verifiedGlassOwner } from './verified-owner.mjs';

// Isolated development-only contract; NOT mounted on the running JH server.
// An enrolled Android Keystore P-256 key signs each explicit photo command.
// The Secure56 initial phone-local approval is NOT implemented here.
const HEX64 = /^[a-f0-9]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const CLAIM_ID = /^[A-Za-z0-9_-]{32}$/;
const NONCE = /^[A-Za-z0-9_-]{22,86}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
export const ENROLLMENT_MAX_MS = 120_000;
export const DEVICE_TRUST_MAX_MS = 30 * 24 * 60 * 60 * 1000;
export const PHOTO_INTENT_MAX_AGE_MS = 45_000;

function sha(v) { return createHash('sha256').update(v).digest('hex'); }
function publicKeyFromDerB64(value) {
  if (typeof value !== 'string' || value.length > 1024 || !B64URL.test(value)) return null;
  const b = Buffer.from(value, 'base64url');
  if (b.length < 80 || b.length > 512 || b.toString('base64url') !== value) return null;
  try {
    const key = createPublicKey({key:b,format:'der',type:'spki'});
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return {key, digest:sha(b)};
  } catch { return null; }
}
function signatureBytes(value) {
  if (typeof value !== 'string' || value.length < 80 || value.length > 180 || !B64URL.test(value)) return null;
  const b = Buffer.from(value, 'base64url');
  return b.length >= 64 && b.length <= 100 && b.toString('base64url') === value ? b : null;
}
export function glassEnrollmentMessage({ownerId,serverDigest,deviceDigest,publicKeyDigest,challenge}) {
  return ['JH_GLASS_ENROLL_P256_V1',ownerId,serverDigest,deviceDigest,publicKeyDigest,challenge].join('\n');
}
export function glassPhotoIntentMessage({ownerId,serverDigest,deviceDigest,requestId,photoSha256,issuedAt,nonce}) {
  return ['JH_GLASS_PHOTO_INTENT_P256_V1',ownerId,serverDigest,deviceDigest,requestId,photoSha256,String(issuedAt),nonce].join('\n');
}

export function createApprovedGlassDeviceRegistry({
  verifySecure56Enrollment,
  serverDigest,
  now = () => Date.now(),
  randomChallenge,
} = {}) {
  if (typeof verifySecure56Enrollment !== 'function') throw new TypeError('Trusted Secure56 initial approval verifier required');
  if (!HEX64.test(serverDigest||'')) throw new TypeError('Pinned server digest required');
  if (typeof randomChallenge !== 'function') throw new TypeError('Cryptographic challenge factory required');
  const pending = new Map();
  const devices = new Map();
  const spent = new Map();
  function ownerOf(record) {
    if (record?.glassOwnerVerified !== true) return {ok:false,code:'GLASS_OWNER_APPROVAL_REQUIRED'};
    return verifiedGlassOwner(record,now());
  }
  function cleanup() {
    const t=now();
    for (const [k,v] of pending) if (v.expiresAt<=t) pending.delete(k);
    for (const [k,v] of devices) if (v.expiresAt<=t) { devices.delete(k); spent.delete(k); }
    for (const v of spent.values()) for (const [nonceHash, expiry] of v) if (expiry<=t) v.delete(nonceHash);
  }
  function startEnrollment({accessRecord,deviceDigest,publicKeyBase64}={}) {
    cleanup();
    const owner=ownerOf(accessRecord);
    if (!owner.ok) return owner;
    if (!HEX64.test(deviceDigest||'')) return {ok:false,code:'DEVICE_DIGEST_INVALID'};
    const pub=publicKeyFromDerB64(publicKeyBase64);
    if (!pub) return {ok:false,code:'P256_PUBLIC_KEY_INVALID'};
    if (pending.has(owner.ownerId)) return {ok:false,code:'ENROLLMENT_ALREADY_PENDING'};
    const challenge=randomChallenge();
    if (typeof challenge!=='string'||!CHALLENGE.test(challenge)) return {ok:false,code:'CHALLENGE_GENERATION_FAILED'};
    const rec={ownerId:owner.ownerId,deviceDigest,publicKey:pub.key,publicKeyDigest:pub.digest,
      challenge,expiresAt:now()+ENROLLMENT_MAX_MS,verifying:false};
    pending.set(owner.ownerId,rec);
    return {ok:true,code:'ENROLLMENT_CHALLENGE_READY',challenge,publicKeyDigest:pub.digest,expiresAt:rec.expiresAt};
  }
  async function finishEnrollment({accessRecord,challenge,signature,approvalProof}={}) {
    cleanup();
    const owner=ownerOf(accessRecord);
    if (!owner.ok) return owner;
    const rec=pending.get(owner.ownerId);
    if (!rec || rec.challenge!==challenge || rec.expiresAt<=now() || rec.verifying)
      return {ok:false,code:'ENROLLMENT_NOT_AVAILABLE'};
    rec.verifying=true;
    try {
      const sig=signatureBytes(signature);
      if (!sig || !verifyEcdsa('sha256',Buffer.from(glassEnrollmentMessage({...rec,serverDigest})),rec.publicKey,sig))
        return {ok:false,code:'ENROLLMENT_KEY_PROOF_INVALID'};
      let approval;
      try { approval=await verifySecure56Enrollment({
        ownerId:owner.ownerId,deviceDigest:rec.deviceDigest,publicKeyDigest:rec.publicKeyDigest,
        challenge:rec.challenge,serverDigest,approvalProof
      }); } catch { return {ok:false,code:'PHONE_APPROVAL_READBACK_FAILED'}; }
      if (pending.get(owner.ownerId)!==rec || rec.expiresAt<=now()) return {ok:false,code:'ENROLLMENT_EXPIRED'};
      if (!approval || approval.verdict!=='VERIFIED' || approval.localUserApproved!==true ||
          approval.ownerId!==owner.ownerId || approval.deviceDigest!==rec.deviceDigest ||
          approval.publicKeyDigest!==rec.publicKeyDigest || approval.challenge!==rec.challenge ||
          approval.serverDigest!==serverDigest || approval.secureCompletionVerified!==true) {
        return {ok:false,code:'PHONE_INITIAL_APPROVAL_REQUIRED'};
      }
      const old=devices.get(owner.ownerId);
      if (old && old.expiresAt>now() &&
          (old.deviceDigest!==rec.deviceDigest || old.publicKeyDigest!==rec.publicKeyDigest) &&
          approval.deviceReplacementApproved!==true) return {ok:false,code:'DEVICE_REPLACEMENT_REAPPROVAL_REQUIRED'};
      const registered={ownerId:owner.ownerId,deviceDigest:rec.deviceDigest,publicKeyDigest:rec.publicKeyDigest,
        publicKey:rec.publicKey,expiresAt:now()+DEVICE_TRUST_MAX_MS};
      devices.set(owner.ownerId,registered);
      spent.delete(owner.ownerId);
      return {ok:true,code:'DEVICE_TRUST_ACTIVE',deviceDigest:rec.deviceDigest,
        publicKeyDigest:rec.publicKeyDigest,expiresAt:registered.expiresAt};
    } finally {
      // A failed enrollment cannot be retried using the same phone approval.
      if (pending.get(owner.ownerId)===rec) pending.delete(owner.ownerId);
    }
  }
  function verifyPhotoIntent({requestId,expectedOwnerId,approvalProof}={}) {
    cleanup();
    if (!CLAIM_ID.test(requestId||'')||!/^owner:[a-f0-9]{64}$/.test(expectedOwnerId||'')) {
      return {verdict:'REJECTED',code:'PHOTO_INTENT_CONTEXT_INVALID'};
    }
    const d=devices.get(expectedOwnerId),p=approvalProof;
    if (!d||d.expiresAt<=now()) return {verdict:'REJECTED',code:'DEVICE_TRUST_REQUIRED'};
    if (!p||typeof p!=='object' || p.deviceDigest!==d.deviceDigest ||
       p.requestId!==requestId || !HEX64.test(p.photoSha256||'') ||
       !NONCE.test(p.nonce||'')||!Number.isSafeInteger(p.issuedAt)||
       p.issuedAt>now()+5000||p.issuedAt<now()-PHOTO_INTENT_MAX_AGE_MS) {
      return {verdict:'REJECTED',code:'PHOTO_INTENT_INVALID_OR_EXPIRED'};
    }
    const sig=signatureBytes(p.signature);
    if (!sig) return {verdict:'REJECTED',code:'PHOTO_INTENT_SIGNATURE_INVALID'};
    const nonceHash=sha(requestId+'|'+p.nonce);
    const prior=spent.get(expectedOwnerId);
    if (prior?.has(nonceHash)) return {verdict:'REJECTED',code:'PHOTO_INTENT_REPLAY'};
    const msg=glassPhotoIntentMessage({ownerId:expectedOwnerId,serverDigest,deviceDigest:d.deviceDigest,
      requestId,photoSha256:p.photoSha256,issuedAt:p.issuedAt,nonce:p.nonce});
    if (!verifyEcdsa('sha256',Buffer.from(msg),d.publicKey,sig)) {
      return {verdict:'REJECTED',code:'PHOTO_INTENT_SIGNATURE_INVALID'};
    }
    const seen=prior??new Map();
    if (seen.size>=256) return {verdict:'REJECTED',code:'INTENT_CAPACITY_REACHED'};
    seen.set(nonceHash,Math.min(d.expiresAt,now()+PHOTO_INTENT_MAX_AGE_MS));
    spent.set(expectedOwnerId,seen);
    return {verdict:'VERIFIED',requestId,ownerId:expectedOwnerId,photoSha256:p.photoSha256,
      deviceDigest:d.deviceDigest,deviceTrustExpiresAt:d.expiresAt};
  }
  function status(accessRecord) {
    cleanup();
    const owner=ownerOf(accessRecord);
    if (!owner.ok) return owner;
    const reg=devices.get(owner.ownerId);
    return {ok:true,enrolled:!!reg,expiresAt:reg?.expiresAt??null};
  }
  function revoke(accessRecord) {
    const owner=ownerOf(accessRecord);
    if (!owner.ok) return owner;
    const was=devices.delete(owner.ownerId);
    spent.delete(owner.ownerId);pending.delete(owner.ownerId);
    return {ok:true,code:was?'DEVICE_TRUST_REVOKED':'NO_DEVICE_TRUST'};
  }
  function close() {pending.clear();devices.clear();spent.clear();}
  return Object.freeze({startEnrollment,finishEnrollment,verifyPhotoIntent,status,revoke,close});
}
