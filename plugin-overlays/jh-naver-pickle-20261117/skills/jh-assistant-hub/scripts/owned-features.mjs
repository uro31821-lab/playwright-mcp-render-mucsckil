import { contributionShows } from './routing-contract.mjs';
// Request-scoped responsibilities on the existing route, never an executor or ledger.
const definitions = {
  result_readback: {owner:'current', helpers:[], contract:'references/distributed-features.md'},
  task_handoff: {owner:'assistant_management', helpers:[], contract:'references/stored-workflow.md'},
  progress_check: {owner:'preparation', helpers:[], contract:'../jh-junbibiseo/SKILL.md'},
  preference_context: {owner:'personal', helpers:[], contract:'../jh-ebiseo-assist/SKILL.md'},
  procedure_support: {owner:'guide', helpers:[], contract:'../jh-seolbiseo/SKILL.md'},
  improvement: {owner:'suggestion', helpers:['personal','preparation'], contract:'../jh-jeanbiseo/SKILL.md'},
  experience_reviews: {owner:'video', helpers:[], contract:'references/distributed-features.md#experience-reviews'},
  place_context: {owner:'travel', helpers:[], contract:'references/distributed-features.md#place-context'},
  reservation_prep: {owner:'reservation', helpers:[], contract:'../jh-yeyakbiseo/references/default-workflow.md'},
  purchase_handoff: {owner:'shopping', helpers:[], contract:'../jh-shoppingbiseo/references/precheckout.md'},
  execution_path: {owner:'current', helpers:[], contract:'references/distributed-features.md#execution-path'}
};
const liveKinds = new Set(['task','continue','select','change','mode']);
const fail = code => {throw new Error(code);};
const text = value => typeof value === 'string' && value.trim().length > 0
  && value.length <= 1024 && !/[\u0000-\u001f]/u.test(value);

function currentNeeds(input, route) {
  const supplied = input.intent.featureNeeds ?? [];
  if (!Array.isArray(supplied) || supplied.length > Object.keys(definitions).length)
    fail('INVALID_FEATURE_NEEDS');
  const seen = new Set();
  const needs = supplied.map(need => {
    if (!need || typeof need !== 'object' || Array.isArray(need)
        || Object.keys(need).some(key => !['id','sourceRef','reason'].includes(key))
        || !Object.hasOwn(definitions, need.id) || seen.has(need.id)
        || need.sourceRef !== input.sourceRef || !text(need.reason)) fail('INVALID_FEATURE_NEED');
    seen.add(need.id);
    return {...need, basis:'current_host_interpretation'};
  });
  if (route.requiresResultInspection && !seen.has('result_readback')) {
    needs.unshift({id:'result_readback',sourceRef:input.sourceRef,
      reason:'UNRESOLVED_EXTERNAL_RESULT',basis:'existing_pending_effects'});
  }
  return needs;
}

/** Host interprets the current need; fixed ownership prevents caller-selected
 * owners, gated assistants or background work. Existing workflow and four-role
 * contracts still own transitions, exclusions, availability and output badges. */
export function routeOwnedFeatures(input, route, catalog, finalize) {
  // STOP wins even over malformed/stale optional metadata.
  if (input.intent.kind === 'stop') return {...route,featureAssignments:[]};
  const needs = currentNeeds(input, route);
  if (!needs.length) return route;
  const entries = new Map(catalog.entries.map(entry => [entry.id,entry]));
  const excluded = new Set(input.intent.excluded ?? []);
  const available = id => {
    const entry = entries.get(id);
    return entry && (!entry.skill || input.available.skills.includes(entry.skill))
      && (!entry.requiresCapability || input.available.capabilities.includes(entry.requiresCapability));
  };
  const helpers = new Set(route.helpers);
  const assignments = needs.map(need => {
    const definition = definitions[need.id];
    const owner = definition.owner === 'current' ? route.lead : definition.owner;
    let status = 'planned', reason = need.reason;
    if (!liveKinds.has(input.intent.kind)) { status='suppressed';reason='NON_LIVE_TASK_INTENT'; }
    else if (route.action === 'clarify' || !route.ready) { status='blocked';reason='CURRENT_ROUTE_NOT_READY'; }
    else if (excluded.has(owner)) { status='suppressed';reason='USER_EXCLUDED'; }
    else if (!available(owner)) { status='unavailable';reason='OWNER_UNAVAILABLE'; }
    else if (need.id !== 'result_readback' && route.requiresResultInspection) {
      status='deferred';reason='INSPECT_ORIGINAL_RESULT_FIRST';
    } else if (need.id === 'task_handoff' && !route.workflow) {
      status='blocked';reason='EXISTING_WORKFLOW_CONTEXT_REQUIRED';
    } else if (need.id === 'task_handoff' && !['ready','checkpoint_required'].includes(route.workflow.status)) {
      status='blocked';reason=route.workflow.reason ?? 'WORKFLOW_NOT_READY';
    } else if (need.id === 'improvement' && input.intent.improvementRelevance === 'irrelevant') {
      status='suppressed';reason='CURRENT_REQUEST_NOT_RELEVANT';
    } else if (need.id === 'progress_check' && input.intent.preparationRelevance === 'irrelevant') {
      status='suppressed';reason='CURRENT_REQUEST_NOT_RELEVANT';
    }
    const support = definition.helpers.map(id => ({id,
      status:excluded.has(id) ? 'suppressed' : !available(id) ? 'unavailable' : status==='planned' ? 'planned' : 'deferred'}));
    // Unavailable owners remain visible in the existing role contract; they do
    // not become fallback specialists or proof that any helper contributed.
    if (['planned','unavailable'].includes(status)) {
      if (owner !== route.lead) helpers.add(owner);
      if (status==='planned') for (const item of support)
        if (item.id !== route.lead && item.status !== 'suppressed') helpers.add(item.id);
    }
    return {id:need.id,owner,role:owner===route.lead ? 'primary' : owner==='video' ? 'appendix' : 'collaborator',status,reason,
      sourceRef:need.sourceRef,basis:need.basis,contract:definition.contract,support,
      returnTo:{lead:route.lead,taskId:route.taskId,threadId:input.threadId},
      binding:{sourceRef:input.sourceRef,threadId:input.threadId,taskId:route.taskId,
        conditionRevision:route.taskId ? input.activeTask.conditionRevision : null,
        menuId:route.taskId ? input.activeTask.menu?.id ?? null : null},
      scope:'current_request_only',preserveCurrentMenu:true,
      inspectOriginalResultFirst:route.requiresResultInspection===true,
      authorizesExecution:false,dispatchesTools:false,changesPersistentState:false,completionProven:false};
  });
  // A helper may also arrive from the older relevance or saved-helper path.
  // Defer that work consistently until the original external result is read.
  // This is request-local only: do not rewrite task helpers or current choices.
  const deferred = new Set(assignments.filter(x=>x.status==='deferred')
    .flatMap(x=>[x.owner,...x.support.map(s=>s.id)]).filter(id=>id!==route.lead));
  for (const id of deferred) helpers.delete(id);
  const current = deferred.size ? {...input,intent:{...input.intent,
    assistantRequests:(input.intent.assistantRequests ?? []).filter(x=>!deferred.has(x.id))}} : input;
  const result=finalize(current,{...route,helpers:[...helpers]},catalog);
  return {...result,featureAssignments:assignments};
}

