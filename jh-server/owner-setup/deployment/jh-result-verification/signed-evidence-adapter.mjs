import { stableStringify } from './canonical-command.mjs';

export function buildAndroidEvidenceSigningPayload(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new TypeError('evidence envelope must be an object');
  }
  const payload = {
    schemaVersion: envelope.schemaVersion,
    evidenceId: envelope.evidenceId,
    source: envelope.source,
    capturedAt: envelope.capturedAt,
    verified: envelope.verified,
    binding: envelope.binding,
    contentDigest: envelope.contentDigest
  };
  return Buffer.from(stableStringify(payload, { ignoreVolatileKeys: false }), 'utf8');
}

/**
 * Converts an Android JHResultEvidence envelope into server evidence only after the existing
 * Secure Bridge trust layer verifies the device signature. Never trust a client-provided
 * signatureVerified field.
 */
export async function verifyAndroidEvidenceEnvelope({ envelope, verifySignature }) {
  if (typeof verifySignature !== 'function') {
    throw new TypeError('verifySignature callback is required');
  }
  if (!envelope?.keyId || !envelope?.signatureBase64) {
    return {
      ...envelope,
      signatureVerified: false,
      signatureFailure: 'MISSING_DEVICE_SIGNATURE'
    };
  }

  const payload = buildAndroidEvidenceSigningPayload(envelope);
  const encodedSignature = String(envelope.signatureBase64);
  const normalizedBase64 = encodedSignature.replace(/\s+/g, '');
  if (
    normalizedBase64.length === 0 ||
    normalizedBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64)
  ) {
    return {
      ...envelope,
      signatureVerified: false,
      signatureFailure: 'INVALID_BASE64_SIGNATURE'
    };
  }
  const signature = Buffer.from(normalizedBase64, 'base64');
  if (signature.length === 0 || signature.toString('base64') !== normalizedBase64) {
    return {
      ...envelope,
      signatureVerified: false,
      signatureFailure: 'INVALID_BASE64_SIGNATURE'
    };
  }

  const signatureVerified = await verifySignature({
    keyId: envelope.keyId,
    payload,
    signature
  });

  return {
    schemaVersion: envelope.schemaVersion,
    evidenceId: envelope.evidenceId,
    source: envelope.source,
    capturedAt: envelope.capturedAt,
    verified: envelope.verified === true,
    signatureVerified: signatureVerified === true,
    binding: envelope.binding,
    facts: envelope.facts,
    contentDigest: envelope.contentDigest,
    signatureFailure: signatureVerified === true ? null : 'DEVICE_SIGNATURE_REJECTED'
  };
}
