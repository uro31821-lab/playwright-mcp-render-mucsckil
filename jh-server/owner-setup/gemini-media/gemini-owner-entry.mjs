/** Explicit supplementary Gemini owner entry; original published startup stays
 * byte-identical. Every original builder/selector runs before this new layer.
 * Only separate GENERATED outputs receive reversible edits. No parent input,
 * attestation, approval rule, catalog digest or source pin is replaced.
 */
import path from 'node:path';
import {readFileSync, writeFileSync, renameSync, lstatSync, realpathSync, existsSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-news-review-entry.mjs';
import {buildPendingApprovalOperatorEntrypoint56, selectPendingApprovalOperatorRuntime56}
  from '../server-integration/pending-approval-operator-entry.mjs';
import {buildStage25PendingOperatorEntrypoint56, selectStage25PendingOperatorRuntime56, selectEbiseoAudioV05}
  from '../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs';
import {main as originalPublishedMain, assertPublishedHost, requirePcNodeVersion,
  selectPendingApprovalStartup56, selectJH168FollowupOperator56} from '../deployment/published-host-router.mjs';
import {patchGeminiMediaRuntime56, reverseGeminiMediaRuntime56} from './gemini-composition.mjs';

export const GEMINI_OPERATOR_ENABLE = 'EXPLICIT_GEMINI_MEDIA_OWNER_V1';
const SERVICE = 'srv-db0fjl2d0e5s73be114g';
const ROOT = path.resolve(import.meta.dirname, '..');
const MODES = new Set(['durable', 'pending-approval', 'followup', 'audio']);
const SCHEMA = 'JH_GEMINI_MEDIA_OWNER_V1';
const SELECTOR_IMPORT = "import {selectGeminiMediaRuntime56} from '../gemini-media/gemini-owner-entry.mjs';\n";
const LIFE_IMPORT = "import {installConfiguredLifeRuntime} from './life-runtime-install.mjs';";
const GEMINI_LIFE_IMPORT = "import {installConfiguredLifeRuntimeWithGemini as installConfiguredLifeRuntime} from '../gemini-media/gemini-owner-runtime.mjs';";
const STORAGE_PINS = Object.freeze({registeredBootstrap: '4ef5d125241b0260d4d9a0cd285e871e76025d736ab51cf95b702d5744a9fe94',
  provision: '495d13c7c03c4f250d66f68915f62e30ad5cfcedeaf51105d514f167bcdf516a'});
const SNAPSHOT_KEYS = ['runtime', 'owner', 'unified', 'operational', 'registeredBootstrap', 'provision'];
const AUDIO_PARENTS = Object.freeze({
  audio: {runtime: 'server-ebiseo-audio-v05-candidate.mjs', suffix: 'ebiseo-audio-v05',
    selector: 'selectAudioCandidateRuntime', module: 'ebiseo-audio-v05/audio-current-selector.mjs'},
  camera: {runtime: 'server-kabiseo-camera-v0256-candidate.mjs', suffix: 'kabiseo-camera-v0256',
    selector: 'selectCameraCandidateRuntime', module: 'kabiseo-camera-v0256/camera-current-selector.mjs'},
  peer: {runtime: 'server-ordinary-peer.mjs', suffix: 'ordinary-peer',
    selector: 'selectPeerRuntime', module: 'ordinary-peer/peer-release.mjs'}
});
const builtParents = new Map();
let building = false;
const fail = code => {throw Object.assign(new Error(code), {code});};
const sha = data => createHash('sha256').update(data).digest('hex');
const count = (source, value) => source.split(value).length - 1;
const cacheKey = (root, mode) => root + '\0' + mode;
const audioLayer = env => env.JH_PEER_PREPARATION_NOTICE_JSON ? 'peer' : env.JH_KABISEO_CAMERA_ENABLE ? 'camera' : 'audio';

function features(env) {
  for (const name of ['JH_GEMINI_ANALYSIS_ENABLED', 'JH_GEMINI_GENERATION_ENABLED']) {
    if (![undefined, '', '0', '1'].includes(env?.[name])) fail('GEMINI_ENABLE_FLAG_INVALID');
  }
  return {analysis: env?.JH_GEMINI_ANALYSIS_ENABLED === '1', generation: env?.JH_GEMINI_GENERATION_ENABLED === '1'};
}
const synthetic = env => env?.CI === 'true' && env.NODE_ENV === 'test' &&
  env.JH_OWNER_DEFER_LISTEN === '1' && env.RENDER_SERVICE_ID === undefined &&
  env.JH_DURABLE_RELEASE === undefined;

/** No production identity or original operator flag is manufactured here. */
function gate(env, requestedMode) {
  const selectedFeatures = features(env);
  if (!selectedFeatures.analysis && !selectedFeatures.generation) fail('GEMINI_FEATURE_ENABLE_REQUIRED');
  if (env?.JH_GEMINI_OPERATOR_ENABLE !== GEMINI_OPERATOR_ENABLE) fail('GEMINI_OPERATOR_EXPLICIT_ENABLE_REQUIRED');
  const audioEnabled = env.JH_EBISEO_AUDIO_ENABLE !== undefined && env.JH_EBISEO_AUDIO_ENABLE !== '';
  if (audioEnabled && env.JH_EBISEO_AUDIO_ENABLE !== 'EXPLICIT_EBISEO_AUDIO_V05') fail('JH_EBISEO_AUDIO_FLAG_INVALID');
  if (!audioEnabled && [env.JH_KABISEO_CAMERA_ENABLE, env.JH_PEER_PREPARATION_NOTICE_JSON]
    .some(value => value !== undefined && value !== '')) fail('GEMINI_EXISTING_AUDIO_PARENT_REQUIRED');
  let baseMode;
  if (synthetic(env)) {
    baseMode = requestedMode || (audioEnabled ? 'audio' : 'durable');
  } else {
    if (env.CI === 'true' || env.JH_OWNER_DEFER_LISTEN !== undefined ||
      env.JH_DURABLE_RELEASE !== 'SERVE_READY_V1' || env.RENDER_SERVICE_ID !== SERVICE) {
      fail('GEMINI_EXISTING_PRODUCTION_OWNER_REQUIRED');
    }
    const pending = selectPendingApprovalStartup56(env);
    const followup = selectJH168FollowupOperator56(env);
    if (pending === 'pending-approval') baseMode = followup === 'followup' ? 'followup' : 'pending-approval';
    else {
      if (followup !== 'original') fail('GEMINI_ORIGINAL_OPERATOR_SELECTION_CHANGED');
      baseMode = 'durable';
    }
    if (audioEnabled) {
      if (baseMode !== 'followup' || selectEbiseoAudioV05(env) !== true) fail('GEMINI_ORIGINAL_AUDIO_OPERATOR_REQUIRED');
      baseMode = 'audio';
    }
    if (requestedMode !== undefined && requestedMode !== baseMode) fail('GEMINI_PARENT_MODE_DOWNGRADE_FORBIDDEN');
  }
  if (!MODES.has(baseMode)) fail('GEMINI_PARENT_MODE_INVALID');
  if ((baseMode === 'audio') !== audioEnabled) fail('GEMINI_AUDIO_PARENT_DOWNGRADE_FORBIDDEN');
  return {baseMode, features: selectedFeatures};
}

function checkedRoot(root) {
  if (typeof root !== 'string' || root !== path.resolve(root) || path.basename(root) !== 'owner-setup') fail('GEMINI_OWNER_ROOT_INVALID');
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(root) !== root) fail('GEMINI_OWNER_ROOT_INVALID');
  return root;
}
function sourceText(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(file) !== file) fail('GEMINI_SOURCE_LINK_FORBIDDEN');
  return readFileSync(file, 'utf8');
}
function publish(file, content) {
  if (realpathSync(path.dirname(file)) !== path.dirname(file)) fail('GEMINI_OUTPUT_LINK_FORBIDDEN');
  if (existsSync(file)) sourceText(file);
  const temporary = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, content, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  renameSync(temporary, file);
  if (sourceText(file) !== content) fail('GEMINI_GENERATED_READBACK_FAILED');
}
function exact(source, before, after) {
  if (typeof source !== 'string' || count(source, before) !== 1 || source.includes(after)) fail('GEMINI_OWNER_SOURCE_DRIFT');
  const output = source.replace(before, after);
  if (output.replace(after, before) !== source) fail('GEMINI_OWNER_REVERSE_SCOPE_CHANGED');
  return output;
}
function applyPairs(source, pairs, prefix = '') {
  if (prefix && source.includes(prefix)) fail('GEMINI_OWNER_ALREADY_PATCHED');
  let output = source;
  for (const [before, after] of pairs) output = exact(output, before, after);
  output = prefix + output;
  if (reversePairs(output, pairs, prefix) !== source) fail('GEMINI_OWNER_REVERSE_SCOPE_CHANGED');
  return output;
}
function reversePairs(source, pairs, prefix = '') {
  if (prefix && (!source.startsWith(prefix) || count(source, prefix) !== 1)) fail('GEMINI_OWNER_REVERSE_PREFIX_CHANGED');
  let output = prefix ? source.slice(prefix.length) : source;
  for (const [before, after] of [...pairs].reverse()) {
    if (count(output, after) !== 1) fail('GEMINI_OWNER_REVERSE_ANCHOR_CHANGED');
    output = output.replace(after, before);
  }
  return output;
}
function outputPaths(root, baseMode) {
  return {runtimeFile: path.join(root, 'server-integration', 'server-jh-gemini-' + baseMode + '-generated.mjs'),
    ownerFile: path.join(root, 'deployment', 'owner-service-gemini-' + baseMode + '-generated.mjs'),
    unifiedFile: path.join(root, 'deployment', 'unified-service-gemini-' + baseMode + '-generated.mjs'),
    file: path.join(root, 'deployment', 'operational-service-gemini-' + baseMode + '-generated.mjs'),
    registeredBootstrapFile: path.join(root, 'deployment', 'life-registered-bootstrap-gemini-' + baseMode + '-generated.mjs'),
    provisionFile: path.join(root, 'deployment', 'life-storage-provision-gemini-' + baseMode + '-generated.mjs'),
    stampFile: path.join(root, 'gemini-media', 'owner-' + baseMode + '-attestation-generated.json')};
}
function linkRecipes(base, outputs, baseMode) {
  const parentSelector = {durable: 'buildDurableRoutedRuntime', 'pending-approval': 'selectPendingApprovalOperatorRuntime56',
    followup: 'selectStage25PendingOperatorRuntime56', audio: base.parentRuntimeSelector}[baseMode];
  const ownerArguments = baseMode === 'durable' ? 'root' : 'root,process.env';
  const opArguments = baseMode === 'durable' ? 'ROOT' : 'ROOT,process.env';
  const ownSelector = "if(runtimeMode==='unified')serverPath=selectGeminiMediaRuntime56(root,process.env,{baseMode:'" + baseMode + "'}).file;";
  const opSelector = "const runtime=selectGeminiMediaRuntime56(ROOT,process.env,{baseMode:'" + baseMode + "'}).file;";
  return {
    owner: [["if(runtimeMode==='unified')serverPath=" + parentSelector + '(' + ownerArguments + ').file;', ownSelector],
      [LIFE_IMPORT, GEMINI_LIFE_IMPORT]],
    unified: [["from './" + path.basename(base.ownerFile) + "';", "from './" + path.basename(outputs.ownerFile) + "';"],
      ["from './life-storage-provision.mjs';", "from './" + path.basename(outputs.provisionFile) + "';"]],
    operational: [["from './" + path.basename(base.unifiedFile) + "';", "from './" + path.basename(outputs.unifiedFile) + "';"],
      ['const runtime=' + parentSelector + '(' + opArguments + ').file;', opSelector]],
    registeredBootstrap: [["import {LifeCheckpointStore} from '../server-continuation/life-checkpoint-store.mjs';",
      "import {GeminiLifeCheckpointStore as LifeCheckpointStore} from '../gemini-media/gemini-storage.mjs';"]],
    provision: [["import {createRegisteredLifeBootstrap} from './life-registered-bootstrap.mjs';",
      "import {createRegisteredLifeBootstrap} from './" + path.basename(outputs.registeredBootstrapFile) + "';"]]
  };
}
function snapshot(base) {
  return {runtime: sourceText(base.runtimeFile), owner: sourceText(base.ownerFile),
    unified: sourceText(base.unifiedFile), operational: sourceText(base.file),
    registeredBootstrap: sourceText(base.registeredBootstrapFile || path.join(path.dirname(base.ownerFile), 'life-registered-bootstrap.mjs')),
    provision: sourceText(base.provisionFile || path.join(path.dirname(base.ownerFile), 'life-storage-provision.mjs'))};
}
function requireSameSnapshot(left, right) {
  if (SNAPSHOT_KEYS.some(key => left[key] !== right[key])) fail('GEMINI_PARENT_ARTIFACT_CHANGED');
}
function parentSelectors(record, root, env) {
  for (const [key, expected] of Object.entries(STORAGE_PINS)) {
    if (sha(record.parent[key]) !== expected) fail('GEMINI_ORIGINAL_STORAGE_SOURCE_CHANGED');
  }
  // These selectors execute the original full reversible attestation chain.
  if (record.baseMode === 'audio') {
    if (record.audioLayer !== audioLayer(env)) fail('GEMINI_AUDIO_LAYER_SELECTION_CHANGED');
    const value = record.parentSelect(root, env);
    if (value.file !== record.base.runtimeFile || value.sha256 !== sha(record.parent.runtime)) fail('GEMINI_AUDIO_PARENT_ATTESTATION_CHANGED');
  } else if (record.baseMode === 'pending-approval') {
    const value = selectPendingApprovalOperatorRuntime56(root, env);
    if (value.file !== record.base.runtimeFile || value.sha256 !== sha(record.parent.runtime)) fail('GEMINI_PARENT_ATTESTATION_CHANGED');
  } else if (record.baseMode === 'followup') {
    const value = selectStage25PendingOperatorRuntime56(root, env);
    if (value.file !== record.base.runtimeFile || value.sha256 !== sha(record.parent.runtime)) fail('GEMINI_PARENT_ATTESTATION_CHANGED');
  } else {
    // Durable has a build-time verifier rather than a stored selector. First
    // reject changed artifacts, then rerun its unmodified complete builder.
    requireSameSnapshot(snapshot(record.base), record.parent);
    const clean = buildCleanRestartRelease56();
    if (clean.sha256 !== record.clean.sha256 || clean.sourceSha256 !== record.clean.sourceSha256) fail('GEMINI_DURABLE_PARENT_SOURCE_CHANGED');
    const verified = record.release.buildDurableRoutedOperationalEntrypoint(root);
    if (verified.runtimeFile !== record.base.runtimeFile || verified.candidateSha256 !== sha(record.parent.runtime)) fail('GEMINI_DURABLE_PARENT_ATTESTATION_CHANGED');
    requireSameSnapshot(snapshot(verified), record.parent);
  }
  requireSameSnapshot(snapshot(record.base), record.parent);
}