/** Check the returned feature outcomes, not the truth of their evidence.
 * Actual tool results must still be inspected by the host. No state/effect is
 * completed, persisted or dispatched by accepting a result packet. */
export function checkFeatureResults(plan, response, catalog) {
  const errors=[];
  const add=(code,id)=>errors.push({code,...(id ? {id} : {})});
  if (!response || typeof response!=='object' || Array.isArray(response)) return errors;
  const assignments=plan.featureAssignments ?? [];
  const results=response.featureResults ?? [];
  if (!Array.isArray(results) || results.length>Object.keys(definitions).length) {
    add('INVALID_FEATURE_RESULTS');return errors;
  }
  const seen=new Set();
  for (const result of results) {
    if (!result || typeof result!=='object' || Array.isArray(result)
      || !['id','owner','binding','status','summary','evidenceRefs','reason'].every(k=>Object.hasOwn(result,k))
      || Object.keys(result).some(k=>!['id','owner','binding','status','summary','evidenceRefs','reason'].includes(k))) {
      add('INVALID_FEATURE_RESULT');continue;
    }
    const assignment=assignments.find(x=>x.id===result.id);
    if (!assignment || seen.has(result.id)) {add('UNPLANNED_OR_DUPLICATE_FEATURE_RESULT',result.id);continue;}
    seen.add(result.id);
    if (assignment.status!=='planned') {add('FEATURE_NOT_READY',result.id);continue;}
    if (result.owner!==assignment.owner) add('FEATURE_RESULT_OWNER_MISMATCH',result.id);
    const binding=result.binding;
    const expected=assignment.binding;
    if (!binding || typeof binding!=='object' || Array.isArray(binding)
      || Object.keys(binding).length!==Object.keys(expected).length
      || Object.keys(expected).some(k=>!Object.hasOwn(binding,k)||binding[k]!==expected[k]))
      add('STALE_OR_FOREIGN_FEATURE_RESULT',result.id);
    if (!['completed','blocked','not_used'].includes(result.status)) add('INVALID_FEATURE_RESULT_STATUS',result.id);
    const section=(Array.isArray(response.sections) ? response.sections : []).find(x=>x?.id===assignment.owner);
    if (!text(result.summary) || !contributionShows(response,assignment.owner,result.summary,catalog))
      add('FEATURE_RESULT_NOT_SHOWN_BY_OWNER',result.id);
    if (!Array.isArray(result.evidenceRefs) || result.evidenceRefs.length>32
      || !result.evidenceRefs.every(text)) add('INVALID_FEATURE_RESULT_EVIDENCE',result.id);
    if (result.status==='completed') {
      if (section?.state!=='contributed') add('FEATURE_OWNER_DID_NOT_CONTRIBUTE',result.id);
      if (!result.evidenceRefs?.length) add('FEATURE_RESULT_EVIDENCE_REQUIRED',result.id);
      if (result.reason!==null) add('UNEXPECTED_COMPLETED_FEATURE_REASON',result.id);
    } else if (!text(result.reason) || typeof result.summary!=='string' || !result.summary.includes(result.reason)) {
      add('FEATURE_RESULT_REASON_REQUIRED',result.id);
    }
  }
  for (const a of assignments) if (a.status==='planned'&&!seen.has(a.id)) add('FEATURE_RESULT_MISSING',a.id);
  return errors;
}

