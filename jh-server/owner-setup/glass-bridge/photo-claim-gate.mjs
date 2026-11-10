import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifiedGlassOwner } from './verified-owner.mjs';

// DEVELOPMENT CANDIDATE ONLY. This module is NOT registered as an MCP or
// HTTP tool. It requires the existing OAuth owner-proof and a separately
// verified Secure56 phone-local approval before delivery of any upload token.
const CLAIM_RE = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_RE = /^[A-Za-z0-9_-]{32}$/;
const MAX_TTL_MS = 90_000;
function hash(value) { return createHash('sha256').update(value).digest(); }

export function createPhotoClaimGate({
  photoSession,
  verifyPhoneApproval,
  now = () => Date.now(),
  makeClaimToken = () => randomBytes(32).toString('base64url'),
  makeRequestId = () => randomBytes(24).toString('base64url'),
  claimTtlMs = MAX_TTL_MS,
} = {}) {
  if (!photoSession || ['beginPairing','consume','status'].some(k => typeof photoSession[k] !== 'function')) {
    throw new TypeError('Authenticated photoSession is required');
  }
  if (typeof verifyPhoneApproval !== 'function') {
    throw new TypeError('Trusted Secure56 phone-local approval callback is required');
  }
  if (!Number.isInteger(claimTtlMs) || claimTtlMs < 1 || claimTtlMs > MAX_TTL_MS) {
    throw new TypeError('Invalid chat claim TTL');
  }
  // Exactly one in-memory request slot per verified owner. Tokens are never
  // placed in URLs or persisted. The upload bearer is only returned from the
  // separately protected deliverToApprovedPhone method.
  const claims = new Map();
  const ownerOf = accessRecord => {
    if (accessRecord?.glassOwnerVerified !== true) return {ok:false,code:'GLASS_OWNER_APPROVAL_REQUIRED'};
    return verifiedGlassOwner(accessRecord, now());
  };
  function lookup(accessRecord, claimToken) {
    const owner = ownerOf(accessRecord);
    if (!owner.ok) return owner;
    const rec = claims.get(owner.ownerId);
    if (!rec) return {ok:false,code:'CHAT_CLAIM_REQUIRED'};
    if (now() >= rec.expiresAt) { claims.delete(owner.ownerId); return {ok:false,code:'CHAT_CLAIM_EXPIRED'}; }
    if (typeof claimToken !== 'string' || !CLAIM_RE.test(claimToken)) return {ok:false,code:'CHAT_CLAIM_INVALID'};
    if (!timingSafeEqual(hash(claimToken),rec.claimHash)) return {ok:false,code:'CHAT_CLAIM_INVALID'};
    return {ok:true,ownerId:owner.ownerId,record:rec};
  }
  return Object.freeze({
    /** Return ONLY a per-chat secret, never the mobile upload bearer. */
    beginForChat(accessRecord) {
      const owner = ownerOf(accessRecord);
      if (!owner.ok) return owner;
      const claimToken=makeClaimToken(),requestId=makeRequestId();
      if (typeof claimToken !== 'string' || !CLAIM_RE.test(claimToken) ||
          typeof requestId !== 'string' || !REQUEST_RE.test(requestId)) {
        return {ok:false,code:'RANDOM_TOKEN_GENERATION_FAILED'};
      }
      const pairing = photoSession.beginPairing(accessRecord);
      if (!pairing?.ok) return pairing ?? {ok:false,code:'PAIRING_FAILED'};
      if (typeof pairing.pairingToken !== 'string' || !CLAIM_RE.test(pairing.pairingToken) ||
          !Number.isFinite(pairing.expiresAt) || pairing.expiresAt <= now()) {
        return {ok:false,code:'PAIRING_CONTRACT_INVALID'};
      }
      const expiresAt = Math.min(now()+claimTtlMs, pairing.expiresAt);
      claims.set(owner.ownerId,{
        claimHash:hash(claimToken),requestId,ownerId:owner.ownerId,
        pairingToken:pairing.pairingToken,expiresAt,
        delivered:false,deliveryPending:false,
      });
      return {ok:true,code:'CHAT_CLAIM_READY',chatClaimToken:claimToken,requestId,expiresAt};
    },
    /** NEVER expose via generic MCP tool. This is a phone-only secure route. */
    async deliverToApprovedPhone({requestId,approvalProof}={}) {
      if (typeof requestId !== 'string' || !REQUEST_RE.test(requestId)) return {ok:false,code:'REQUEST_ID_INVALID'};
      const rec = [...claims.values()].find(x=>x.requestId===requestId);
      if (!rec) return {ok:false,code:'PHONE_REQUEST_NOT_FOUND'};
      if (now() >= rec.expiresAt) { claims.delete(rec.ownerId); return {ok:false,code:'PHONE_PAIRING_EXPIRED'}; }
      if (rec.delivered || rec.deliveryPending) return {ok:false,code:'PHONE_PAIRING_ALREADY_DELIVERED'};
      rec.deliveryPending = true;
      try {
        // The callback MUST read signed Secure56 job/result and owner binding
        // from the actual JH server, not from untrusted request fields.
        const receipt = await verifyPhoneApproval({requestId,expectedOwnerId:rec.ownerId,approvalProof});
        if (receipt?.verdict !== 'VERIFIED' || receipt?.requestId !== requestId ||
            receipt?.ownerId !== rec.ownerId || now() >= rec.expiresAt ||
            claims.get(rec.ownerId) !== rec) {
          return {ok:false,code:'PHONE_APPROVAL_UNVERIFIED'};
        }
        // When the device proves the exact JPEG digest with its enrolled
        // AndroidKeyStore signing key, bind this chat claim to those bytes.
        // Never allow a differently uploaded photo to reach the GPT image tool.
        if (receipt.photoSha256 !== undefined) {
          if (typeof receipt.photoSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.photoSha256)) {
            return {ok:false,code:'PHOTO_INTENT_DIGEST_INVALID'};
          }
          rec.expectedPhotoSha256 = receipt.photoSha256;
        }
        rec.delivered = true;
        const pairingToken = rec.pairingToken;
        rec.pairingToken = null;
        return {ok:true,code:'PHONE_PAIRING_READY',pairingToken,expiresAt:rec.expiresAt};
      } catch {
        return {ok:false,code:'PHONE_APPROVAL_UNAVAILABLE'};
      } finally {rec.deliveryPending=false;}
    },
    /** This must be the only publicly registered image consumption route. */
    consumeForChat(accessRecord,chatClaimToken) {
      const auth = lookup(accessRecord,chatClaimToken);
      if (!auth.ok) return auth;
      const photo = photoSession.consume(accessRecord);
      if (!photo?.ok) return photo ?? {ok:false,code:'PHOTO_NOT_READY'};
      if (auth.record.expectedPhotoSha256 &&
          photo.sha256 !== auth.record.expectedPhotoSha256) {
        claims.delete(auth.ownerId);
        if (photo.imageBytes?.fill) photo.imageBytes.fill(0);
        return {ok:false,code:'SIGNED_PHOTO_DIGEST_MISMATCH'};
      }
      claims.delete(auth.ownerId);
      return photo;
    },
    statusForChat(accessRecord,chatClaimToken) {
      const auth = lookup(accessRecord,chatClaimToken);
      if (!auth.ok) return auth;
      const status = photoSession.status(accessRecord);
      if (!status?.ok) return status ?? {ok:false,code:'PHOTO_STATUS_UNAVAILABLE'};
      return {ok:true,photoPending:status.photoPending===true};
    },
    close(){claims.clear();},
  });
}