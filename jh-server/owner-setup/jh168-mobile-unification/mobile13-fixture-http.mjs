/**
 * Source-only HTTP adapter for the reviewed mobile13 fixture.
 * Importing this module performs no file I/O. Call the factory or patch only
 * after the caller has selected the existing, explicit mobile verification mode.
 * No listener, route registration, authentication, or Android operation starts here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const MOBILE13_FIXTURE_PREFIX = '/__jh_mobile13_fixture/v1/';
export const MOBILE13_FIXTURE_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";
// Reviewed assets published in 5d3ce71, unchanged in cce1c04. Pins are not options.
export const MOBILE13_FIXTURE_ASSETS = Object.freeze([
  Object.freeze({ name: 'index.html', type: 'text/html; charset=utf-8',
    sha256: '3c7cc5351b9dc46eac6d30194e5eab503b89d739ed546ba84f3723aaf0b74eb7' }),
  Object.freeze({ name: 'destination.html', type: 'text/html; charset=utf-8',
    sha256: '34d822dfda34e8c72b1dbd2d08ce4a7afc5d05335aac7ef41470d65b06408334' }),
  Object.freeze({ name: 'fixture.css', type: 'text/css; charset=utf-8',
    sha256: '7c42a1807e5f0cc10dda99971acff17d7cc12214907e9edd230795628fef9cba' }),
  Object.freeze({ name: 'fixture.js', type: 'text/javascript; charset=utf-8',
    sha256: 'a870308ddba3d60d3c48232aae40548866b9323eaa69a3625bed0975925c96e1' })
]);
const HEADERS = Object.freeze({
  'content-security-policy': MOBILE13_FIXTURE_CSP,
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
});
const DEFAULT_DIRECTORY = fileURLToPath(new URL('./fixtures/mobile13/', import.meta.url));
const CREATE_SERVER = 'const httpServer=createServer(async(req,res)=>{\n';
const URL_LINE = '  const url=new URL(req.url||"/","http://localhost");\n';
const CONTINUATION_PRELUDE = '  if(await lifeRuntimeSlot56.handle(req,res))return;\n';
const BEGIN = '  /* JH_MOBILE13_FIXTURE_HTTP_V1_BEGIN */\n';
const END = '  /* JH_MOBILE13_FIXTURE_HTTP_V1_END */\n';
const BLOCK_OPEN = BEGIN + '  {\n' +
  '    const jhMobile13FixtureRaw56=typeof req.url==="string"?req.url:"";\n' +
  '    if(jhMobile13FixtureRaw56.startsWith(' + JSON.stringify(MOBILE13_FIXTURE_PREFIX) + ')||\n' +
  '       jhMobile13FixtureRaw56===' + JSON.stringify(MOBILE13_FIXTURE_PREFIX.slice(0, -1)) + '||\n' +
  '       jhMobile13FixtureRaw56.startsWith(' + JSON.stringify(MOBILE13_FIXTURE_PREFIX.slice(0, -1) + '?') + ')){\n';
