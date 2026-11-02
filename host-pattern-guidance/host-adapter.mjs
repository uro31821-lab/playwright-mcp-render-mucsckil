/** Read-only integration with the ACTUAL installed JH runtimes; callbacks are
 * explicitly supplied by the host. No guessed data, network calls or effects.
 */
import {clean,check,fingerprint,evidenceFingerprint,context,evaluateProposal,mutate,iso,validateState} from './engine.mjs';
function fields(x,keys,optional=[]){check(x&&typeof x==='object'&&!Array.isArray(x)&&keys.every(k=>Object.hasOwn(x,k))&&Object.keys(x).every(k=>keys.includes(k)||optional.includes(k)),'PATTERN_ADAPTER_INPUT');}
function apis(r){
  for(const key of ['research','personal','decision','decisionContext'])check(r?.[key]?.VERSION==='1.0.0','PATTERN_RUNTIME_UNAVAILABLE');
  return r;
}
function load(states,r){
  const p=r.personal.validateState(states.personal),d=r.decision.validateState(states.decision),q=r.research.validateState(states.research);
  check(p.ownerScope===d.ownerScope&&p.ownerScope===q.ownerScope&&p.ownerScope===states.pattern.ownerScope,'PATTERN_OWNER_MISMATCH');
  return {p,d,q};
}
export function reviewWithJH(states,input,runtimes){
  const r=apis(runtimes),x=clean(input),{p,d,q}=load(states,r);
  fields(x,['at','topicId','goalId','proposalId','changeKey','ranking','mode','metrics','hostConditionsVerified']);
  fields(x.ranking,['scope','candidates'],['context']);
  fields(x.metrics,['benefit','confidence','setupBurden','ongoingBurden','interruptionCost']);
  check([true,false,null].includes(x.hostConditionsVerified),'PATTERN_ADAPTER_INPUT');
  const ctx=context(states.pattern,{now:x.at,topicId:x.topicId});
  const ranked=r.decisionContext.rankWithGoal(p,d,{goalId:x.goalId,at:x.at,...x.ranking});
  check(fingerprint(ctx.topic.scope)===fingerprint(ranked.goalContext.scope),'PATTERN_SCOPE_MISMATCH');
  const notices=r.research.notices(q,{at:x.at,limit:3,maxChars:12000});
  const proposal=notices.items.find(n=>n.id===x.proposalId&&n.topicId===x.topicId);
  const base={pattern:ctx.pattern,goalContext:ranked.goalContext,reviewContext:ranked.reviewContext,ranking:ranked.ranking,
    referencesOnly:true,permanentPreferencesChanged:false,authorizesExecution:false};
  if(!proposal)return {...base,show:false,reason:'research_not_available_or_already_delivered'};
  // A ranked numeric candidate is not proof that every arbitrary condition has been checked.
  const present=ranked.ranking?.ranks.some(c=>c.candidateId===proposal.id)===true;
  const selected=r.decision.selectProposals(d,{goalId:x.goalId,at:x.at,mode:x.mode,limit:1,candidates:[{
    id:proposal.id,goalId:x.goalId,label:proposal.summary,sourceRefs:proposal.sources.map(s=>s.url),stage:'ready',
    eligible:present&&x.hostConditionsVerified===true,...x.metrics
  }]});
  if(!selected.selected.length)return {...base,show:false,reason:selected.deferred[0]?.reason||'not_selected'};
  const candidate={topicId:x.topicId,changeKey:x.changeKey,goalId:x.goalId,goalRevision:ranked.goalContext.goalRevision,
    summary:proposal.summary,sources:proposal.sources.map(s=>({url:s.url,contentHash:s.contentHash,retrievedAt:s.retrievedAt,kind:s.kind})),
    sourceRetrievalAttested:true,goalActive:ranked.eligible,hardConstraintsMet:present&&x.hostConditionsVerified===true,mode:x.mode,...x.metrics};
  const decision=evaluateProposal(states.pattern,{now:x.at,candidate});
  return {...base,...decision,candidate,researchProposalId:proposal.id,
    binding:fingerprint({patternRevision:ctx.revision,personalRevision:p.revision,decisionRevision:d.revision,researchRevision:q.revision,input:x})};
}
/** Produce BOTH next private states, not remote writes. Persist each by CAS;
 * read back both. Lost storage acknowledgements never repeat research/actions.
 */
export function deliveryTransition(states,input,runtimes){
  const r=apis(runtimes),x=clean(input),{q}=load(states,r);
  fields(x,['at','topicId','patternProposalId','researchProposalId','receiptId','sourceRef']);iso(x.at);
  const pattern=validateState(states.pattern);
  const p=pattern.events.find(e=>e.kind==='proposal'&&e.id===x.patternProposalId&&e.data.topicId===x.topicId);check(p,'PATTERN_PROPOSAL_MISSING');
  const originalReceipt=pattern.events.find(e=>e.kind==='receipt'&&e.id===x.receiptId);
  if(originalReceipt && q.receipts[x.receiptId]){
    const a=mutate(pattern,{id:x.receiptId,kind:'receipt',sourceRef:x.sourceRef,at:x.at,expectedRevision:pattern.revision,data:{proposalId:x.patternProposalId,meaning:'handoff_attempted'}});
    const b=r.research.acknowledge(q,{expectedRevision:q.revision,receiptId:x.receiptId,proposalIds:[x.researchProposalId],at:x.at});
    return {pattern:a.state,research:b.state,patternResult:a.result,researchResult:b.result,persisted:false,readVerified:false,userAccepted:false,authorizesExecution:false};
  }
  const proposal=q.proposals[x.researchProposalId];check(proposal&&proposal.topicId===x.topicId,'PATTERN_RESEARCH_MISMATCH');
  const currentGoal=r.decision.goalContext(states.decision,{goalId:p.data.goalId,at:x.at});
  check(currentGoal.eligible&&currentGoal.goalRevision===p.data.goalRevision,'PATTERN_GOAL_CHANGED');
  const evidence=proposal.sources.map(s=>({url:s.url,contentHash:s.contentHash,retrievedAt:s.retrievedAt,kind:s.kind}));
  check(evidenceFingerprint(evidence,x.at)===evidenceFingerprint(p.data.sources,x.at),'PATTERN_EVIDENCE_MISMATCH');
  const topic=q.topics[x.topicId];check(topic.status==='active'||topic.status==='snoozed'&&topic.until!==null&&Date.parse(x.at)>=Date.parse(topic.until),'PATTERN_TOPIC_PAUSED');
  const a=mutate(states.pattern,{id:x.receiptId,kind:'receipt',sourceRef:x.sourceRef,at:x.at,expectedRevision:states.pattern.revision,data:{proposalId:x.patternProposalId,meaning:'handoff_attempted'}});
  const b=r.research.acknowledge(q,{expectedRevision:q.revision,receiptId:x.receiptId,proposalIds:[x.researchProposalId],at:x.at});
  return {pattern:a.state,research:b.state,patternResult:a.result,researchResult:b.result,
    persisted:false,readVerified:false,userAccepted:false,authorizesExecution:false};
}
