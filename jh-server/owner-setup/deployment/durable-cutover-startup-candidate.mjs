/** Candidate only: require the first-activation receipt in the existing owner startup. */
import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {buildOwnerBoundDurableCandidate} from './durable-owner-startup-candidate.mjs';
const from="import {installOwnerBoundDurableCircuit} from './durable-owner-storage.mjs';";
const to="import {installCutoverReadyCircuit as installOwnerBoundDurableCircuit} from './durable-cutover.mjs';";
export function buildCutoverStartupCandidate(root){
 const prior=buildOwnerBoundDurableCandidate(root),source=readFileSync(prior.file,'utf8');
 if(source.split(from).length!==2||source.includes(to))throw Error('CUTOVER_STARTUP_ANCHOR');
 const candidate=source.replace(from,to);
 if(candidate.replace(to,from)!==source)throw Error('CUTOVER_STARTUP_SCOPE');
 const file=path.join(root,'deployment/owner-service-cutover-candidate.mjs');
 writeFileSync(file,candidate,{mode:0o600});
 if(readFileSync(file,'utf8')!==candidate)throw Error('CUTOVER_STARTUP_READBACK');
 return {file,productionEnabled:false,exactAdditionalEdits:1};
}
