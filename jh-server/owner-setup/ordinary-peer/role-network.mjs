import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {roleCatalog} from './role-catalog.mjs';
import {calculate} from './role-calculations.mjs';
import {requestsReceipt,withReceipt} from './pickup-question.mjs';

const maximumAge=15*60_000;
const maxRows=1024;
const hash=value=>createHash('sha256').update(value).digest('hex');
const failure=text=>({isError:true,content:[{type:'text',text}]});
const invalid=()=>failure('이 동료 요청의 역할, 입력 자료 또는 회신 표식을 확인해 주세요.');
const busy=()=>failure('동료 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
const storedBases=new Set(['conversation_material','published_role_work','authorized_tool_result','unavailable']);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])):value;
function packet(body,content){
  return {structuredContent:body,content:[{type:'text',text:content??body.text??JSON.stringify(body)}]};
}
function safeText(value,max){
  return typeof value==='string'&&value.trim()!==''&&Array.from(value).length<=max&&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}
// Older clients expose the question field before they refresh optional input shapes.
const inlineFormats = new Map([
  ['medication',{prefix:'JH_MEDICATION_LEAFLETS_V1='}],
  ['tropical_trading',{prefix:'JH_TRADING_RULE_V1='}],
  ['insurance',{prefix:'JH_INSURANCE_EXCERPTS_V1='}],
  ['personal',{prefix:'JH_PREFERENCE_REVISIONS_V1='}],
  ['camera',{prefix:'JH_CAMERA_PLANS_V1='}],
  ['audio',{prefix:'JH_AUDIO_PRESETS_V1='}],
  ['food',{prefix:'JH_MENU_TERMS_V1='}],
  ['reservation',{prefix:'JH_RESERVATION_TIMES_V1='}],
  ['repair',{prefix:'JH_REPAIR_QUOTES_V1='}],
  ['suggestion',{prefix:'JH_COOPERATION_REVIEW_V1='}],
  ['government_services',{prefix:'JH_DOCUMENT_LIST_V1='}],
  ['nostalgia',{prefix:'JH_NOSTALGIA_AGES_V1='}],
  ['photo',{prefix:'JH_PHOTO_OBSERVATIONS_V1=',list:'observations'}],
  ['history',{prefix:'JH_HISTORY_PERIODS_V1=',list:'periods'}],
  ['official_document',{prefix:'JH_NOTICE_V1='}]
]);
function inlinePayload(args) {
  const format=inlineFormats.get(args.actor);
  if (!format) return {input:args.workInput,question:args.question};
  const lines=args.question.split(/\r?\n/u);
  const first=lines.findIndex(line=>line.startsWith(format.prefix));
  if(first===-1)return {input:args.workInput,question:args.question};
  if(args.workInput!==undefined || first===0 || first!==lines.length-1 || Array.from(args.question).length>2200)
    throw Error('INVALID_INLINE_RECORD_LINE');
  const question=lines.slice(0,first).join('\n');
  if(!question.trim())throw Error('INLINE_QUESTION_REQUIRED');
  const data=JSON.parse(lines[first].slice(format.prefix.length));
  return {input:format.list ? {[format.list]:data} : data,question};
}

