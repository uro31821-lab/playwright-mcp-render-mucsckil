import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {openRoleNetwork} from './role-network.mjs';
import {calculate,workInputSchema} from './role-calculations.mjs';
import {roleIds} from './role-catalog.mjs';
import {selectRegistration} from './registration-statistics.mjs';

const original={actor:'book',requester:'history',question:'제시된 문장에서 제일 먼저 발생한 사건을 확인해 주세요.',purpose:'같은 대화 읽기',retryKey:'books-and-history-67'};
function open(t){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE peer_requests(owner TEXT,retry_hash TEXT)');
  let clock=1000;
  const logs=[];
  const mesh=openRoleNetwork(db,'owner',()=>clock,line=>logs.push(line));
  t.after(()=>db.close());
  return {mesh,logs,db,setTime:value=>{clock=value;}};
}
function finish(body,extra={}){
  const {actor,requester,requestRef,returnToken}=body;
  return {actor,requester,requestRef,returnToken,text:'제시된 순서로는 방파제에 먼저 도착합니다.',basis:'conversation_material',...extra};
}
test('owner-bound handoff has no answer until a real same-turn submission, then retries are idempotent',t=>{
  const {mesh,setTime,logs}=open(t);
  const auth={client:'app-a',resource:'resource'};
  const waiting=mesh.ask(original,auth).structuredContent;
  assert.equal(waiting.status,'awaiting_role_work');assert.equal(waiting.skill,'jh-chaekbiseo');
  assert.ok(!('text' in waiting)&&!('replyRef' in waiting));
  assert.deepEqual(mesh.ask(original,auth).structuredContent,waiting);
  for(const bad of [{...original,actor:'price'},{...original,requester:'book'},{...original,purpose:'another'}])assert.equal(mesh.ask(bad,auth).isError,true);
  for(const bad of [{requester:'news'},{actor:'idea'},{returnToken:'0'.repeat(64)},{text:' '},{sourceRef:'\0bad'}])
    assert.equal(mesh.accept(finish(waiting,bad),auth).isError,true);
  assert.equal(mesh.accept(finish(waiting),{client:'b',resource:'resource'}).isError,true);
  const reply=mesh.accept(finish(waiting),auth);
  assert.equal(reply.structuredContent.origin,'host_composed');assert.equal(reply.structuredContent.peerWorkVerifiedExternally,false);
  assert.ok(!('returnToken' in reply.structuredContent));assert.deepEqual(mesh.ask(original,auth),reply);
  assert.deepEqual(mesh.accept(finish(waiting),auth),reply);assert.equal(mesh.accept(finish(waiting,{text:'다른 내용'}),auth).isError,true);
  assert.deepEqual(logs,[]);setTime(901000);assert.equal(mesh.accept(finish(waiting),auth).isError,true);
  assert.notEqual(mesh.ask(original,auth).structuredContent.requestRef,waiting.requestRef);
});
test('capability-only role requires a referenced tool result or an explicit unavailable reply',t=>{
  const {mesh,logs}=open(t);
  const base={...original,actor:'audio',purpose:'JH67 합성 동일방 검증'};
  const waiting=mesh.ask(base).structuredContent;
  assert.equal(waiting.capability,'audio-assistance');assert.equal(mesh.accept(finish(waiting)).isError,true);
  assert.equal(mesh.accept(finish(waiting,{basis:'authorized_tool_result'})).isError,true);
  const answer=mesh.accept(finish(waiting,{basis:'unavailable',text:'현재 대화에 기기 읽기 결과가 없습니다.'}));
  assert.equal(answer.structuredContent.availability,'unavailable');
  const supported=mesh.ask({...base,actor:'evidence',retryKey:'unique-synthetic-key-67'}).structuredContent;
  const retrieved=mesh.accept(finish(supported,{basis:'authorized_tool_result',sourceRef:'source:approved-test-17'}));
  assert.equal(retrieved.structuredContent.origin,'host_composed');assert.equal(retrieved.structuredContent.peerWorkVerifiedExternally,false);
  assert.equal(logs.length,2);assert.ok(logs.every(s=>!s.includes(original.question)&&!s.includes(waiting.returnToken)));
});
test('all five native roles calculate on typed conversation inputs and reject cross-role inputs or mutation flags',t=>{
  const {mesh,logs}=open(t);
  const cases=[
    ['shopping',{dailyUse:3,horizonDays:7,packSize:4,stock:2,unit:'개'},'5묶음'],
    ['pricing',{offers:[{name:'A',price:15000,quantity:10},{name:'B',price:19500,quantity:15}]},'1,300원'],
    ['revenue',{cumulativeRevenue:34000,actualWorkdays:2,totalWorkdays:22},'374,000원'],
    ['billing',{baselineCosts:220,baselineRefunds:35,alternativeCosts:180,alternativeRefunds:11},'16원'],
    ['cleanup',{name:'sample.png',createdAt:'2025-01-01T00:00:00Z',asOf:'2025-01-01T12:00:00Z'},'보존기간이 지났습니다']
  ];
  for(const [actor,input,expected] of cases){
    assert.equal(workInputSchema.safeParse(input).success,true);
    const args={...original,actor,workInput:input,retryKey:'native-operation-'+actor,purpose:'JH67 합성 동일방 검증'};
    const result=mesh.ask(args).structuredContent;
    assert.equal(result.origin,'native');assert.equal(result.basis,'server_calculation');assert.ok(result.text.includes(expected));
    assert.deepEqual(mesh.ask(args).structuredContent,result);
    assert.equal(mesh.ask({...args,workInput:{...input,delete:true}}).isError,true);
    assert.throws(()=>calculate('audio',input));
  }
  assert.equal(logs.length,5);
  assert.throws(()=>calculate('revenue',{cumulativeRevenue:0,actualWorkdays:3,totalWorkdays:1}));
  assert.throws(()=>calculate('pricing',{offers:[{name:'A',price:2,quantity:1},{name:'A',price:3,quantity:1}]}));
  assert.equal(new Set(roleIds).size,41);assert.ok(roleIds.includes('jh-ingyebiseo'));
});
test('spoken event particles and whole team names resolve without counting another class or subgroup',()=>{
  const event={event:'초록 물감 세미나',teams:[{label:'가',confirmed:12},{label:'나',confirmed:29}]};
  assert.equal(selectRegistration('초록 물감 세미나 확정 등록 인원은 몇 명인가요?',[event]),event);
  assert.equal(selectRegistration('초록 물감 세미나 가 팀 확정 인원은 몇 명인가요?',[event]),null);
  assert.equal(selectRegistration('초록 물감 세미나에서 나팀 확정 신청자 수는?',[event]),null);
  const pm={event:'구름매듭 66 실습회 오후반',teams:[]};
  for(const suffix of ['이야.','인데,','입니다.','이에요.'])assert.equal(selectRegistration(pm.event+suffix+' 확정 등록자 수는?',[pm]),pm);
  assert.equal(selectRegistration('구름매듭 66 실습회 오후반별 확정 등록자 수는?',[pm]),null);
});

