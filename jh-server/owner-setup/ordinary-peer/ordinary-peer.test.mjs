import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createOwnerChannel,rejectOwnerVerification} from './owner-channel.mjs';
import {openPeerService} from './peer-service.mjs';
import {answerPickup} from './preparation-receiver.mjs';

const cfg={googleWebClientId:'testing.apps.googleusercontent.com',serverOrigin:'https://test.invalid',accountDigest:'b'.repeat(64)};
const params={client_id:'https://chatgpt.com/oauth/client.json',redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',
  resource:cfg.serverOrigin+'/mcp',scope:'example',state:'example',response_type:'code',code_challenge_method:'S256',code_challenge:'abc'};
const hash=s=>createHash('sha256').update(s).digest('hex');
function begin(c,p=params){
  const out={writeHead(code,headers){this.code=code;this.headers=headers;return this;},end(html){this.html=html;}};
  c.page(out,p);
  assert.equal(out.code,200);
  return {cookie:out.headers['set-cookie'].split(';')[0],nonce:out.html.match(/data-nonce="([a-f0-9]+)"/)[1]};
}
test('verified Google owner is bound to the browser, PKCE grant, client, resource and refresh',async()=>{
  let at=1000;
  const owner=createOwnerChannel(cfg,{clock:()=>at,peer:{},verifier:{async verify(proof,nonce){
    if(proof!==nonce)throw Error('wrong proof');
    return {accountDigest:cfg.accountDigest};
  }}});
  const post=(c,extra={},origin=cfg.serverOrigin)=>owner.verify({headers:{origin,cookie:c.cookie}},{...params,peer_proof:c.nonce,...extra});
  const first=begin(owner);
  const result=await post(first);
  assert.equal(result.owner,cfg.accountDigest);
  assert.equal(owner.accepted(result,params),true);
  assert.equal(owner.accepted(result,{...params,client_id:'other'},true),false);
  assert.equal(owner.accepted(result,{...params,resource:'other'},true),false);
  assert.equal(owner.accepted(result,{...params,resource:undefined},true),true);
  await assert.rejects(post(first));
  await assert.rejects(post(begin(owner),{code_challenge:'different'}));
  await assert.rejects(post(begin(owner),{},'https://other.invalid'));
  await assert.rejects(post(begin(owner),{peer_proof:'another'}));
  const late=begin(owner);at+=300001;await assert.rejects(post(late));
  assert.equal(await owner.verify({headers:{}},params),null);
  const wrong=createOwnerChannel(cfg,{peer:{},verifier:{verify:async()=>({accountDigest:'wrong'})}});
  const attempt=begin(wrong);
  await assert.rejects(wrong.verify({headers:{origin:cfg.serverOrigin,cookie:attempt.cookie}},{...params,peer_proof:attempt.nonce}));
  const records=new Map(),token=randomBytes(30).toString('hex'),scope='example';
  const req={headers:{authorization:'Bearer '+token}};
  const key=hash('oauth-access|'+token);
  records.set(key,{expiresAt:at+100,scope});
  assert.equal(owner.current(req,records,hash,scope),null);
  records.set(key,{expiresAt:at+100,scope,peer59:result});
  assert.equal(owner.current(req,records,hash,scope).owner,cfg.accountDigest);
  at+=100;assert.equal(owner.current(req,records,hash,scope),null);
});
test('one independent recipient, bound original and reply, retry, audit and restart',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'peer-'));
  const config={...cfg,stateDir:dir},notice={event:'예시 행사',pickup:'예시 창구'},open=()=>openPeerService({config,noticeJson:JSON.stringify(notice)});
  let peer=open();
  const args={actor:'preparation',question:'예시 행사 자료는 어디서 받아요?',purpose:'수령 안내',retryKey:'local-synthetic-01234'};
  const allow=()=>({owner:cfg.accountDigest,aud:cfg.serverOrigin});
  try{
    assert.equal((await peer.ask(args,()=>null)).isError,true);
    assert.equal((await peer.ask(args,()=>({...allow(),owner:'other'}))).isError,true);
    const results=await Promise.all([peer.ask(args,allow),peer.ask(args,allow)]);
    assert.deepEqual(results[0],results[1]);
    const reply=results[0].structuredContent;
    assert.equal(reply.text,notice.pickup);
    assert.equal(reply.status,'returned_to_model');
    assert.equal(reply.originalQuestionVerified,false);assert.equal(reply.finalDisplayVerified,false);
    assert.equal(reply.scope,'active_tool_call');
    const audit=new DatabaseSync(path.join(dir,'ordinary-peer.sqlite'),{readOnly:true});
    try{
      const rows=audit.prepare('SELECT * FROM peer_requests').all();
      assert.equal(rows.length,1);assert.equal(rows[0].question,args.question);
      assert.equal(rows[0].reply,reply.text);assert.equal(rows[0].reply_ref,reply.replyRef);
      assert.ok(rows[0].request_ref&&rows[0].received_at);
    }finally{audit.close();}
    assert.equal((await peer.ask({...args,question:'다른 질문'},allow)).isError,true);
    let count=0;
    assert.equal((await peer.ask({...args,retryKey:'revoked-synthetic-01'},()=>++count===1?allow():null)).isError,true);
    peer.close();peer=open();
    assert.deepEqual((await peer.ask(args,allow)).structuredContent,reply);
    assert.notEqual(answerPickup('미등록 행사 자료는 어디서 받아요?',notice),notice.pickup);
    assert.notEqual(answerPickup('예시 행사와 다른 행사 자료를 어디서 받아요?',notice),notice.pickup);
    notice.pickup='새 창구';peer.close();peer=open();
    assert.equal((await peer.ask(args,allow)).isError,true);
  }finally{peer.close();rmSync(dir,{recursive:true,force:true});}
});
test('expired, denied and unrecognized failures publish only enumerated reason codes',async t=>{
  const lines=[];
  t.mock.method(console,'warn',message=>lines.push(message));
  const owner=createOwnerChannel(cfg,{peer:{},verifier:{verify:async()=>({accountDigest:'other'})}});
  for(const [origin,expected] of [[undefined,'ORIGIN_MISSING'],['null','ORIGIN_NULL'],['https://else.invalid','ORIGIN_MISMATCH'],[cfg.serverOrigin,'IDENTITY_POLICY']]){
    const c=begin(owner);
    const err=await owner.verify({headers:{origin,cookie:c.cookie}},{...params,peer_proof:c.nonce}).catch(e=>e);
    const out={writeHead(status){this.status=status;return this;},end(body){this.body=body;}};
    rejectOwnerVerification(out,err);
    assert.equal(out.status,403);assert.ok(out.body.endsWith(expected));
    assert.equal(lines.at(-1),'JH_PEER_OWNER_VERIFY_REJECT '+expected);
  }
  let publicText;
  rejectOwnerVerification({writeHead(){return this;},end(v){publicText=v;}},Object.assign(Error('private sample'),{code:'private sample'}));
  assert.ok(publicText.endsWith('VERIFICATION_FAILED'));
  assert.equal(lines.at(-1),'JH_PEER_OWNER_VERIFY_REJECT VERIFICATION_FAILED');
});
test('exact operator-selected test card emits one redacted receipt across fresh requests, retries and restart',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'peer-log-')),notice={event:'합성 자료행사',pickup:'합성 시험 창구'};
  const logs=[],config={...cfg,stateDir:dir},allow=()=>({owner:cfg.accountDigest,aud:cfg.serverOrigin});
  const open=trialDigest=>openPeerService({config,noticeJson:JSON.stringify(notice),trialDigest,recordTrial:s=>logs.push(s)});
  const testDigest=hash(JSON.stringify([notice.event,notice.pickup]));
  const args={actor:'preparation',question:notice.event+' 자료는 어디서 받아요?',purpose:'합성 확인'};
  let peer=open('not-the-test-card');
  try{
    await peer.ask(args,allow);assert.deepEqual(logs,[]);
    peer.close();peer=open(testDigest);
    assert.equal((await peer.ask(args,()=>null)).isError,true);
    await peer.ask({...args,question:notice.event+' 자료를 어디서 받아요?'},allow);
    let count=0;
    assert.equal((await peer.ask(args,()=>++count===1?allow():null)).isError,true);
    assert.deepEqual(logs,[]);
    const reply=await peer.ask({...args,retryKey:'test-receipt-123456789'},allow);
    await peer.ask({...args,retryKey:'test-receipt-123456789'},allow);
    peer.close();peer=open(testDigest);
    await peer.ask(args,allow);
    assert.equal(logs.length,1);
    const prefix='JH_PREPARATION_TRIAL_RECEIPT ';
    assert.ok(logs[0].startsWith(prefix));
    assert.equal(logs[0].includes(cfg.accountDigest),false);
    const receipt=JSON.parse(logs[0].slice(prefix.length));
    assert.deepEqual(Object.keys(receipt).sort(),['answerSha256','questionSha256','replyRef','requestRef','utc']);
    assert.equal(receipt.questionSha256,hash(args.question));assert.equal(receipt.answerSha256,hash(notice.pickup));
    assert.equal(receipt.replyRef,reply.structuredContent.replyRef);assert.ok(Date.parse(receipt.utc)>0);
    const audit=new DatabaseSync(path.join(dir,'ordinary-peer.sqlite'),{readOnly:true});
    try{
      const row=audit.prepare('SELECT request_ref,reply_ref FROM peer_requests WHERE reply_ref=?').get(receipt.replyRef);
      assert.equal(receipt.requestRef,row.request_ref);
    }finally{audit.close();}
  }finally{peer.close();rmSync(dir,{recursive:true,force:true});}
});
test('authorization form names only the already validated callback of that grant',()=>{
  const owner=createOwnerChannel(cfg,{peer:{},verifier:{}});
  const approved=new Set(['https://chatgpt.com/connector_platform_oauth_redirect','https://chatgpt.com/connector/oauth/local-synthetic']);
  function policy(uri){
    const out={writeHead(status,headers){assert.equal(status,200);this.headers=headers;return this;},end(){}};
    owner.page(out,{...params,redirect_uri:uri},value=>approved.has(value));
    return out.headers['content-security-policy'].split(';').map(v=>v.trim()).find(v=>v.startsWith('form-action '));
  }
  for(const uri of approved)assert.equal(policy(uri),"form-action 'self' "+uri);
  assert.equal(policy('https://else.invalid/callback'),"form-action 'self'");
  assert.equal(policy(undefined),"form-action 'self'");
});

