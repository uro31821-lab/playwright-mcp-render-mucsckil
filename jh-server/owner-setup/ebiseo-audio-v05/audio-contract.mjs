/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {createHash} from 'node:crypto';
import {isPinnedAudioReleaseAuthority} from './audio-release-authority.mjs';

export const LEGACY_CATALOG_PIN = 'a777e1a88a0b7633ba983ca3054d2eb28f3b9c41596e0a46b93597d478a42ca1';
export const PRESETS = Object.freeze(['genre-rock','genre-ballad','genre-edm','genre-jazz',
  'genre-classical','genre-trot','genre-pop','genre-hiphop','vocals','live','deepbass',
  'energy','instruments','night','speech','flat','photo']);
export const ENVIRONMENTS = Object.freeze(['preset','stereo','wide','surround','system']);
export const AUDIO_ROUTES = Object.freeze([
  Object.freeze({tool:'life_android_audio_status',jobType:'ebiseo_audio_status',effect:'READ_ONLY'}),
  Object.freeze({tool:'life_android_audio_command',jobType:'ebiseo_audio_command',effect:'WRITE_REVERSIBLE'})
]);
export const AUDIO_ROUTE_CONTRACT = Object.freeze({version:2,transport:'structured-command-only',
  routes:AUDIO_ROUTES,presets:PRESETS,environments:ENVIRONMENTS,
  actions:Object.freeze(['start','stop','automatic','query_track','query_status','preset','environment','enabled'])});
export const AUDIO_CONTRACT_SHA256 = createHash('sha256')
  .update(JSON.stringify(AUDIO_ROUTE_CONTRACT),'utf8').digest('hex');

export function fail(code) { throw Object.assign(new Error(code),{code}); }
export function plainRecord(value) {
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&proto!==Object.prototype)return false;
  return Reflect.ownKeys(value).every(k=>typeof k==='string'&&
    Object.getOwnPropertyDescriptor(value,k)?.enumerable===true&&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'));
}
export function only(value,names) {
  if(!plainRecord(value)||Object.keys(value).some(k=>!names.includes(k)))fail('AUDIO_UNEXPECTED_FIELD');
}
export function normalizeAudioCommand(value) {
  if(!plainRecord(value)||typeof value.action!=='string')fail('AUDIO_COMMAND_INVALID');
  let command;
  switch(value.action) {
    case 'start': case 'stop':
      only(value,['action']);command={action:value.action};break;
    case 'automatic':
      only(value,['action','target']);
      if(Object.hasOwn(value,'target')&&!['configured_source','youtube_music'].includes(value.target))
        fail('AUDIO_TARGET_INVALID');
      command={action:'automatic',target:value.target??'configured_source'};break;
    case 'query_track': case 'query_status':
      only(value,['action']);command={action:value.action};break;
    case 'preset':
      only(value,['action','preset','scope']);
      if(!PRESETS.includes(value.preset))fail('AUDIO_PRESET_INVALID');
      if(Object.hasOwn(value,'scope')&&!['current_item','locked'].includes(value.scope))
        fail('AUDIO_SCOPE_INVALID');
      command={action:'preset',preset:value.preset,scope:value.scope??'current_item'};break;
    case 'environment':
      only(value,['action','environment']);
      if(!ENVIRONMENTS.includes(value.environment))fail('AUDIO_ENVIRONMENT_INVALID');
      command={action:'environment',environment:value.environment};break;
    case 'enabled':
      only(value,['action','enabled']);
      if(typeof value.enabled!=='boolean')fail('AUDIO_BOOLEAN_REQUIRED');
      command={action:'enabled',enabled:value.enabled};break;
    default:fail('AUDIO_ACTION_UNSUPPORTED');
  }
  return Object.freeze(command);
}
export const isReadCommand = command => ['query_track','query_status'].includes(command.action);

export function makeAudioSchemas(z) {
  if(!z||typeof z.object!=='function'||typeof z.discriminatedUnion!=='function')fail('AUDIO_ZOD_REQUIRED');
  const command=z.discriminatedUnion('action',[
    z.object({action:z.literal('start')}).strict(),
    z.object({action:z.literal('stop')}).strict(),
    z.object({action:z.literal('automatic'),target:z.enum(['configured_source','youtube_music']).optional()}).strict(),
    z.object({action:z.literal('preset'),preset:z.enum(PRESETS),scope:z.enum(['current_item','locked']).optional()}).strict(),
    z.object({action:z.literal('environment'),environment:z.enum(ENVIRONMENTS)}).strict(),
    z.object({action:z.literal('enabled'),enabled:z.boolean()}).strict()
  ]);
  const common={device_id:z.string().min(1).max(160).optional(),task_digest:z.string().regex(/^[a-f0-9]{64}$/)};
  return Object.freeze({status:{...common,query:z.enum(['track','status']).optional()},
    command:{...common,command}});
}

export function makeReleaseGuard({releaseAuthority,getCatalogDigest}={}) {
  if(!isPinnedAudioReleaseAuthority(releaseAuthority)||typeof getCatalogDigest!=='function')
    fail('AUDIO_RELEASE_AUTHORITY_REQUIRED');
  let first=null;
  return function assertCurrentRelease() {
    const actual=getCatalogDigest();
    if(actual!==LEGACY_CATALOG_PIN)fail('AUDIO_BASE_CATALOG_MISMATCH');
    const release=releaseAuthority.requireAudioRoutes({routes:AUDIO_ROUTES,contractSha256:AUDIO_CONTRACT_SHA256});
    if(!plainRecord(release)||release.baseCatalogDigest!==actual||
       release.androidExtensionDigest!==release.extensionDigest||
       !/^[a-f0-9]{64}$/.test(release.extensionDigest)||release.extensionDigest===actual||
       release.audioContractSha256!==AUDIO_CONTRACT_SHA256||
       typeof release.releaseId!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(release.releaseId))
      fail('AUDIO_RELEASE_BINDING_MISMATCH');
    const binding=Object.freeze({releaseId:release.releaseId,baseCatalogDigest:actual,extensionDigest:release.extensionDigest});
    if(first&&(first.releaseId!==binding.releaseId||first.extensionDigest!==binding.extensionDigest))
      fail('AUDIO_RELEASE_CHANGED_RESTART_REQUIRED');
    first??=binding;
    return first;
  };
}
