import {parentPort,workerData} from 'node:worker_threads';
import {parsePickupQuestion} from './pickup-question.mjs';

export function answerPickup(question,notice){
  return parsePickupQuestion(question,notice).recognized
    ? notice.pickup
    : '행사 이름과 어떤 자료의 수령처를 찾으시는지 확인해 주세요.';
}
if(parentPort){
  parentPort.postMessage({requestRef:workerData.requestRef,replyRef:workerData.replyRef,
    text:answerPickup(workerData.question,workerData.notice)});
}
