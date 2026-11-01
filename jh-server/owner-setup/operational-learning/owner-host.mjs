/** Bind operational memory to the already validated personal-server owner.
 * No OAuth claim, client argument, or conversation name selects the store.
 * Installation happens after owner/trust validation and before the listener.
 */
import path from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertConfig } from '../deployment/owner-config.mjs';
import { createServerLearning } from './server-runtime.mjs';

const CONTEXT = Object.freeze({
  platform: 'jh-mcp', version: 'server-learning-v1', environment: 'owner-service',
});

function unavailable() {
  return Object.freeze({
    invoke: (_call, handler) => handler(),
    jobCreated() {}, jobCompleted() {}, close() {},
    status: () => ({ enabled: false, degraded: true, stateAvailable: false,
      diagnostics: { codes: ['LEARNING_STORAGE_UNAVAILABLE'] },
      observationScope: 'JH tool events only', librarySync: 'not_connected' }),
  });
}

export async function installOwnerLearning(runtime, { config, runtimeId = randomUUID() } = {}) {
  assertConfig(config);
  if (runtime?.httpServer?.listening !== false ||
      typeof runtime.installOperationalLearning56 !== 'function') {
    throw Error('LEARNING_OWNER_PRELISTEN_REQUIRED');
  }
  let controller;
  try {
    // checkOwnerStorage already authenticated this volume. Recheck its private
    // parent here so the learning store never creates a replacement owner root.
    const parent = lstatSync(config.stateDir);
    if (!parent.isDirectory() || parent.isSymbolicLink() ||
        realpathSync(config.stateDir) !== config.stateDir || (parent.mode & 0o077) !== 0 ||
        (typeof process.getuid === 'function' && parent.uid !== process.getuid())) {
      throw Error('LEARNING_PRIVATE_PARENT_REQUIRED');
    }
    controller = await createServerLearning({
      file: path.join(config.stateDir, 'operational-learning-v1.json'),
      ownerScope: 'jh-owner:' + config.accountDigest, runtimeId, context: CONTEXT,
      hostMemoryEnabled: process.env.JH_HOST_MEMORY_BRIDGE === 'EXPLICIT_OWNER_HOST_MEMORY_V1',
    });
  } catch {
    // A memory-volume problem is visible through life_status but cannot replay,
    // retry, or stop an otherwise authorized JH action.
    controller = unavailable();
  }
  let installation;
  try {
    installation = runtime.installOperationalLearning56(controller);
    if (installation?.installed !== true || typeof installation.close !== 'function') {
      throw Error('LEARNING_OWNER_INSTALL_CONTRACT');
    }
  } catch (error) {
    await controller.close();
    throw error;
  }
  let closing;
  return Object.freeze({
    installed: true, automaticReplayAllowed: false,
    status: () => controller.status(),
    close() {
      if (!closing) closing = (async () => {
        try { installation.close(); } finally { await controller.close(); }
      })();
      return closing;
    },
  });
}
