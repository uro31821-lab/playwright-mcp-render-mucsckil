import {createHash} from 'node:crypto';
import {parsePickupQuestion} from './pickup-question.mjs';

const schema='jh.preparation-notices.v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const eventName=text=>text.normalize('NFC').replace(/\s+/gu,' ').trim();
const bounded=(text,max)=>typeof text==='string' && text.trim().length>0 && Array.from(text).length<=max;
const exactKeys=(value,keys)=>value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===keys;
const validPlace=row=>bounded(row.event,160) && bounded(row.pickup,240);

export const unavailablePickup='현재 공지에서 이 행사의 자료 수령처를 확인할 수 없습니다.';

export function pickupText(notice){
  return notice.status==='unavailable'?unavailablePickup:notice.pickup;
}

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
    const unavailable=exactKeys(row,'event,revision,status') && row.status==='unavailable' && bounded(row.event,160);
    const available=exactKeys(row,'event,pickup,revision') && validPlace(row);
    if((!available && !unavailable) || !Number.isSafeInteger(row.revision) || row.revision<1)throw Error('PEER_NOTICE_INVALID');
    // Preserve input bytes in the registered catalog digest before normalizing the lookup index.
    const canonicalRow=unavailable?{event:row.event,status:'unavailable',revision:row.revision}
      :{event:row.event,pickup:row.pickup,revision:row.revision};
    canonical.push(canonicalRow);
    const event=eventName(row.event), revision=row.revision;
    const notice=unavailable?{event,status:'unavailable',revision}:{event,pickup:row.pickup.trim(),revision};
    const key=JSON.stringify([event,revision]), prior=histories.get(key);
    if(prior && (prior.status!==notice.status || prior.pickup!==notice.pickup))throw Error('PEER_NOTICE_REVISION_CONFLICT');
    histories.set(key,notice);
    const existing=current.get(event);
    if(!existing || existing.revision<revision)current.set(event,notice);
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
  return notice.revision===1 && notice.status!=='unavailable'?digest({event:notice.event,pickup:notice.pickup}):digest(notice);
}
