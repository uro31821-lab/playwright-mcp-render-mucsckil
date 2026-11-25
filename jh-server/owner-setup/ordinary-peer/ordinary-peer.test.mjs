import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createOwnerChannel} from './owner-channel.mjs';
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
