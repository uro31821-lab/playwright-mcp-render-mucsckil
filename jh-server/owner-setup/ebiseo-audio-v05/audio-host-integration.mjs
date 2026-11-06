/* Copyright 2026 JH Equalizer contributors. SPDX-License-Identifier: Apache-2.0 */
import {createPinnedAudioReleaseAuthority} from './audio-release-authority.mjs';
import {createAudioCapabilityAuthority} from './audio-capability-authority.mjs';
import {createAudioDurableClassifier} from './audio-durable-policy.mjs';
import {registerAudioTools} from './audio-host-adapter.mjs';
import {preserveUnconfirmedAudioOutcomes} from './audio-completion-fence.mjs';
import {fail} from './audio-contract.mjs';

export function createAudioHostIntegration({getCatalogDigest,captureAdmission,currentBinding,secureCall56,now=Date.now}={}) {
  const releaseAuthority=createPinnedAudioReleaseAuthority();
  const ports={releaseAuthority,getCatalogDigest};
  const capability=createAudioCapabilityAuthority({...ports,captureAdmission,currentBinding,now});
  const classify=createAudioDurableClassifier(ports);
  let registered=false,closed=false;
  return Object.freeze({
    register({z,registerOAuthTool}) {
      if(closed)fail('AUDIO_HOST_CLOSED');registered=true;
      return registerAudioTools({z,registerOAuthTool,secureCall56,...ports,capabilityAuthority:capability});
    },
    classify,
    beforeMk:(type,payload,deviceId)=>capability.beforeMk(type,payload,deviceId),
    beforeDispatch:job=>capability.beforeDispatch(job),
    wrapDurableHooks(original) {
      const base=preserveUnconfirmedAudioOutcomes(original);
      return Object.freeze({
        capture(job,payload) {base.capture(job,payload);capability.capture(job,payload);},
        discardTransient(job) {capability.discard(job);return base.discardTransient(job);},
        beforeDispatch(job) {
          const guard=capability.beforeDispatch(job);if(!guard.allowed)return guard;
          const allowed=base.beforeDispatch(job);if(!allowed?.allowed)return allowed;
          try{capability.didDispatch(job);return allowed;}
          catch(e){return {allowed:false,code:e?.code||'AUDIO_CAPABILITY_DISPATCH_REJECTED',httpStatus:409};}
        },
        acceptedCompletion(job,result) {
          const accepted=base.acceptedCompletion(job,result);
          if(accepted?.allowed===true)try{capability.acceptedAuthenticatedCompletion(job,result);}catch{}
          return accepted;
        },
        uncertainEffectsForMaintenance:()=>base.uncertainEffectsForMaintenance(),
        close(){if(closed)return;closed=true;capability.close();base.close();}
      });
    }
  });
}
