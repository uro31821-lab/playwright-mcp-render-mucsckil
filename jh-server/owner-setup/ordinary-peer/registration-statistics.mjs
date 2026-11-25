import {parentPort,workerData} from 'node:worker_threads';

export const unknownCount='현재 등록 집계에서 이 행사의 확정 인원을 확인할 수 없습니다.';
const normalized=value=>value.normalize('NFC').replace(/\s+/gu,' ').trim();

// A record is a count of confirmed registrants by disjoint team, not an identifiable roster.
export function registrationRecords(raw){
  const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length>500)throw Error('INVALID_REGISTRATION_SOURCE');
  const events=new Set();
  return rows.map(row=>{
    if(!row||typeof row.event!=='string'||!normalized(row.event)||row.event.length>160||
        !Array.isArray(row.teams)||!row.teams.length||row.teams.length>100)throw Error('INVALID_REGISTRATION_SOURCE');
    const event=normalized(row.event);
    if(events.has(event))throw Error('DUPLICATE_REGISTRATION_EVENT');
    events.add(event);
    const labels=new Set();
    const teams=row.teams.map(team=>{
      if(!team||typeof team.label!=='string'||!normalized(team.label)||team.label.length>80||
          !Number.isSafeInteger(team.confirmed)||team.confirmed<0||team.confirmed>1000000)throw Error('INVALID_REGISTRATION_TEAM');
      const label=normalized(team.label);
      if(labels.has(label))throw Error('DUPLICATE_REGISTRATION_TEAM');
      labels.add(label);
      return {label,confirmed:team.confirmed};
    });
    return {event,teams};
  });
}
export function matchesEvent(question,event){
  const text=normalized(question), name=normalized(event);
  const start=text.indexOf(name);
  if(start<0)return false;
  const tail=text.slice(start+name.length);
  return (start===0||/[\s“"'「(,]/u.test(text[start-1])) && /^(?:$|[\s,.!?“”"')」]|(?:의|에|에는|에서|은|는|을|를|이|가|용)(?:\s|$))/u.test(tail);
}
export function selectRegistration(question,records){
  if(!/(?:확정|등록|신청|참가|참석|참여|명단|인원|인당)/u.test(question)||!/(?:인원|수량|몇\s*(?:명|부)|총원|합계|몇\s*사람|총\s*(?:수|등록|참가|신청)|전체\s*수)/u.test(question))return null;
  if(/취소|대기|성비|평균|미확정|불참|백분율|비율|증가율|전년/u.test(question))return null;
  const matched=records.filter(row=>matchesEvent(question,row.event));
  if(matched.length!==1)return null;
  // This receiver answers confirmed totals. A named subgroup needs a different metric.
  const record=matched[0];
  return record.teams.some(team=>question.includes(team.label))?null:record;
}
export function answerRegistration(row){
  if(!row)return unknownCount;
  const total=row.teams.reduce((sum,team)=>sum+team.confirmed,0);
  return '확정 등록 인원은 총 '+total+'명입니다.';
}
if(parentPort && workerData?.actor==='statistics')parentPort.postMessage({requestRef:workerData.requestRef,replyRef:workerData.replyRef,text:answerRegistration(workerData.registration)});
