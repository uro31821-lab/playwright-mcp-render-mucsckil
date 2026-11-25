import {createHash} from 'node:crypto';
import {parsePickupQuestion} from './pickup-question.mjs';

const schema='jh.preparation-notices.v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const eventName=text=>text.normalize('NFC').replace(/\s+/gu,' ').trim();
const bounded=(text,max)=>typeof text==='string' && text.trim().length>0 && Array.from(text).length<=max;
const exactKeys=(value,keys)=>value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===keys;
const validPlace=row=>bounded(row.event,160) && bounded(row.pickup,240);

export function readNoticeCatalog(json){
  const value=JSON.parse(json);
  if(exactKeys(value,'event,pickup') && validPlace(value)){
    const notice={event:value.event.trim(),pickup:value.pickup.trim()};
    return {notices:[notice],sourceDigest:digest(notice),trialCard:digest([notice.event,notice.pickup]),legacy:true};
  }
  if(!exactKeys(value,'notices,schema') || value.schema!==schema || !Array.isArray(value.notices) || !value.notices.length)
    throw Error('PEER_NOTICE_INVALID');

  const histories=new Map(), current=new Map(), canonical=[];
  for(const row of value.notices){
    if(!exactKeys(row,'event,pickup,revision') || !validPlace(row) || !Number.isSafeInteger(row.revision) || row.revision<1)
      throw Error('PEER_NOTICE_INVALID');
    canonical.push({event:row.event,pickup:row.pickup,revision:row.revision});
    const event=eventName(row.event), pickup=row.pickup.trim(), revision=row.revision;
    const key=JSON.stringify([event,revision]);
    if(histories.has(key) && histories.get(key)!==pickup)throw Error('PEER_NOTICE_REVISION_CONFLICT');
    histories.set(key,pickup);
    const existing=current.get(event);
    if(!existing || existing.revision<revision)current.set(event,{event,pickup,revision});
  }
  const trialCard=digest({schema,notices:canonical});
  return {notices:[...current.values()],sourceDigest:trialCard,trialCard,legacy:false};
}

// A prefix can be used to ask which branch the user means, never to decide a pickup.
export function selectNotice(question,notices){
  const matches=notices.filter(notice=>parsePickupQuestion(question,notice).recognized);
  return matches.length===1?matches[0]:null;
}

export function clarifyPickup(question,notices){
  const fallback='행사 이름과 어떤 자료의 수령처를 찾으시는지 확인해 주세요.';
  if(notices.length<2)return fallback;
  const choices=[];
  for(const notice of notices){
    const words=eventName(notice.event).split(' ');
    for(let length=words.length-1;length>0;length--){
      const common=words.slice(0,length).join(' ');
      if(parsePickupQuestion(question,{event:common}).recognized){
        choices.push(words.slice(length).join(' '));
        break;
      }
    }
  }
  if(choices.length===2 && choices[0]!==choices[1])return `${choices[0]}, ${choices[1]} 중 어느 행사인가요?`;
  return fallback;
}

// Revision one is the entry point for previously stored single-notice retries.
export function noticeDigest(notice){
  return notice.revision===1?digest({event:notice.event,pickup:notice.pickup}):digest(notice);
}
