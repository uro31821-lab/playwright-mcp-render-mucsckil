import test from 'node:test';
import assert from 'node:assert/strict';
import { decideFileDelivery, verifyPublicReleaseAsset } from './delivery-gate.mjs';

const digest = '44f2ba7a85f39af9bf8155af0aa081cfdc13044e5594f285adf3e583345a491c';
const release = {
  repositoryVisibility: 'PUBLIC', draft: false, published: true,
  owner: 'uro31821-lab', repository: 'playwright-mcp-render-mucsckil',
  tag: 'gglass-s26-readonly-20261112',
  assets: [{
    name: 'GGlass26.zip', size: 15822, digest: 'sha256:' + digest,
    browser_download_url: 'https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/releases/download/gglass-s26-readonly-20261112/GGlass26.zip',
  }],
};
const base = {
  visibility: 'PUBLIC', publicAuthorized: true, fileName: 'GGlass26.zip',
  fileSha256: digest, fileSizeBytes: 15822,
  release, sandboxPathVerified: true, sandboxFailures: 0,
};

test('verified public release beats sandbox, even when sandbox is valid', () => {
  const r = decideFileDelivery(base);
  assert.equal(r.status, 'EXTERNAL_ASSET_METADATA_VERIFIED');
  assert.equal(r.channel, 'PUBLIC_GITHUB_RELEASE');
  assert.equal(r.userDownloadConfirmed, false);
  assert.equal(r.anonymousDownloadVerified, false);
  assert.equal(r.rebuildRequired, false);
});
test('repeated sandbox failures immediately switch to verified public release', () => {
  const r = decideFileDelivery({...base, sandboxFailures: 5});
  assert.equal(r.channel, 'PUBLIC_GITHUB_RELEASE');
});
test('public release metadata must have exact SHA and size', () => {
  const r = verifyPublicReleaseAsset({
    release, fileName: 'GGlass26.zip', sha256: digest, sizeBytes: 15822,
    publicAuthorized: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.url, release.assets[0].browser_download_url);
});
test('asset hash mismatch blocks external delivery', () => {
  const r = decideFileDelivery({...base, fileSha256: '0'.repeat(64), sandboxFailures: 3});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('asset size mismatch blocks external delivery', () => {
  const r = decideFileDelivery({...base, fileSizeBytes: 15823, sandboxFailures: 3});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('draft release not accepted', () => {
  const r = decideFileDelivery({...base, release: {...release, draft: true}, sandboxFailures: 3});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('expired Actions artifact is not a release URL', () => {
  const wrong = {...release, assets: [{...release.assets[0],
    browser_download_url: 'https://github.com/uro31821-lab/playwright-mcp-render-mucsckil/actions/runs/123'}]};
  const r = decideFileDelivery({...base, release: wrong, sandboxFailures: 3});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('no public permission means do not publish to GitHub', () => {
  const r = decideFileDelivery({...base, publicAuthorized: false, sandboxFailures: 1});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('private patient data is never linked to public release', () => {
  const r = decideFileDelivery({...base, visibility: 'PRIVATE', sandboxFailures: 2});
  assert.equal(r.reason, 'PRIVATE_DELIVERY_CHANNEL_UNAVAILABLE');
});
test('private data may only use verified sandbox channel before a failure', () => {
  const r = decideFileDelivery({...base, visibility: 'PRIVATE'});
  assert.equal(r.channel, 'SANDBOX');
});
test('after sandbox failure, no name-only retry on same channel', () => {
  const r = decideFileDelivery({...base, visibility: 'PRIVATE', sandboxFailures: 1});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('a previously failed public file without public release blocks, not rebuilds', () => {
  const r = decideFileDelivery({...base, release: undefined, sandboxFailures: 1});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
  assert.equal(r.rebuildRequired, false);
});
test('wrong file name prevents any delivery', () => {
  const r = decideFileDelivery({...base, fileName: '../secret.zip'});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
test('wrong release asset path fails public link', () => {
  const wrong = {...release, assets: [{...release.assets[0],
    browser_download_url: release.assets[0].browser_download_url + '?token=secret'}]};
  assert.equal(verifyPublicReleaseAsset({
    release: wrong, fileName:'GGlass26.zip', sha256:digest,
    sizeBytes:15822, publicAuthorized:true
  }).ok, false);
});
test('unknown visibility fails closed', () => {
  assert.equal(decideFileDelivery({...base, visibility: 'UNKNOWN'}).status,'DELIVERY_BLOCKED');
});
test('user acknowledgement is only way to claim download completion', () => {
  assert.equal(decideFileDelivery({...base}).userDownloadConfirmed, false);
  assert.equal(decideFileDelivery({...base,userDownloadAcknowledged:true}).userDownloadConfirmed, true);
});
test('missing file hash fails closed', () => {
  assert.equal(decideFileDelivery({...base,fileSha256: undefined}).status, 'DELIVERY_BLOCKED');
});
test('private file content cannot escape even with mismatched reported release', () => {
  const r = decideFileDelivery({...base, visibility: 'PRIVATE', release, sandboxPathVerified: false});
  assert.equal(r.status, 'DELIVERY_BLOCKED');
});
