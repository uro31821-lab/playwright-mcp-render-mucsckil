// Private, bounded video handoff. The MCP bearer gate issues capabilities;
// phone browsers receive only a task's upload/read capability, never MCP_TOKEN.
import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, rm, lstat, open } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const ID = /^[a-f0-9]{32}$/;
const MAX_BYTES = 64 * 1024 * 1024;
const UPLOAD_TTL = 2 * 60 * 60 * 1000;
const RESULT_TTL = 24 * 60 * 60 * 1000;
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
const fail = code => { throw Error(code); };
const json = (res, status, body) => { res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

// Only stdin's pipe protocol is permitted. Uploaded bytes cannot ask ffprobe
// to open local files, playlists or remote URLs. The process has a hard deadline.
export async function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-protocol_whitelist', 'pipe',
      '-format_whitelist', 'mov,matroska,webm', '-show_streams', '-show_format', '-of', 'json', '-i', 'pipe:0'],
    { stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => finish(Error('VIDEO_VALIDATION_TIMEOUT')), 15000);
    child.on('error', () => finish(Error('VIDEO_VALIDATOR_UNAVAILABLE')));
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 262144) finish(Error('VIDEO_INVALID')); });
    child.on('close', code => {
      if (code !== 0) return finish(Error('VIDEO_INVALID'));
      try {
        const p = JSON.parse(output), v = p.streams?.find(s => s.codec_type === 'video');
        const seconds = Number(p.format?.duration ?? v?.duration);
        if (!v || !(v.width > 0 && v.height > 0) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 600) fail('VIDEO_INVALID');
        finish(null, { durationSeconds: seconds, width: v.width, height: v.height });
      } catch { finish(Error('VIDEO_INVALID')); }
    });
    pipeline(createReadStream(file), child.stdin).catch(() => { /* ffprobe may close stdin after reading metadata. */ });
  });
}

