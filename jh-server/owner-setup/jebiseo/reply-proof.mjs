import { createHash } from 'node:crypto';

/** Candidate result admission only. This module does not fetch, send, or turn
 * an accessibility fragment into a provider message ID. The task must come
 * from the existing authenticated owner journal. verifyObservation is trusted
 * host code: authenticate the original receipt AND independently verify the
 * provider/account/conversation/sent-message association before attesting.
 * A signed screenshot, matching text, or caller-supplied verified:true is not
 * enough. Current PR63 visible-sequence candidates deliberately fail here.
 */
export const JEBISEO_REPLY_SCHEMA = 'jh.jebiseo.reply-observation.v1';
const MAX_AGE_MS = 15_000;
const MAX_TEXT_BYTES = 200_000;
const hex32 = x => typeof x === 'string' && /^[a-f0-9]{32}$/.test(x);
const hex64 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const opaque = x => typeof x === 'string' && x.length > 0 && x.length <= 256 &&
  x.trim() === x && !/[\u0000-\u0020\u007f]/u.test(x);
const time = x => Number.isSafeInteger(x) && x >= 0;
const sha = x => createHash('sha256').update(x, 'utf8').digest('hex');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const base = Object.freeze({
  matched: false, response: null, replyBindingVerified: false,
  fullReplyVerified: false, partial: true, contentIsUntrusted: true,
  actionAuthority: false, automaticReplay: false, automaticDelivery: false,
  hiddenExecutionVerified: false, liveEndToEndVerified: false,
});
const deny = code => Object.freeze({ ...base, code });
function freeze(value) {
  if (object(value) || Array.isArray(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object' &&
      !Object.isFrozen(child)) freeze(child);
  }
  return value;
}
function validTask(task) {
  return object(task) && opaque(task.taskRef) && hex32(task.commandId) &&
    opaque(task.deviceId) && hex64(task.promptDigest) && time(task.submittedAt) &&
    opaque(task.accountBinding) && opaque(task.conversationId) &&
    opaque(task.sentMessageId) && task.cancelled !== true;
}
function validate(task, observation, at) {
  if (!validTask(task)) return 'JEBISEO_AUTHENTICATED_SENT_TASK_REQUIRED';
  if (!time(at) || task.submittedAt > at) return 'JEBISEO_TIME_INVALID';
  if (!object(observation) || observation.schema !== JEBISEO_REPLY_SCHEMA ||
    observation.provider !== 'GEMINI' || observation.backend !== 'JH_ANDROID_NATIVE')
    return 'JEBISEO_ORIGINAL_MOBILE_REPLY_REQUIRED';
  if (['taskRef', 'commandId', 'deviceId', 'accountBinding', 'conversationId']
    .some(key => observation[key] !== task[key])) return 'JEBISEO_REPLY_SCOPE_MISMATCH';
  if (!time(observation.observedAt) || observation.observedAt < task.submittedAt ||
    observation.observedAt > at || at - observation.observedAt > MAX_AGE_MS)
    return 'JEBISEO_FRESH_REPLY_REQUIRED';
  const sent = observation.sent;
  if (!object(sent) || sent.messageId !== task.sentMessageId ||
    sent.promptDigest !== task.promptDigest || sent.at !== task.submittedAt)
    return 'JEBISEO_ORIGINAL_SUBMISSION_MISMATCH';
  const reply = observation.reply;
  if (!object(reply) || reply.role !== 'assistant' || !opaque(reply.messageId) ||
    reply.messageId === sent.messageId || reply.inReplyTo !== sent.messageId ||
    reply.promptDigest !== task.promptDigest || !time(reply.createdAt) ||
    reply.createdAt < sent.at || reply.createdAt > observation.observedAt)
    return 'JEBISEO_REQUEST_TURN_PROOF_REQUIRED';
  if (typeof reply.text !== 'string' || !reply.text.trim() ||
    Buffer.byteLength(reply.text, 'utf8') > MAX_TEXT_BYTES ||
    !hex64(reply.textDigest) || reply.textDigest !== sha(reply.text))
    return 'JEBISEO_REPLY_TEXT_INVALID';
  if (!['VISIBLE_REPLY_ONLY', 'BOUND_COMPLETE_TRAVERSAL'].includes(reply.coverage) ||
    typeof reply.generating !== 'boolean' || typeof reply.truncated !== 'boolean')
    return 'JEBISEO_REPLY_COVERAGE_REQUIRED';
  return null;
}

