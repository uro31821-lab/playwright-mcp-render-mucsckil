import {parentPort,workerData} from 'node:worker_threads';

export function answerPickup(question,notice){
  const normalized=question.normalize('NFC').replace(/\s+/gu,' ').trim();
  const event=notice.event.normalize('NFC').replace(/\s+/gu,' ').trim();
  const rest=normalized.startsWith(event)?normalized.slice(event.length).trim():'';
  const collection=/^(?:(?:행사|참가자)\s*)*(?:자료|준비물|인쇄물|안내문|키트)(?:는|은|를|을)?\s*어디(?:서|에서)\s*(?:받(?:아요|나요|죠|아|으면\s*될까요)|수령(?:하나요|해요))\s*[?.!]?$/u;
  const desk=/^(?:(?:행사|참가자|자료)\s*)*(?:수령|배부)\s*(?:처|창구|장소)(?:\s*이름)?\s*(?:(?:을|를)?\s*알려\s*(?:줘|주세요)|(?:는|은|가|이)?\s*어디(?:인가요|예요|에요|입니까|야|죠|지))\s*[?.!]?$/u;
  if(!collection.test(rest)&&!desk.test(rest))
    return '행사 이름과 어떤 자료의 수령처를 찾으시는지 확인해 주세요.';
  return notice.pickup;
}
if(parentPort){
  parentPort.postMessage({requestRef:workerData.requestRef,replyRef:workerData.replyRef,
    text:answerPickup(workerData.question,workerData.notice)});
}
