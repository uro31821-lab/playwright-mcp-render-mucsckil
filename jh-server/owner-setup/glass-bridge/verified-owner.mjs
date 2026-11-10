import { createHash } from "node:crypto";

/**
 * Isolated contract, NOT installed in the running JH OAuth server.
 * The caller MUST provide an internally verified oauthAccess56 record.
 * Never accept this record from HTTP JSON, a mobile intent, or plugin args.
 */
export function verifiedGlassOwner(tokenRecord, now = Date.now()) {
  if (!tokenRecord || typeof tokenRecord !== "object") {
    return { ok: false, code: "OAUTH_PRINCIPAL_REQUIRED" };
  }
  if (tokenRecord.scope !== "jh.secure") {
    return { ok: false, code: "OAUTH_SCOPE_INVALID" };
  }
  if (!Number.isFinite(tokenRecord.expiresAt) || tokenRecord.expiresAt <= now) {
    return { ok: false, code: "OAUTH_ACCESS_EXPIRED" };
  }
  if (
    typeof tokenRecord.subject !== "string" ||
    !/^jhsub_[A-Za-z0-9_-]{22,64}$/.test(tokenRecord.subject)
  ) {
    return { ok: false, code: "OAUTH_STABLE_SUBJECT_MISSING" };
  }
  // Do not expose the raw OAuth subject in phone or photo payloads.
  return {
    ok: true,
    ownerId: "owner:" + createHash("sha256")
      .update("jh-glass-owner|" + tokenRecord.subject)
      .digest("hex"),
  };
}
