import { createHash, createHmac } from 'node:crypto';

const PURPOSE = 'JH_GLASS_OAUTH_OWNER_BIND_V1';
const MAX_APPROVAL_AGE_MS = 120_000;
const ID = /^[A-Za-z0-9_-]{24,160}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const VERIFIED_OWNER = /^owner-binding:[A-Za-z0-9_-]{16,96}$/;

function digest(data) {
  return createHash('sha256').update(data).digest('hex');
}
function oauthRequestDigest(request, allowedResources) {
  if (!request || typeof request !== 'object') return null;
  const { response_type, client_id, redirect_uri, code_challenge_method, code_challenge, resource, state = '' } = request;
  if (response_type !== 'code' || code_challenge_method !== 'S256') return null;
  if (typeof client_id !== 'string' || !/^https:\/\/chatgpt\.com\/oauth\/(?:client\.json|[A-Za-z0-9_-]+\/client\.json)$/.test(client_id)) return null;
  if (typeof redirect_uri !== 'string' || !/^https:\/\/chatgpt\.com\/(?:connector_platform_oauth_redirect|connector\/oauth\/[A-Za-z0-9_-]+)$/.test(redirect_uri)) return null;
  if (typeof code_challenge !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(code_challenge)) return null;
  if (typeof resource !== 'string' || !allowedResources.includes(resource)) return null;
  if (typeof state !== 'string' || state.length > 2048) return null;
  return digest(JSON.stringify([response_type, client_id, redirect_uri, code_challenge_method, code_challenge, resource, state]));
}

/**
 * Isolated development candidate. NOT installed into server.mjs, NOT a login system.
 * Requires a server-only, cryptographic Secure56 phone-approval verifier.
 * A browser POST, OAuth PKCE, or client-provided owner string is NEVER sufficient.
 */
