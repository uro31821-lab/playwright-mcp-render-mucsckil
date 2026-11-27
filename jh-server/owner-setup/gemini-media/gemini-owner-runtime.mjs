/** Additive adapter around the unchanged reviewed Life installer.
 * Owner/storage/clock checks and the original authenticator remain authoritative.
 * Media is installed only after those checks and the original slot installation.
 */
import {installConfiguredLifeRuntime} from '../deployment/life-runtime-install.mjs';

const mediaRequested = env => env?.JH_GEMINI_ANALYSIS_ENABLED === '1' || env?.JH_GEMINI_GENERATION_ENABLED === '1';
const slotError = () => Object.assign(new Error('GEMINI_RUNTIME_SLOT_REQUIRED'), {code: 'GEMINI_RUNTIME_SLOT_REQUIRED'});
const objectLike = value => value !== null && ['object', 'function'].includes(typeof value);

/** Retain the original option keys/descriptors and let the original installer
 * reject missing/non-function open, extra keys, disabled state and invalid flags.
 * Frozen options and an inherited open method are supported without mutation. */
function captureOpen(options, capture) {
  if (!objectLike(options)) return options;
  const descriptors = Object.getOwnPropertyDescriptors(options);
  descriptors.open = {
    enumerable: descriptors.open?.enumerable ?? false,
    configurable: false,
    get() {
      const open = Reflect.get(options, 'open', options);
      if (typeof open !== 'function') return open;
      return async binding => {
        const resources = await Reflect.apply(open, options, [binding]);
        capture(resources);
        return resources;
      };
    }
  };
  return Object.create(Object.getPrototypeOf(options), descriptors);
}

export async function installConfiguredLifeRuntimeWithGemini(runtime, config, options, {env = process.env} = {}) {
  if (!mediaRequested(env) || !objectLike(runtime)) return installConfiguredLifeRuntime(runtime, config, options);

  let resources, mediaAttempted = false;
  let initialization = Promise.resolve({ok: true});

  // The facade forwards the two original installer capabilities with the
  // original receiver; it does not mutate a frozen ESM runtime namespace.
  const adapter = {
    get httpServer() { return Reflect.get(runtime, 'httpServer', runtime); },
    get installLifeContinuationHandler56() {
      const install = Reflect.get(runtime, 'installLifeContinuationHandler56', runtime);
      if (typeof install !== 'function') return install;
      return handler => {
        const slot = Reflect.apply(install, runtime, [handler]);
        if (!slot || typeof slot.quiesce !== 'function' || typeof slot.drain !== 'function') return slot;

        // The original installer has already validated resources, owner,
        // server, private DB path, existing schemas and clock at this point.
        try {
          const installMedia = runtime.installGeminiMediaStore56;
          if (typeof installMedia !== 'function' || typeof runtime.closeGeminiMedia56 !== 'function') throw slotError();
          mediaAttempted = true;
          const result = Reflect.apply(installMedia, runtime, [{
            store: resources.store, ownerDigest: config.accountDigest, clock: resources.clock ?? Date.now
          }]);
          // Consume a rejection immediately; the outer wrapper propagates it
          // after the original installer has acquired its cleanup handle.
          initialization = Promise.resolve(result).then(() => ({ok: true}), error => ({ok: false, error}));
        } catch (error) {
          initialization = Promise.resolve({ok: false, error});
        }

        let drainPromise;
        return Object.freeze({
          quiesce(...args) { return Reflect.apply(slot.quiesce, slot, args); },
          drain() {
            if (!drainPromise) drainPromise = (async () => {
              let failed = false, failure;
              try { await Reflect.apply(slot.drain, slot, []); }
              catch (error) { failed = true; failure = error; }
              try {
                await initialization;
                if (mediaAttempted) await Reflect.apply(runtime.closeGeminiMedia56, runtime, []);
              } catch (error) { if (!failed) { failed = true; failure = error; } }
              if (failed) throw failure;
            })();
            return drainPromise;
          }
        });
      };
    }
  };

  const installed = await installConfiguredLifeRuntime(adapter, config, captureOpen(options, value => { resources = value; }));
  const result = await initialization;
  if (!result.ok) {
    // This invokes the wrapped slot drain BEFORE the original installer closes
    // the store/key and original authority resources. Preserve the install error.
    try { await installed.close(); } catch {}
    throw result.error;
  }
  return installed;
}
