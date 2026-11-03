/** Resolve verified sibling skills in the installed plugin; never download. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {contextWithJH, parseRequest} from './context.mjs';

export const DEPENDENCY_PINS = Object.freeze([
  ['jh-personal-dialogue/scripts/runtime.js', '366a0be98cb8560aaf75359dcf466047a0b58d1bc5e989bf79a783c58a770d3e'],
  ['jh-personal-dialogue/scripts/context-adapter.js', '82d3d0de9f66a848df8cd38f0e4e04d9cbc376ba18493ab5d632f57f2fe313bd'],
  ['jh-personalization/scripts/runtime.js', 'ad7835ccfeca98486d8a1478e5a60996cb1d61aaebad094229e2d1538821d0b9'],
  ['jh-decision-learning/scripts/runtime.js', '8bdd50f5925fe01fdece92c1bf23ed8b9b92bd5a04f0f80126b95f630233f5e0'],
  ['jh-decision-learning/scripts/personalization-adapter.js', '505ee5790d89003eec671a215d30fec06313531d1fd2a51bdce529ec08c6f28a'],
].map(item => Object.freeze(item)));

export async function installedAPIs(skillsRoot = new URL('../../', import.meta.url)) {
  if (!(skillsRoot instanceof URL) || skillsRoot.protocol !== 'file:' || !skillsRoot.pathname.endsWith('/')) {
    const error = new Error('EBISEO_SKILLS_ROOT_INVALID'); error.code = error.message; throw error;
  }
  const paths = DEPENDENCY_PINS.map(([path]) => new URL(path, skillsRoot));
  for (let index = 0; index < paths.length; index++) {
    const hash = createHash('sha256').update(await readFile(paths[index])).digest('hex');
    if (hash !== DEPENDENCY_PINS[index][1]) {
      const error = new Error('EBISEO_DEPENDENCY_CHANGED'); error.code = error.message; throw error;
    }
  }
  for (const path of paths) await import(path.href);
  return {dialogue: globalThis.JHPersonalDialogue, dialogueBridge: globalThis.JHPersonalDialogueBridge,
    personal: globalThis.JHPersonalization, decision: globalThis.JHDecisionLearning,
    decisionContext: globalThis.JHDecisionContext};
}

export async function contextInstalled(states, input, skillsRoot) {
  // No disk reads or API loading for quotes, negations, explanations, or no call.
  if (!parseRequest(input).active) return contextWithJH(undefined, input, undefined);
  return contextWithJH(states, input, await installedAPIs(skillsRoot));
}
