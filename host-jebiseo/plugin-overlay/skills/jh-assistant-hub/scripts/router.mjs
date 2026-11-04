import { readFileSync } from 'node:fs';

export const catalog = JSON.parse(readFileSync(new URL('../references/capabilities.json', import.meta.url), 'utf8'));
const entries = new Map(catalog.entries.map(entry => [entry.id, entry]));
const kinds = new Set(['task','develop','explain_feature','continue','select','change','mode','stop','inbox','save_routine','use_routine','feedback']);
const modes = new Set(['explain','assist','execute']);
const continuations = new Set(['continue','select','change','mode','stop']);
const check = (condition, code) => { if (!condition) throw new Error(code); };
const ids = value => { check(Array.isArray(value) && value.length <= 16 && value.every(x => typeof x === 'string' && entries.has(x)), 'INVALID_CAPABILITY_IDS'); return [...new Set(value)]; };

/** Validate the host's semantic interpretation. This function does NOT interpret natural language,
 * inspect a phone, grant permission, or dispatch tools. Availability is a current host observation. */
export function planRoute(input) {
  check(input && typeof input === 'object', 'INVALID_INPUT');
  const { intent, available, activeTask = null, threadId, sourceRef } = input;
  check(intent && kinds.has(intent.kind), 'INVALID_INTENT');
  check(typeof sourceRef === 'string' && sourceRef.length > 0 && sourceRef.length <= 1024, 'SOURCE_REQUIRED');
  check(typeof threadId === 'string' && threadId.length > 0 && threadId.length <= 256, 'THREAD_REQUIRED');
  check(available && Array.isArray(available.skills) && Array.isArray(available.capabilities), 'AVAILABILITY_REQUIRED');
  check(available.skills.every(x => typeof x === 'string') && available.capabilities.every(x => typeof x === 'string'), 'INVALID_AVAILABILITY');
  const excluded = ids(intent.excluded ?? []);
  const topics = ids(intent.topics ?? []);
  const helpersRequested = ids(intent.helpers ?? []);
  if (intent.primary != null) check(entries.has(intent.primary), 'UNKNOWN_PRIMARY');
  if (intent.explicitAssistant != null) check(entries.has(intent.explicitAssistant), 'UNKNOWN_ASSISTANT');
  if (intent.mode != null) check(modes.has(intent.mode), 'INVALID_MODE');
  const result = {
    schema:'jh.assistant-route.v1', sourceRef, action:'route', lead:'general', helpers:[],
    mode:intent.mode ?? 'explain', taskId:null, requiredSkills:[], unavailableCapabilities:[],
    badge:null, participantBadges:[], authorizesExecution:false, dispatchesTools:false, requiresResultInspection:false,
    changesPersistentState:false, semanticInterpreter:'current_conversation_host'
  };
  if (intent.kind === 'explain_feature') return { ...result, action:'explain' };
  if (intent.kind === 'inbox') return { ...result, action:'list_tasks' };
  if (intent.kind === 'save_routine') {
    if (!activeTask || activeTask.threadId !== threadId) return { ...result, action:'clarify', reason:'CURRENT_TASK_REQUIRED' };
    return { ...result, action:'review_routine_save', taskId:activeTask.id };
  }
  if (intent.kind === 'use_routine') return { ...result, action:'plan_routine' };
  if (intent.kind === 'feedback') {
    const ready = available.skills.includes('jh-personal-dialogue');
    const prefix = `🏴‍☠️ ${entries.get('personal').label}:`;
    return { ...result, action:'route_feedback', lead:'personal', ready,
      badge:ready ? prefix : null, participantBadges:ready ? [{id:'personal',prefix}] : [],
      requiredSkills:ready ? ['jh-personal-dialogue'] : [], unavailableCapabilities:ready ? [] : ['personal'] };
  }
  if (continuations.has(intent.kind)) {
    if (!activeTask || activeTask.threadId !== threadId) return { ...result, action:'clarify', reason:'CURRENT_TASK_REQUIRED' };
    check(entries.has(activeTask.lead) && modes.has(activeTask.mode), 'INVALID_ACTIVE_TASK');
    result.taskId = activeTask.id;
    result.lead = activeTask.lead;
    result.helpers = ids([...new Set([...(activeTask.helpers ?? []),...helpersRequested])]).filter(x => x !== result.lead && !excluded.includes(x));
    result.mode = intent.mode ?? activeTask.mode;
    if (['canceled','completed'].includes(activeTask.status)) return { ...result, action:'clarify', reason:'TASK_CLOSED' };
    const effects = Object.values(activeTask.effects ?? {});
    result.requiresResultInspection = effects.some(x => ['pending','unknown'].includes(x.status));
    result.action = {continue:'continue',select:'select',change:'change_conditions',mode:'set_mode',stop:'pause'}[intent.kind];
    if (intent.kind === 'select' && (!activeTask.menu || activeTask.menu.id !== intent.menuId || activeTask.menu.threadId !== threadId)) return {...result, action:'clarify', reason:'CURRENT_MENU_REQUIRED'};
    if (intent.kind !== 'stop' && excluded.includes(result.lead)) return {...result, action:'clarify', reason:'ACTIVE_LEAD_EXCLUDED'};
  } else if (intent.kind === 'develop') {
    result.lead = 'development';
    result.mode = intent.mode ?? 'execute';
    result.helpers = helpersRequested.filter(x => ['open_source','personal','gemini'].includes(x) && !excluded.includes(x));
  } else {
    const preferred = intent.explicitAssistant ?? intent.primary;
    if (preferred && excluded.includes(preferred)) return {...result, action:'clarify', reason:'ASSISTANT_EXCLUDED'};
    const candidates = topics.filter(x => !excluded.includes(x));
    if (!preferred && candidates.length > 1) return {...result, action:'clarify', reason:'PRIMARY_GOAL_REQUIRED'};
    result.lead = preferred ?? candidates[0] ?? 'general';
    result.helpers = helpersRequested.filter(x => x !== result.lead && !excluded.includes(x));
    result.mode = intent.mode ?? (result.lead === 'guide' ? 'explain' : 'assist');
  }
  for (const id of [result.lead, ...result.helpers]) {
    const entry = entries.get(id);
    if (entry.skill) {
      if (!available.skills.includes(entry.skill)) result.unavailableCapabilities.push(id);
      else result.requiredSkills.push(entry.skill);
    }
    if (entry.requiresCapability && !available.capabilities.includes(entry.requiresCapability)) result.unavailableCapabilities.push(id);
  }
  result.requiredSkills = [...new Set(result.requiredSkills)];
  result.unavailableCapabilities = [...new Set(result.unavailableCapabilities)];
  result.ready = !result.unavailableCapabilities.includes(result.lead);
  // Prefix candidates only: the host displays each prefix when that assistant actually contributes.
  result.participantBadges = [result.lead,...result.helpers]
    .filter(id => id !== 'general' && !result.unavailableCapabilities.includes(id))
    .map(id => ({id,prefix:`🏴‍☠️ ${entries.get(id).label}:`}));
  result.badge = result.participantBadges.find(item => item.id === result.lead)?.prefix ?? null;
  return result;
}
