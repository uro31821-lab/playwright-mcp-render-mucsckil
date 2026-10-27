// The owner and MCP attach to this one persistent Chromium context.
import { chromium } from 'playwright';
import { mkdir, chmod, readFile, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { startupFailureCode } from './render-owner-startup-diagnostics.mjs';
import { acquireProfileLease } from './render-owner-profile.mjs';
import { archiveStaleChromiumSingletons } from './render-owner-profile-lock.mjs';

export async function requirePersistentMount(profile, mountInfo = '/proc/self/mountinfo') {
  if (profile !== '/var/data/jh-browser-profile') throw Error('OWNER_PROFILE_PATH_INVALID');
  const mounts = await readFile(mountInfo, 'utf8');
  if (!mounts.split('\n').some(line => line.split(' ')[4] === '/var/data'))
    throw Error('OWNER_PERSISTENT_DISK_REQUIRED');
}

export async function launchOwnerBrowser({ profile, port, persistent = true, executablePath }) {
  if (persistent) await requirePersistentMount(profile);
  if (!path.isAbsolute(profile) || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('OWNER_BROWSER_CONFIG_INVALID');
  await mkdir(profile, { recursive: true, mode: 0o700 });
  if (await realpath(profile) !== profile) throw Error('OWNER_PROFILE_UNSAFE');
  await chmod(profile, 0o700);
  const lease = await acquireProfileLease(profile);
  let context;
  try {
    const recovery = await archiveStaleChromiumSingletons(profile, {
      lease,
      exclusiveHostMount: persistent && process.env.RENDER === 'true' && /^srv-[a-z0-9]+$/.test(process.env.RENDER_SERVICE_ID || ''),
    });
    if (recovery.archived) console.info('[owner] ' + recovery.code);
    else if (recovery.code !== 'OWNER_SINGLETON_NO_LOCK') throw Error(recovery.code);
    lease.assertHeld();
    context = await chromium.launchPersistentContext(profile, {
    // The pinned Playwright MCP image contains full Chromium, not headless-shell.
    // Use its installed new-headless channel. Explicit executablePath stays
    // available only for isolated verified test runners.
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    // Our supervisor owns shutdown. Playwright's default signal handler plus
    // context.close() calls graceful close twice; its second call force-kills
    // Chromium and can leave the profile singleton behind.
    handleSIGTERM: false, handleSIGINT: false, handleSIGHUP: false,
    headless: true, timeout: 20000, viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`, '--disable-save-password-bubble'],
    });
    lease.assertHeld();
    const close = context.close.bind(context);
    context.close = async (...args) => { try { return await close(...args); } finally { await lease.release(); } };
    context.once('close', () => { void lease.release(); });
    lease.onLost(() => { console.error('[owner] OWNER_PROFILE_LEASE_LOST'); void context.close(); });
    return context;
  } catch (error) { await context?.close(); await lease.release(); throw error; }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let context, child, stopping = false, closing;
  const stop = signal => {
    stopping = true;
    child?.kill(signal);
    if (context) closing ||= context.close();
    return closing;
  };
  // Register BEFORE launch; shutdown during startup must still close Chromium.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { void stop(signal); });
  try {
    const port = 9222;
    context = await launchOwnerBrowser({ profile: '/var/data/jh-browser-profile', port });
    if (stopping) { await stop('SIGTERM'); } else {
    child = spawn(process.execPath, [new URL('./render-auth-proxy.mjs', import.meta.url).pathname,
      process.execPath, '/app/cli.js', '--cdp-endpoint', `http://127.0.0.1:${port}`,
      '--shared-browser-context', '--host', '127.0.0.1', '--port', process.env.UPSTREAM_PORT,
      '--allowed-hosts', process.env.PLAYWRIGHT_MCP_ALLOWED_HOSTS || process.env.RENDER_EXTERNAL_HOSTNAME],
    { stdio: 'inherit', env: { ...process.env, JH_OWNER_CDP_URL: `http://127.0.0.1:${port}` } });
    child.on('error', () => { void stop('SIGTERM'); process.exitCode = 1; });
    child.on('exit', async code => { const requested = stopping; await stop('SIGTERM'); process.exitCode = requested ? 0 : code ?? 1; });
    }
  } catch (error) {
    console.error('[owner] Persistent browser startup failed: ' + startupFailureCode(error));
    await context?.close();
    process.exitCode = 1;
  }
}

