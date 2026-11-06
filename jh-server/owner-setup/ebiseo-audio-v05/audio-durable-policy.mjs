/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {AUDIO_ROUTES,normalizeAudioCommand,isReadCommand,only,makeReleaseGuard} from './audio-contract.mjs';
import {exactAudioExtension} from './audio-release-authority.mjs';

const deny = code => Object.freeze({kind:'DENY',code});
const payloadFields = Object.freeze(['audio','audioExtension','taskId','effect','action','index','viewportWidth',
  'viewportHeight','scrollX','scrollY','waitMs','dataClass','maxActionsInCall','mcpToolName',
  'taskDigest','targetDeviceDigest','secureRequestedEffect','secureInvocationExpiresAt',
  'containsCredential','commandId']);
function hostJobRecord(value) {
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==null&&proto!==Object.prototype)return false;
  return Reflect.ownKeys(value).every(k=>{
    if(typeof k!=='string')return false;
    const d=Object.getOwnPropertyDescriptor(value,k);
    return Object.hasOwn(d,'value')&&(d.enumerable===true||
      (k==='trustBindingId'&&d.enumerable===false&&typeof d.value==='string'&&d.value.length>0));
  });
}
export function createAudioDurableClassifier({releaseAuthority,getCatalogDigest}={}) {
  const assertRelease=makeReleaseGuard({releaseAuthority,getCatalogDigest});
  return function classifyAudioJob(job,payload) {
    if(!hostJobRecord(job))return null;
    const audioSignal=AUDIO_ROUTES.some(x=>x.jobType===job.type||x.tool===job.mcpToolName)||
      Object.hasOwn(job,'audioExtension')||Object.hasOwn(payload||{},'audioExtension');
    if(!audioSignal)return null;
    try {
      assertRelease();
      only(payload,payloadFields);
      const route=AUDIO_ROUTES.find(x=>x.jobType===job.type);
      if(!route||!exactAudioExtension(payload.audioExtension)||!exactAudioExtension(job.audioExtension)||
         job.mcpToolName!==route.tool||job.secureRequestedEffect!==route.effect||
         payload.mcpToolName!==route.tool||payload.secureRequestedEffect!==route.effect)
        return deny('AUDIO_DURABLE_ROUTE_MISMATCH');
      if(payload.containsCredential!==false||payload.dataClass!=='NONE'||
         typeof payload.taskDigest!=='string'||!/^[a-f0-9]{64}$/.test(payload.taskDigest)||
         payload.taskId!==payload.taskDigest||typeof payload.targetDeviceDigest!=='string'||
         !/^[a-f0-9]{64}$/.test(payload.targetDeviceDigest)||
         !Number.isSafeInteger(payload.secureInvocationExpiresAt)||payload.secureInvocationExpiresAt<=0||
         typeof payload.commandId!=='string'||!/^[a-f0-9]{32}$/.test(payload.commandId))
        return deny('AUDIO_DURABLE_ENVELOPE_INVALID');
      if(payload.action!==''||payload.effect!=='READ_ONLY'||payload.maxActionsInCall!==20||
         ['index','viewportWidth','viewportHeight','scrollX','scrollY','waitMs'].some(k=>payload[k]!==0))
        return deny('AUDIO_DURABLE_UI_FIELDS_FORBIDDEN');
      only(payload.audio,['schemaVersion','command']);
      if(payload.audio.schemaVersion!==1)return deny('AUDIO_DURABLE_SCHEMA_INVALID');
      const command=normalizeAudioCommand(payload.audio.command),readOnly=isReadCommand(command);
      if(readOnly!==(route.effect==='READ_ONLY'))return deny('AUDIO_DURABLE_EFFECT_MISMATCH');
      if(readOnly)return Object.freeze({kind:'READ'});
      return Object.freeze({kind:'JOURNAL',identityPayload:{audio:{schemaVersion:1,command}},
        approvalGranted:false,screenConsentGranted:false});
    } catch(e) {
      return deny(/^AUDIO_[A-Z_]+$/.test(e?.code||'')?e.code:'AUDIO_DURABLE_REJECTED');
    }
  };
}