test('only a requested available reply displays its stored receipt for native and host work',t=>{
  const {mesh}=open(t);
  for(const [index,suffix] of [' 회신번호도 적어줘.',' 회신 번호까지 함께 알려 주세요.',' 회신번호는 알려 주지 마세요.',' 회신번호'].entries()){
    for(const actor of ['pricing','book']){
      const args={...original,actor,question:'이번 결과는?'+suffix,retryKey:'test-optional-receipt-'+actor+index,
        ...(actor==='pricing'?{workInput:{offers:[{name:'가',price:21,quantity:1},{name:'나',price:37,quantity:2}]}}:{})};
      const first=mesh.ask(args);
      const reply=actor==='pricing'?first:mesh.accept(finish(first.structuredContent));
      const expected=reply.structuredContent.text+(index<2?'\n회신번호: '+reply.structuredContent.replyRef:'');
      assert.equal(reply.content[0].text,expected);
      assert.deepEqual(mesh.ask(args),reply);
    }
  }
  const denied=mesh.ask({...original,actor:'audio',question:'회신번호 적어줘.',retryKey:'audio-missing-receipt-67'});
  const missing=mesh.accept(finish(denied.structuredContent,{basis:'unavailable',text:'현재 재생 상태를 확인할 수 없습니다.'}));
  assert.equal(missing.content[0].text,missing.structuredContent.text);
});

