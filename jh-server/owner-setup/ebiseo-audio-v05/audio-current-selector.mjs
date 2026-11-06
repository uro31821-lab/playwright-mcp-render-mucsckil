/* Original parent attestation always runs before the supplementary audio selector. */
import {selectStage25PendingOperatorRuntime56} from '../jh168-mobile-unification/stage25-live-operator-followup-entry.mjs';
import {selectAttestedAudioRuntime} from './audio-compose-current-host.mjs';
export function selectAudioCandidateRuntime(root,env=process.env){
  return selectAttestedAudioRuntime(root,selectStage25PendingOperatorRuntime56(root,env));
}
