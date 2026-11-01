/** Source-only, reversible activation of the narrow mobile13 host policy.
 * The caller must select PHONE_RIGHT before invoking this patch. It changes no
 * OAuth, HMAC, nonce, command, phone approval, or completion handling code.
 */
import {createHash} from 'node:crypto';
import {MOBILE13_ACTION_POLICY_MODE56} from './mobile13-action-policy.mjs';

const INSTALL = 'export function installDurableNativeCircuit56(options){\n';
const GUARD = ' if(durableNativeHooks56||httpServer.listening||jobs.size||devices.size)throw Error("DURABLE_INSTALL_BEFORE_LISTEN_ONLY");\n';
const ORIGINAL = ' durableNativeHooks56=createDurableNativeHooks(options);';
const ENABLED = ' durableNativeHooks56=createDurableNativeHooks({...options,mobile13ActionMode:' +
  JSON.stringify(MOBILE13_ACTION_POLICY_MODE56) + '});';
const PRESERVED = [
  'if(durableNativeHooks56)durableNativeHooks56.capture(j,p);',
  'durableNativeHooks56?.beforeDispatch(next)',
  'durableNativeHooks56?.acceptedCompletion(j,body.result)',
  '!eqHex56(mac,hmac56(a.secret,"complete|"+sid+"|"+j.id+"|"+dev+"|"+nonce+"|"+exp+"|"+rd))||!seen56(a.seenComplete,nonce)',
  'commandId:jhRequireCommand56(targetDeviceId,p.workflowId)'
];
const count = (source, value) => source.split(value).length - 1;
const sha = (source) => createHash('sha256').update(source).digest('hex');

function runtimeGuard(source, enabled) {
  const call = enabled ? ENABLED : ORIGINAL;
  if (typeof source !== 'string' || count(source, INSTALL + GUARD + call) !== 1 ||
      count(source, call) !== 1 || count(source, 'mobile13ActionMode') !== (enabled ? 1 : 0) ||
      PRESERVED.some((part) => !source.includes(part)))
    throw Error('MOBILE13_ACTION_POLICY_RUNTIME_ANCHOR_CHANGED');
}

export function patchJH168Mobile13ActionPolicy56(source) {
  runtimeGuard(source, false);
  const patched = source.replace(ORIGINAL, ENABLED);
  if (reverseJH168Mobile13ActionPolicy56(patched) !== source)
    throw Error('MOBILE13_ACTION_POLICY_NOT_REVERSIBLE');
  return patched;
}

export function reverseJH168Mobile13ActionPolicy56(source) {
  runtimeGuard(source, true);
  const original = source.replace(ENABLED, ORIGINAL);
  runtimeGuard(original, false);
  return original;
}

// The only three reviewed changes to the shared host. These source transforms
// are for exact review/CI reversal; importing or calling the runtime patch never
// edits a host file. Any unrelated host delta makes reversal fail closed.
export const MOBILE13_ACTION_HOST_BASE_SHA256 = 'c63a14aeb66e43de45ad4f245a54a6f46a71d0f0ee4d3ca6d1241992fbef0c36';
const HOST_EDITS = Object.freeze([
  Object.freeze([
    "import {durableNativeJobPolicy} from './durable-native-job-policy.mjs';\n",
    "import {durableNativeJobPolicy} from './durable-native-job-policy.mjs';\n" +
      "import {MOBILE13_ACTION_POLICY_MODE56,mobile13DurableJobPolicy} from '../jh168-mobile-unification/mobile13-action-policy.mjs';\n"
  ]),
  Object.freeze([
    "export function createDurableNativeHooks({file,key,namespace,mode='read'}={}){\n",
    "export function createDurableNativeHooks({file,key,namespace,mode='read',mobile13ActionMode}={}){\n" +
      " if(mobile13ActionMode!==undefined&&mobile13ActionMode!==MOBILE13_ACTION_POLICY_MODE56)throw Error('DURABLE_MOBILE13_ACTION_MODE_INVALID');\n"
  ]),
  Object.freeze([
    '  capture(job,payload){policies.set(job,durableNativeJobPolicy(job,payload));},\n',
    '  capture(job,payload){policies.set(job,mobile13ActionMode===MOBILE13_ACTION_POLICY_MODE56?mobile13DurableJobPolicy(job,payload):durableNativeJobPolicy(job,payload));},\n'
  ])
]);

export function patchJH168Mobile13ActionPolicyHost56(source) {
  if (typeof source !== 'string' || sha(source) !== MOBILE13_ACTION_HOST_BASE_SHA256)
    throw Error('MOBILE13_ACTION_POLICY_HOST_BASE_CHANGED');
  let patched = source;
  for (const [before, after] of HOST_EDITS) {
    if (count(patched, before) !== 1) throw Error('MOBILE13_ACTION_POLICY_HOST_ANCHOR_CHANGED');
    patched = patched.replace(before, after);
  }
  return patched;
}

export function reverseJH168Mobile13ActionPolicyHost56(source) {
  if (typeof source !== 'string') throw Error('MOBILE13_ACTION_POLICY_HOST_REVERSE_INVALID');
  let original = source;
  for (const [before, after] of [...HOST_EDITS].reverse()) {
    if (count(original, after) !== 1) throw Error('MOBILE13_ACTION_POLICY_HOST_REVERSE_CHANGED');
    original = original.replace(after, before);
  }
  if (sha(original) !== MOBILE13_ACTION_HOST_BASE_SHA256)
    throw Error('MOBILE13_ACTION_POLICY_HOST_BASE_CHANGED');
  return original;
}
