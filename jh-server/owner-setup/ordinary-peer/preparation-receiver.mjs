import {parentPort,workerData} from 'node:worker_threads';
import {selectNotice,clarifyPickup,pickupText} from './notice-catalog.mjs';

export function answerPickup(question,source){
  const notices=Array.isArray(source)?source:[source];
  const notice=selectNotice(question,notices);
  return notice?pickupText(notice):clarifyPickup(question,notices);
}
if(parentPort){
  parentPort.postMessage({requestRef:workerData.requestRef,replyRef:workerData.replyRef,
    text:answerPickup(workerData.question,workerData.notices)});
}