test('photo orders only the supplied dated sightings, retaining ties and uncertainty',t=>{
  const {mesh,logs}=open(t);
  const observations=[
    {ref:'A',match:'seen',captureTimeMs:1000,detail:'blue'},
    {ref:'B',match:'seen',captureTimeMs:2000,detail:'blue'},
    {ref:'C',match:'seen',captureTimeMs:2000,detail:'blue'},
    {ref:'D',match:'seen',detail:'blue'},
    {ref:'E',match:'possible',captureTimeMs:3000,detail:'blurred'},
    {ref:'F',match:'unread',captureTimeMs:4000},
    {ref:'G',match:'absent',captureTimeMs:5000}];
  const args={...original,actor:'photo',workInput:{observations},question:'관찰을 정리하고 회신번호도 알려 주세요.',
    purpose:'JH67 합성 동일방 검증'};
  const reply=mesh.ask(args);
  const body=reply.structuredContent;
  assert.deepEqual([body.origin,body.basis,body.operation,body.availability],['native','server_calculation','latest_confirmed_observation','available']);
  assert.equal(body.text,'제공된 관찰표 기준입니다. 촬영 시각이 기록된 확인 사진 중 가장 최근은 B, C입니다 (1970-01-01T00:00:02.000Z). 촬영 시각 미상 확인 1건, 불확실 1건, 미열람 1건입니다.');
  assert.equal(reply.content[0].text,body.text+'\n회신번호: '+body.replyRef);
  assert.deepEqual(mesh.ask(args),reply);assert.equal(logs.length,1);
  assert.match(calculate('photo',{observations:[{ref:'B',match:'seen',captureTimeMs:null,detail:'blue'}]}).text,/기록된 확인 사진은 없습니다.*시각 미상 확인 1건/);
  for(const invalid of [[],[observations[0],observations[0]],[{ref:'B',match:'possible'}],
    [{ref:'C',match:'seen',captureTimeMs:0,detail:'',token:'unused'}],[{ref:'D',match:'unread',captureTimeMs:1.2}]]) {
    assert.throws(()=>calculate('photo',{observations:invalid}));
  }
});

test('retention never reports a duration for timestamps with an unreadable offset',()=>{
  const input={name:'note.jpg',createdAt:'2026-05-01T09:00:00+09:00',asOf:'2026-05-01T12:00:00Z'};
  assert.match(calculate('cleanup',input).text,/12시간.*지났습니다/);
  for(const field of ['createdAt','asOf']) {
    for(const value of ['2026-05-01T09:00:00+24:00','2026-05-01T09:00:00+83:81'])
      assert.throws(()=>calculate('cleanup',{...input,[field]:value}));
  }
});

