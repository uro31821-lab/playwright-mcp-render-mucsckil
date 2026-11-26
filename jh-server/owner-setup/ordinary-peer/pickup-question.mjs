// A separate, affirmative request can follow the pickup question. A mention or
// a negated request must never change how an ordinary answer is displayed.
const receiptSuffix = /\s+(?:이번\s+)?회신\s*번호(?:도|를)?\s*(?:알려\s*(?:주세요|줘|주시겠어요)|표시해\s*(?:주세요|줘))\s*[.!?]?\s*$/u;

// Handoffs may paraphrase an instruction. Only an affirmative receipt request
// selects the display form; withdrawal, examples and mere mentions do not.
export function requestsReceipt(question){
  const affirmative=/회신\s*번호(?:까지|도|를|는)?\s*(?:(?:함께|같이|마지막\s*줄에|끝에|꼭|그대로)\s*)*(?:알려|적어|붙여|써|포함해|표시해|기재해|남겨|보여)\s*(?:주세요|줘|주시겠어요|달라|줘요)\s*[.!?]?\s*$/u;
  return affirmative.test(question);
}
export function withReceipt(text,id,requested){
  return requested?text+'\n회신번호: '+id:text;
}
function splitReceiptRequest(question) {
  const suffix = receiptSuffix.exec(question);
  return suffix
    ? { pickupQuestion: question.slice(0, suffix.index), requested: true }
    : { pickupQuestion: question, requested: false };
}

export const trialReceiptSuffix = ' 회신번호도 알려 주세요.';

export function parsePickupQuestion(question,notice){
  const {pickupQuestion, requested}=splitReceiptRequest(question);
  const normalized=pickupQuestion.normalize('NFC').replace(/\s+/gu,' ').trim();
  const event=notice.event.normalize('NFC').replace(/\s+/gu,' ').trim();
  const rest=normalized.startsWith(event)?normalized.slice(event.length).trim():'';
  const collection=/^(?:(?:행사|참가자)\s*)*(?:자료|준비물|인쇄물|안내문|키트)(?:는|은|를|을)?\s*어디(?:서|에서)\s*(?:받(?:아요|나요|죠|아|으면\s*될까요)|수령(?:하나요|해요))\s*[?.!]?$/u;
  const desk=/^(?:(?:행사|참가자|자료)\s*)*(?:수령|배부)\s*(?:처|창구|장소)(?:\s*이름)?\s*(?:(?:을|를)?\s*알려\s*(?:줘|주세요)|(?:는|은|가|이)?\s*어디(?:인가요|예요|에요|입니까|야|죠|지))\s*[?.!]?$/u;
  const recognized=collection.test(rest)||desk.test(rest);
  return {recognized, showReceipt: recognized&&requested};
}
