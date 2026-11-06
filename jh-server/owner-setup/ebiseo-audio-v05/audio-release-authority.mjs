/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {createHash} from 'node:crypto';
import {AUDIO_ROUTES,AUDIO_CONTRACT_SHA256,LEGACY_CATALOG_PIN,plainRecord,fail} from './audio-contract.mjs';
import {BASE_CATALOG_DIGEST,AUDIO_EXTENSION_ID,AUDIO_EXTENSION_VERSION,AUDIO_EXTENSION_DIGEST,
  AUDIO_EXTENSION_MANIFEST,AUDIO_PROTOCOL} from './audio-extension-catalog.mjs';

const authorities=new WeakSet();
const BASE_TOOLS=Object.freeze(['life_android_action_approval_request','life_android_action_approval_status',
  'life_android_capture_work_window','life_android_computer_inspect','life_android_computer_prepare',
  'life_android_execute_computer_action','life_android_screen_consent_request',
  'life_android_screen_consent_status','life_android_secure_status']);
export function canonical(value) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isSafeInteger(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(!plainRecord(value))fail('AUDIO_RELEASE_MANIFEST_INVALID');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function frozen(value) {
  return !value||typeof value!=='object'||(Object.isFrozen(value)&&Object.values(value).every(frozen));
}
function verifyManifest() {
  const m=AUDIO_EXTENSION_MANIFEST;
  if(!frozen(m)||createHash('sha256').update(canonical(m),'utf8').digest('hex')!==AUDIO_EXTENSION_DIGEST||
     m.schema!=='jh.audio.catalog-extension/1'||m.extensionId!==AUDIO_EXTENSION_ID||
     m.version!==AUDIO_EXTENSION_VERSION||m.protocol!==AUDIO_PROTOCOL||
     BASE_CATALOG_DIGEST!==LEGACY_CATALOG_PIN||m.base?.catalogDigest!==BASE_CATALOG_DIGEST||
     m.base?.bridgeVersion!==56||m.base?.androidBinderSha256!=='cecd15e6a254ad6d5c023cb0efb6c627a65b41ec0b8dc2c30611eafbfa38e4bf'||
     m.base?.serverRuntimeSha256!=='169d3f17297c9cc2ca298123a7f06ac161ce62a35c84c9e0a8277aa73d65bf21'||
     canonical(m.base?.secureToolNames)!==canonical(BASE_TOOLS)||
     canonical(m.routes)!==canonical(AUDIO_ROUTES)||m.audioContractSha256!==AUDIO_CONTRACT_SHA256||
     canonical(m.requirements)!==canonical({automaticReplay:false,
       capabilityProof:'secure_device_status_authenticated_completion',
       capabilityScope:['device','session','command','task','probe_nonce'],
       reconnectGrantsActions:false,signedPayloadField:'audioExtension'}))
    fail('AUDIO_RELEASE_MANIFEST_MISMATCH');
}
export function createPinnedAudioReleaseAuthority() {
  verifyManifest();
  const result=Object.freeze({
    requireAudioRoutes(request) {
      verifyManifest();
      if(!plainRecord(request)||canonical(request.routes)!==canonical(AUDIO_ROUTES)||
         request.contractSha256!==AUDIO_CONTRACT_SHA256)fail('AUDIO_RELEASE_CONTRACT_MISMATCH');
      return Object.freeze({releaseId:'ebiseo-audio-extension-'+AUDIO_EXTENSION_VERSION+'-'+AUDIO_EXTENSION_DIGEST.slice(0,16),
        baseCatalogDigest:BASE_CATALOG_DIGEST,extensionDigest:AUDIO_EXTENSION_DIGEST,
        androidExtensionDigest:AUDIO_EXTENSION_DIGEST,audioContractSha256:AUDIO_CONTRACT_SHA256,
        protocol:AUDIO_PROTOCOL});
    }
  });
  authorities.add(result);return result;
}
export const isPinnedAudioReleaseAuthority=value=>authorities.has(value);
export const audioExtensionEnvelope=()=>Object.freeze({id:AUDIO_EXTENSION_ID,version:AUDIO_EXTENSION_VERSION,digest:AUDIO_EXTENSION_DIGEST});
export function exactAudioExtension(value) {
  return plainRecord(value)&&Object.keys(value).sort().join('|')==='digest|id|version'&&
    value.id===AUDIO_EXTENSION_ID&&value.version===AUDIO_EXTENSION_VERSION&&value.digest===AUDIO_EXTENSION_DIGEST;
}
export function exactAudioCapability(value) {
  return plainRecord(value)&&Object.keys(value).sort().join('|')==='digest|id|protocol|version'&&
    value.id===AUDIO_EXTENSION_ID&&value.version===AUDIO_EXTENSION_VERSION&&
    value.digest===AUDIO_EXTENSION_DIGEST&&value.protocol===AUDIO_PROTOCOL;
}
