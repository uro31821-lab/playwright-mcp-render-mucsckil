/** JH choice + cost engine. No network, device actions, booking or payment. */
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,renameSync,existsSync} from 'node:fs';
import path from 'node:path';

const fail = code => {throw Object.assign(new Error(code), {code});};
const own = (o,k) => Object.hasOwn(o,k);
const copy = x => structuredClone(x);
const check = (ok,code) => {if(!ok) fail(code);};
const integer = (n,code='INVALID_WON') => {check(Number.isSafeInteger(n)&&n>=0,code);return n;};
const add = (a,b) => {const n=a+b;check(Number.isSafeInteger(n),'AMOUNT_OVERFLOW');return n;};
const mul = (a,b) => {const n=a*b;check(Number.isSafeInteger(n),'AMOUNT_OVERFLOW');return n;};
const fmt = n => n.toLocaleString('ko-KR')+'원';
const date = s => typeof s==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
const id = s => typeof s==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(s);
const label = s => typeof s==='string'&&s.trim().length>0&&s.length<=500;
const METRICS={price:{label:'가격',direction:'low'},distanceKm:{label:'거리',direction:'low'},durationMin:{label:'시간',direction:'low'},rating:{label:'평점',direction:'high'},conditions:{label:'선호 조건',direction:'high'}};

