import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const PURPOSE = 'JH_GLASS_OAUTH_OWNER_BIND_V1';
const HEX64 = /^[0-9a-f]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{24,160}$/;
const OWNER = /^owner-binding:[A-Za-z0-9_-]{16,96}$/;
const MAX_AGE = 120_000;

export function glassApprovalMessage(r) {
  return [PURPOSE, r.sessionId, r.deviceDigest, r.jobId, r.approvalId,
    r.requestDigest, r.serverDigest, String(r.approvedAt), String(r.expiresAt),
    r.localUserApproved === true ? '1' : '0'].join('|');
}

/**
 * Cryptographic receipt verifier candidate. This alone does NOT implement the
 * required phone-local UI job, nor a trusted device-to-owner account binding.
 * Both must already be proven by server-owned callbacks. NOT deployed.
 */
export function createSecure56GlassApprovalVerifier({
  getActiveSession, getApprovedJob, getVerifiedOwnerBinding, now = () => Date.now(),
}) {
  if ([getActiveSession, getApprovedJob, getVerifiedOwnerBinding].some(x => typeof x !== 'function')) {
    throw new TypeError('Three trusted server-side readback functions required');
  }
  const used = new Map();
  return async function verify({approvalReceipt, purpose, requestDigest, serverDigest}) {
    const t = now();
    if (purpose !== PURPOSE || !HEX64.test(requestDigest || '') || !HEX64.test(serverDigest || '')) {
      return {verdict:'REJECTED',code:'INVALID_BINDING_CONTEXT'};
    }
    const r = approvalReceipt;
    if (!r || typeof r !== 'object' || r.purpose !== PURPOSE ||
      !TOKEN.test(r.jobId || '') || !TOKEN.test(r.approvalId || '') ||
      typeof r.deviceId !== 'string' || r.deviceId.length < 8 || r.deviceId.length > 160 ||
      !TOKEN.test(r.sessionId || '') || !HEX64.test(r.deviceDigest || '') ||
      r.requestDigest !== requestDigest || r.serverDigest !== serverDigest ||
      r.localUserApproved !== true || !Number.isFinite(r.approvedAt) ||
      !Number.isFinite(r.expiresAt) || r.approvedAt > t ||
      r.approvedAt < t - MAX_AGE || r.expiresAt <= t || r.expiresAt > t + MAX_AGE ||
      !HEX64.test(r.mac || '')) {
      return {verdict:'REJECTED',code:'INVALID_OR_EXPIRED_APPROVAL'};
    }
    for (const [hash, expiry] of used) if (expiry <= t) used.delete(hash);
    const nonceKey = createHash('sha256').update(r.sessionId + '|' + r.approvalId).digest('hex');
    if (used.has(nonceKey)) return {verdict:'REJECTED',code:'APPROVAL_REPLAY'};
    if (used.size >= 2048) return {verdict:'REJECTED',code:'APPROVAL_CAPACITY_EXCEEDED'};
    let session, job, owner;
    try {
      [session, job, owner] = await Promise.all([
        getActiveSession(r.deviceId),
        getApprovedJob(r.jobId),
        getVerifiedOwnerBinding(r.deviceId),
      ]);
    } catch { return {verdict:'REJECTED',code:'TRUSTED_READBACK_UNAVAILABLE'}; }
    if (!session || !Buffer.isBuffer(session.secret) || session.secret.length < 32 ||
      session.sessionId !== r.sessionId || session.deviceDigest !== r.deviceDigest ||
      !Number.isFinite(session.expiresAt) || session.expiresAt <= t) {
      return {verdict:'REJECTED',code:'SECURE_SESSION_UNVERIFIED'};
    }
    const expectedMac = createHmac('sha256', session.secret).update(glassApprovalMessage(r)).digest();
    const gotMac = Buffer.from(r.mac,'hex');
    if (gotMac.length !== expectedMac.length || !timingSafeEqual(gotMac,expectedMac)) {
      return {verdict:'REJECTED',code:'SIGNATURE_INVALID'};
    }
    if (!job || job.jobId !== r.jobId || job.approvalId !== r.approvalId ||
      job.type !== 'glass_owner_oauth_bind' || job.status !== 'complete' ||
      job.secureCompletionVerified !== true || job.localApprovalVerified !== true ||
      job.deviceDigest !== r.deviceDigest || job.sessionId !== r.sessionId ||
      job.requestDigest !== r.requestDigest) {
      return {verdict:'REJECTED',code:'PHONE_LOCAL_JOB_UNVERIFIED'};
    }
    if (!owner || owner.verifiedFor === 'device_only' || owner.accountLinked !== true ||
      !OWNER.test(owner.ownerRef || '') || owner.deviceDigest !== r.deviceDigest ||
      owner.expiresAt <= t || !Number.isFinite(owner.expiresAt)) {
      return {verdict:'REJECTED',code:'ACCOUNT_OWNER_BINDING_MISSING'};
    }
    used.set(nonceKey,r.expiresAt);
    return {
      verdict:'VERIFIED',purpose:PURPOSE,requestDigest:r.requestDigest,serverDigest:r.serverDigest,
      approvalId:r.approvalId,ownerRef:owner.ownerRef,
      approvedAt:r.approvedAt,expiresAt:r.expiresAt,
      signatureValid:true,localUserApproved:true,
    };
  };
}