import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectVideoArtifact } from '../src/video-artifact.mjs';
const exec = promisify(execFile);
const bind = { taskId: 'video-test-1', sentMessageId: 'message-1', accountBinding: 'opaque-test-account' };

test('validates real video bytes, duration and hash; rejects file confusion and symlinks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'jh-video-test-'));
  try {
    const video = path.join(root, 'generated.mp4');
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=5:d=1',
      '-c:v', 'mpeg4', '-an', '-y', video], { timeout: 20000 });
    const a = await inspectVideoArtifact({ ...bind, exportRoot: root, localPath: video });
    assert.equal(a.mime, 'video/mp4'); assert.equal(a.durationSeconds, 1);
    assert.match(a.sha256, /^[a-f0-9]{64}$/); assert.ok(a.bytes > 100);
    await assert.rejects(inspectVideoArtifact({ ...bind, exportRoot: root, localPath: video, maxBytes: 100 }), /SIZE_INVALID/);
    const fake = path.join(root, 'fake.mp4'); await writeFile(fake, '<html>please log in</html>');
    await assert.rejects(inspectVideoArtifact({ ...bind, exportRoot: root, localPath: fake }), /VIDEO_BYTES/);
    const link = path.join(root, 'link.mp4'); await symlink(video, link);
    await assert.rejects(inspectVideoArtifact({ ...bind, exportRoot: root, localPath: link }), /SYMLINK/);
    await assert.rejects(inspectVideoArtifact({ ...bind, exportRoot: path.join(root, 'not-export'), localPath: video }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
