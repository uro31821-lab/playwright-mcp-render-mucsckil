import {selectAudioCandidateRuntime} from '../ebiseo-audio-v05/audio-current-selector.mjs';
import {selectAttestedCameraRuntime} from './camera-compose-audio-host.mjs';

export function selectCameraCandidateRuntime(root,env=process.env){
  return selectAttestedCameraRuntime(root,selectAudioCandidateRuntime(root,env));
}