const DATA_LINE = '      const jhMobile13FixtureData56=';
const RESERVED = ['JH_MOBILE13_FIXTURE_HTTP_V1_', 'jhMobile13FixtureData56', 'jhMobile13FixtureRaw56'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const occurrences = (source, needle) => source.split(needle).length - 1;

function readPinnedFixture({ assetDirectory = DEFAULT_DIRECTORY } = {}) {
  if (typeof assetDirectory !== 'string' || assetDirectory.length === 0)
    throw Error('MOBILE13_FIXTURE_ASSET_DIRECTORY_INVALID');
  const assets = MOBILE13_FIXTURE_ASSETS.map((asset) => {
    const bytes = readFileSync(join(assetDirectory, asset.name));
    if (sha256(bytes) !== asset.sha256)
      throw Error('MOBILE13_FIXTURE_ASSET_HASH_MISMATCH:' + asset.name);
    return Object.freeze({ ...asset, base64: bytes.toString('base64') });
  });
  return Object.freeze({ prefix: MOBILE13_FIXTURE_PREFIX, headers: HEADERS,
    assets: Object.freeze(assets) });
}

// This function must remain self-contained: its exact source is embedded below.
// A handled request returns true. Other routes are untouched and return false.
function serveFixedMobile13Fixture(req, res, fixture) {
  const raw = typeof req.url === 'string' ? req.url : '';
  const query = raw.indexOf('?');
  const pathname = query === -1 ? raw : raw.slice(0, query);
  const prefix = fixture.prefix;
  if (pathname !== prefix.slice(0, -1) && !pathname.startsWith(prefix)) return false;

  const method = req.method;
  const allowed = method === 'GET' || method === 'HEAD';
  const asset = allowed ? fixture.assets.find((entry) => pathname === prefix + entry.name) : undefined;
  const status = !allowed ? 405 : asset ? 200 : 404;
  const body = asset ? Buffer.from(asset.base64, 'base64') :
    Buffer.from(allowed ? 'Not Found\n' : 'Method Not Allowed\n', 'utf8');
  const headers = {
    ...fixture.headers,
    'content-type': asset ? asset.type : 'text/plain; charset=utf-8',
    'content-length': String(body.length)
  };
  if (!allowed) headers.allow = 'GET, HEAD';
  res.writeHead(status, headers);
  if (method === 'HEAD') res.end();
  else res.end(body);
  return true;
}

/** Load and pin exactly four assets once; the returned handler never reads files. */
export function createMobile13FixtureHttpHandler(options) {
  const fixture = readPinnedFixture(options);
  return (req, res) => serveFixedMobile13Fixture(req, res, fixture);
}

function sourceGuard(source) {
  if (typeof source !== 'string' || RESERVED.some((token) => source.includes(token)))
    throw Error('MOBILE13_FIXTURE_SOURCE_INVALID_OR_ALREADY_PATCHED');
  if (occurrences(source, CREATE_SERVER) !== 1 || occurrences(source, URL_LINE) !== 1)
    throw Error('MOBILE13_FIXTURE_HTTP_ANCHOR_CHANGED');
  const afterCreate = source.indexOf(CREATE_SERVER) + CREATE_SERVER.length;
  const urlIndex = source.indexOf(URL_LINE);
  const prelude = source.slice(afterCreate, urlIndex);
  if (urlIndex < afterCreate || (prelude !== '' && prelude !== CONTINUATION_PRELUDE))
    throw Error('MOBILE13_FIXTURE_HTTP_PRELUDE_CHANGED');
}

function renderBlock(fixture) {
  return BLOCK_OPEN + DATA_LINE + JSON.stringify(fixture) + ';\n' +
    '      if((' + serveFixedMobile13Fixture.toString() +
    ')(req,res,jhMobile13FixtureData56))return;\n' +
    '    }\n  }\n' + END;
}

// Reverse validates the embedded bundle without consulting the working directory.
function validateEmbeddedFixture(fixture) {
  if (!fixture || JSON.stringify(Object.keys(fixture)) !== '["prefix","headers","assets"]' ||
      fixture.prefix !== MOBILE13_FIXTURE_PREFIX ||
      JSON.stringify(fixture.headers) !== JSON.stringify(HEADERS) ||
      !Array.isArray(fixture.assets) || fixture.assets.length !== MOBILE13_FIXTURE_ASSETS.length)
    throw Error('MOBILE13_FIXTURE_EMBEDDED_ASSETS_INVALID');
  for (let i = 0; i < MOBILE13_FIXTURE_ASSETS.length; i += 1) {
    const actual = fixture.assets[i], expected = MOBILE13_FIXTURE_ASSETS[i];
    if (!actual || JSON.stringify(Object.keys(actual)) !== '["name","type","sha256","base64"]' ||
        actual.name !== expected.name || actual.type !== expected.type ||
        actual.sha256 !== expected.sha256 || typeof actual.base64 !== 'string')
      throw Error('MOBILE13_FIXTURE_EMBEDDED_ASSETS_INVALID');
    const bytes = Buffer.from(actual.base64, 'base64');
    if (bytes.toString('base64') !== actual.base64 || sha256(bytes) !== expected.sha256)
      throw Error('MOBILE13_FIXTURE_EMBEDDED_ASSETS_INVALID');
  }
}

/**
 * Add one guarded block immediately after the original HTTP URL line.
 * The caller owns mode selection; this function never reads environment flags.
 */
export function patchJH168Mobile13FixtureHttp56(source, options) {
  sourceGuard(source);
  const block = renderBlock(readPinnedFixture(options));
  const patched = source.replace(URL_LINE, URL_LINE + block);
  if (reverseJH168Mobile13FixtureHttp56(patched) !== source)
    throw Error('MOBILE13_FIXTURE_PATCH_NOT_REVERSIBLE');
  return patched;
}

export function reverseJH168Mobile13FixtureHttp56(source) {
  if (typeof source !== 'string' || occurrences(source, BEGIN) !== 1 || occurrences(source, END) !== 1)
    throw Error('MOBILE13_FIXTURE_REVERSE_MARKER_INVALID');
  const start = source.indexOf(BEGIN), finish = source.indexOf(END) + END.length;
  const block = source.slice(start, finish);
  const dataStart = BLOCK_OPEN.length + DATA_LINE.length;
  if (!block.startsWith(BLOCK_OPEN + DATA_LINE))
    throw Error('MOBILE13_FIXTURE_REVERSE_BLOCK_CHANGED');
  const dataEnd = block.indexOf(';\n', dataStart);
  if (dataEnd === -1) throw Error('MOBILE13_FIXTURE_REVERSE_BLOCK_CHANGED');
  let fixture;
  try { fixture = JSON.parse(block.slice(dataStart, dataEnd)); }
  catch { throw Error('MOBILE13_FIXTURE_REVERSE_BLOCK_CHANGED'); }
  validateEmbeddedFixture(fixture);
  if (renderBlock(fixture) !== block)
    throw Error('MOBILE13_FIXTURE_REVERSE_BLOCK_CHANGED');
  const original = source.slice(0, start) + source.slice(finish);
  sourceGuard(original);
  if (start !== original.indexOf(URL_LINE) + URL_LINE.length)
    throw Error('MOBILE13_FIXTURE_REVERSE_LOCATION_CHANGED');
  return original;
}