export function createGlassOwnerOAuthGate({
  verifySecure56Approval,
  serverDigest,
  allowedResources,
  hmacKey,
  now = () => Date.now(),
}) {
  if (typeof verifySecure56Approval !== 'function') throw new TypeError('Verified phone approval callback required');
  if (typeof serverDigest !== 'string' || !DIGEST.test(serverDigest)) throw new TypeError('Pinned server digest required');
  if (!Array.isArray(allowedResources) || !allowedResources.length || !allowedResources.every(resource => typeof resource === 'string' && /^https:\/\/[A-Za-z0-9.-]+(?:\/mcp)?$/.test(resource))) {
    throw new TypeError('Exact allowed OAuth resources required');
  }
  if (!Buffer.isBuffer(hmacKey) || hmacKey.length < 32) throw new TypeError('Dedicated secret key required (not LIFE_HUB_TOKEN)');
  const activeApprovals = new WeakSet();
  const activeCodes = new WeakSet();
  const activeRefresh = new WeakSet();
  const seenApprovalDigests = new Map();
  const serverKey = Buffer.from(hmacKey);

  function mintRecords(subject, accessTtlMs, refreshTtlMs) {
    const time = now();
    if (!Number.isInteger(accessTtlMs) || accessTtlMs < 1 || accessTtlMs > 3_600_000 ||
        !Number.isInteger(refreshTtlMs) || refreshTtlMs < 1 || refreshTtlMs > 2_592_000_000) {
      return { ok: false, code: 'INVALID_TTL' };
    }
    const accessRecord = Object.freeze({ scope: 'jh.secure', expiresAt: time + accessTtlMs, subject, glassOwnerVerified: true });
    const refreshRecord = Object.freeze({ scope: 'jh.secure', expiresAt: time + refreshTtlMs, subject, glassOwnerVerified: true });
    activeRefresh.add(refreshRecord);
    return { ok: true, accessRecord, refreshRecord };
  }

  async function approve({ oauthRequest, approvalReceipt }) {
    const requestDigest = oauthRequestDigest(oauthRequest, allowedResources);
    if (!requestDigest) return { ok: false, code: 'OAUTH_REQUEST_INVALID' };
    let result;
    try {
      result = await verifySecure56Approval({ approvalReceipt, purpose: PURPOSE, requestDigest, serverDigest });
    } catch {
      return { ok: false, code: 'OWNER_APPROVAL_UNVERIFIED' };
    }
    const time = now();
    if (!result || result.verdict !== 'VERIFIED' || result.purpose !== PURPOSE ||
        result.signatureValid !== true || result.localUserApproved !== true ||
        result.requestDigest !== requestDigest || result.serverDigest !== serverDigest ||
        typeof result.approvalId !== 'string' || !ID.test(result.approvalId) ||
        typeof result.ownerRef !== 'string' || !VERIFIED_OWNER.test(result.ownerRef) ||
        !Number.isFinite(result.approvedAt) || !Number.isFinite(result.expiresAt) ||
        result.approvedAt > time || result.approvedAt < time - MAX_APPROVAL_AGE_MS ||
        result.expiresAt <= time || result.expiresAt > time + MAX_APPROVAL_AGE_MS) {
      return { ok: false, code: 'OWNER_APPROVAL_UNVERIFIED' };
    }
    for (const [key, expiry] of seenApprovalDigests) if (expiry <= time) seenApprovalDigests.delete(key);
    const oneUseDigest = digest(result.approvalId);
    if (seenApprovalDigests.has(oneUseDigest)) return { ok: false, code: 'OWNER_APPROVAL_REPLAY' };
    if (seenApprovalDigests.size >= 2048) return { ok: false, code: 'OWNER_APPROVAL_CAPACITY_EXCEEDED' };
    seenApprovalDigests.set(oneUseDigest, result.expiresAt);
    const subject = 'jhsub_' + createHmac('sha256', serverKey)
      .update('jh-glass-owner-v1\0' + serverDigest + '\0' + result.ownerRef)
      .digest('base64url');
    const approval = Object.freeze({ requestDigest, subject, expiresAt: result.expiresAt });
    activeApprovals.add(approval);
    return { ok: true, approval };
  }

  function bindCode({ oauthRequest, approval, codeRecord }) {
    const requestDigest = oauthRequestDigest(oauthRequest, allowedResources);
    if (!requestDigest || !approval || !activeApprovals.has(approval) ||
        approval.requestDigest !== requestDigest || approval.expiresAt <= now() ||
        !codeRecord || typeof codeRecord !== 'object' ||
        codeRecord.clientId !== oauthRequest.client_id ||
        codeRecord.redirectUri !== oauthRequest.redirect_uri ||
        codeRecord.challenge !== oauthRequest.code_challenge ||
        codeRecord.resource !== oauthRequest.resource ||
        !Number.isFinite(codeRecord.expiresAt) || codeRecord.expiresAt <= now()) {
      return { ok: false, code: 'UNVERIFIED_CODE_BINDING' };
    }
    activeApprovals.delete(approval);
    const record = Object.freeze({ ...codeRecord, subject: approval.subject, glassOwnerVerified: true });
    activeCodes.add(record);
    return { ok: true, record };
  }

  function issueFromCode({ codeRecord, accessTtlMs = 3_600_000, refreshTtlMs = 2_592_000_000 }) {
    if (!codeRecord || !activeCodes.has(codeRecord) || codeRecord.glassOwnerVerified !== true ||
        typeof codeRecord.subject !== 'string') return { ok: false, code: 'OAUTH_CODE_OWNER_UNVERIFIED' };
    activeCodes.delete(codeRecord);
    return mintRecords(codeRecord.subject, accessTtlMs, refreshTtlMs);
  }

  function rotateRefresh({ refreshRecord, accessTtlMs = 3_600_000, refreshTtlMs = 2_592_000_000 }) {
    if (!refreshRecord || !activeRefresh.has(refreshRecord) || refreshRecord.expiresAt <= now()) {
      return { ok: false, code: 'OAUTH_REFRESH_OWNER_UNVERIFIED' };
    }
    activeRefresh.delete(refreshRecord);
    return mintRecords(refreshRecord.subject, accessTtlMs, refreshTtlMs);
  }

  return Object.freeze({ approve, bindCode, issueFromCode, rotateRefresh });
}