// Runtime metadata only: no key/DB contents, writes, network, initialization or grants.
// Called once after the existing, verified server entry has loaded successfully.
import * as fs from 'node:fs';
import path from 'node:path';
const SERVICE = 'srv-db0fjl2d0e5s73be114g';
const FLAGS = ['JH_OWNER_ENABLED', 'JH_LIFE_ENABLED'];
const FILES = ['JH_OWNER_CONFIG_FILE', 'JH_OWNER_KEY_FILE', 'JH_LIFE_KEY_FILE', 'JH_LIFE_DATABASE_FILE', 'JH_LIFE_REGISTRY_FILE', 'JH_LIFE_POLICY_FILE'];
const base = status => ({schema:1, revision:'runtime-metadata-v1', status, scope:'METADATA_ONLY', releaseReady:false});
export function collectRuntimeMetadata({env=process.env, io=fs, getUid=()=>process.getuid?.()}={}) {
  if (env.RENDER_SERVICE_ID !== SERVICE) return base('WRONG_SERVICE_OR_CONTEXT');
  const report = base('OBSERVED');
  let uid; try { uid=getUid(); } catch {}
  report.flags = Object.fromEntries(FLAGS.map(k => [k, env[k] === '1' ? 'ENABLED' : env[k] === undefined ? 'NOT_SET' : 'NOT_ENABLED']));
  const metadata = p => {
    if (p === undefined || p === '') return 'NOT_SET';
    if (typeof p !== 'string' || p.length > 4096 || p.includes('\0') || !path.isAbsolute(p) || path.normalize(p) !== p) return 'INVALID_PATH';
    try {
      if (io.realpathSync(path.dirname(p)) !== path.dirname(p)) return 'LINKED_PARENT';
      const s = io.lstatSync(p);
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) return 'NOT_SINGLE_REGULAR_FILE';
      if (!Number.isSafeInteger(uid) || uid < 0 || s.uid !== uid || (s.mode & 0o077) !== 0) return 'PERMISSIONS_REVIEW';
      return s.size > 0 ? 'FILE_PRESENT_CONTENT_NOT_CHECKED' : 'EMPTY_FILE';
    } catch { return 'MISSING_OR_INACCESSIBLE'; }
  };
  report.files = Object.fromEntries(FILES.map(k => [k, metadata(env[k])]));
  // This is the only content read. It is a fixed kernel metadata path, never an env path.
  try {
    const m = io.readFileSync('/proc/self/mountinfo', 'utf8');
    if (typeof m !== 'string' || Buffer.byteLength(m) > 1024*1024) report.dataMount='NOT_CHECKED';
    else report.dataMount=m.split('\n').some(line => line.split(' ')[4] === '/var/data') ? 'MOUNT_POINT_OBSERVED_NOT_DURABILITY_PROOF' : 'NOT_OBSERVED';
  } catch { report.dataMount='NOT_CHECKED'; }
  // Only a syntactically valid public revision identifier may be returned.
  if (typeof env.RENDER_GIT_COMMIT === 'string' && /^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT)) report.commit=env.RENDER_GIT_COMMIT;
  return report;
}
export function emitRuntimeMetadata(options={}, sink=line=>console.log(line)) {
  let report;
  try { report=collectRuntimeMetadata(options); }
  catch { report=base('CHECK_FAILED_NO_DETAILS'); }
  // Logging failure must never affect the existing server or weaken its guards.
  try { sink('JH_RUNTIME_METADATA '+JSON.stringify(report)); } catch {}
  return report;
}
