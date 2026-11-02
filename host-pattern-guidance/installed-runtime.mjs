/** Load only the already installed, hash-pinned JH dependencies. No download. */
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {check} from './engine.mjs';import {reviewWithJH,deliveryTransition} from './host-adapter.mjs';
const pins=[['jh-personalization/scripts/runtime.js','ad7835ccfeca98486d8a1478e5a60996cb1d61aaebad094229e2d1538821d0b9'],['jh-decision-learning/scripts/runtime.js','8bdd50f5925fe01fdece92c1bf23ed8b9b92bd5a04f0f80126b95f630233f5e0'],['jh-decision-learning/scripts/personalization-adapter.js','505ee5790d89003eec671a215d30fec06313531d1fd2a51bdce529ec08c6f28a'],['jh-proactive-research/scripts/runtime.js','0d1d98c50e2ef0f7d04ab7252369b39dd6f6bf339576f5a70f74018fdb80797e']];
export async function installedAPIs(skillsRoot=new URL('../../',import.meta.url)){
 const paths=pins.map(([path])=>new URL(path,skillsRoot));for(let i=0;i<paths.length;i++)check(createHash('sha256').update(await readFile(paths[i])).digest('hex')===pins[i][1],'PATTERN_DEPENDENCY_CHANGED');
 for(const path of paths)await import(path.href);
 return {personal:globalThis.JHPersonalization,decision:globalThis.JHDecisionLearning,research:globalThis.JHProactiveResearch,decisionContext:globalThis.JHDecisionContext};
}
export async function reviewInstalled(states,input,root){return reviewWithJH(states,input,await installedAPIs(root));}
export async function deliveryInstalled(states,input,root){return deliveryTransition(states,input,await installedAPIs(root));}
