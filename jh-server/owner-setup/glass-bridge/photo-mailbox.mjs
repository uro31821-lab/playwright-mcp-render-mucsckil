import { createHash, randomBytes } from "node:crypto";

/**
 * JH Glass Bridge proof-of-concept, NOT wired into the running JH HTTP/MCP server.
 * Only authenticated server-side code may pass the ownerId. Never trust an
 * ownerId supplied by an Android client, an HTTP header, or an upload body.
 *
 * This module does not call OpenAI, store to disk, create an external service,
 * or post to a ChatGPT conversation.
 */
export const MAX_JPEG_BYTES = 2 * 1024 * 1024;
export const PAIRING_TTL_MS = 90_000;
export const PHOTO_TTL_MS = 90_000;

function identity(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:@._-]{8,256}$/.test(value)) {
    throw new TypeError("Verified owner identity is required");
  }
  return value;
}
function hexSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function validJpeg(bytes) {
  return (
    bytes.length >= 32 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9
  );
}
function wipe(record) {
  if (record?.bytes) record.bytes.fill(0);
}

export class GlassPhotoMailbox {
  #pairings = new Map();       // SHA256(one-time token) -> owner + expiry
  #activeTokens = new Map();   // owner -> SHA256(token)
  #pending = new Map();        // owner -> one in-memory JPEG
  #now;
  #makeToken;

  constructor({
    now = () => Date.now(),
    makeToken = () => randomBytes(32).toString("base64url"),
  } = {}) {
    this.#now = now;
    this.#makeToken = makeToken;
  }

  #sweep() {
    const now = this.#now();
    for (const [hash, pairing] of this.#pairings) {
      if (now >= pairing.expiresAt) {
        this.#pairings.delete(hash);
        if (this.#activeTokens.get(pairing.ownerId) === hash) {
          this.#activeTokens.delete(pairing.ownerId);
        }
      }
    }
    for (const [ownerId, photo] of this.#pending) {
      if (now >= photo.expiresAt) {
        wipe(photo);
        this.#pending.delete(ownerId);
      }
    }
  }

  beginPairing({ ownerId }) {
    const owner = identity(ownerId);
    this.#sweep();
    if (this.#pending.has(owner)) {
      return { ok: false, code: "PHOTO_PENDING" };
    }
    const oldHash = this.#activeTokens.get(owner);
    if (oldHash) this.#pairings.delete(oldHash);
    const token = this.#makeToken();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new Error("Pairing token generator must return 256-bit base64url");
    }
    const hash = hexSha256(token);
    if (this.#pairings.has(hash)) throw new Error("Pairing token collision");
    const expiresAt = this.#now() + PAIRING_TTL_MS;
    this.#pairings.set(hash, { ownerId: owner, expiresAt });
    this.#activeTokens.set(owner, hash);
    return {
      ok: true,
      code: "PAIRING_READY",
      pairingToken: token,
      expiresAt,
      maxJpegBytes: MAX_JPEG_BYTES,
    };
  }

  /**
   * Called by a separate authenticated/rate-limited HTTPS adapter only AFTER
   * the adapter has limited the streaming body to MAX_JPEG_BYTES.
   * The one-time bearer pairing is always invalidated on the first attempt.
   */
  receivePhoto({ pairingToken, contentType, imageBytes }) {
    this.#sweep();
    if (
      typeof pairingToken !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(pairingToken)
    ) {
      return { ok: false, code: "PAIRING_INVALID" };
    }
    const hash = hexSha256(pairingToken);
    const pairing = this.#pairings.get(hash);
    if (!pairing) return { ok: false, code: "PAIRING_INVALID_OR_EXPIRED" };

    this.#pairings.delete(hash);
    if (this.#activeTokens.get(pairing.ownerId) === hash) {
      this.#activeTokens.delete(pairing.ownerId);
    }

    if (this.#pending.has(pairing.ownerId)) {
      return { ok: false, code: "PHOTO_PENDING" };
    }
    if (contentType !== "image/jpeg") {
      return { ok: false, code: "JPEG_REQUIRED" };
    }
    if (!(imageBytes instanceof Uint8Array)) {
      return { ok: false, code: "INVALID_PHOTO_BYTES" };
    }
    if (imageBytes.byteLength > MAX_JPEG_BYTES) {
      return { ok: false, code: "PHOTO_TOO_LARGE" };
    }
    const bytes = Buffer.from(imageBytes);
    if (!validJpeg(bytes)) {
      return { ok: false, code: "INVALID_JPEG" };
    }

    const receipt = hexSha256(bytes);
    const expiresAt = this.#now() + PHOTO_TTL_MS;
    this.#pending.set(pairing.ownerId, {
      bytes,
      receipt,
      expiresAt,
    });
    return {
      ok: true,
      code: "PHOTO_RECEIVED",
      sha256: receipt,
      byteLength: bytes.length,
      expiresAt,
    };
  }

  /** Must only be called from an authenticated MCP request for this owner. */
  consumePhoto({ ownerId }) {
    const owner = identity(ownerId);
    this.#sweep();
    const record = this.#pending.get(owner);
    if (!record) return { ok: false, code: "NO_PENDING_PHOTO" };
    this.#pending.delete(owner);
    const bytes = Buffer.from(record.bytes);
    wipe(record);
    return {
      ok: true,
      contentType: "image/jpeg",
      imageBytes: bytes,
      sha256: record.receipt,
    };
  }

  status({ ownerId }) {
    const owner = identity(ownerId);
    this.#sweep();
    return {
      pairingActive: this.#activeTokens.has(owner),
      photoPending: this.#pending.has(owner),
    };
  }

  close() {
    for (const record of this.#pending.values()) wipe(record);
    this.#pending.clear();
    this.#pairings.clear();
    this.#activeTokens.clear();
  }
}
