/**
 * JH file-delivery gate: public/private release selection without side effects.
 * This is a pure decision helper, NOT a file uploader, network fetch, installer,
 * account auth, or certificate bypass. Runtime must supply real verified facts.
 */
const HEX64 = /^[0-9a-f]{64}$/;
const ASCII_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const OWNER_REPO = /^[A-Za-z0-9_.-]+$/;
const TAG = /^[A-Za-z0-9_.-]{1,120}$/;

export function verifyPublicReleaseAsset({ release, fileName, sha256, sizeBytes, publicAuthorized = false } = {}) {
  if (publicAuthorized !== true) return { ok: false, reason: 'PUBLICATION_NOT_AUTHORIZED' };
  if (!ASCII_NAME.test(fileName || '') || !HEX64.test(sha256 || '')
      || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: 'FILE_IDENTITY_NOT_VERIFIED' };
  }
  if (!release || release.repositoryVisibility !== 'PUBLIC'
      || release.draft !== false || release.published !== true) {
    return { ok: false, reason: 'PUBLIC_RELEASE_UNVERIFIED' };
  }
  const { owner, repository, tag } = release;
  if (!OWNER_REPO.test(owner || '') || !OWNER_REPO.test(repository || '') || !TAG.test(tag || '')) {
    return { ok: false, reason: 'RELEASE_IDENTITY_INVALID' };
  }
  const asset = (release.assets || []).find(a => a.name === fileName);
  if (!asset || asset.size !== sizeBytes || asset.digest !== 'sha256:' + sha256) {
    return { ok: false, reason: 'RELEASE_ASSET_SHA_OR_SIZE_MISMATCH' };
  }
  // Exact allowlisted public URL only, no token/query/fragment/sandbox path.
  const expect = 'https://github.com/' + owner + '/' + repository
    + '/releases/download/' + tag + '/' + fileName;
  if (asset.browser_download_url !== expect) {
    return { ok: false, reason: 'RELEASE_DIRECT_URL_UNVERIFIED' };
  }
  return { ok: true, url: expect, releasePage: 'https://github.com/' + owner + '/'
    + repository + '/releases/tag/' + tag, sha256, sizeBytes };
}

/** choose a delivery surface, never claim a user's browser succeeded */
export function decideFileDelivery(p = {}) {
  const { visibility = 'PRIVATE', fileSha256, fileSizeBytes,
    fileName, sandboxPathVerified = false, sandboxFailures = 0,
    userDownloadAcknowledged = false, release, publicAuthorized = false } = p;

  if (!HEX64.test(fileSha256 || '') || !Number.isSafeInteger(fileSizeBytes)
      || fileSizeBytes <= 0 || !ASCII_NAME.test(fileName || '')) {
    return { status: 'DELIVERY_BLOCKED', reason: 'SOURCE_FILE_NOT_VERIFIED',
      userDownloadConfirmed: false, rebuildRequired: false };
  }
  if (userDownloadAcknowledged === true) {
    return { status: 'USER_DOWNLOAD_CONFIRMED', userDownloadConfirmed: true,
      rebuildRequired: false };
  }
  if (visibility !== 'PUBLIC' && visibility !== 'PRIVATE') {
    return { status: 'DELIVERY_BLOCKED', reason: 'VISIBILITY_UNKNOWN',
      userDownloadConfirmed: false, rebuildRequired: false };
  }
  // Only public and owner-authorized files can receive a public direct link.
  if (visibility === 'PUBLIC' && publicAuthorized === true) {
    const checked = verifyPublicReleaseAsset({
      release, fileName, sha256: fileSha256, sizeBytes: fileSizeBytes,
      publicAuthorized,
    });
    if (checked.ok) {
      return { status: 'EXTERNAL_ASSET_METADATA_VERIFIED',
        channel: 'PUBLIC_GITHUB_RELEASE',
        url: checked.url, releasePage: checked.releasePage,
        userDownloadConfirmed: false, anonymousDownloadVerified: false,
        rebuildRequired: false };
    }
  }
  // Never send private data to GitHub, even if a release mistakenly exists.
  if (Number.isInteger(sandboxFailures) && sandboxFailures === 0 && sandboxPathVerified === true) {
    return { status: 'CHATGPT_LINK_READY', channel: 'SANDBOX',
      userDownloadConfirmed: false, rebuildRequired: false };
  }
  return { status: 'DELIVERY_BLOCKED',
    reason: visibility === 'PRIVATE' ? 'PRIVATE_DELIVERY_CHANNEL_UNAVAILABLE'
      : 'INDEPENDENT_DELIVERY_CHANNEL_REQUIRED',
    userDownloadConfirmed: false, rebuildRequired: false };
}
