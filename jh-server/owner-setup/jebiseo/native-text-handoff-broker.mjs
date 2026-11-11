/** Public candidate control carried by the EXISTING life_android_step schema.
 * PREPARE retains semantic input only. START/RESUME reuse that exact session;
 * callers cannot provide a native receipt, success assertion, grant or caller.
 * Actual phone phases still use the original private signed handler path.
 */
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareJebiseoHandoff} from './handoff-request.mjs';

export const JEBISEO_NATIVE_BROKER_SCHEMA = 'JH_JEBISEO_AUTO3_BROKER_V1';
export const JEBISEO_NATIVE_BROKER_MARKER = '__JH_JEBISEO_HANDOFF_BROKER_V1__';
export const JEBISEO_NATIVE_BROKER_ACTIONS = Object.freeze({
  PREPARE: 'jebiseo_handoff_prepare', START: 'jebiseo_handoff_start', RESUME: 'jebiseo_handoff_resume'
});
const MODES = new Set(Object.keys(JEBISEO_NATIVE_BROKER_ACTIONS));
const REF = /^jhb_[a-f0-9]{48}$/;
const PREPARE_KEYS = ['schema', 'mode', 'request'];
const CONTINUE_KEYS = ['schema', 'mode', 'brokerRef', 'taskRef', 'threadRef', 'sourceRef', 'requestDigest', 'promptDigest'];
const SCOPE_KEYS = ['taskRef', 'threadRef', 'sourceRef', 'requestDigest', 'promptDigest'];
const fail = code => {throw Error(code);};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, fields) => plain(value) && Reflect.ownKeys(value).length === fields.length &&
  fields.every(key => Object.hasOwn(value, key) && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
const freeze = value => Object.freeze(structuredClone(value));

export function isJebiseoNativeBrokerCarrier(args) {
  return plain(args) && ((typeof args.action === 'string' && args.action.startsWith('jebiseo_handoff')) ||
    (typeof args.text === 'string' && args.text.startsWith('__JH_JEBISEO_HANDOFF_BROKER')));
}
export function readJebiseoNativeBrokerCarrier(args) {
  if (!exact(args, ['action', 'text', 'value']) || args.text !== JEBISEO_NATIVE_BROKER_MARKER ||
      typeof args.value !== 'string' || Buffer.byteLength(args.value, 'utf8') > 24576)
    fail('JEBISEO_BROKER_CARRIER_INVALID');
  let value;
  try {value = JSON.parse(args.value);} catch {fail('JEBISEO_BROKER_VALUE_INVALID');}
  if (!plain(value) || !MODES.has(value.mode) || value.schema !== JEBISEO_NATIVE_BROKER_SCHEMA ||
      args.action !== JEBISEO_NATIVE_BROKER_ACTIONS[value.mode] || JSON.stringify(value) !== args.value ||
      !exact(value, value.mode === 'PREPARE' ? PREPARE_KEYS : CONTINUE_KEYS))
    fail('JEBISEO_BROKER_VALUE_INVALID');
  if (value.mode !== 'PREPARE' && (!REF.test(value.brokerRef ?? '') ||
      SCOPE_KEYS.some(key => typeof value[key] !== 'string' || !value[key])))
    fail('JEBISEO_BROKER_CONTINUATION_INVALID');
  return freeze(value);
}
function continuation(entry, mode) {
  return {schema: JEBISEO_NATIVE_BROKER_SCHEMA, mode, brokerRef: entry.ref,
    ...Object.fromEntries(SCOPE_KEYS.map(key => [key, entry.prepared[key]]))};
}
function argumentsFor(entry, mode) {
  return {action: JEBISEO_NATIVE_BROKER_ACTIONS[mode], text: JEBISEO_NATIVE_BROKER_MARKER,
    value: JSON.stringify(continuation(entry, mode)), command_id: entry.owner.commandId};
}

/** Both functions are original private host services installed by the source
 * composition. They never enter the public tool's arguments or result.
 */
export function createJebiseoNativeHandoffBroker({resolveAuthenticatedOwner, createHandoffRuntime} = {}) {
  if (typeof resolveAuthenticatedOwner !== 'function' || typeof createHandoffRuntime !== 'function')
    fail('JEBISEO_BROKER_ORIGINAL_HOST_REQUIRED');
  const entries = new Map(), commands = new Map();
  function current() {
    const owner = resolveAuthenticatedOwner();
    if (!plain(owner) || typeof owner.deviceId !== 'string' || !owner.deviceId ||
        !/^[a-f0-9]{32}$/.test(owner.commandId ?? '') || typeof owner.secureSessionId !== 'string' || !owner.secureSessionId ||
        !/^[a-f0-9]{64}$/.test(owner.runtimeId ?? '') || !/^[a-f0-9]{64}$/.test(owner.deviceDigest ?? ''))
      fail('JEBISEO_BROKER_ORIGINAL_OWNER_REQUIRED');
    return owner;
  }
  function ensureOwner(entry) {
    if (!isDeepStrictEqual(current(), entry.owner)) fail('JEBISEO_BROKER_OWNER_CHANGED');
  }
  function present(entry, state = entry.session.view()) {
    // Prepared prompt is returned only before START. Repeated PREPARE never
    // resets a retained UNKNOWN/pending/completed session or suggests resending.
    if (!entry.started) return Object.freeze({schema: 'jh.jebiseo-auto3-broker.v1',
      ok: true, active: true, status: 'PREPARED', code: 'JEBISEO_NATIVE_HANDOFF_PREPARED',
      brokerRef: entry.ref, ...Object.fromEntries(SCOPE_KEYS.map(key => [key, entry.prepared[key]])),
      preparedPrompt: entry.prepared.prompt, nextAction: 'DISPLAY_REQUEST_TEXT',
      nextTool: 'life_android_step', nextArguments: Object.freeze(argumentsFor(entry, 'START')),
      layout: 'LEFT_GPT_RIGHT_GEMINI', toolInvoked: false, phoneActionDispatched: false,
      requestSent: false, resultVerified: false, businessResultVerified: false,
      automaticReplay: false, automaticResume: false, displayVerified: false});
    const status = plain(state) ? state : {};
    const result = {...status, schema: 'jh.jebiseo-auto3-broker.v1', brokerRef: entry.ref,
      ...Object.fromEntries(SCOPE_KEYS.map(key => [key, entry.prepared[key]])),
      resultVerified: false, businessResultVerified: false, automaticReplay: false, automaticResume: false};
    delete result.preparedPrompt; delete result.prompt;
    if (status.canResume === true) {
      result.nextTool = 'life_android_step';
      result.nextArguments = Object.freeze(argumentsFor(entry, 'RESUME'));
    }
    return Object.freeze(result);
  }
  async function handle(args) {
    const value = readJebiseoNativeBrokerCarrier(args), owner = current();
    if (value.mode === 'PREPARE') {
      const prepared = prepareJebiseoHandoff(value.request);
      if (prepared.active !== true) return prepared;
      const key = JSON.stringify([owner.runtimeId, owner.deviceId, owner.commandId]);
      const old = commands.get(key);
      if (old) {
        const entry = entries.get(old);
        if (!entry || !isDeepStrictEqual(entry.owner, owner) ||
            SCOPE_KEYS.some(field => entry.prepared[field] !== prepared[field]))
          fail('JEBISEO_BROKER_CURRENT_REQUEST_ALREADY_BOUND');
        return present(entry);
      }
      if (entries.size >= 256) fail('JEBISEO_BROKER_CAPACITY');
      const request = structuredClone(value.request);
      const session = createHandoffRuntime({request, deviceId: owner.deviceId,
        commandId: owner.commandId, deliveryMode: 'AUTO_TEXT_SELECTION'});
      if (!session || ['start', 'resumeAutomation', 'view'].some(name => typeof session[name] !== 'function'))
        fail('JEBISEO_BROKER_ORIGINAL_SESSION_REQUIRED');
      const entry = {ref: 'jhb_' + randomBytes(24).toString('hex'), owner: freeze(owner),
        prepared, session, started: false};
      ensureOwner(entry);
      entries.set(entry.ref, entry); commands.set(key, entry.ref);
      return present(entry);
    }
    const entry = entries.get(value.brokerRef);
    if (!entry) fail('JEBISEO_BROKER_PREPARED_SESSION_REQUIRED');
    ensureOwner(entry);
    if (SCOPE_KEYS.some(key => value[key] !== entry.prepared[key])) fail('JEBISEO_BROKER_REQUEST_SCOPE_CHANGED');
    if (value.mode === 'RESUME' && !entry.started) fail('JEBISEO_BROKER_START_REQUIRED');
    if (value.mode === 'START') entry.started = true;
    const state = await (value.mode === 'START' ? entry.session.start() : entry.session.resumeAutomation());
    ensureOwner(entry);
    return present(entry, state);
  }
  return Object.freeze({handle});
}