test('the actual return reference is visible only with an explicit request and an available pickup',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'peer-visible-'));
  const notice={event:'합성 도서전',pickup:'모형 창구'};
  const allow=()=>({owner:cfg.accountDigest,aud:cfg.serverOrigin});
  const peer=openPeerService({config:{...cfg,stateDir:dir},noticeJson:JSON.stringify(notice),trialDigest:''});
  const ask=question=>peer.ask({actor:'preparation',question,purpose:'자료 수령 안내'},allow);
  try{
    const base=notice.event+' 자료는 어디서 받아요?';
    const ordinary=await ask(base);
    assert.equal(ordinary.content[0].text,notice.pickup);
    for(const suffix of [' 회신번호도 알려 주세요.',' 이번 회신 번호를 표시해 주세요.']){
      const reply=await ask(base+suffix);
      assert.equal(reply.structuredContent.text,notice.pickup);
      assert.equal(reply.content[0].text,notice.pickup+'\n회신번호: '+reply.structuredContent.replyRef);
      assert.notEqual(reply.structuredContent.replyRef,ordinary.structuredContent.replyRef);
      assert.equal(reply.structuredContent.finalDisplayVerified,false);
    }
    for(const question of [base+' 회신번호는 알려 주지 마세요.',base+' 회신번호',
      '다른 도서전 자료는 어디서 받아요? 회신번호도 알려 주세요.']){
      const reply=await ask(question);
      assert.equal(reply.content[0].text,reply.structuredContent.text);
      assert.equal(reply.content[0].text.includes(reply.structuredContent.replyRef),false);
    }
  }finally{peer.close();rmSync(dir,{recursive:true,force:true});}
});

