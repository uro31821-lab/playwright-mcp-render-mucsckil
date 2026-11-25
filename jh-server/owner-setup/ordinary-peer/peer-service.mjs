import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,chmodSync,openSync,closeSync,constants} from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {readNoticeCatalog,selectNotice,noticeDigest,pickupText} from './notice-catalog.mjs';
import {parsePickupQuestion,trialReceiptSuffix} from './pickup-question.mjs';

import {registrationRecords,selectRegistration} from './registration-statistics.mjs';
import {openSyntheticPair,pairEvent} from './synthetic-pair.mjs';

const actors=['preparation','statistics'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const bounded=(x,n)=>typeof x==='string'&&x.trim().length>0&&Array.from(x).length<=n;
const replyError=message=>({isError:true,content:[{type:'text',text:message}]});

function receive(work){
  const file=work.actor==='statistics'?'./registration-statistics.mjs':'./preparation-receiver.mjs';
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(file,import.meta.url),{workerData:work,env:{}});
    const timer=setTimeout(()=>{void worker.terminate();reject(Error('PEER_TIMEOUT'));},5000);
    worker.once('message',value=>{
      clearTimeout(timer);
      if(value?.requestRef!==work.requestRef||value.replyRef!==work.replyRef||!bounded(value.text,512))
        reject(Error('PEER_WRONG_REPLY'));
      else resolve(value.text);
    });
    worker.once('error',err=>{clearTimeout(timer);reject(err);});
    worker.once('exit',code=>{clearTimeout(timer);reject(Error('PEER_EXIT_'+code));});
  });
}