/** Digest of the exact task + text + coverage admitted by this module. This
 * digest is NOT authentication. A host verifier must compare it with the
 * independently authenticated original source, never just echo input flags.
 */
export function jebiseoReplyBindingDigest(task, observation) {
  const r = observation?.reply;
  return sha(JSON.stringify([
    'jh.jebiseo.reply-binding.v1', task?.taskRef, task?.commandId, task?.deviceId,
    task?.promptDigest, task?.submittedAt, task?.accountBinding,
    task?.conversationId, task?.sentMessageId, observation?.schema,
    observation?.provider, observation?.backend, observation?.taskRef,
    observation?.commandId, observation?.deviceId, observation?.accountBinding,
    observation?.conversationId, observation?.observedAt, observation?.sent?.messageId,
    observation?.sent?.promptDigest, observation?.sent?.at, r?.role, r?.messageId,
    r?.inReplyTo, r?.promptDigest, r?.createdAt, r?.textDigest,
    typeof r?.text === 'string' ? sha(r.text) : null, r?.coverage,
    r?.generating, r?.truncated,
  ]));
}

/**
 * Trusted verifier result:
 * {authenticated:true, source:'ORIGINAL_SECURE56', bindingDigest,
 *  verifiedAt, providerVerified:true, commandCurrent:true,
 *  conversationVerified:true, sentMessageIdProven:true, requestTurnVerified:true,
 *  fullReplyVerified?:true, coverage?:'BOUND_COMPLETE_TRAVERSAL',
 *  fullReplyTextDigest?:<exact text SHA256>, traversalEvidenceRef?:<opaque ref>}
 *
 * Full coverage requires independently verified traversal evidence. The
 * ordinary mobile observer currently exposes partial visible candidates; it
 * cannot manufacture this proof. All returned text remains untrusted content.
 */
export async function verifyJebiseoReply({ task, observation, verifyObservation, now = Date.now } = {}) {
  if (typeof verifyObservation !== 'function') return deny('JEBISEO_ORIGINAL_HOST_VERIFIER_REQUIRED');
  if (typeof now !== 'function') return deny('JEBISEO_TIME_INVALID');
  let t, o, at;
  try {
    t = freeze(structuredClone(task));
    o = freeze(structuredClone(observation));
    at = now();
  } catch { return deny('JEBISEO_REPLY_INPUT_INVALID'); }
  const invalid = validate(t, o, at);
  if (invalid) return deny(invalid);
  const bindingDigest = jebiseoReplyBindingDigest(t, o);
  let proof;
  try { proof = await verifyObservation(o, t); }
  catch { return deny('JEBISEO_REPLY_AUTHENTICATION_FAILED'); }
  if (!object(proof) || proof.authenticated !== true || proof.source !== 'ORIGINAL_SECURE56' ||
    proof.bindingDigest !== bindingDigest || proof.providerVerified !== true ||
    proof.commandCurrent !== true || proof.conversationVerified !== true ||
    proof.sentMessageIdProven !== true || proof.requestTurnVerified !== true)
    return deny('JEBISEO_AUTHENTICATED_TURN_PROOF_REQUIRED');
  let verifiedNow;
  try { verifiedNow = now(); } catch { return deny('JEBISEO_TIME_INVALID'); }
  const stale = validate(t, o, verifiedNow);
  if (stale) return deny(stale);
  if (verifiedNow < at || !time(proof.verifiedAt) || proof.verifiedAt < o.observedAt ||
    proof.verifiedAt > verifiedNow || verifiedNow - proof.verifiedAt > MAX_AGE_MS)
    return deny('JEBISEO_FRESH_AUTHENTICATION_REQUIRED');
  const full = o.reply.coverage === 'BOUND_COMPLETE_TRAVERSAL' &&
    !o.reply.generating && !o.reply.truncated && proof.fullReplyVerified === true &&
    proof.coverage === 'BOUND_COMPLETE_TRAVERSAL' &&
    proof.fullReplyTextDigest === o.reply.textDigest && opaque(proof.traversalEvidenceRef);
  return Object.freeze({ ...base, matched: true,
    code: full ? 'JEBISEO_MATCHED_COMPLETE' : 'JEBISEO_MATCHED_VISIBLE_PARTIAL',
    taskRef: t.taskRef, provider: 'GEMINI', response: o.reply.text,
    replyBindingVerified: true, fullReplyVerified: full, partial: !full,
    coverage: full ? 'BOUND_COMPLETE_TRAVERSAL' : 'VISIBLE_REPLY_ONLY',
    generating: o.reply.generating, truncated: o.reply.truncated,
  });
}