test('a pinned synthetic trace follows the exact question and reply across independent calls, retries and restart',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'peer-visible-log-'));
  const notice={event:'합성 종이행사',pickup:'모형 작업대'};
  const base=notice.event+' 자료는 어디서 받아요?',question=base+' 회신번호도 알려 주세요.';
  const config={...cfg,stateDir:dir},allow=()=>({owner:cfg.accountDigest,aud:cfg.serverOrigin});
  const logs=[],card=hash(JSON.stringify([notice.event,notice.pickup]));
  const open=trialDigest=>openPeerService({config,noticeJson:JSON.stringify(notice),trialDigest,recordTrial:s=>logs.push(s)});
  const args={actor:'preparation',question,purpose:'시험 수령처 안내',retryKey:'explicit-synthetic-01'};
  let peer=open('inactive');
  try{
    await peer.ask({...args,retryKey:'explicit-inactive-01'},allow);
    peer.close();peer=open(card);
    await peer.ask({...args,question:base+' 회신 번호를 표시해 주세요.',retryKey:'other-wording-001'},allow);
    assert.equal((await peer.ask(args,()=>null)).isError,true);
    assert.deepEqual(logs,[]);
    await peer.ask({...args,question:base,retryKey:'plain-question-001'},allow);
    const [first,retry]=await Promise.all([peer.ask(args,allow),peer.ask(args,allow)]);
    assert.deepEqual(retry,first);
    assert.equal(logs.length,2);
    peer.close();peer=open(card);
    assert.deepEqual(await peer.ask(args,allow),first);
    const second=await peer.ask({...args,retryKey:'explicit-synthetic-02'},allow);
    assert.equal(second.structuredContent.text,notice.pickup);
    const receipts=logs.map(line=>JSON.parse(line.slice('JH_PREPARATION_TRIAL_RECEIPT '.length)));
    assert.equal(receipts.length,3);
    assert.equal(receipts[0].questionSha256,hash(base));
    assert.deepEqual(receipts.slice(1).map(r=>r.replyRef),[first,second].map(r=>r.structuredContent.replyRef));
    assert.equal(new Set(receipts.map(r=>r.requestRef)).size,3);
    assert.equal(new Set(receipts.map(r=>r.replyRef)).size,3);
    for(const r of receipts.slice(1)){
      assert.equal(r.questionSha256,hash(question));
      assert.equal(r.answerSha256,hash(notice.pickup));
      assert.deepEqual(Object.keys(r).sort(),['answerSha256','questionSha256','replyRef','requestRef','utc']);
    }
  }finally{peer.close();rmSync(dir,{recursive:true,force:true});}
});