export async function createVideoTransfer({ origin, root, secret, clock = Date.now, probe = probeVideo,
  maxBytes = MAX_BYTES, maxTransfers = 4 }) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://') || !root || !secret) fail('VIDEO_CONFIG_INVALID');
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) fail('VIDEO_ROOT_INVALID');
  const records = new Map(), active = new Set();
  let creation = Promise.resolve();
  const file = (id, suffix) => path.join(root, `${id}.${suffix}`);
  const persist = async record => {
    await writeFile(file(record.id, 'json.tmp'), JSON.stringify(record), { mode: 0o600 });
    await rename(file(record.id, 'json.tmp'), file(record.id, 'json'));
  };
  const sign = (id, purpose, expires) => createHmac('sha256', secret).update(`jh-video-v1:${id}:${purpose}:${expires}`).digest('base64url');
  const cap = (r, purpose) => {
    const expires = purpose === 'upload' ? r.uploadExpiresAt : r.expiresAt;
    return `${r.id}.${expires}.${sign(r.id, purpose, expires)}`;
  };
  const authorize = (value, purpose) => {
    const match = /^([a-f0-9]{32})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value ?? '');
    if (!match) fail('VIDEO_LINK_INVALID');
    const [, id, expiry, mac] = match, r = records.get(id);
    const expected = sign(id, purpose, expiry);
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) || !r || clock() >= Number(expiry) ||
        Number(expiry) !== (purpose === 'upload' ? r.uploadExpiresAt : r.expiresAt)) fail('VIDEO_LINK_EXPIRED');
    return r;
  };
  const clean = async () => {
    for (const [id, r] of records) {
      if (!active.has(id) && clock() >= (r.state === 'READY' ? r.expiresAt : r.uploadExpiresAt)) {
        records.delete(id);
        await Promise.all(['json', 'json.tmp', 'part', 'mp4', 'webm'].map(s => rm(file(id, s), { force: true })));
      }
    }
  };
  for (const name of await readdir(root)) {
    if (!/^[a-f0-9]{32}\.json$/.test(name)) continue;
    const id = name.slice(0, 32);
    try {
      if ((await lstat(file(id, 'json'))).isSymbolicLink()) continue;
      const r = JSON.parse(await readFile(file(id, 'json'), 'utf8'));
      if (r.id !== id || !ID.test(r.taskId) || !['WAITING', 'READY'].includes(r.state) ||
          !Number.isFinite(r.uploadExpiresAt) || !Number.isFinite(r.expiresAt)) continue;
      if (r.state === 'READY') {
        if (!['mp4', 'webm'].includes(r.extension) || !/^[a-f0-9]{64}$/.test(r.sha256)) continue;
        const stat = await lstat(file(id, r.extension));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== r.bytes || stat.size > maxBytes) continue;
      } else {
        // A crash before metadata commit never makes an unvalidated file visible.
        await Promise.all(['part', 'mp4', 'webm'].map(s => rm(file(id, s), { force: true })));
      }
      records.set(id, r);
    } catch { /* Corrupt records are never served. */ }
  }
  await clean();
  const cleanupTimer = setInterval(() => { void clean().catch(() => {}); }, 60000);
  cleanupTimer.unref();
  const status = r => ({ transferId: r.id, taskId: r.taskId,
    state: active.has(r.id) ? 'UPLOADING' : r.state, maxBytes,
    uploadExpiresAt: r.uploadExpiresAt, expiresAt: r.expiresAt,
    ...(r.state === 'READY' ? { bytes: r.bytes, sha256: r.sha256, mime: r.mime,
      durationSeconds: r.durationSeconds,
      playbackUrl: `${origin}/video-transfer/file/${cap(r, 'read')}/video.${r.extension}`,
      downloadUrl: `${origin}/video-transfer/file/${cap(r, 'read')}/video.${r.extension}?download=1` } : {}) });
  const links = r => ({ ...status(r),
    uploadUrl: `${origin}/video-transfer/?view=${r.id}#upload=${cap(r, 'upload')}`,
    resultUrl: `${origin}/video-transfer/?view=${r.id}#result=${cap(r, 'read')}` });
  const service = {
    close: () => clearInterval(cleanupTimer),
    // Called only after the existing MCP bearer gate. Idempotent for this task.
    create(taskId) {
      const run = creation.then(async () => {
        if (!ID.test(taskId ?? '')) fail('VIDEO_TASK_REQUIRED');
        await clean();
        const existing = [...records.values()].find(r => r.taskId === taskId);
        if (existing) return links(existing);
        if (records.size >= maxTransfers) fail('VIDEO_CAPACITY_REACHED');
        const r = { id: randomBytes(16).toString('hex'), taskId, state: 'WAITING',
          uploadExpiresAt: clock() + UPLOAD_TTL, expiresAt: clock() + RESULT_TTL };
        await persist(r); records.set(r.id, r); return links(r);
      });
      creation = run.catch(() => {}); return run;
    },
    lookup(taskId, transferId) {
      const r = records.get(transferId);
      if (!ID.test(taskId ?? '') || !r || r.taskId !== taskId ||
          clock() >= (r.state === 'READY' ? r.expiresAt : r.uploadExpiresAt)) fail('VIDEO_RESULT_NOT_FOUND');
      return links(r);
    },
    async handle(req, res) {
      if (!req.url?.startsWith('/video-transfer/')) return false;
      const url = new URL(req.url, origin);
      const assets = { '/video-transfer/': ['render-video-view.html', 'text/html; charset=utf-8'],
        '/video-transfer/view.js': ['render-video-view.js', 'text/javascript'],
        '/video-transfer/view.css': ['render-video-view.css', 'text/css'] };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [asset, mime] = assets[url.pathname];
        res.writeHead(200, { ...HEADERS, 'Content-Type': mime,
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
        res.end(await readFile(new URL(asset, import.meta.url))); return true;
      }
      try {
        if (url.pathname === '/video-transfer/status' && req.method === 'GET') {
          const purpose = req.headers['x-video-purpose'];
          if (!['upload', 'read'].includes(purpose)) fail('VIDEO_LINK_INVALID');
          json(res, 200, status(authorize(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1], purpose)));
        } else if (url.pathname === '/video-transfer/upload' && req.method === 'PUT') {
          if (req.headers.origin !== origin) fail('VIDEO_ORIGIN_INVALID');
          const r = authorize(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1], 'upload');
          if (r.state === 'READY') { req.resume(); json(res, 200, status(r)); return true; }
          if (active.has(r.id)) fail('VIDEO_UPLOAD_IN_PROGRESS');
          const size = Number(req.headers['content-length']);
          if (!Number.isSafeInteger(size) || size <= 12 || size > maxBytes) fail('VIDEO_SIZE_INVALID');
          if (!['video/mp4', 'video/webm'].includes(req.headers['content-type'])) fail('VIDEO_TYPE_INVALID');
          active.add(r.id);
          let fd, bytes = 0, head = Buffer.alloc(0), renamed;
          const h = createHash('sha256');
          const timer = setTimeout(() => req.destroy(), 180000);
          try {
            fd = await open(file(r.id, 'part'), 'wx', 0o600);
            for await (const chunk of req) {
              bytes += chunk.length;
              if (bytes > maxBytes || bytes > size || clock() >= r.uploadExpiresAt) fail('VIDEO_SIZE_INVALID');
              if (head.length < 12) head = Buffer.concat([head, chunk.subarray(0, 12 - head.length)]);
              h.update(chunk); await fd.writeFile(chunk);
            }
            await fd.sync(); await fd.close(); fd = null;
            if (bytes !== size) fail('VIDEO_INCOMPLETE');
            const extension = head.toString('ascii', 4, 8) === 'ftyp' ? 'mp4'
              : head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'webm' : null;
            if (!extension || req.headers['content-type'] !== `video/${extension}`) fail('VIDEO_TYPE_INVALID');
            const metadata = await probe(file(r.id, 'part'));
            authorize(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1], 'upload');
            const next = { ...r, ...metadata, state: 'READY', bytes, extension,
              mime: `video/${extension}`, sha256: h.digest('hex') };
            renamed = file(r.id, extension);
            await rename(file(r.id, 'part'), renamed); await persist(next);
            records.set(r.id, next); renamed = null; active.delete(r.id); json(res, 200, status(next));
          } finally {
            clearTimeout(timer); await fd?.close(); active.delete(r.id);
            await rm(file(r.id, 'part'), { force: true });
            if (renamed) await rm(renamed, { force: true });
          }
        } else if (url.pathname.startsWith('/video-transfer/file/') && ['GET', 'HEAD'].includes(req.method)) {
          const match = /^\/video-transfer\/file\/([^/]+)\/video\.(mp4|webm)$/.exec(url.pathname);
          if (!match) fail('VIDEO_LINK_INVALID');
          const r = authorize(match[1], 'read');
          if (r.state !== 'READY' || r.extension !== match[2]) fail('VIDEO_NOT_READY');
          let start = 0, end = r.bytes - 1, partial = false;
          if (req.headers.range) {
            const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
            if (!range || (!range[1] && !range[2])) { res.writeHead(416, { ...HEADERS, 'Content-Range': `bytes */${r.bytes}` }); res.end(); return true; }
            start = range[1] ? Number(range[1]) : Math.max(0, r.bytes - Number(range[2]));
            end = range[1] && range[2] ? Math.min(Number(range[2]), r.bytes - 1) : r.bytes - 1;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= r.bytes) {
              res.writeHead(416, { ...HEADERS, 'Content-Range': `bytes */${r.bytes}` }); res.end(); return true;
            }
            partial = true;
          }
          const fd = await open(file(r.id, r.extension), constants.O_RDONLY | constants.O_NOFOLLOW);
          const stat = await fd.stat();
          if (!stat.isFile() || stat.size !== r.bytes) { await fd.close(); fail('VIDEO_FILE_UNAVAILABLE'); }
          res.writeHead(partial ? 206 : 200, { ...HEADERS, 'Content-Type': r.mime,
            'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
            'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="gemini-video.${r.extension}"`,
            ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${r.bytes}` } : {}) });
          if (req.method === 'HEAD') { await fd.close(); res.end(); }
          else await pipeline(fd.createReadStream({ start, end }), res);
        } else { req.resume(); json(res, 404, { code: 'VIDEO_ROUTE_NOT_FOUND' }); }
      } catch (error) {
        req.resume();
        if (!res.headersSent && !res.destroyed) json(res, 400, {
          code: /^VIDEO_[A-Z_]+$/.test(error.message) ? error.message : 'VIDEO_TRANSFER_FAILED' });
        else if (!res.destroyed) res.destroy();
      }
      return true;
    },
  };
  return service;
}

export const VIDEO_TOOLS = [
  { name: 'browser_video_transfer_create', description: 'Create a private upload link for one existing phone video and a result link. Does not generate a video or upload without user file selection. Reuse task_id for retries. Links expire; return only to the requesting user.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string', pattern: '^[a-f0-9]{32}$' } }, required: ['task_id'], additionalProperties: false } },
  { name: 'browser_video_transfer_status', description: 'Read this task’s video transfer. READY includes playbackUrl for immediate browser viewing and a separate downloadUrl, actual bytes, digest and duration. Prefer playbackUrl in ChatGPT replies. WAITING is not a completed transfer.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, transfer_id: { type: 'string' } }, required: ['task_id', 'transfer_id'], additionalProperties: false } },
];
