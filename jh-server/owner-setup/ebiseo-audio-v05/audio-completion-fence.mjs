/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {plainRecord,fail} from './audio-contract.mjs';

const isAudioWrite = job => job?.type==='ebiseo_audio_command'&&
  job?.mcpToolName==='life_android_audio_command'&&job?.secureRequestedEffect==='WRITE_REVERSIBLE';
const deny = code => Object.freeze({allowed:false,code,httpStatus:409});
function outcome(result) {
  if(!plainRecord(result)||result.protocol!=='ebiseo_audio_v1'||typeof result.ok!=='boolean'||
     typeof result.accepted!=='boolean'||result.automaticReplayAllowed===true)return 'INVALID';
  if(result.outcomeUnknown===true||result.mutationOutcome==='UNKNOWN'||
     result.code==='AUDIO_RESULT_UNCONFIRMED'||result.code==='AUDIO_HOST_RESULT_UNCONFIRMED'||
     (Object.hasOwn(result,'preferencesSaved')&&result.preferencesSaved===null)||
     (Object.hasOwn(result,'stateChanged')&&result.stateChanged===null))return 'UNKNOWN';
  if(result.outcomeUnknown===false||
     (typeof result.preferencesSaved==='boolean'&&typeof result.stateChanged==='boolean'))return 'KNOWN';
  return 'UNKNOWN';
}
export function preserveUnconfirmedAudioOutcomes(base) {
  for(const name of ['capture','beforeDispatch','acceptedCompletion','discardTransient','close',
    'uncertainEffectsForMaintenance'])if(typeof base?.[name]!=='function')fail('AUDIO_DURABLE_HOOKS_REQUIRED');
  let admitted=new WeakMap(),closed=false;
  return Object.freeze({
    capture(job,payload) { admitted.delete(job);return base.capture(job,payload); },
    discardTransient(job) { admitted.delete(job);return base.discardTransient(job); },
    beforeDispatch(job) {
      const result=base.beforeDispatch(job);
      if(result?.allowed===true&&isAudioWrite(job))admitted.set(job,{session:job.secureSessionId,
        device:job.targetDeviceId,type:job.type});
      return result;
    },
    acceptedCompletion(job,result) {
      if(!isAudioWrite(job))return base.acceptedCompletion(job,result);
      const binding=admitted.get(job);
      if(closed||!binding||typeof binding.session!=='string'||!binding.session||
         binding.session!==job.secureSessionId||binding.device!==job.targetDeviceId||binding.type!==job.type||
         !['in_progress','complete'].includes(job.status))return deny('AUDIO_COMPLETION_DISPATCH_BINDING_REQUIRED');
      const status=outcome(result);
      if(status==='INVALID')return deny('AUDIO_COMPLETION_SCHEMA_INVALID');
      if(status==='UNKNOWN')return Object.freeze({allowed:true,audioOutcomeUnknown:true,
        journalUncertaintyPreserved:true,taskSuccessVerified:false,automaticReplayAllowed:false});
      return base.acceptedCompletion(job,result);
    },
    uncertainEffectsForMaintenance() { return base.uncertainEffectsForMaintenance(); },
    close() { if(closed)return;closed=true;admitted=new WeakMap();base.close(); }
  });
}