/** Same-process selection is intentional: a generated file alone is not a
 * release authority. Each restart must run this explicit entry/builder first.
 * Generated owner code calls this before installing auth or opening a listener.
 */
export function selectGeminiMediaRuntime56(root, env = process.env, {baseMode: requestedMode} = {}) {
  checkedRoot(root);
  // In production the original published selector derives the parent. CI may
  // have multiple reviewed test profiles, so only a builder-issued record wins.
  const candidates = [...builtParents.values()].filter(record => record.root === root);
  const selected = synthetic(env) ? candidates.filter(record =>
    record.features.analysis === features(env).analysis && record.features.generation === features(env).generation) : candidates;
  if (!selected.length) fail('GEMINI_OWNER_BUILD_REQUIRED');
  const baseMode = synthetic(env) ? (requestedMode || selected.at(-1).baseMode) : gate(env, requestedMode).baseMode;
  const checked = gate(env, baseMode);
  const record = builtParents.get(cacheKey(root, baseMode));
  if (!record || record.features.analysis !== checked.features.analysis || record.features.generation !== checked.features.generation) fail('GEMINI_OWNER_BUILD_REQUIRED');
  parentSelectors(record, root, env);
  const actual = snapshot(record.outputs);
  let stamp;
  try {stamp = JSON.parse(sourceText(record.outputs.stampFile));} catch {fail('GEMINI_OWNER_ATTESTATION_MISSING');}
  if (JSON.stringify(stamp) !== JSON.stringify(record.stamp)) fail('GEMINI_OWNER_ATTESTATION_CHANGED');
  if (reverseGeminiMediaRuntime56(actual.runtime) !== record.parent.runtime ||
    reversePairs(actual.owner, record.recipes.owner, SELECTOR_IMPORT) !== record.parent.owner ||
    reversePairs(actual.unified, record.recipes.unified) !== record.parent.unified ||
    reversePairs(actual.operational, record.recipes.operational, SELECTOR_IMPORT) !== record.parent.operational ||
    reversePairs(actual.registeredBootstrap, record.recipes.registeredBootstrap) !== record.parent.registeredBootstrap ||
    reversePairs(actual.provision, record.recipes.provision) !== record.parent.provision ||
    sha(actual.runtime) !== stamp.runtimeSha256 || sha(actual.owner) !== stamp.ownerSha256 ||
    sha(actual.unified) !== stamp.unifiedSha256 || sha(actual.operational) !== stamp.operationalSha256 ||
    sha(actual.registeredBootstrap) !== stamp.registeredBootstrapSha256 || sha(actual.provision) !== stamp.provisionSha256) fail('GEMINI_OWNER_GENERATED_SCOPE_CHANGED');
  return Object.freeze({file: record.outputs.runtimeFile, runtimeFile: record.outputs.runtimeFile,
    sha256: stamp.runtimeSha256, candidateSha256: stamp.runtimeSha256, baseMode,
    originalOperatorVerified: true, productionEnabled: false, automaticReplayAllowed: false});
}

