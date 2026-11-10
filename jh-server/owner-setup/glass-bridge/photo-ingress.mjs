import { MAX_JPEG_BYTES } from './photo-mailbox.mjs';

/**
 * Isolated, fail-closed HTTP adapter. Deliberately NOT registered on JH's server.
 * trustedTransport, approveRequest and validateJpeg are REQUIRED trusted
 * dependencies, never client-controlled. No OpenAI API calls; no disk writes.
 */
export function createPhotoIngress({ mailbox, trustedTransport, approveRequest, validateJpeg }) {
  if (!mailbox || typeof mailbox.receivePhoto !== 'function' || typeof mailbox.cancelPairing !== 'function') throw new TypeError('mailbox required');
  const available = [trustedTransport, approveRequest, validateJpeg].every(fn => typeof fn === 'function');
  return async function handlePhotoIngress(req, res) {
    const send = (status, code, receipt = null) => {
      if (res.headersSent || res.writableEnded) return;
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify({
        ok: status === 202, code,
        ...(status === 202 && receipt?.ok && /^[a-f0-9]{64}$/.test(receipt.sha256)
          && Number.isInteger(receipt.byteLength) && receipt.byteLength >= 32
          && receipt.byteLength <= MAX_JPEG_BYTES
            ? { sha256: receipt.sha256, byteLength: receipt.byteLength } : {}),
      }));
    };
    const pathname = String(req.url || '').split('?')[0];
    if (pathname !== '/jh-glass/v1/photo') return false;
    if (req.method !== 'POST') { send(405, 'METHOD_NOT_ALLOWED'); return true; }
    if (!available) { send(503, 'INGRESS_GATES_UNCONFIGURED'); return true; }
    // HTTPS termination must be attested by a trusted reverse proxy, not a
    // spoofable client X-Forwarded-Proto header.
    if ((await trustedTransport(req)) !== true || (await approveRequest(req)) !== true) {
      send(403, 'INGRESS_NOT_AUTHORIZED'); return true;
    }
    const auth = req.headers.authorization;
    const match = typeof auth === 'string' && /^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth);
    if (!match) { send(401, 'ONE_TIME_PAIRING_REQUIRED'); return true; }
    const burn = () => mailbox.cancelPairing({ pairingToken: match[1] });
    if (req.headers.origin || req.headers.referer) { burn(); send(403, 'NATIVE_CLIENT_ONLY'); return true; }
    if (req.headers['content-encoding']) { burn(); send(415, 'ENCODING_NOT_ALLOWED'); return true; }
    if (req.headers['content-type'] !== 'image/jpeg') { burn(); send(415, 'JPEG_REQUIRED'); return true; }
    if (req.headers['content-length'] !== undefined) {
      const len = String(req.headers['content-length']);
      if (!/^(0|[1-9][0-9]*)$/.test(len) || Number(len) > MAX_JPEG_BYTES || Number(len) < 32) {
        burn(); send(413, 'INVALID_OR_TOO_LARGE_LENGTH'); return true;
      }
    }
    let chunks = [], total = 0, bytes = null;
    try {
      for await (const chunk of req) {
        const copy = Buffer.from(chunk);
        total += copy.length;
        if (total > MAX_JPEG_BYTES) {
          copy.fill(0);
          burn(); send(413, 'PHOTO_TOO_LARGE');
          return true;
        }
        chunks.push(copy);
      }
      if (total < 32) { burn(); send(422, 'INVALID_JPEG'); return true; }
      if (req.headers['content-length'] !== undefined && total !== Number(req.headers['content-length'])) {
        burn(); send(400, 'CONTENT_LENGTH_MISMATCH'); return true;
      }
      bytes = Buffer.concat(chunks, total);
      // This function must use a bounded real JPEG decoder; magic bytes are not enough.
      const valid = await validateJpeg(bytes);
      if (valid !== true) { burn(); send(422, 'JPEG_DECODER_REJECTED'); return true; }
      const receipt = mailbox.receivePhoto({ pairingToken: match[1], contentType: 'image/jpeg', imageBytes: bytes });
      send(receipt.ok ? 202 : 409, receipt.code, receipt);
      return true;
    } catch {
      burn(); send(400, 'INGRESS_FAILED');
      return true;
    } finally {
      if (bytes) bytes.fill(0);
      for (const chunk of chunks) chunk.fill(0);
    }
  };
}