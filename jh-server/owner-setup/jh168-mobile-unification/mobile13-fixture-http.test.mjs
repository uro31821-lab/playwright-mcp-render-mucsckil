import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOBILE13_FIXTURE_PREFIX as PREFIX, MOBILE13_FIXTURE_CSP as CSP,
  MOBILE13_FIXTURE_ASSETS as ASSETS, createMobile13FixtureHttpHandler,
  patchJH168Mobile13FixtureHttp56 as patch, reverseJH168Mobile13FixtureHttp56 as reverse
} from './mobile13-fixture-http.mjs';

const ASSET_DIRECTORY = fileURLToPath(new URL('./fixtures/mobile13/', import.meta.url));
const URL_LINE = '  const url=new URL(req.url||"/","http://localhost");\n';

function response() {
  return {
    writes: 0, ends: 0, status: undefined, headers: undefined, body: undefined,
    writeHead(status, headers) {
      this.writes += 1; this.status = status; this.headers = { ...headers }; return this;
    },
    end(body) {
      this.ends += 1; this.body = body === undefined ? undefined : Buffer.from(body); return this;
    }
  };
}

function invoke(handler, url, method = 'GET') {
  const res = response();
  const req = { url, method,
    get headers() { throw Error('fixture must not inspect credentials or cookies'); },
    get body() { throw Error('fixture must not inspect a request body'); }
  };
  return { handled: handler(req, res), res };
}

function secureHeaders(res) {
  assert.equal(res.headers['content-security-policy'], CSP);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.equal('set-cookie' in res.headers, false);
  assert.equal('location' in res.headers, false);
  assert.equal('access-control-allow-origin' in res.headers, false);
  assert.equal(res.writes, 1);
  assert.equal(res.ends, 1);
}

for (const asset of ASSETS) {
  test('fixed GET bytes and bodyless HEAD with identical headers: ' + asset.name, () => {
    const handler = createMobile13FixtureHttpHandler();
    const expected = readFileSync(join(ASSET_DIRECTORY, asset.name));
    const get = invoke(handler, PREFIX + asset.name);
    assert.equal(get.handled, true);
    assert.equal(get.res.status, 200);
    assert.deepEqual(get.res.body, expected);
    assert.equal(get.res.headers['content-type'], asset.type);
    assert.equal(get.res.headers['content-length'], String(expected.length));
    secureHeaders(get.res);
    const head = invoke(handler, PREFIX + asset.name, 'HEAD');
    assert.equal(head.handled, true);
    assert.equal(head.res.status, 200);
    assert.equal(head.res.body, undefined);
    assert.deepEqual(head.res.headers, get.res.headers);
    secureHeaders(head.res);
  });
}

test('query and request metadata do not change or reflect into the fixed response', () => {
  const handler = createMobile13FixtureHttpHandler();
  for (const asset of ASSETS) {
    const original = invoke(handler, PREFIX + asset.name).res;
    for (const suffix of ['?', '?via=new-tab', '?SECRET_SHOULD_NOT_APPEAR=<script>&next=/mcp?x=1']) {
      const queried = invoke(handler, PREFIX + asset.name + suffix).res;
      assert.deepEqual(queried.body, original.body);
      assert.deepEqual(queried.headers, original.headers);
      assert.equal(queried.body.includes(Buffer.from('SECRET_SHOULD_NOT_APPEAR')), false);
    }
  }
});

test('only exact raw allowlist paths are served; directory, traversal, encoding and other files are 404', () => {
  const handler = createMobile13FixtureHttpHandler();
  for (const suffix of [
    '', 'cases.json', 'README.md', 'smoke.cjs', 'unknown', 'INDEX.HTML', 'index.html/extra',
    './index.html', '../index.html', '../mcp', '%2e%2e/index.html', '%69ndex.html',
    'folder/../index.html', '\\index.html', '..\\index.html', 'index.html#fragment',
    '/index.html', 'index.html%00', 'index.html%3fvia=new-tab'
  ]) {
    for (const method of ['GET', 'HEAD']) {
      const { handled, res } = invoke(handler, PREFIX + suffix, method);
      assert.equal(handled, true, suffix);
      assert.equal(res.status, 404, suffix);
      assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8');
      assert.equal(res.headers['content-length'], String(Buffer.byteLength('Not Found\n')));
      assert.deepEqual(res.body, method === 'HEAD' ? undefined : Buffer.from('Not Found\n'));
      secureHeaders(res);
    }
  }
  assert.equal(invoke(handler, PREFIX.slice(0, -1)).res.status, 404);
});

test('unsupported methods cannot serve assets or inspect bodies and return Allow', () => {
  const handler = createMobile13FixtureHttpHandler();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT', 'get', '']) {
    for (const suffix of ['index.html', 'unknown']) {
      const { handled, res } = invoke(handler, PREFIX + suffix, method);
      assert.equal(handled, true);
      assert.equal(res.status, 405);
      assert.equal(res.headers.allow, 'GET, HEAD');
      assert.deepEqual(res.body, Buffer.from('Method Not Allowed\n'));
      secureHeaders(res);
    }
  }
});

test('non-fixture routes receive no writes, response changes, or credential access', () => {
  const handler = createMobile13FixtureHttpHandler();
  for (const url of ['/', '/health', '/mcp', '/device/trusted/read', '/jh/life/read',
    '/__jh_mobile13_fixture/v2/index.html', '/__jh_mobile13_fixture/v1other/index.html',
    'https://example.invalid' + PREFIX + 'index.html', undefined]) {
    const { handled, res } = invoke(handler, url, 'POST');
    assert.equal(handled, false);
    assert.equal(res.writes, 0);
    assert.equal(res.ends, 0);
    assert.equal(res.status, undefined);
    assert.equal(res.headers, undefined);
    assert.equal(res.body, undefined);
  }
});