export function openPeerService({config,noticeJson,trialDigest=process.env.JH_PEER_PREPARATION_TRIAL_SHA256,
  statisticsJson=process.env.JH_PEER_STATISTICS_SOURCE_JSON??'[]',recordPilot=line=>console.info(line),
  recordTrial=line=>console.info(line)}){
  const stats=registrationRecords(statisticsJson);
  const catalog=readNoticeCatalog(noticeJson);
  const trialEnabled=trialDigest===catalog.trialCard;
  const filename=path.join(config.stateDir,'ordinary-peer.sqlite');
  const fd=openSync(filename,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  closeSync(fd);
  if(!lstatSync(filename).isFile())throw Error('PEER_DB_INVALID');
  chmodSync(filename,0o600);
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS peer_requests (
      owner TEXT NOT NULL, retry_hash TEXT NOT NULL, request_ref TEXT PRIMARY KEY,
      actor TEXT NOT NULL, question TEXT NOT NULL, purpose TEXT NOT NULL,
      source_digest TEXT NOT NULL, reply_ref TEXT NOT NULL UNIQUE, reply TEXT,
      created_at TEXT NOT NULL, received_at TEXT, UNIQUE(owner,retry_hash))`);
  const pilot=openSyntheticPair(db,config.accountDigest,recordPilot);
  const pilotNotice={event:pairEvent,pickup:pilot.source.pickup};
  const pilotRegistration={event:pairEvent,teams:pilot.source.teams};
  const records=stats.some(row=>row.event===pairEvent)?stats:[...stats,pilotRegistration];
  if(trialEnabled)db.exec('CREATE TABLE IF NOT EXISTS peer_trial_receipts (owner TEXT NOT NULL, card_hash TEXT NOT NULL, reply_ref TEXT NOT NULL UNIQUE, emitted_at TEXT NOT NULL, PRIMARY KEY(owner,card_hash))');
  const markTrial=!trialEnabled?null:db.prepare('INSERT OR IGNORE INTO peer_trial_receipts VALUES(?,?,?,?)');
  function emitTrial(row,notice){
    if(!markTrial||!notice||row.reply!==pickupText(notice))return;
    const trialQuestion=notice.event+' 자료는 어디서 받아요?';
    const traced=row.question===trialQuestion+trialReceiptSuffix;
    if(!traced && row.question!==trialQuestion)return;
    const receiptKey=catalog.legacy && !traced?catalog.trialCard:digest(JSON.stringify([catalog.trialCard,row.request_ref]));
    const utc=new Date().toISOString();
    if(markTrial.run(config.accountDigest,receiptKey,row.reply_ref,utc).changes!==1)return;
    const receipt={requestRef:row.request_ref,replyRef:row.reply_ref,questionSha256:digest(row.question),
      answerSha256:digest(row.reply),utc};
    const marker=notice.status==='unavailable'?'JH_PREPARATION_TRIAL_UNAVAILABLE ':'JH_PREPARATION_TRIAL_RECEIPT ';
    try{recordTrial(marker+JSON.stringify(receipt));}catch{}
  }
  const byKey=db.prepare('SELECT * FROM peer_requests WHERE owner=? AND retry_hash=?');
  const pending=new Map();
  function denied(){
    return {...replyError('준비비서에 연결하려면 이 앱을 다시 연결하고 등록된 소유자 계정으로 확인해 주세요.'),
      _meta:{'mcp/www_authenticate':['Bearer resource_metadata="'+config.serverOrigin+'/.well-known/oauth-protected-resource", error="insufficient_scope"']}};
  }
  function ownerOf(session){
    return session?.owner===config.accountDigest&&session?.aud===config.serverOrigin;
  }
  async function ask(args,session){
    if(!ownerOf(session()))return denied();
    if(!actors.includes(args.actor)||(args.requester!==undefined&&(!actors.includes(args.requester)||args.requester===args.actor))||
      !bounded(args.question,2200)||!bounded(args.purpose,240)||
      (args.retryKey!==undefined&&!(typeof args.retryKey==='string'&&/^[a-zA-Z0-9_-]{16,96}$/.test(args.retryKey))))return replyError('질문을 받을 동료와 질문 형식을 확인해 주세요.');
    const isStatistics=args.actor==='statistics';
    const registration=isStatistics?selectRegistration(args.question,records):null;
    const pilotPickup=!isStatistics && !catalog.notices.some(row=>row.event===pairEvent) && pilot.pickupRequested(args.question);
    const notice=isStatistics?null:(pilotPickup?pilotNotice:selectNotice(args.question,catalog.notices));
    const isPilot=pilotPickup||registration===pilotRegistration;
    const source=isStatistics?digest(JSON.stringify(registration)):notice?noticeDigest(notice):catalog.sourceDigest;
    // Requests without an explicit caller retain their historical retry binding.
    const sourceDigest=args.requester?digest(JSON.stringify([source,args.requester])):source;
    const key=digest(args.retryKey??randomUUID()),owner=config.accountDigest;
    db.prepare('INSERT OR IGNORE INTO peer_requests VALUES(?,?,?,?,?,?,?,?,NULL,?,NULL)').run(
      owner,key,randomUUID(),args.actor,args.question,args.purpose,sourceDigest,randomUUID(),new Date().toISOString());
    const original=byKey.get(owner,key);
    if(original.question!==args.question||original.actor!==args.actor||original.purpose!==args.purpose||original.source_digest!==sourceDigest)
      return replyError('이 재시도 번호에 다른 질문 또는 공지가 연결되어 있습니다.');
    if(original.reply===null){
      let work=pending.get(original.request_ref);
      if(!work){
        if(pending.size>=16)return replyError('동료 비서가 처리 중입니다. 잠시 후 다시 물어봐 주세요.');
        const material=isStatistics?{registration}:pilotPickup?{resolvedNotice:pilotNotice}:{notices:catalog.notices};
        work=receive({actor:args.actor,requestRef:original.request_ref,replyRef:original.reply_ref,question:original.question,...material})
          .then(text=>db.prepare('UPDATE peer_requests SET reply=?, received_at=? WHERE request_ref=? AND reply IS NULL').run(text,new Date().toISOString(),original.request_ref))
          .finally(()=>pending.delete(original.request_ref));
        pending.set(original.request_ref,work);
      }
      try{await work;}catch{return replyError('동료 비서의 회신을 확보하지 못했습니다.');}
    }
    if(!ownerOf(session()))return denied();
    const stored=byKey.get(owner,key);
    if(!stored?.received_at||typeof stored.reply!=='string')return replyError('동료의 회신을 확인할 수 없습니다.');
    if(isPilot)pilot.record(stored,args.requester,digest);
    else if(!isStatistics)emitTrial(stored,notice);
    const showReceipt=notice && stored.reply===notice.pickup&&parsePickupQuestion(stored.question,notice).showReceipt;
    const display=showReceipt?stored.reply+'\n회신번호: '+stored.reply_ref:stored.reply;
    return {content:[{type:'text',text:display}],structuredContent:{actor:stored.actor,...(args.requester?{requester:args.requester}:{}),text:stored.reply,
      ...(notice?.status==='unavailable'||(isStatistics&&!registration)?{availability:'unavailable'}:{}),
      replyRef:stored.reply_ref,status:'returned_to_model',scope:'active_tool_call',
      originalQuestionVerified:false,finalDisplayVerified:false}};
  }
  return {ask,close:()=>db.close()};
}
