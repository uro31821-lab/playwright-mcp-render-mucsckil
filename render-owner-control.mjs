// Owner-only, short-lived access to the EXACT MCP-selected page. No credential logging.
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
// One-use URL transfer allowance: users may switch from desktop ChatGPT to phone.
// 256-bit random token, one active offer, no persistence or token logging.
export const OWNER_LINK_TTL_MS = 30 * 60 * 1000;
const fail = code => { throw Error(code); };
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
export async function readJSON(req) {
  const chunks = []; let size = 0;
  req.setTimeout?.(5000, () => req.destroy());
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) fail('REQUEST_TOO_LARGE');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally { req.setTimeout?.(0); }
}
export function parseRPC(body, id) {
  const candidates = body.trim().startsWith('{') ? [JSON.parse(body)] :
    body.split(/\r?\n\r?\n/).filter(s => /^data:/m.test(s)).map(s =>
      JSON.parse(s.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')));
  const replies = candidates.filter(x => x.id === id);
  if (replies.length !== 1 || replies[0].jsonrpc !== '2.0') fail('OWNER_RPC_BINDING_FAILED');
  return replies[0];
}
export function createOwnerControl({ origin, getPage, clock = Date.now }) {
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) fail('OWNER_ORIGIN_INVALID');
  let ticket = null, session = null, busy = false, frame = null, lastCommand = null, generation = 0;
  const expire = () => {
    if (ticket && clock() >= ticket.expires) ticket = null;
    if (session && clock() >= session.expires) { session = null; frame = null; generation++; }
  };
  const locked = () => { expire(); return !!session; };
  const enter = () => { if (busy) fail('OWNER_BUSY'); busy = true; };
  const leave = () => { busy = false; };
  const json = (res, status, body) => { res.writeHead(status, JSON_HEADERS); res.end(JSON.stringify(body)); };
  const authorize = req => {
    expire();
    if (req.headers.origin !== origin || !session ||
        hash(req.headers.authorization || '') !== session.auth) fail('OWNER_ACCESS_EXPIRED');
    return session;
  };
  const safePage = async s => {
    const page = await getPage(s.targetId);
    if (!page || page.isClosed() || !/^https?:\/\//.test(page.url())) fail('OWNER_PAGE_CLOSED');
    return page;
  };
  return {
    locked,
    // All upstream requests with a body are serialized with manual interactions.
    beginMCP(command, metadata = false, { preserveOffer = false } = {}) {
      expire();
      if (session && !metadata) fail('OWNER_CONTROL_ACTIVE');
      enter();
      if (metadata) return;
      // A new explicit work command or any page-capable MCP action revokes an
      // unclaimed link. Routine read-only browser_snapshot does not change the
      // selected target and must not discard the user's desktop-to-phone ticket.
      // Tickets still expire, remain single-use, and are superseded on offer().
      const newCommand = !!command && lastCommand !== null && command !== lastCommand;
      if (command) lastCommand = command;
      if (newCommand || !preserveOffer) ticket = null;
    },
    endMCP: leave,
    offer(targetId) {
      if (!/^[a-fA-F0-9]{32}$/.test(targetId) || session) fail('OWNER_TARGET_INVALID');
      const value = token();
      ticket = { digest: hash(value), targetId, expires: clock() + OWNER_LINK_TTL_MS };
      return `${origin}/owner/#${value}`;
    },
    async handle(req, res) {
      if (!req.url?.startsWith('/owner/')) return false;
      // ChatGPT can append a harmless source tag before the URL fragment.
      // Accept it ONLY on the static viewer GET; never as authentication.
      // The one-use owner ticket remains in #fragment and claim still requires POST.
      const viewerGet = req.method === 'GET' &&
        (req.url === '/owner/' || req.url === '/owner/?utm_source=chatgpt.com');
      if (viewerGet) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
        res.end(await readFile(new URL('./render-owner-view.html', import.meta.url))); return true;
      }
      const assets = { '/owner/view.js': ['render-owner-view.js', 'text/javascript'],
        '/owner/view.css': ['render-owner-view.css', 'text/css'] };
      if (assets[req.url] && req.method === 'GET') {
        const [name, type] = assets[req.url];
        res.writeHead(200, { ...JSON_HEADERS, 'Content-Type': type });
        res.end(await readFile(new URL(name, import.meta.url))); return true;
      }
      let entered = false;
      try {
        if (req.method !== 'POST' || req.headers.origin !== origin ||
            req.headers['content-type']?.split(';')[0] !== 'application/json') fail('OWNER_REQUEST_REFUSED');
        // Lock before reading the body. No MCP action may race the takeover.
        enter(); entered = true;
        const body = await readJSON(req);
        expire();
        if (req.url === '/owner/claim') {
          if (session || !ticket || typeof body.ticket !== 'string' ||
              hash(body.ticket) !== ticket.digest) fail('OWNER_LINK_EXPIRED');
          const pending = ticket; ticket = null;
          await safePage(pending);
          const secret = token();
          session = { auth: hash(`Bearer ${secret}`), targetId: pending.targetId,
            expires: clock() + 600000, generation: ++generation };
          json(res, 200, { secret, expiresAt: session.expires });
        } else {
          const current = authorize(req);
          if (req.url === '/owner/finish') {
            session = null; frame = null; generation++;
            json(res, 200, { state: 'RELEASED', loginVerified: false });
          } else if (req.url === '/owner/frame') {
            const page = await safePage(current);
            const bytes = await page.screenshot({ type: 'png', timeout: 5000 });
            if (clock() >= current.expires) fail('OWNER_ACCESS_EXPIRED');
            frame = { id: token(), page, url: page.url(), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
              expires: clock() + 10000, generation: current.generation };
            json(res, 200, { image: bytes.toString('base64'), frame: frame.id,
              width: frame.width, height: frame.height, site: new URL(page.url()).origin });
          } else if (req.url === '/owner/input') {
            if (!frame || frame.id !== body.frame || clock() >= frame.expires ||
                frame.generation !== current.generation) fail('OWNER_REFRESH_REQUIRED');
            const page = await safePage(current);
            if (page !== frame.page || page.url() !== frame.url) fail('OWNER_REFRESH_REQUIRED');
            const saved = frame; frame = null; // Each frame authorizes at most one action. Never retry input.
            if (body.type === 'click') {
              if (![body.x, body.y].every(Number.isFinite) || body.x < 0 || body.y < 0 ||
                  body.x >= saved.width || body.y >= saved.height) fail('OWNER_INPUT_INVALID');
              await page.mouse.click(body.x, body.y, { timeout: 5000 });
            } else if (body.type === 'text') {
              if (typeof body.text !== 'string' || body.text.length > 4096) fail('OWNER_INPUT_INVALID');
              await page.keyboard.insertText(body.text);
            } else if (body.type === 'key') {
              if (!['Enter', 'Tab', 'Shift+Tab', 'Backspace', 'Escape', 'ControlOrMeta+A',
                'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(body.key)) fail('OWNER_INPUT_INVALID');
              await page.keyboard.press(body.key);
            } else if (body.type === 'scroll') {
              if (![body.x, body.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1500)) fail('OWNER_INPUT_INVALID');
              await page.mouse.wheel(body.x, body.y);
            } else fail('OWNER_INPUT_INVALID');
            json(res, 200, { state: 'APPLIED' });
          } else fail('OWNER_REQUEST_REFUSED');
        }
      } catch (error) {
        const code = /^OWNER_[A-Z_]+$/.test(error.message) ? error.message : 'OWNER_REQUEST_FAILED';
        json(res, code === 'OWNER_BUSY' ? 409 : 403, { code });
      } finally { if (entered) leave(); }
      return true;
    },
  };
}