test('tampered or missing assets fail closed at build time; handlers keep reviewed in-memory bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jh-mobile13-assets-'));
  try {
    for (const asset of ASSETS) copyFileSync(join(ASSET_DIRECTORY, asset.name), join(directory, asset.name));
    const handler = createMobile13FixtureHttpHandler({ assetDirectory: directory });
    for (const asset of ASSETS) {
      const path = join(directory, asset.name), original = readFileSync(path);
      writeFileSync(path, Buffer.concat([original, Buffer.from('\nUNREVIEWED')]));
      assert.throws(() => createMobile13FixtureHttpHandler({ assetDirectory: directory }),
        new RegExp('MOBILE13_FIXTURE_ASSET_HASH_MISMATCH:' + asset.name.replace('.', '\\.')));
      assert.throws(() => patch(sourceFixture(), { assetDirectory: directory }), /ASSET_HASH_MISMATCH/);
      assert.deepEqual(invoke(handler, PREFIX + asset.name).res.body, original);
      writeFileSync(path, original);
    }
    const patched = patch(sourceFixture(), { assetDirectory: directory });
    rmSync(directory, { recursive: true });
    assert.equal(reverse(patched), sourceFixture(), 'reverse must not read asset files');
    assert.throws(() => createMobile13FixtureHttpHandler({ assetDirectory: directory }), /ENOENT/);
    assert.equal(invoke(handler, PREFIX + 'index.html').res.status, 200);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sourceFixture(exported = false) {
  return [
    'const unchangedBefore="original";',
    (exported ? 'export ' : '') + 'const httpServer=createServer(async(req,res)=>{',
    ...(exported ? ['  if(await lifeRuntimeSlot56.handle(req,res))return;'] : []),
    '  const url=new URL(req.url||"/","http://localhost");',
    '  return originalRoute(req,res,url);',
    '});',
    'const unchangedAfter="original";',
    ''
  ].join('\n');
}

test('deterministic guarded insertion round-trips actual raw and integrated source without other edits', () => {
  const sources = [
    sourceFixture(), sourceFixture(true),
    readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8'),
    readFileSync(new URL('../server-integration/server.mjs', import.meta.url), 'utf8')
  ];
  for (const source of sources) {
    const patched = patch(source);
    assert.equal(patch(source), patched);
    assert.equal(reverse(patched), source);
    const insertion = source.indexOf(URL_LINE) + URL_LINE.length;
    assert.equal(patched.slice(0, insertion), source.slice(0, insertion));
    const endMarker = '  /* JH_MOBILE13_FIXTURE_HTTP_V1_END */\n';
    assert.equal(patched.slice(patched.indexOf(endMarker) + endMarker.length), source.slice(insertion));
  }
});

test('embedded callback serves the same bytes and preserves original continuation and auth routing', async () => {
  for (const exported of [false, true]) {
    const originalCalls = [], slotCalls = [];
    let callback;
    const patched = patch(sourceFixture(exported)).replace('export const httpServer=', 'const httpServer=');
    new Function('createServer', 'lifeRuntimeSlot56', 'originalRoute', patched)(
      (handler) => { callback = handler; return {}; },
      { async handle(req) { slotCalls.push(req.url); return req.url === '/jh/life/handled'; } },
      (req, res, url) => {
        originalCalls.push([req.url, req.method, url.pathname]);
        res.writeHead(401, { 'content-type': 'text/plain' }); res.end('ORIGINAL_AUTH_REQUIRED');
      }
    );
    for (const asset of ASSETS) {
      const res = response();
      await callback({ url: PREFIX + asset.name + '?via=new-tab', method: 'GET' }, res);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, readFileSync(join(ASSET_DIRECTORY, asset.name)));
    }
    for (const url of ['/mcp', '/device/trusted/read', '/health']) {
      const res = response();
      await callback({ url, method: 'POST' }, res);
      assert.equal(res.status, 401);
      assert.equal(res.body.toString(), 'ORIGINAL_AUTH_REQUIRED');
    }
    assert.deepEqual(originalCalls.map((entry) => entry[0]), ['/mcp', '/device/trusted/read', '/health']);
    if (exported) {
      const res = response();
      await callback({ url: '/jh/life/handled', method: 'GET' }, res);
      assert.equal(res.writes, 0);
      assert.equal(originalCalls.length, 3);
      assert.equal(slotCalls.length, ASSETS.length + 4);
    } else assert.equal(slotCalls.length, 0);
  }
});

test('changed or duplicate anchors, repeated patching, modified bundles and modified blocks are rejected', () => {
  const source = sourceFixture(), patched = patch(source);
  for (const invalid of [
    null, source.replace('createServer(async(req,res)', 'createServer(async(request,response)'),
    source + URL_LINE, source.replace(URL_LINE, '  const url=new URL(req.url);\n'),
    source.replace(URL_LINE, '  unexpected();\n' + URL_LINE), patched
  ]) assert.throws(() => patch(invalid), /MOBILE13_FIXTURE_/);
  assert.throws(() => patch('invalid', { assetDirectory: '/nonexistent/not-read' }),
    /MOBILE13_FIXTURE_HTTP_ANCHOR_CHANGED/);
  for (const invalid of [
    source, patched + patched,
    patched.replace('res.writeHead(status, headers);', 'res.writeHead(200, headers);'),
    patched.replace(ASSETS[0].sha256, '0'.repeat(64)),
    patched.replace('"base64":"', '"base64":"AAAA'),
    patched.replace('  /* JH_MOBILE13_FIXTURE_HTTP_V1_BEGIN */', '  /* changed */')
  ]) assert.throws(() => reverse(invalid), /MOBILE13_FIXTURE_/);
});
