import { open, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
/** Inspect a download already placed in the host's PRIVATE export directory.
 * Never fetches an arbitrary URL or reads the browser profile/cookies.
 * This is file evidence; publishing to ChatGPT is a separate host operation.
 */
export async function inspectVideoArtifact({ exportRoot, localPath, taskId, sentMessageId, accountBinding,
  maxBytes = 100 * 1024 * 1024, requestDigest = null }) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(taskId ?? '') || !sentMessageId || !accountBinding)
    throw Error('ARTIFACT_BINDING_REQUIRED');
  if(requestDigest!==null&&!/^[a-f0-9]{64}$/.test(requestDigest))throw Error('ARTIFACT_REQUEST_DIGEST_INVALID');
  const root = await realpath(exportRoot), real = await realpath(localPath);
  const rel = path.relative(root, real);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ||
      path.resolve(localPath) !== real) throw Error('ARTIFACT_OUTSIDE_EXPORT_ROOT_OR_SYMLINK');
  const fd = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await fd.stat();
    if (!before.isFile() || before.size <= 0 || before.size > maxBytes) throw Error('ARTIFACT_SIZE_INVALID');
    const header = Buffer.alloc(12); await fd.read(header, 0, 12, 0);
    const mime = header.toString('ascii', 4, 8) === 'ftyp' ? 'video/mp4'
      : header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'video/webm' : null;
    if (!mime) throw Error('VIDEO_BYTES_REQUIRED');
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', real],
      { timeout: 10000, maxBuffer: 256 * 1024 });
    const probe = JSON.parse(stdout), durationSeconds = Number(probe.format?.duration);
    if (!probe.streams?.some(s => s.codec_type === 'video' && s.width > 0 && s.height > 0) ||
        !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw Error('DECODABLE_VIDEO_REQUIRED');
    const h = createHash('sha256'), buffer = Buffer.alloc(65536);
    let offset = 0;
    while (offset < before.size) {
      const { bytesRead } = await fd.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      if (!bytesRead) throw Error('ARTIFACT_CHANGED');
      h.update(buffer.subarray(0, bytesRead)); offset += bytesRead;
    }
    const after = await fd.stat(), current = await lstat(real);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino || after.ctimeMs !== before.ctimeMs)
      throw Error('ARTIFACT_CHANGED');
    if (current.isSymbolicLink() || current.ino !== before.ino || current.dev !== before.dev)
      throw Error('ARTIFACT_CHANGED');
    return Object.freeze({ taskId, sentMessageId, accountBinding, localPath: real,
      sha256: h.digest('hex'), bytes: before.size, mime, durationSeconds, requestDigest,
      source:'EXISTING_NATIVE_VIDEO_EXPORT', fullGenerationIntentVerified:false });
  } finally { await fd.close(); }
}