/** Only a single, unambiguous KRW amount. Ranges/from-prices stay unknown. */
export function extractWon(value) {
 if(typeof value==='number')return {amount:integer(value),reason:null};
 if(typeof value!=='string')return {amount:null,reason:'PRICE_MISSING'};
 const s=value.trim();
 if(/^(무료|0원)$/.test(s))return {amount:0,reason:null};
 const plain=s.match(/^(?:₩\s*)?((?:\d{1,3}(?:,\d{3})+|\d+))(?:\s*원|\s*KRW)?$/i);
 if(plain)return {amount:integer(Number(plain[1].replaceAll(',',''))),reason:null};
 const man=s.match(/^(\d+)(?:\.(\d{1,4}))?\s*만\s*원$/);
 if(man)return {amount:integer(Number(man[1])*10000+Number((man[2]||'').padEnd(4,'0'))),reason:null};
 return {amount:null,reason:'PRICE_AMBIGUOUS'};
}
function amountValue(input,now) {
 if(!input||input.status==='unknown')return {amount:null,status:'unknown',reason:'PRICE_MISSING'};
 check(['confirmed','estimated'].includes(input.status),'INVALID_PRICE_STATUS');
 check(!(own(input,'amount')&&own(input,'text')),'DUPLICATE_PRICE_REPRESENTATION');
 const v=extractWon(own(input,'amount')?input.amount:input.text);
 if(v.amount===null)return {...v,status:'unknown'};
 let status=input.status;
 if(input.validUntil!==undefined){check(date(input.validUntil),'INVALID_PRICE_EXPIRY');if(Date.parse(input.validUntil)<=now)status='estimated';}
 return {...v,status,expired:status!==input.status};
}
function multiplier(basis,counts) {
 const keys={total:[],per_unit:['quantity'],per_person:['people'],per_night:['nights'],per_person_per_night:['people','nights'],per_room_per_night:['rooms','nights']}[basis];
 check(keys,'INVALID_PRICE_BASIS');
 return keys.reduce((n,k)=>{check(Number.isSafeInteger(counts[k])&&counts[k]>0&&counts[k]<=10000,'COUNT_REQUIRED_'+k);return mul(n,counts[k]);},1);
}
export function calculateItem(price,{now=Date.now()}={}) {
 check(price&&typeof price==='object','PRICE_OBJECT_REQUIRED');
 check((price.currency||'KRW')==='KRW','CURRENCY_NOT_SUPPORTED');
 const counts=price.counts||{},lines=[],unknown=[],warnings=[];
 const seen=new Set();
 function line(x,isBase=false) {
  check(x&&id(x.id)&&label(x.label),'INVALID_PRICE_LINE');check(!seen.has(x.id),'DUPLICATE_PRICE_LINE');seen.add(x.id);
  if(!isBase&&x.includedInBase===true){lines.push({id:x.id,label:x.label,includedInBase:true,subtotal:0,formula:'기본 가격에 포함'});return;}
  const v=amountValue(x.value,now),count=multiplier(x.basis,counts);
  if(v.amount===null){unknown.push(x.label);lines.push({id:x.id,label:x.label,status:'unknown',subtotal:null,reason:v.reason});return;}
  const subtotal=mul(v.amount,count);
  lines.push({id:x.id,label:x.label,unitPrice:v.amount,count,subtotal,status:v.status,formula:fmt(v.amount)+' × '+count+' = '+fmt(subtotal)});
  if(v.expired)warnings.push(x.label+': 가격 유효기간이 지나 예상 금액으로 표시');
 }
 line({...price.base,id:'base',label:price.base?.label||'기본 가격'},true);
 check(Array.isArray(price.charges||[])&&(price.charges||[]).length<=30,'INVALID_CHARGES');
 for(const x of price.charges||[])line(x);
 if(price.additionalCostsChecked!==true)unknown.push('세금·수수료 등 추가금 확인 필요');
 for(const x of price.discounts||[]) {
  check(x&&id(x.id)&&label(x.label)&&!seen.has(x.id),'INVALID_OR_DUPLICATE_DISCOUNT');seen.add(x.id);
  const v=amountValue(x.value,now);
  if(x.eligible!==true||v.status!=='confirmed'||v.expired||v.amount===null){warnings.push(x.label+': 적용 미확인 할인은 차감하지 않음');continue;}
  const current=lines.reduce((n,l)=>add(n,l.subtotal||0),0);
  check(v.amount<=current,'DISCOUNT_EXCEEDS_KNOWN_COST');
  lines.push({id:x.id,label:x.label,subtotal:-v.amount,status:'confirmed',formula:'확인된 할인 −'+fmt(v.amount)});
 }
 let confirmed=0,estimated=0;
 for(const x of lines){if(x.status==='confirmed')confirmed=add(confirmed,x.subtotal);if(x.status==='estimated')estimated=add(estimated,x.subtotal);}
 const knownSubtotal=add(confirmed,estimated),complete=unknown.length===0;
 let dueNow=null,later=null;
 if(price.deposit!==undefined){dueNow=integer(price.deposit);check(complete&&dueNow<=knownSubtotal,'DEPOSIT_REQUIRES_COMPLETE_TOTAL');later=knownSubtotal-dueNow;}
 return {currency:'KRW',lines,confirmed,estimated,unknown,warnings,knownSubtotal,complete,total:complete?knownSubtotal:null,kind:!complete?'INCOMPLETE':estimated!==0||lines.some(x=>x.status==='estimated')?'ESTIMATED':'QUOTED',dueNow,later,depositIncludedInTotal:price.deposit!==undefined};
}
export function calculateTotal(items,{discounts=[],now=Date.now()}={}) {
 check(Array.isArray(items)&&items.length>0&&items.length<=100,'ITEMS_REQUIRED');
 const seen=new Set(),rows=items.map(x=>{check(id(x.id)&&!seen.has(x.id),'DUPLICATE_OR_INVALID_ITEM');seen.add(x.id);return {id:x.id,title:x.title,...calculateItem(x.price,{now})};});
 let confirmed=0,estimated=0;const unknown=[],warnings=[];
 for(const x of rows){confirmed=add(confirmed,x.confirmed);estimated=add(estimated,x.estimated);unknown.push(...x.unknown.map(y=>x.title+': '+y));warnings.push(...x.warnings);}
 const discountRows=[],discountIds=new Set(rows.flatMap(x=>x.lines.map(l=>l.id).filter(x=>x!=='base')));
 for(const d of discounts){check(id(d.id)&&label(d.label)&&!discountIds.has(d.id),'DUPLICATE_OR_INVALID_SHARED_DISCOUNT');discountIds.add(d.id);
  const v=amountValue(d.value,now);if(d.eligible!==true||v.status!=='confirmed'||v.amount===null||v.expired){warnings.push(d.label+': 공통 할인 적용 미확인');continue;}
  check(v.amount<=add(confirmed,estimated),'DISCOUNT_EXCEEDS_KNOWN_COST');confirmed=add(confirmed,-v.amount);discountRows.push({id:d.id,label:d.label,amount:v.amount});
 }
 const complete=unknown.length===0,knownSubtotal=add(confirmed,estimated),kind=!complete?'INCOMPLETE':rows.some(x=>x.kind==='ESTIMATED')?'ESTIMATED':'QUOTED';
 const total=complete?knownSubtotal:null;
 const headline=kind==='INCOMPLETE'?'확인·추정한 소계는 '+fmt(knownSubtotal)+'이며, 미확인 비용이 있어 전체 총액은 아직 확정할 수 없습니다.':kind==='ESTIMATED'?'이 조합을 선택하면 예상 총액은 약 '+fmt(total)+'입니다.':'이 조합의 조회 시점 총액은 '+fmt(total)+'입니다.';
 return {currency:'KRW',items:rows,sharedDiscounts:discountRows,confirmed,estimated,knownSubtotal,total,complete,kind,unknown,warnings,headline,paymentCompleted:false};
}
function weightsFor(value) {
 const w=value??{price:30,distanceKm:20,durationMin:20,rating:20,conditions:10};
 check(w&&typeof w==='object'&&!Array.isArray(w),'INVALID_WEIGHTS');
 let total=0;for(const [k,v] of Object.entries(w)){check(own(METRICS,k)&&Number.isFinite(v)&&v>=0&&v<=1000,'INVALID_WEIGHT');total+=v;}
 check(total>0,'EMPTY_PRIORITY');
 return Object.fromEntries(Object.keys(METRICS).map(k=>[k,(w[k]||0)/total]));
}
function sourceFor(c,now,maxAgeHours) {
 const s=c.source;check(s&&label(s.url)&&date(s.observedAt),'SOURCE_AND_TIME_REQUIRED');
 let u;try{u=new URL(s.url)}catch{fail('INVALID_SOURCE_URL')};check(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password,'INVALID_SOURCE_URL');
 check(Date.parse(s.observedAt)<=now+300000,'FUTURE_SOURCE_TIME');
 return {...s,stale:now-Date.parse(s.observedAt)>maxAgeHours*3600000};
}
function normalizedCandidate(c,group,now,maxAgeHours) {
 check(c&&id(c.id)&&label(c.title),'INVALID_CANDIDATE');
 const source=sourceFor(c,now,maxAgeHours),cost=calculateItem(c.price,{now});
 for(const k of ['distanceKm','durationMin'])if(c[k]!=null)check(Number.isFinite(c[k])&&c[k]>=0,'INVALID_'+k);
 let rating=null;
 if(c.rating!=null){check(c.rating&&Number.isFinite(c.rating.value)&&Number.isFinite(c.rating.scale)&&c.rating.scale>0&&c.rating.value>=0&&c.rating.value<=c.rating.scale,'INVALID_RATING');rating=c.rating.value/c.rating.scale;}
 const conditions=c.conditions||{};check(Object.values(conditions).every(v=>[true,false,null].includes(v)),'INVALID_CONDITION_VALUE');
 const prefs=group.preferredConditions||[];
 const metrics={price:cost.total,distanceKm:c.distanceKm??null,durationMin:c.durationMin??null,rating,conditions:prefs.length?prefs.filter(k=>conditions[k]===true).length/prefs.length:null};
 const excluded=[];
 if(c.available===false)excluded.push('이용 불가');
 if(group.requireAvailable!==false&&c.available!==true)excluded.push('이용 가능 여부 미확인');
 for(const k of group.requiredConditions||[])if(conditions[k]!==true)excluded.push(k+': 필수 조건 불충족 또는 미확인');
 const constraints=group.constraints||{};
 const limitMap={maxPrice:['price','max'],maxDistanceKm:['distanceKm','max'],maxDurationMin:['durationMin','max'],minRatingRatio:['rating','min']};
 for(const [key,n] of Object.entries(constraints)){
  check(own(limitMap,key)&&Number.isFinite(n)&&n>=0,'INVALID_CONSTRAINT');const [m,op]=limitMap[key];
  if(metrics[m]===null||(op==='max'?metrics[m]>n:metrics[m]<n))excluded.push(key+': 조건 불충족 또는 미확인');
 }
 check(Array.isArray(c.conflictsWith||[])&&(c.conflictsWith||[]).every(id),'INVALID_CONFLICTS');
 return {...copy(c),groupId:group.id,source,cost,metrics,excluded};
}
function publicChoice(c) {
 return {id:c.id,title:c.title,groupId:c.groupId,source:c.source,score:c.score,criteria:c.criteria,cost:c.cost,conditions:c.conditions||{},tradeoffs:c.tradeoffs||[],available:c.available,conflictsWith:c.conflictsWith||[]};
}
export function recommend(input,{now=Date.now()}={}) {
 check(input&&label(input.query),'QUERY_REQUIRED');
 check(Array.isArray(input.groups)&&input.groups.length>0&&input.groups.length<=8,'GROUPS_REQUIRED');
 const maxAgeHours=input.maxAgeHours??24;check(Number.isFinite(maxAgeHours)&&maxAgeHours>0&&maxAgeHours<=720,'INVALID_MAX_AGE');
 const weights=weightsFor(input.weights),ids=new Set(),groupIds=new Set(),excluded=[],warnings=[];let collected=0;
 const groups=input.groups.map(g=>{
  check(id(g.id)&&!groupIds.has(g.id)&&label(g.title),'INVALID_GROUP');groupIds.add(g.id);
  check(Array.isArray(g.candidates)&&g.candidates.length>0&&g.candidates.length<=30,'CANDIDATES_REQUIRED');
  const candidates=[];
  for(const raw of g.candidates){collected++;check(!ids.has(raw.id),'DUPLICATE_CANDIDATE_ID');ids.add(raw.id);const c=normalizedCandidate(raw,g,now,maxAgeHours);
   // Deduplicate only explicit same offers; distinct rate plans remain separate.
   if(c.offerKey!==undefined){check(label(c.offerKey),'INVALID_OFFER_KEY');const old=candidates.find(x=>x.offerKey===c.offerKey);if(old){if(JSON.stringify(old.price)!==JSON.stringify(c.price))fail('CONFLICTING_DUPLICATE_QUOTE');continue;}}
   candidates.push(c);
  }
  const eligible=candidates.filter(c=>{if(c.excluded.length)excluded.push({id:c.id,title:c.title,reasons:c.excluded});return !c.excluded.length;});
  for(const c of eligible){c.criteria=[];c.score=0;
   for(const [k,w] of Object.entries(weights)){if(!w)continue;const values=eligible.map(x=>x.metrics[k]).filter(x=>x!==null),v=c.metrics[k];
    const min=values.length?Math.min(...values):null,max=values.length?Math.max(...values):null;
    const normalized=v===null?0:max===min?1:METRICS[k].direction==='low'?(max-v)/(max-min):(v-min)/(max-min);
    const contribution=normalized*w;c.score+=contribution;c.criteria.push({key:k,label:METRICS[k].label,weight:w,value:v,normalized,contribution,missing:v===null});
   }
  }
  return {...copy(g),candidates:eligible};
 });
 if(groups.some(g=>g.candidates.length===0))return {ok:false,code:'NO_ELIGIBLE_CHOICE',recommendation:null,excluded,mainConditions:input.groups.map(g=>({group:g.title,required:g.requiredConditions||[],constraints:g.constraints||{}}))};
 let combinations=1;for(const g of groups)combinations*=g.candidates.length;check(combinations<=10000,'TOO_MANY_COMBINATIONS');
 if(input.budget!==undefined)integer(input.budget,'INVALID_BUDGET');
 // Every cross-item relation must come from collected evidence, not a guessed schedule.
 for(const g of groups)for(const c of g.candidates)for(const conflict of c.conflictsWith||[])check(ids.has(conflict),'UNKNOWN_CONFLICT_ID');
 const ranked=[];let rejectedBudget=0,rejectedConflict=0,feasibleCount=0;
 const compare=(a,b)=>b.score-a.score||Number(b.totals.complete)-Number(a.totals.complete)||(a.totals.total??Infinity)-(b.totals.total??Infinity)||a.key.localeCompare(b.key,'en');
 function visit(i,selected) {
  if(i<groups.length){for(const c of groups[i].candidates){if(selected.some(x=>(x.conflictsWith||[]).includes(c.id)||(c.conflictsWith||[]).includes(x.id))){rejectedConflict++;continue;}visit(i+1,[...selected,c]);}return;}
  const totals=calculateTotal(selected,{discounts:input.sharedDiscounts||[],now});
  if(input.budget!==undefined&&(!totals.complete||totals.total>input.budget)){rejectedBudget++;return;}
  const score=selected.reduce((n,c)=>n+c.score,0)/groups.length;
  feasibleCount++;
  ranked.push({selected,score,totals,key:selected.map(x=>x.id).join('|')});
  ranked.sort(compare);if(ranked.length>2)ranked.pop();
 }
 visit(0,[]);
 ranked.sort(compare);
 if(!ranked.length)return {ok:false,code:'NO_FEASIBLE_COMBINATION',recommendation:null,excluded,rejectedBudget,rejectedConflict};
 const first=ranked[0],second=ranked[1],names=first.selected.map(c=>c.title).join(' + ');
 if(collected<2)warnings.push('비교 후보가 1개뿐이므로 최적 여부를 충분히 비교하지 못했습니다.');
 for(const c of first.selected){if(c.source.stale)warnings.push(c.title+': 오래된 조회 자료이므로 재확인 필요');if(c.criteria.some(x=>x.missing))warnings.push(c.title+': 일부 비교 기준 미확인');}
 if(groups.length>1&&input.compatibilityChecked!==true)warnings.push('항목 간 일정·이동 연결은 아직 검증되지 않았습니다.');
 const mainConditions={query:input.query,budget:input.budget??null,priorities:Object.entries(weights).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({key:k,label:METRICS[k].label,weight:v})),groups:input.groups.map(g=>({id:g.id,title:g.title,required:g.requiredConditions||[],preferred:g.preferredConditions||[],constraints:g.constraints||{}})),priceScope:'조회 후보와 수집 시점의 원화 가격',tieBreak:'동점이면 비용 확인 여부, 총액, 후보 ID 순서'};
 const toPublic=r=>({items:r.selected.map(publicChoice),score:r.score,totals:r.totals});
 const recommendation=toPublic(first);
 const runnerUp=second?toPublic(second):null;
 const conditionLabels=mainConditions.priorities.map(x=>x.label+' '+Math.round(x.weight*100)+'%').join(', ');
 const explanation={summary:'필수 조건을 통과한 '+feasibleCount+'개 조합을 '+conditionLabels+' 기준으로 비교했습니다.',selected:recommendation.items.map(c=>({id:c.id,title:c.title,criteria:c.criteria,tradeoffs:c.tradeoffs,source:c.source})),comparison:runnerUp?{other:runnerUp.items.map(x=>x.title),scoreDifference:first.score-second.score,priceDifference:recommendation.totals.complete&&runnerUp.totals.complete?recommendation.totals.total-runnerUp.totals.total:null,tied:first.score===second.score}:null,excluded};
 return {ok:true,version:2,createdAt:new Date(now).toISOString(),collectedCandidates:collected,eligibleCandidates:groups.reduce((n,g)=>n+g.candidates.length,0),evaluatedCombinations:feasibleCount,recommendation,alternatives:input.includeAlternatives&&runnerUp?[runnerUp]:[],alternativesAvailable:!!runnerUp,mainConditions,headline:'JH 추천: '+names+'. '+first.totals.headline,explanation,warnings,conditional:warnings.length>0||!first.totals.complete,scope:'수집한 후보와 명시된 조건 내 추천',_runnerUp:runnerUp};
}

