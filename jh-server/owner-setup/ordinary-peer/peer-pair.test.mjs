import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {z} from 'zod';
import {openPeerService} from './peer-service.mjs';
import {createOwnerChannel} from './owner-channel.mjs';
import {pairEvent} from './synthetic-pair.mjs';
import {registrationRecords,selectRegistration,unknownCount} from './registration-statistics.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const registered=[{event:'등록 장부 큰반',teams:[{label:'노을팀',confirmed:14},{label:'새벽팀',confirmed:23}]}];
const qA=`준비비서, ${pairEvent} 자료를 확정 신청자 한 명당 한 부씩 준비하려고 해. 모두 몇 부 챙기면 돼?`;
const qB=`통비서, ${pairEvent} 집계표에 넣을 안내 문구가 필요해. 자료를 어디서 받는지 한 줄로 정리해 줘.`;

test('statistics uses only registered disjoint groups for the selected event',()=>{
  for(const bad of [[...registered,...registered],[{event:'A',teams:[{label:'A',confirmed:-1}]}],
    [{event:'A',teams:[{label:'팀',confirmed:3},{label:'팀',confirmed:2}]}]])assert.throws(()=>registrationRecords(JSON.stringify(bad)));
  for(const q of ['큰반 맞죠?','다른 모임 몇 명인가요?','등록 장부 큰반 대기 인원 몇 명인가요?',
    '등록 장부 큰반 노을팀 확정 인원 몇 명인가요?'])assert.equal(selectRegistration(q,registered),null);
});

test('normal MCP calls resolve the two different recipients, bind retries to their callers and isolate synthetic logging',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'jh-pair-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const config={accountDigest:'test-owner',serverOrigin:'https://test.invalid',stateDir:dir};
  let trace=[],allowed=true;
  function open(){return openPeerService({config,noticeJson:JSON.stringify({event:'종전 모임',pickup:'종전 자료실'}),statisticsJson:JSON.stringify(registered),recordPilot:line=>trace.push(line)});}
  const peer=open();t.after(()=>peer.close());
  const source=JSON.parse(trace[0].split(' ').slice(1).join(' '));assert.equal(source.event,pairEvent);
  const total=source.teams.reduce((s,row)=>s+row.confirmed,0);
  const session=()=>allowed?{owner:config.accountDigest,aud:config.serverOrigin}:null;
  const channel=createOwnerChannel(config,{peer,verifier:{}});
  const server=new McpServer({name:'jh-real-peer-test',version:'1'});
  channel.register(z,(name,opts,fn)=>server.registerTool(name,opts,fn),session);
  const [lc,ls]=InMemoryTransport.createLinkedPair();const client=new Client({name:'jh-client',version:'1'});
  await server.connect(ls);await client.connect(lc);t.after(async()=>{await client.close();await server.close();});
  const spec=(await client.listTools()).tools.find(tool=>tool.name==='jh_ask_peer');
  assert.equal(spec.inputSchema.properties.actor.enum.length,41);
  assert.ok(['preparation','statistics'].every(role=>spec.inputSchema.properties.actor.enum.includes(role)));
  assert.ok(!spec.inputSchema.required.includes('requester'));
  const call=args=>client.callTool({name:'jh_ask_peer',arguments:{purpose:'현재 자료 확인',...args}});
  const bill=await call({actor:'billing',requester:'book',question:'같은 기간에 현금지출이 얼마나 줄어드나요?',workInput:{baselineCosts:210,baselineRefunds:30,alternativeCosts:190,alternativeRefunds:15}});
  assert.equal(bill.structuredContent.origin,'native');assert.match(bill.structuredContent.text,/5원/);
  const handoff=(await call({actor:'history',requester:'book',question:'주어진 사건의 선후를 한 줄로 알려주세요.'})).structuredContent;
  assert.equal(handoff.status,'awaiting_role_work');
  const {actor,requester,requestRef,returnToken}=handoff;
  const submitted={actor,requester,requestRef,returnToken,basis:'conversation_material',text:'제공된 연표에서 개관이 이전보다 먼저입니다.'};
  const returned=await client.callTool({name:'jh_return_peer',arguments:submitted});
  assert.equal(returned.structuredContent.origin,'host_composed');
  assert.equal(returned.structuredContent.text,submitted.text);
  const args={actor:'statistics',requester:'preparation',question:qA,retryKey:'pair-requester-bind-test'};
  allowed=false;assert.equal((await call(args)).isError,true);allowed=true;
  const a=await call(args),b=await call({actor:'preparation',requester:'statistics',question:qB});
  assert.equal(a.structuredContent.text,`확정 등록 인원은 총 ${total}명입니다.`);
  assert.equal(b.structuredContent.text,source.pickup);assert.deepEqual([a.structuredContent.actor,a.structuredContent.requester,b.structuredContent.actor,b.structuredContent.requester],['statistics','preparation','preparation','statistics']);
  assert.equal(a.structuredContent.finalDisplayVerified,false);
  assert.deepEqual(await call(args),a);assert.equal((await call({...args,requester:undefined})).isError,true);
  assert.equal((await call({...args,requester:'statistics'})).isError,true);
  assert.equal((await call({...args,requester:'other'})).isError,true);
  const missing=await call({actor:'statistics',question:'기타반 확정 인원은 몇 명인가요?'});
  assert.equal(missing.structuredContent.text,unknownCount);assert.equal(missing.structuredContent.availability,'unavailable');
  const general=await call({actor:'statistics',question:'등록 장부 큰반 확정 인원은 몇 명인가요?'});
  assert.equal(general.structuredContent.text,'확정 등록 인원은 총 37명입니다.');
  const old=await call({actor:'preparation',question:'종전 모임 자료는 어디서 받아요?'});
  assert.equal(old.structuredContent.text,'종전 자료실');assert.ok(!Object.hasOwn(old.structuredContent,'requester'));
  const logged=trace.filter(line=>line.startsWith('JH_PEER_PILOT66_REPLY ')).map(line=>JSON.parse(line.slice(line.indexOf(' ')+1)));
  assert.equal(logged.length,2);assert.deepEqual(logged.map(x=>x.questionSha256),[hash(qA),hash(qB)]);
  assert.deepEqual(logged.map(x=>x.answerSha256),[hash(a.structuredContent.text),hash(source.pickup)]);
  assert.deepEqual(logged.map(x=>x.replyRef),[a.structuredContent.replyRef,b.structuredContent.replyRef]);
  assert.ok(trace.every(line=>!line.includes(qA)&&!line.includes(qB)&&!line.includes('기타반')));
  trace=[];const reopened=open();try{assert.deepEqual((await reopened.ask({...args,purpose:'현재 자료 확인'},session)).structuredContent,a.structuredContent);assert.equal(trace.length,1);assert.equal(JSON.parse(trace[0].slice(trace[0].indexOf(' ')+1)).fixtureId,source.fixtureId);}finally{reopened.close();}
});
