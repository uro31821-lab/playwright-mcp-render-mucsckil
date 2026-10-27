// The owner and MCP attach to this one persistent Chromium context.
import { chromium } from 'playwright';
import { mkdir, chmod, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { startupFailureCode } from './render-owner-startup-diagnostics.mjs';

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
  await chmod(profile, 0o700);
  return chromium.launchPersistentContext(profile, {
    // The pinned Playwright MCP image contains full Chromium, not headless-shell.
    // Use its installed new-headless channel. Explicit executablePath stays
    // available only for isolated verified test runners.
    ...(executablePath ? { executablePath } : { channel: 'chromium' }),
    headless: true, viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`, '--disable-save-password-bubble'],
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let context;
  try {
    const port = 9222;
    context = await launchOwnerBrowser({ profile: '/var/data/jh-browser-profile', port });
    const child = spawn(process.execPath, [new URL('./render-auth-proxy.mjs', import.meta.url).pathname,
      process.execPath, '/app/cli.js', '--cdp-endpoint', `http://127.0.0.1:${port}`,
      '--shared-browser-context', '--host', '127.0.0.1', '--port', process.env.UPSTREAM_PORT,
      '--allowed-hosts', process.env.PLAYWRIGHT_MCP_ALLOWED_HOSTS || process.env.RENDER_EXTERNAL_HOSTNAME],
    { stdio: 'inherit', env: { ...process.env, JH_OWNER_CDP_URL: `http://127.0.0.1:${port}` } });
    let stopping = false;
    const stop = async signal => {
      if (stopping) return;
      stopping = true;
      child.kill(signal);
      await context.close();
    };
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void stop(signal));
    child.on('error', () => { void stop('SIGTERM'); process.exitCode = 1; });
    child.on('exit', async code => { await context.close(); process.exitCode = code ?? 1; });
  } catch (error) {
    console.error('[owner] Persistent browser startup failed: ' + startupFailureCode(error));
    await context?.close();
    process.exitCode = 1;
  }
}

