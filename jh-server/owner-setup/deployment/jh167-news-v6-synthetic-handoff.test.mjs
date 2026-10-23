/** V6: Synthetic, signed-shaped right Chrome readback -> independent article HTTP parser
 * -> real authenticated local MCP tool response. This is NOT a real Android MAC receipt.
 * No production server, real secrets, external network or automatic replay.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {registerJHArticleReadCandidate} from '../guide-13/article-host-readonly.mjs';
import {makeIndependentPublicArticleReader} from '../guide-13/article-fallback-http.mjs';

const ARTICLE_URL='https://www.hani.co.kr/arti/society/society_general/1283889.html';
const TITLE='“오세훈, 울면서 나경원 이기는 조사 요청” 명태균 진술 배척한 2심';
const CMD='a'.repeat(32), AUTH='Bearer JH167_V6_SYNTHETIC_LOCAL_ONLY';
const PARAS=[
 '합성 시험 문단 하나입니다. 이 문장은 신문 기사의 실재 내용이 아니며 원문 수집이 올바르게 시작되는지만 검증합니다.',
 '합성 시험 문단 둘입니다. HTML의 기사 영역에서 끝까지 읽고 웹페이지의 다른 메뉴나 광고를 포함하지 않는지 확인합니다.',
 '합성 시험 문단 셋입니다. 읽어 들인 본문의 제목과 정식 주소가 사전에 확인한 기사와 일치해야만 성공으로 판단합니다.',
 '합성 시험 문단 넷입니다. 테스트 데이터를 실제 취재 정보나 뉴스로 취급하지 않고 도구 결과의 출처 확인에만 사용합니다. 추가 문장은 HTML 본문 범위 검증의 최소 길이를 충족하기 위한 합성 정보로, 실제 기사의 내용이 아닙니다.'
];
function html({complete=true,wrongTitle=false}={}){
 const title=wrongTitle?'대상이 아닌 완전히 다른 기사 제목':TITLE;
 return '<!doctype html><html><head><link rel="canonical" href="'+ARTICLE_URL+'">'+
  '<meta property="og:title" content="'+title+'"></head><body>'+
  '<article>'+PARAS.map(p=>'<p>'+p+'</p>').join('')+(complete?'</article>':'')+
  '<aside>광고와 메뉴 텍스트는 기사에 포함하면 안 됩니다.</aside></body></html>';
}
function signedShape(state){
 return {verified:state.mode!=='unverified',command_id:state.mode==='changed_command'?'b'.repeat(32):CMD,
  source_ref:'JH_SIGNED_RIGHT:'+('c'.repeat(40)),
  selected_tab_titles:state.mode==='ambiguous'?[TITLE+', 선택된 탭','다른 기사, 선택된 탭']:
    [state.mode==='search'?'JH167 뉴스 검증 - Google 검색, 선택된 탭':TITLE+', 선택된 탭'],
  observation:{app:'com.android.chrome',window_id:'synthetic-window-1',
   observed_at:'2026-10-23T14:00:00.000Z'}};
}
async function fixture(){
 const state={mode:'valid',browser:0,html:0,screen:0,rejected:0,command:CMD,flipOnRead:0};
 const instances=[];
 const http=createServer(async(req,res)=>{
  if(req.url!=='/mcp'){res.writeHead(404).end();return;}
  if(req.headers.authorization!==AUTH){
   state.rejected++;res.writeHead(401,{'content-type':'application/json'}).end('{"error":"AUTH_REQUIRED"}');return;
  }
  const mcp=new McpServer({name:'jh167-v6-synthetic-handoff',version:'0.6.0'},{capabilities:{tools:{}}});
  const registerOAuthTool=(name,meta,handler)=>mcp.registerTool(name,{
   title:meta.title,description:meta.description,inputSchema:meta.inputSchema,annotations:meta.annotations
  },async args=>({content:[{type:'text',text:JSON.stringify(await handler(args))}]}));
  const fallback=makeIndependentPublicArticleReader({allowedHosts:['www.hani.co.kr'],
   readHtml:async()=>{
    state.html++;
    if(state.mode==='command_changed_during_fallback')state.command='b'.repeat(32);
    return html({complete:state.mode!=='incomplete',wrongTitle:state.mode==='wrong_title'});
   }});
  registerJHArticleReadCandidate({
   enabled:true,registerOAuthTool,z,textResult:x=>x,
   getHostContext:()=>({command_id:state.command}),
   readVerifiedRight:async()=>{
    state.screen++;
    const proof=signedShape(state);
    if(state.screen===state.flipOnRead){
     if(state.mode==='tab_switched_after_fetch')
      return {...proof,selected_tab_titles:['다른 기사의 제목은 이전 기사와 전혀 다릅니다, 선택된 탭']};
     if(state.mode==='window_switched_after_fetch')
      return {...proof,observation:{...proof.observation,window_id:'another-window'}};
     if(state.mode==='final_receipt_unverified')
      return {...proof,verified:false};
     if(state.mode==='final_receipt_stale')
      return {...proof,observation:{...proof.observation,observed_at:'2026-10-22T14:00:00.000Z'}};
    }
    return proof;
   },
   browserTool:async()=>{
    state.browser++;
    if(state.mode==='command_changed_during_primary')state.command='b'.repeat(32);
    return {code:'browser_request_timeout_no_automatic_retry'};
   },
   readFallback:fallback,allowedHosts:['www.hani.co.kr']
  });
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  instances.push({mcp,transport});
  try{await mcp.connect(transport);await transport.handleRequest(req,res)}
  catch(e){if(!res.headersSent)res.writeHead(500).end('SERVER_ERROR');else if(!res.writableEnded)res.end();}
 });
 http.listen(0,'127.0.0.1');await once(http,'listening');
 const uri=new URL('http://127.0.0.1:'+http.address().port+'/mcp');
 const client=new Client({name:'jh167-v6-client',version:'0.6.0'},{capabilities:{}});
 await client.connect(new StreamableHTTPClientTransport(uri,{requestInit:{headers:{Authorization:AUTH}}}));
 return {state,uri,client,async call(args={article_url:ARTICLE_URL}){
  const r=await client.callTool({name:'life_article_fulltext_read',arguments:args});
  assert.notEqual(r.isError,true);
  return JSON.parse(r.content.find(x=>x.type==='text').text);
 },async close(){
  await client.close();
  http.closeIdleConnections?.();
  http.closeAllConnections?.();
  await new Promise(resolve=>http.close(resolve));
  for(const x of instances){try{await x.transport.close()}catch{}try{await x.mcp.close()}catch{}}
 }};
}
test('V6 real localhost MCP: signed-shaped article -> timeout -> independent complete original HTML; other states fail closed',{timeout:25000},async()=>{
 const f=await fixture();
 try{
  const blocked=await fetch(f.uri,{method:'POST',headers:{Accept:'application/json, text/event-stream',
   'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
  assert.equal(blocked.status,401);
  await blocked.text(); // Consume the response so loopback sockets close promptly.
  assert.equal(f.state.rejected,1);
  const list=await f.client.listTools();
  assert.equal(list.tools.length,1);
  assert.equal(list.tools[0].name,'life_article_fulltext_read');
  assert.equal(list.tools[0].annotations?.readOnlyHint,true);
  const ok=await f.call();
  assert.equal(ok.code,'FULL_BODY_READY_FOR_SUMMARY');
  assert.equal(ok.summary_scope,'FULL_ARTICLE_SOURCE_VERIFIED');
  assert.equal(ok.article?.url,ARTICLE_URL);
  assert.equal(ok.article?.full_body_readback_verified,true);
  assert.equal(ok.article?.verified_reader,'INDEPENDENT_ORIGINAL_HTML');
  assert.equal(ok.summaryTask?.mode,'SUMMARIZE_SOURCE_TEXT');
  assert(ok.article.fullBody.includes('합성 시험 문단 넷'));
  assert(!ok.article.fullBody.includes('광고와 메뉴'));
  assert.deepEqual(ok.attempts.map(x=>x.kind),['PLAYWRIGHT','INDEPENDENT_ORIGINAL']);
  assert.equal(f.state.browser,1);
  assert.equal(f.state.html,1);
  assert.equal(f.state.screen,2,'one initial and one final signed-shaped right-pane readback');
  // Same article, but command superseded during Playwright: no fallback network.
  f.state.mode='command_changed_during_primary';
  f.state.command=CMD;
  const prePrimaryHtml=f.state.html;
  const primaryCancelled=await f.call();
  assert.equal(primaryCancelled.code,'HOST_COMMAND_CHANGED_DURING_READ');
  assert.equal(f.state.html,prePrimaryHtml);
  assert.equal(primaryCancelled.article?.fullBody,undefined);
  // New command during fallback: never publish already-read old article text.
  f.state.mode='command_changed_during_fallback';
  f.state.command=CMD;
  const duringFallback=await f.call();
  assert.equal(duringFallback.code,'HOST_COMMAND_CHANGED_DURING_READ');
  assert.equal(duringFallback.article?.fullBody,undefined);
  // A tab switch, changed right work window, stale final proof, or failed final
  // readback must all suppress full body even if original fetch was complete.
  for(const mode of ['tab_switched_after_fetch','window_switched_after_fetch',
    'final_receipt_unverified','final_receipt_stale']){
   f.state.mode=mode;f.state.command=CMD;f.state.flipOnRead=f.state.screen+2;
   const changed=await f.call();
   assert.equal(changed.code,'RIGHT_ARTICLE_CHANGED_DURING_READ',mode);
   assert.equal(changed.article?.fullBody,undefined,mode);
  }
  f.state.command=CMD;
  for(const mode of ['unverified','changed_command','ambiguous','search']){
   f.state.mode=mode;
   const before=[f.state.browser,f.state.html];
   const result=await f.call();
   assert.equal(result.ok,false,mode);
   assert.equal(result.summary_scope,'NOT_VERIFIED',mode);
   assert.deepEqual([f.state.browser,f.state.html],before,'no network after invalid signed screen: '+mode);
  }
  f.state.mode='valid';
  const unsafe=await f.call({article_url:'http://127.0.0.1:3000/private'});
  assert.equal(unsafe.code,'ORIGINAL_URL_NOT_ALLOWED');
  const unrelated=await f.call({article_url:'https://evil.example/other'});
  assert.equal(unrelated.code,'ORIGINAL_URL_NOT_ALLOWED');
  f.state.mode='wrong_title';
  assert.equal((await f.call()).code,'PARTIAL_SOURCE_ONLY');
  f.state.mode='incomplete';
  assert.equal((await f.call()).code,'PARTIAL_SOURCE_ONLY');
  f.state.mode='unverified';
  const injected=await f.call({article_url:ARTICLE_URL,proof:{verified:true,source_ref:'JH_SIGNED_RIGHT:FAKE'}});
  assert.equal(injected.ok,false);
  console.log('JH167_V6_SYNTHETIC_HANDOFF '+JSON.stringify({
   httpUnauthorized:blocked.status,mcpTools:list.tools.length,
   fullBodyWithValidSyntheticProof:true,timeoutFallbackOnce:true,
   commandChangesDiscarded:2,postReadScreenChangesDiscarded:4,
   invalidScreenBlocked:4,unsafeUrlBlocked:2,wrongTitleBlocked:true,
   incompleteBodyBlocked:true,injectedProofBlocked:true,
   syntheticOnly:true,realPhone:false,productionDeploy:false}));
 }finally{await f.close()}
});