const buildEnvKey = key => key === 'CI' || key === 'NODE_ENV' || key.startsWith('JH_') || key.startsWith('RENDER_');
async function withBuildEnvironment(env, callback) {
  const keys = new Set([...Object.keys(process.env), ...Object.keys(env || {})].filter(buildEnvKey));
  const previous = new Map([...keys].map(key => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (env[key] === undefined) delete process.env[key]; else process.env[key] = String(env[key]);
    }
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

/** Preserve the complete existing audio -> optional camera -> optional peer
 * chain. Only these fixed original selector imports/names are admitted.
 */
async function buildAudioParent(root, env) {
  const audio = await import(pathToFileURL(path.join(root, 'ebiseo-audio-v05/audio-compose-current-host.mjs')).href);
  const built = await audio.buildCurrentAudioReleaseCandidate(root, env);
  const layer = audioLayer(env), known = AUDIO_PARENTS[layer];
  const expected = {runtimeFile: path.join(root, 'server-integration', known.runtime),
    ownerFile: path.join(root, 'deployment', 'owner-service-' + known.suffix + '.mjs'),
    unifiedFile: path.join(root, 'deployment', 'unified-service-' + known.suffix + '.mjs'),
    file: path.join(root, 'deployment', 'operational-service-' + known.suffix + '.mjs')};
  if (built.file !== expected.runtimeFile || built.entryFile !== expected.file ||
    built.candidateSha256 !== sha(sourceText(expected.runtimeFile))) fail('GEMINI_AUDIO_FINAL_BUILD_MISMATCH');
  if (layer === 'peer') {
    // Existing buildPeerRelease retains owner/unified metadata from its immediate
    // parent. Normalize ONLY its fixed, recomputed, original peer output paths.
    const previous = AUDIO_PARENTS[env.JH_KABISEO_CAMERA_ENABLE ? 'camera' : 'audio'];
    if (built.peerEnabled !== true || built.ownerFile !== path.join(root, 'deployment', 'owner-service-' + previous.suffix + '.mjs') ||
      built.unifiedFile !== path.join(root, 'deployment', 'unified-service-' + previous.suffix + '.mjs')) fail('GEMINI_PEER_PARENT_METADATA_CHANGED');
  } else if (built.ownerFile !== expected.ownerFile || built.unifiedFile !== expected.unifiedFile) fail('GEMINI_AUDIO_FINAL_BUILD_MISMATCH');
  const originalSelectorImport = 'import {' + known.selector + '} from "../' + known.module + '";';
  for (const file of [expected.ownerFile, expected.file]) {
    if (count(sourceText(file), originalSelectorImport) !== 1) fail('GEMINI_AUDIO_SELECTOR_IMPORT_CHANGED');
  }
  const selectors = await import(pathToFileURL(path.join(root, known.module)).href);
  const parentSelect = selectors[known.selector];
  if (typeof parentSelect !== 'function') fail('GEMINI_AUDIO_SELECTOR_REQUIRED');
  const selected = parentSelect(root, env);
  if (selected.file !== expected.runtimeFile || selected.sha256 !== built.candidateSha256) fail('GEMINI_AUDIO_FINAL_SELECTOR_CHANGED');
  return {base: {...built, ...expected, parentRuntimeSelector: known.selector}, parentSelect, audioLayer: layer};
}

/** Build-only API. The exact supplied CI/production gates go unchanged to the
 * original parent builders. This never imports an operational entry or listens.
 */
export async function buildGeminiMediaOwnerEntrypoint(root = ROOT, env = process.env, {baseMode} = {}) {
  checkedRoot(root);
  const checked = gate(env, baseMode);
  if (building) fail('GEMINI_CONCURRENT_BUILD_FORBIDDEN');
  building = true;
  try {
    return await withBuildEnvironment(env, async () => {
      let base, release, clean, parentSelect, selectedAudioLayer;
      if (checked.baseMode === 'durable') {
        clean = buildCleanRestartRelease56();
        release = await import(pathToFileURL(clean.file).href + '?gemini-parent=' + clean.sha256);
        base = release.buildDurableRoutedOperationalEntrypoint(root);
      } else if (checked.baseMode === 'audio') {
        const finalParent = await buildAudioParent(root, env);
        base = finalParent.base; parentSelect = finalParent.parentSelect; selectedAudioLayer = finalParent.audioLayer;
      } else if (checked.baseMode === 'pending-approval') base = await buildPendingApprovalOperatorEntrypoint56(root, env);
      else base = await buildStage25PendingOperatorEntrypoint56(root, env);
      const outputs = outputPaths(root, checked.baseMode), parent = snapshot(base);
      const record = {root, baseMode: checked.baseMode, features: checked.features, base, parent, release, clean, outputs,
        parentSelect, audioLayer: selectedAudioLayer};
      parentSelectors(record, root, env);
      const recipes = linkRecipes(base, outputs, checked.baseMode);
      const candidate = {runtime: patchGeminiMediaRuntime56(parent.runtime),
        owner: applyPairs(parent.owner, recipes.owner, SELECTOR_IMPORT),
        unified: applyPairs(parent.unified, recipes.unified),
        operational: applyPairs(parent.operational, recipes.operational, SELECTOR_IMPORT),
        registeredBootstrap: applyPairs(parent.registeredBootstrap, recipes.registeredBootstrap),
        provision: applyPairs(parent.provision, recipes.provision)};
      if (reverseGeminiMediaRuntime56(candidate.runtime) !== parent.runtime) fail('GEMINI_RUNTIME_REVERSE_SCOPE_CHANGED');
      const stamp = Object.freeze({schema: SCHEMA, baseMode: checked.baseMode, features: checked.features,
        audioLayer: selectedAudioLayer || null,
        parentRuntimeSha256: sha(parent.runtime), parentOwnerSha256: sha(parent.owner),
        parentUnifiedSha256: sha(parent.unified), parentOperationalSha256: sha(parent.operational),
        parentRegisteredBootstrapSha256: sha(parent.registeredBootstrap), parentProvisionSha256: sha(parent.provision),
        runtimeSha256: sha(candidate.runtime), ownerSha256: sha(candidate.owner),
        unifiedSha256: sha(candidate.unified), operationalSha256: sha(candidate.operational),
        registeredBootstrapSha256: sha(candidate.registeredBootstrap), provisionSha256: sha(candidate.provision),
        productionEnabled: false, automaticReplayAllowed: false});
      publish(outputs.runtimeFile, candidate.runtime); publish(outputs.ownerFile, candidate.owner);
      publish(outputs.unifiedFile, candidate.unified); publish(outputs.file, candidate.operational);
      publish(outputs.registeredBootstrapFile, candidate.registeredBootstrap); publish(outputs.provisionFile, candidate.provision);
      publish(outputs.stampFile, JSON.stringify(stamp, null, 2) + '\n');
      builtParents.delete(cacheKey(root, checked.baseMode));
      builtParents.set(cacheKey(root, checked.baseMode), {...record, recipes, stamp});
      const verified = selectGeminiMediaRuntime56(root, env, {baseMode: checked.baseMode});
      if (verified.sha256 !== stamp.runtimeSha256) fail('GEMINI_OWNER_OUTPUT_READBACK_CHANGED');
      return Object.freeze({...outputs, baseMode: checked.baseMode, stamp,
        candidateSha256: stamp.runtimeSha256, parentFile: base.runtimeFile,
        productionEnabled: false, automaticReplayAllowed: false, listenerStarted: false,
        originalOperatorPreserved: true, apkChanged: false});
    });
  } finally {building = false;}
}

/** Select with a separate explicit startup command; the original router and
 * package script are unchanged. Both features OFF delegates to that router.
 */
export async function main(env = process.env) {
  if (env !== process.env) fail('GEMINI_STARTUP_PROCESS_ENVIRONMENT_REQUIRED');
  const selected = features(env);
  if (!selected.analysis && !selected.generation) return originalPublishedMain();
  if (synthetic(env)) fail('GEMINI_PRODUCTION_MAIN_FORBIDS_CI');
  const checked = gate(env);
  assertPublishedHost(path.dirname(ROOT), ROOT);
  requirePcNodeVersion(process.versions.node);
  const built = await buildGeminiMediaOwnerEntrypoint(ROOT, env, {baseMode: checked.baseMode});
  selectGeminiMediaRuntime56(ROOT, env);
  const operating = await import(pathToFileURL(built.file).href + '?sha=' + built.stamp.operationalSha256);
  if (typeof operating.main !== 'function') fail('GEMINI_ORIGINAL_MAIN_MISSING');
  return operating.main(env);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    process.stderr.write((typeof error?.code === 'string' && /^[A-Z_]{3,96}$/.test(error.code) ? error.code : 'GEMINI_OWNER_STARTUP_FAILED') + '\n');
    process.exitCode = 1;
  });
}
