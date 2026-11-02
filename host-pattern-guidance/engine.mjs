/** JH pattern guidance 1.0.0. Original Node.js host module; no network or device I/O.
 * Events are bounded JSON data, never instructions. Attribution is host-attested,
 * not independent authentication. The storage adapter enforces owner isolation.
 */
import { createHash } from 'node:crypto';
export const VERSION='1.0.0', SCHEMA='jh.pattern-memory.v2';
export const MAX_BYTES=2*1024*1024, MAX_EVENTS=2000;
const DAY=86400000, WINDOW=30*DAY, COOLDOWN=7*DAY;
const RESERVED=new Set([...Object.getOwnPropertyNames(Object.prototype),'prototype']);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
export const fail=code=>{const e=new Error(code);e.code=code;throw e;};
export const check=(x,code='PATTERN_INPUT_INVALID')=>{if(!x)fail(code);};
export function clean(x,depth=0,b={nodes:100000,chars:0}) {
  check(depth<=30 && --b.nodes>=0,'PATTERN_CAPACITY');
  if(x===null||typeof x==='boolean')return x;
  if(typeof x==='number'){check(Number.isFinite(x));return x;}
  if(typeof x==='string'){b.chars+=x.length;check(b.chars<=MAX_BYTES,'PATTERN_CAPACITY');check(x.isWellFormed());return x;}
  check(x && typeof x==='object');
  const ds=Object.getOwnPropertyDescriptors(x);
  if(Array.isArray(x)){
    check(Object.getPrototypeOf(x)===Array.prototype && x.length<=10000 && Reflect.ownKeys(x).length===x.length+1);
    return Array.from({length:x.length},(_,i)=>{check(ds[i] && own(ds[i],'value'));return clean(ds[i].value,depth+1,b);});
  }
  check([Object.prototype,null].includes(Object.getPrototypeOf(x)));
  const y={};
  for(const k of Reflect.ownKeys(x)){
    check(typeof k==='string'&&!RESERVED.has(k)&&own(ds[k],'value')&&ds[k].enumerable);
    b.chars+=k.length;check(b.chars<=MAX_BYTES,'PATTERN_CAPACITY');y[k]=clean(ds[k].value,depth+1,b);
  }
  return y;
}
const canon=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canon).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';
export const fingerprint=x=>createHash('sha256').update(canon(clean(x))).digest('hex');
const equal=(a,b)=>canon(a)===canon(b);
function fields(x,required,optional=[]){check(x&&typeof x==='object'&&!Array.isArray(x));check(required.every(k=>own(x,k))&&Object.keys(x).every(k=>required.includes(k)||optional.includes(k)));}
const secret=s=>/\bBearer\s+\S+|(?:api[-_ ]?key|password|access[-_ ]?token|secret)\s*[:=]\s*\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:sk-proj-|ghp_|github_pat_)[\w-]{12,}/i.test(s);
function text(x,max=500){check(typeof x==='string'&&x.length<=max&&x.trim().length>0&&!/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e]/.test(x)&&!secret(x));return x.normalize('NFKC').trim();}
function token(x){const v=text(x,160);check(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v)&&!RESERVED.has(v));return v;}
function ref(x){const v=text(x,240);check(/^(?:conversation|user|source|artifact|test|commit|file|library):[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v));return v;}
export function iso(x){check(typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x));const n=Date.parse(x);check(Number.isFinite(n));const s=new Date(n).toISOString();check(s===x||s.replace('.000Z','Z')===x);return s;}
function scope(x){fields(x,['topic'],['project','aspect']);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,token(v).toLowerCase()]));}
function unit(x){check(x===null||(typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1));return x;}
function scalar(x){check(x===null||typeof x==='boolean'||typeof x==='number'||typeof x==='string');if(typeof x==='string')return text(x,120);if(typeof x==='number')check(Number.isFinite(x)&&Math.abs(x)<=1e12);return x;}
function int(x,min,max){check(Number.isSafeInteger(x)&&x>=min&&x<=max);return x;}
function publicUrl(x){
  const v=text(x,1800);check(!/\\|\s/.test(v));let u;try{u=new URL(v);}catch{fail('PATTERN_SOURCE_INVALID');}
  check(u.protocol==='https:'&&!u.username&&!u.password&&!u.port,'PATTERN_SOURCE_INVALID');
  const h=u.hostname.toLowerCase();check(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)&&!/(?:^|\.)(?:localhost|local|internal|home|lan|onion|test|invalid)$/.test(h)&&!/(?:nip\.io|sslip\.io|localtest\.me)$/.test(h),'PATTERN_SOURCE_INVALID');
  for(const k of [...u.searchParams.keys()]){check(!/token|key|signature|password|credential|secret|auth/i.test(k),'PATTERN_SOURCE_INVALID');if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);}
  u.searchParams.sort();u.hash='';return u.href;
}
function source(x,at){fields(x,['url','contentHash','retrievedAt','kind']);check(/^[a-f0-9]{64}$/.test(x.contentHash));check(['official','source','paper'].includes(x.kind));const t=iso(x.retrievedAt);check(t<=at,'PATTERN_SOURCE_FUTURE');return {url:publicUrl(x.url),contentHash:x.contentHash,retrievedAt:t,kind:x.kind};}
const emptyView=()=>({topics:{},rules:{},proposals:{},receipts:{},observations:[],outcomes:[],sources:{}});
export function createState(input){const x=clean(input);fields(x,['ownerScope','now']);const now=iso(x.now);return {schema:SCHEMA,apiVersion:VERSION,ownerScope:token(x.ownerScope),createdAt:now,updatedAt:now,revision:0,events:[]};}
function normalize(kind,x,at){
  if(kind==='observe'){
    fields(x,['topicId','scope','taskId','requestId','type','summary','occurredAt']);
    check(['question','problem','correction','decision','continue','status','explicit'].includes(x.type));
    const occurredAt=iso(x.occurredAt);check(occurredAt<=at,'PATTERN_TIME_ORDER');
    return {topicId:token(x.topicId),scope:scope(x.scope),taskId:token(x.taskId),requestId:token(x.requestId),type:x.type,summary:text(x.summary,300),occurredAt};
  }
  if(kind==='status'){
    fields(x,['topicId','status','basis','reason']);check(['active','snoozed','rejected','resolved'].includes(x.status));check(['user_explicit','host_verified'].includes(x.basis));
    check(x.status!=='active'||x.basis==='user_explicit','PATTERN_EXPLICIT_RESUME_REQUIRED');
    return {topicId:token(x.topicId),status:x.status,basis:x.basis,reason:text(x.reason,300)};
  }
  if(kind==='outcome'){
    fields(x,['topicId','taskId','status','basis','summary']);check(['solved','failed','unknown'].includes(x.status));check(['user_report','host_verified'].includes(x.basis));
    return {topicId:token(x.topicId),taskId:token(x.taskId),status:x.status,basis:x.basis,summary:text(x.summary,300)};
  }
  if(kind==='rule'){
    fields(x,['scope','key','operator','value','status','basis','reason','validUntil','supersedes']);
    check(['eq','neq','gte','lte'].includes(x.operator)&&['confirmed','uncertain','revoked'].includes(x.status)&&['user_explicit','host_inferred'].includes(x.basis));
    check(x.status!=='confirmed'||x.basis==='user_explicit','PATTERN_RULE_UNCONFIRMED');
    const value=scalar(x.value);check(!['gte','lte'].includes(x.operator)||typeof value==='number');
    const validUntil=x.validUntil===null?null:iso(x.validUntil);check(validUntil===null||validUntil>at);
    return {scope:scope(x.scope),key:token(x.key),operator:x.operator,value,status:x.status,basis:x.basis,reason:text(x.reason,400),validUntil,supersedes:x.supersedes===null?null:token(x.supersedes)};
  }
  if(kind==='proposal'){
    fields(x,['topicId','changeKey','goalId','goalRevision','summary','sources','sourceRetrievalAttested','goalActive','hardConstraintsMet','mode','benefit','confidence','setupBurden','ongoingBurden','interruptionCost']);
    check(Array.isArray(x.sources)&&x.sources.length>0&&x.sources.length<=6,'PATTERN_SOURCE_REQUIRED');
    check(x.sourceRetrievalAttested===true,'PATTERN_SOURCE_UNATTESTED');
    check([true,false,null].includes(x.goalActive)&&[true,false,null].includes(x.hardConstraintsMet)&&['normal','busy','explore'].includes(x.mode));
    const sources=x.sources.map(s=>source(s,at)).sort((a,b)=>a.url.localeCompare(b.url));check(new Set(sources.map(s=>s.url)).size===sources.length);
    return {topicId:token(x.topicId),changeKey:token(x.changeKey),goalId:token(x.goalId),goalRevision:int(x.goalRevision,0,1e9),summary:text(x.summary,500),sources,sourceRetrievalAttested:true,goalActive:x.goalActive,hardConstraintsMet:x.hardConstraintsMet,mode:x.mode,...Object.fromEntries(['benefit','confidence','setupBurden','ongoingBurden','interruptionCost'].map(k=>[k,unit(x[k])]))};
  }
  if(kind==='receipt'){fields(x,['proposalId','meaning']);check(x.meaning==='handoff_attempted');return {proposalId:token(x.proposalId),meaning:x.meaning};}
  fail('PATTERN_KIND_INVALID');
}
function pattern(view,topicId,now){
  const t=view.topics[topicId];check(t,'PATTERN_TOPIC_MISSING');
  const recent=view.observations.filter(e=>e.data.topicId===topicId&&Date.parse(now)-Date.parse(e.data.occurredAt)<=WINDOW&&e.data.occurredAt<=now);
  const latestOutcome=new Map();for(const e of view.outcomes.filter(e=>e.data.topicId===topicId))latestOutcome.set(e.data.taskId,e);
  const tasks=type=>new Set(recent.filter(e=>e.data.type===type).map(e=>e.data.taskId));
  const unsolved=recent.filter(e=>e.data.type==='problem'&&!(latestOutcome.get(e.data.taskId)?.data.status==='solved'&&(latestOutcome.get(e.data.taskId).at>e.data.occurredAt||(latestOutcome.get(e.data.taskId).at===e.data.occurredAt&&latestOutcome.get(e.data.taskId).revision>e.revision))));
  const problems=new Set(unsolved.map(e=>e.data.taskId));const questions=tasks('question'),corrections=tasks('correction');
  const explicit=tasks('explicit');
  const reason=t.status!=='active'?t.status:problems.size>=2?'repeated_unresolved_problem':corrections.size>=2?'repeated_corrections':questions.size>=3?'repeated_interest':explicit.size?'explicit_request':'not_repeated';
  return {topicId,scope:t.scope,status:t.status,eligible:['repeated_unresolved_problem','repeated_corrections','repeated_interest','explicit_request'].includes(reason),reason,problemTasks:problems.size,questionTasks:questions.size,correctionTasks:corrections.size,explicitTasks:explicit.size,evidenceRefs:[...new Set(recent.map(e=>e.sourceRef))],inferenceOnly:true,authorizesExecution:false};
}
function identity(d){return fingerprint({topicId:d.topicId,goalId:d.goalId,changeKey:d.changeKey,evidence:d.sources.map(s=>({url:s.url,contentHash:s.contentHash}))});}
function evaluate(view,d,at){
  const p=pattern(view,d.topicId,at), key=identity(d);
  const base={show:false,contentKey:key,pattern:p,advisoryOnly:true,independentFactVerification:false,authorizesExecution:false};
  const reject=reason=>({...base,reason});
  if(!p.eligible)return reject(p.reason);
  if(d.goalActive!==true)return reject('goal_inactive_or_unknown');
  if(d.hardConstraintsMet!==true)return reject('constraints_unverified');
  if(d.sources.some(s=>Date.parse(at)-Date.parse(s.retrievedAt)>WINDOW))return reject('evidence_stale');
  if(['benefit','confidence','setupBurden','ongoingBurden','interruptionCost'].some(k=>d[k]===null))return reject('metrics_unknown');
  const delivered=Object.values(view.receipts).map(r=>({r,p:view.proposals[r.data.proposalId]}));
  if(delivered.some(x=>identity(x.p.data)===key))return reject('already_delivered');
  const same=delivered.filter(x=>x.p.data.topicId===d.topicId).sort((a,b)=>b.r.revision-a.r.revision)[0];
  if(same&&Date.parse(at)-Date.parse(same.r.at)<COOLDOWN&&!view.observations.some(e=>e.data.topicId===d.topicId&&e.data.type==='explicit'&&e.revision>same.r.revision))return reject('cooldown');
  const mult=d.mode==='busy'?2:d.mode==='explore'?.5:1;
  const score=+(d.benefit*d.confidence-.25*d.setupBurden-.25*d.ongoingBurden-.25*mult*d.interruptionCost).toFixed(12);
  if(score<=0)return {...reject('nonpositive_utility'),score};
  return {...base,show:true,reason:'evidence_backed_candidate',score,scoreKind:'caller_supplied_expected_utility'};
}
function apply(view,e){
  const d=e.data;
  if(e.kind==='observe'){
    check(!['continue','status'].includes(d.type),'PATTERN_STATE_INVALID');
    const t=view.topics[d.topicId];
    if(t)check(equal(t.scope,d.scope),'PATTERN_SCOPE_MISMATCH');else view.topics[d.topicId]={scope:d.scope,status:'active',statusSource:e.sourceRef};
    const sourceKey=d.topicId+'|'+e.sourceRef;check(!own(view.sources,sourceKey),'PATTERN_SOURCE_REPLAY');view.sources[sourceKey]=e.id;view.observations.push(e);
  } else if(e.kind==='status'){
    check(view.topics[d.topicId],'PATTERN_TOPIC_MISSING');Object.assign(view.topics[d.topicId],{status:d.status,statusSource:e.sourceRef});
  } else if(e.kind==='outcome'){
    check(view.observations.some(o=>o.data.topicId===d.topicId&&o.data.taskId===d.taskId&&o.data.type==='problem'),'PATTERN_PROBLEM_MISSING');view.outcomes.push(e);
  } else if(e.kind==='rule'){
    const key=canon(d.scope)+'|'+d.key,old=view.rules[key];check((old?.id??null)===d.supersedes,'PATTERN_RULE_SUPERSEDES_REQUIRED');view.rules[key]=e;
  } else if(e.kind==='proposal'){
    check(evaluate(view,d,e.at).show,'PATTERN_PROPOSAL_INELIGIBLE');
    view.proposals[e.id]=e;
  } else if(e.kind==='receipt'){
    const p=view.proposals[d.proposalId];check(p,'PATTERN_PROPOSAL_MISSING');check(view.topics[p.data.topicId].status==='active','PATTERN_TOPIC_PAUSED');
    check(!Object.values(view.receipts).some(r=>r.data.proposalId===d.proposalId),'PATTERN_RECEIPT_EXISTS');
    check(Date.parse(e.at)-Date.parse(p.at)<=DAY,'PATTERN_PROPOSAL_EXPIRED');check(evaluate(view,p.data,e.at).show,'PATTERN_PROPOSAL_INELIGIBLE');view.receipts[e.id]=e;
  }
}
function validate(value){
  const s=clean(value);fields(s,['schema','apiVersion','ownerScope','createdAt','updatedAt','revision','events']);
  check(s.schema===SCHEMA&&s.apiVersion===VERSION,'PATTERN_STATE_VERSION');check(token(s.ownerScope)===s.ownerScope);
  check(iso(s.createdAt)===s.createdAt&&iso(s.updatedAt)===s.updatedAt);int(s.revision,0,MAX_EVENTS);
  check(Array.isArray(s.events)&&s.events.length===s.revision&&Buffer.byteLength(JSON.stringify(s))<=MAX_BYTES,'PATTERN_CAPACITY');
  const view=emptyView(),ids=new Set();let at=s.createdAt;
  for(const e of s.events){
    fields(e,['id','kind','data','sourceRef','at','revision','fingerprint']);check(token(e.id)===e.id&&!ids.has(e.id),'PATTERN_ID_CONFLICT');ids.add(e.id);
    check(iso(e.at)===e.at&&e.at>=at,'PATTERN_TIME_ORDER');check(e.revision===ids.size);
    check(ref(e.sourceRef)===e.sourceRef);const d=normalize(e.kind,e.data,e.at);check(equal(d,e.data));
    check(e.fingerprint===fingerprint({id:e.id,kind:e.kind,data:d,at:e.at,sourceRef:e.sourceRef}),'PATTERN_INTEGRITY');apply(view,e);at=e.at;
  }
  check(s.updatedAt===at,'PATTERN_TIME_ORDER');return {s,view};
}
export function validateState(s){return validate(s).s;}
function bounded(x){check(Buffer.byteLength(JSON.stringify(x))<=512*1024,'PATTERN_OUTPUT_CAPACITY');return x;}
function query(s,now){const v=validate(s);const at=iso(now);check(at>=v.s.updatedAt,'PATTERN_TIME_ORDER');return {...v,at};}
export function mutate(value,request){
  const {s,view}=validate(value),r=clean(request);fields(r,['id','kind','data','sourceRef','at','expectedRevision']);int(r.expectedRevision,0,MAX_EVENTS);
  const id=token(r.id),at=iso(r.at),sourceRef=ref(r.sourceRef),data=normalize(r.kind,r.data,at);
  const fp=fingerprint({id,kind:r.kind,data,at,sourceRef});const old=s.events.find(e=>e.id===id);
  if(old){check(old.fingerprint===fp,'PATTERN_ID_CONFLICT');return {state:s,result:{changed:false,duplicate:true,revision:s.revision,id}};}
  check(r.expectedRevision===s.revision,'PATTERN_REVISION_CONFLICT');check(at>=s.updatedAt,'PATTERN_TIME_ORDER');
  if(r.kind==='observe'&&['continue','status'].includes(data.type))return {state:s,result:{changed:false,ignored:true,revision:s.revision}};
  if(r.kind==='proposal'){
    const decision=evaluate(view,data,at);if(!decision.show)return {state:s,result:{...decision,changed:false,revision:s.revision}};
    const pending=Object.values(view.proposals).find(p=>equal(p.data,data)&&Date.parse(at)-Date.parse(p.at)<=DAY);
    if(pending)return {state:s,result:{...decision,id:pending.id,changed:false,duplicate:true,revision:s.revision}};
  }
  const e={id,kind:r.kind,data,sourceRef,at,revision:s.revision+1,fingerprint:fp};apply(view,e);s.events.push(e);s.revision++;s.updatedAt=at;
  check(s.revision<=MAX_EVENTS&&Buffer.byteLength(JSON.stringify(s))<=MAX_BYTES,'PATTERN_CAPACITY');
  return {state:s,result:{id,changed:true,duplicate:false,revision:s.revision,...(r.kind==='proposal'?{show:true,contentKey:identity(data)}:{})}};
}
export function detectPatterns(value,input={}){
  const x=clean(input);fields(x,['now'],['scope']);const {now,scope:filter}=x;
  const {view,at}=query(value,now);const sc=filter===undefined?null:scope(clean(filter));
  return bounded(Object.keys(view.topics).filter(k=>!sc||equal(view.topics[k].scope,sc)).map(k=>pattern(view,k,at)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.problemTasks-a.problemTasks||b.correctionTasks-a.correctionTasks||a.topicId.localeCompare(b.topicId)));
}
export function evaluateProposal(value,input){const x=clean(input);fields(x,['now','candidate']);const {view,at}=query(value,x.now);return bounded(evaluate(view,normalize('proposal',x.candidate,at),at));}
export function challenge(value,input){
  const x=clean(input);fields(x,['now','scope','facts'],['overrides']);const {view,at}=query(value,x.now);const sc=scope(x.scope);
  check(Array.isArray(x.facts)&&x.facts.length<=30);const facts=new Map();
  for(const f of x.facts){fields(f,['key','value','sourceRef','observedAt']);const k=token(f.key);check(!facts.has(k));const t=iso(f.observedAt);check(t<=at);facts.set(k,{value:scalar(f.value),sourceRef:ref(f.sourceRef),observedAt:t});}
  const overrides=new Map();check(x.overrides===undefined||Array.isArray(x.overrides)&&x.overrides.length<=30);
  for(const o of x.overrides||[]){fields(o,['key','sourceRef','reason','basis']);check(o.basis==='user_explicit');const k=token(o.key);check(!overrides.has(k));overrides.set(k,{sourceRef:ref(o.sourceRef),reason:text(o.reason,300)});}
  const items=[];
  for(const r of Object.values(view.rules).filter(r=>equal(r.data.scope,sc))){
    const d=r.data,f=facts.get(d.key),o=overrides.get(d.key);let status;
    if(o)status='current_override';else if(d.status!=='confirmed')status=d.status;else if(d.validUntil!==null&&at>=d.validUntil)status='expired';
    else if(!f||f.value===null||Date.parse(at)-Date.parse(f.observedAt)>WINDOW)status='unknown';
    else if(['gte','lte'].includes(d.operator)&&typeof f.value!=='number'||typeof f.value!==typeof d.value)status='unknown';
    else {const fits=d.operator==='eq'?f.value===d.value:d.operator==='neq'?f.value!==d.value:d.operator==='gte'?f.value>=d.value:f.value<=d.value;status=fits?'matched':'conflict';}
    items.push({ruleId:r.id,key:d.key,status,reason:d.reason,sourceRef:r.sourceRef,fact:f??null,currentOverride:o??null});
  }
  return bounded({items,requiresReview:items.some(i=>i.status==='conflict'),automaticRejection:false,semanticTruthVerified:false,authorizesExecution:false});
}
export function context(value,input){
  const x=clean(input);fields(x,['now','topicId']);const {s,view,at}=query(value,x.now);const topicId=token(x.topicId);
  const proposals=Object.values(view.proposals).filter(p=>p.data.topicId===topicId),receipts=Object.values(view.receipts).filter(r=>view.proposals[r.data.proposalId].data.topicId===topicId);
  return bounded({schema:SCHEMA,ownerScope:s.ownerScope,revision:s.revision,pattern:pattern(view,topicId,at),topic:view.topics[topicId],proposals:proposals.slice(-10),receipts:receipts.slice(-10),omitted:{proposals:Math.max(0,proposals.length-10),receipts:Math.max(0,receipts.length-10)},readOnly:true,authorizesExecution:false});
}