/** Stores completed decision evidence only. Never persists or restarts an active task. */
export class DecisionStore {
 constructor({directory=null,limit=500,captureBinding=null}={}){check(Number.isSafeInteger(limit)&&limit>0,'INVALID_STORE_LIMIT');this.captureBinding=captureBinding;this.directory=directory;this.limit=limit;this.cache=new Map();if(directory){check(path.isAbsolute(directory),'ABSOLUTE_STATE_DIR_REQUIRED');mkdirSync(directory,{recursive:true,mode:0o700});}}
 save(result){check(result.ok===true,'ONLY_COMPLETED_DECISION_SAVED');const decisionId='choice_'+randomUUID();const record={...copy(result),decisionId,...(this.captureBinding?{command_binding:this.captureBinding()}:{} )};
  if(this.directory){const file=path.join(this.directory,decisionId+'.json'),tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify(record),{flag:'wx',mode:0o600});renameSync(tmp,file);}
  this.cache.set(decisionId,record);while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);return this.view(record);
 }
 get(decisionId){check(typeof decisionId==='string'&&/^choice_[a-f0-9-]{36}$/.test(decisionId),'INVALID_DECISION_ID');let r=this.cache.get(decisionId);if(!r&&this.directory){const file=path.join(this.directory,decisionId+'.json');if(existsSync(file))r=JSON.parse(readFileSync(file,'utf8'));}check(r,'DECISION_NOT_FOUND');return copy(r);}
 view(record){const {_runnerUp,explanation,...r}=copy(record);return {...r,historyPersistence:this.directory?'disk':'process_only'};}
 why(decisionId,{alternatives=false}={}){const r=this.get(decisionId);return {decisionId,createdAt:r.createdAt,mainConditions:r.mainConditions,explanation:r.explanation,totals:r.recommendation.totals,alternatives:alternatives&&r._runnerUp?[r._runnerUp]:[],warnings:r.warnings};}
}
