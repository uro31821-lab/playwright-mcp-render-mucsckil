import { verifiedGlassOwner } from './verified-owner.mjs';

/**
 * Candidate bridge for JH MCP handlers. Only the JH HTTP auth middleware may
 * build the verifiedAccessRecord. Accepting it from MCP tool args or Android
 * payloads is a security violation. Not yet wired into production.
 */
export function createGlassSession({ mailbox, now = () => Date.now() }) {
  if (!mailbox || typeof mailbox.beginPairing !== 'function') throw new TypeError('mailbox required');
  const principal = verifiedAccessRecord => verifiedGlassOwner(verifiedAccessRecord, now());
  return {
    beginPairing(verifiedAccessRecord) {
      const owner = principal(verifiedAccessRecord);
      return owner.ok ? mailbox.beginPairing({ ownerId: owner.ownerId }) : owner;
    },
    consume(verifiedAccessRecord) {
      const owner = principal(verifiedAccessRecord);
      return owner.ok ? mailbox.consumePhoto({ ownerId: owner.ownerId }) : owner;
    },
    status(verifiedAccessRecord) {
      const owner = principal(verifiedAccessRecord);
      return owner.ok ? { ok: true, ...mailbox.status({ ownerId: owner.ownerId }) } : owner;
    },
  };
}