test('an older photo client can attach one explicit observation line to its question',t=>{
  const {mesh,logs}=open(t), marker='JH_PHOTO_OBSERVATIONS_V1=';
  const seen=[{ref:'T1',match:'seen',captureTimeMs:1,detail:'blue'}];
  const line=marker+JSON.stringify(seen);
  const prompt='제공된 관찰 중 가장 최근을 알려줘. 회신번호도 적어줘.';
  const args={...original,actor:'photo',purpose:'JH67 합성 동일방 검증',retryKey:'compat-photo-observation-retry',question:prompt+'\r\n'+line};
  const answer=mesh.ask(args);
  const typed=mesh.ask({...args,question:prompt,retryKey:undefined,workInput:{observations:seen}});
  assert.deepEqual([answer.structuredContent.origin,answer.structuredContent.operation,answer.structuredContent.text],
    ['native','latest_confirmed_observation',typed.structuredContent.text]);
  assert.equal(answer.content[0].text,answer.structuredContent.text+'\n회신번호: '+answer.structuredContent.replyRef);
  assert.deepEqual(mesh.ask(args),answer);
  assert.equal(logs.length,2);
  assert.equal(mesh.ask({...args,question:args.question.replace('T1','T2')}).isError,true);
  for(const question of [line,prompt+'\n'+line+'\n',prompt+'\n'+line+'\n'+line,
    prompt+'\n'+marker+'{}',prompt+'\n'+marker+'[]',prompt+'\n'+marker+'[invalid',
    prompt+'\n'+marker+JSON.stringify(Array(17).fill(seen[0])), '가'.repeat(2200)+'\n'+line]) {
    assert.equal(mesh.ask({...args,question,retryKey:undefined}).isError,true);
  }
  assert.equal(mesh.ask({...args,workInput:{observations:seen},retryKey:undefined}).isError,true);
  const ordinary=mesh.ask({...args,question:'일반 관찰 설명: '+line,retryKey:undefined});
  assert.equal(ordinary.structuredContent.status,'awaiting_role_work');
  const other=mesh.ask({...args,actor:'book',retryKey:undefined});
  assert.equal(other.structuredContent.status,'awaiting_role_work');
  const unrequested=mesh.ask({...args,retryKey:undefined,question:'관찰표를 정리해 줘.\n'+line});
  assert.equal(unrequested.content[0].text,unrequested.structuredContent.text);
});

test('document and period sources return the same findings from old and current callers',t=>{
  const {mesh}=open(t);
  const notices={noticeId:'파랑',documents:[{ref:'A',noticeId:'파랑',text:'제출기한: 9월 12일\n제출처: 동문'},
    {ref:'B',noticeId:'파랑',corrects:'A',mode:'amend',text:'제출기한: 9월 15일'}]};
  const periods=[{label:'흙',start:1600,end:1609},{label:'돌',start:1608,end:1620}];
  const query='제공된 자료를 대조해 줘. 회신번호도 알려 주세요.';
  for(const [actor,operation,input,marker,data,expected] of [
    ['official_document','notice_current_terms',notices,'JH_NOTICE_V1=',notices,['9월 15일','동문','〔A〕','〔B〕']],
    ['history','compare_supplied_year_ranges',{periods},'JH_HISTORY_PERIODS_V1=',periods,['1608년부터 1609년','2개 연도']]
  ]){
    const args={actor,requester:'book',purpose:'가상 대조',question:query};
    const asText={...args,question:query+'\n'+marker+JSON.stringify(data)};
    const first=mesh.ask({...args,workInput:input}),second=mesh.ask(asText);
    for(const r of [first,second]){
      assert.equal(r.structuredContent.operation,operation);assert.equal(r.structuredContent.origin,'native');
      assert.equal(r.structuredContent.availability,'available');
      for(const value of expected)assert.ok(r.structuredContent.text.includes(value));
      assert.ok(r.content[0].text.endsWith(r.structuredContent.replyRef));
    }
    assert.equal(first.structuredContent.text,second.structuredContent.text);
    assert.equal(mesh.ask({...asText,workInput:input}).isError,true);
    assert.equal(mesh.ask({...args,question:query+'\n'+marker+'invalid'}).isError,true);
    assert.equal(mesh.ask({...args,workInput:{...input,privateAttribute:'irrelevant'}}).isError,true);
  }
  const unsure=mesh.ask({actor:'history',requester:'book',purpose:'누락',question:query,
    workInput:{periods:[{label:'가',start:1600,end:null},{label:'나',start:1650,end:null}]}}).structuredContent;
  assert.equal(unsure.availability,'unavailable');assert.equal(unsure.origin,'native');
});