export function openRoleNetwork(db,owner,clock=Date.now,recordTrial=line=>console.info(line)) {
  db.exec(`CREATE TABLE IF NOT EXISTS peer_return_keys(owner TEXT PRIMARY KEY, key BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS peer_role_work (
    owner TEXT NOT NULL, retry_hash TEXT NOT NULL, request_ref TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL, actor TEXT NOT NULL, requester TEXT NOT NULL,
    issued_at INTEGER NOT NULL, result TEXT, trial_question TEXT, client_hash TEXT NOT NULL, show_receipt INTEGER NOT NULL, UNIQUE(owner,retry_hash));
    CREATE INDEX IF NOT EXISTS peer_role_work_expiry ON peer_role_work(issued_at);`);
  db.prepare('INSERT OR IGNORE INTO peer_return_keys VALUES(?,?)').run(owner,randomBytes(32));
  const key=db.prepare('SELECT key FROM peer_return_keys WHERE owner=?').get(owner).key;
  const byKey=db.prepare('SELECT * FROM peer_role_work WHERE owner=? AND retry_hash=?');
  const byRef=db.prepare('SELECT * FROM peer_role_work WHERE owner=? AND request_ref=?');
  const expire=db.prepare('DELETE FROM peer_role_work WHERE issued_at<=?');
  const size=db.prepare('SELECT COUNT(*) AS count FROM peer_role_work WHERE owner=?');
  const insert=db.prepare('INSERT OR IGNORE INTO peer_role_work VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const finish=db.prepare('UPDATE peer_role_work SET result=? WHERE owner=? AND request_ref=? AND result IS NULL');
  const legacy=db.prepare('SELECT 1 AS used FROM peer_requests WHERE owner=? AND retry_hash=?');
  const token=row=>createHmac('sha256',key).update(JSON.stringify([row.owner,row.request_ref,row.fingerprint,row.actor,row.requester,row.issued_at])).digest('hex');
  function trace(row){
    if(!row.trial_question||!row.result)return;
    const result=JSON.parse(row.result);
    const receipt={actor:row.actor,requester:row.requester,requestRef:row.request_ref,replyRef:result.replyRef,
      origin:result.origin,availability:result.availability,operation:result.operation??null,basis:result.basis,
      questionSha256:row.trial_question,answerSha256:hash(result.text),utc:new Date(clock()).toISOString()};
    try{recordTrial('JH_PEER_ROOM67_REPLY '+JSON.stringify(receipt));}catch{}
  }
  function read(row){
    if(row.result){
      const result=JSON.parse(row.result);
      return packet(result,withReceipt(result.text,result.replyRef,row.show_receipt&&result.availability==='available'));
    }
    const {skill,capability}=roleCatalog.get(row.actor);
    return packet({status:'awaiting_role_work',origin:'host_handoff',requestRef:row.request_ref,
      actor:row.actor,requester:row.requester,skill,capability,returnToken:token(row),expiresAt:new Date(row.issued_at+maximumAge).toISOString(),
      peerWorkVerifiedExternally:false});
  }
  function finalResult(requestRef, actor,requester,reply){
    return {status:'returned_to_model',scope:'active_tool_call',requestRef,replyRef:randomUUID(),actor,requester,
      availability:reply.basis==='unavailable'?'unavailable':'available',peerWorkVerifiedExternally:false,
      originalQuestionVerified:false,finalDisplayVerified:false,...reply};
  }
  const clientScope=claims=>hash(JSON.stringify([claims?.client??null,claims?.resource??null]));
  function ask(args,claims){
    if(!roleCatalog.has(args.requester)||!roleCatalog.has(args.actor)||args.actor===args.requester)return invalid();
    let payload;
    try{payload=inlinePayload(args);}catch{return invalid();}
    const at=clock();
    expire.run(at-maximumAge);
    const fingerprint=hash(JSON.stringify(canonical([args.actor,args.requester,args.question,args.purpose,payload.input??null,clientScope(claims)])));
    const retryHash=hash(args.retryKey??randomUUID());
    const existing=byKey.get(owner,retryHash);
    if(existing)return existing.fingerprint===fingerprint?read(existing):invalid();
    if(legacy.get(owner,retryHash))return invalid();
    if(size.get(owner).count>=maxRows)return busy();
    const ref=randomUUID();
    let result=null;
    if(payload.input!==undefined){
      let answer;
      try{answer=calculate(args.actor,payload.input);}catch{return invalid();}
      result=JSON.stringify(finalResult(ref,args.actor,args.requester,{origin:'native',basis:'server_calculation',...answer}));
    }
    const trial=args.purpose==='JH67 합성 동일방 검증'?hash(args.question):null;
    const fresh=insert.run(owner,retryHash,ref,fingerprint,args.actor,args.requester,at,result,trial,clientScope(claims),Number(requestsReceipt(payload.question))).changes;
    const row=byKey.get(owner,retryHash);
    if(row.fingerprint!==fingerprint)return invalid();
    if(fresh)trace(row);
    return read(row);
  }
  function accept(args,claims){
    const at=clock();
    expire.run(at-maximumAge);
    const row=byRef.get(owner,args.requestRef);
    if(!row||row.client_hash!==clientScope(claims)||args.actor!==row.actor||args.requester!==row.requester||
        typeof args.returnToken!=='string'||!/^[a-f0-9]{64}$/.test(args.returnToken)||
        !timingSafeEqual(Buffer.from(args.returnToken,'hex'),Buffer.from(token(row),'hex')))return invalid();
    const {basis,text,sourceRef}=args;
    if(!storedBases.has(basis)||!safeText(text,512)||
        (sourceRef!==undefined&&!safeText(sourceRef,192))||
        (basis==='authorized_tool_result'&&!sourceRef)||
        (roleCatalog.get(row.actor).capability&&!['authorized_tool_result','unavailable'].includes(basis)))return invalid();
    const reply={origin:'host_composed',basis,text,...(sourceRef?{sourceRef}:{})};
    if(row.result){
      const old=JSON.parse(row.result);
      if(old.origin!==reply.origin||old.basis!==basis||old.text!==text||old.sourceRef!==sourceRef)return invalid();
    }else{
      const result=JSON.stringify(finalResult(row.request_ref,row.actor,row.requester,reply));
      const saved=finish.run(result,owner,row.request_ref);
      const current=byRef.get(owner,row.request_ref);
      if(saved.changes)trace(current);
      else if(!current||current.result===null)return invalid();
      else {
        const winner=JSON.parse(current.result);
        if(winner.origin!==reply.origin||winner.basis!==basis||winner.text!==text||winner.sourceRef!==sourceRef)return invalid();
      }
    }
    return read(byRef.get(owner,row.request_ref));
  }
  return {ask,accept,hasRetry:retry=>Boolean(retry&&byKey.get(owner,hash(retry))?.issued_at>clock()-maximumAge)};
}
