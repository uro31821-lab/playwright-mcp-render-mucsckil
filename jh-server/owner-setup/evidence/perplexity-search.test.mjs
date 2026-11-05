import test from 'node:test';
import assert from 'node:assert/strict';
import {isExplicitEvidenceRequest,registerJHEvidenceSearchTool,searchPerplexityEvidence} from './perplexity-search.mjs';
const KEY='test-only-fake-api-key-000000';
const yes=x=>({ok:true,status:200,text:async()=>JSON.stringify(x)});
const z=(()=>{
  const leaf={min(){return this;},max(){return this;},optional(){return this;},int(){return this;},regex(){return this;}};
  return {string:()=>({...leaf}),array:()=>({...leaf}),union:()=>({...leaf}),number:()=>({...leaf}),enum:()=>({...leaf})};
})();

test('only explicit evidence requests qualify',()=>{
  for(const s of ['이 기사의 근거 찾아줘','관련 논문과 원문 링크 보여줘','이 주장의 증거 자료 제시해 줘','출처?','근거는?','관련 자료는?','그 근거는?','그에 대한 출처는?','팩트체크해줘','show citation sources','논문 자료 찾아줘','이 기사 요약하고 관련 근거 논문도 찾아줘'])
    assert.equal(isExplicitEvidenceRequest(s),true,s);
  for(const s of ['이 기사 요약해 줘','내 생각을 확장해 줘','주식 아이디어 줘','오늘 날씨?','자료를 찾지 마','근거를 요구하지 않아','이 논문을 요약해줘','이 자료 내용 정리해줘','이 기사에 근거 부족한 이유를 설명해줘','팩트체크하는 방법 알려줘','이 보고서의 출처 표기법을 설명해줘','소스 코드 보여줘'])
    assert.equal(isExplicitEvidenceRequest(s),false,s);
});

test('standard Search API: ONE POST, no agent/model/fast; source links for GPT',async()=>{
 let count=0;
 const fetchImpl=async(url,req)=>{
   count++;
   assert.equal(url,'https://api.perplexity.ai/search');
   assert.equal(req.method,'POST');
   assert.equal(req.headers.Authorization,'Bearer '+KEY);
   const body=JSON.parse(req.body);
   assert.equal(body.query,'dementia diagnosis NICE clinical guideline');
   assert.equal(body.max_results,10);
   assert.equal(body.max_tokens,12000);
   assert.equal(body.max_tokens_per_page,1500);
   for(const forbidden of ['model','tools','search_type','search_context_size'])assert.equal(body[forbidden],undefined);
   return yes({id:'test-1',results:[
     {title:'Clinical guideline',url:'https://www.nice.org.uk/guidance/ng97',snippet:'A guideline excerpt',date:'2025-01-01'},
     {title:'Duplicate',url:'https://www.nice.org.uk/guidance/ng97',snippet:'duplicate'},
     {title:'No excerpt',url:'https://example.org/report',snippet:''},
     {title:'Unsafe',url:'javascript:alert(1)',snippet:'not trustworthy'}
   ]});
 };
 const result=await searchPerplexityEvidence({query:'dementia diagnosis NICE clinical guideline',apiKey:KEY,fetchImpl});
 assert.equal(count,1);assert.equal(result.ok,true);
 assert.equal(result.provider,'perplexity_search');
 assert.equal(result.assistant_marker,'🏴‍☠️ 퍼비서:');
 assert.equal(result.search_type,'standard');
 assert.equal(result.sources.length,2);
 assert.equal(result.sources[0].url,'https://www.nice.org.uk/guidance/ng97');
 assert.equal(result.sources[0].evidence_status,'UNVERIFIED_SEARCH_EXCERPT');
 assert.equal(result.sources[1].evidence_status,'LINK_ONLY_NOT_EVIDENCE');
 assert.equal(result.estimated_perplexity_cost_usd,0.005);
 assert.equal(result.source_verification,'NOT_VERIFIED_FROM_ORIGINAL_PAGE');
 assert.equal(JSON.stringify(result).includes(KEY),false);
});

test('MCP OAuth tool hidden without key, blocks generic questions',async()=>{
 const registered=[];
 const registrar=(name,config,handler)=>registered.push({name,config,handler});
 const textResult=x=>x;
 assert.equal(registerJHEvidenceSearchTool({registerOAuthTool:registrar,z,textResult}),false);
 assert.equal(registered.length,0);
 let count=0;
 assert.equal(registerJHEvidenceSearchTool({registerOAuthTool:registrar,z,textResult,apiKey:KEY,
   fetchImpl:async()=>{count++;return yes({results:[]});}}),true);
 assert.equal(registered.length,1);
 assert.equal(registered[0].name,'jh_evidence_search');
 assert.match(registered[0].config.title,/🏴‍☠️ 퍼비서/);
 const handler=registered[0].handler;
 const blocked=await handler({user_request:'이 기사 요약해 줘',query:'the general article'});
 assert.equal(blocked.code,'EXPLICIT_EVIDENCE_REQUEST_REQUIRED');assert.equal(count,0);
 const ok=await handler({user_request:'이 기사의 근거와 링크 찾아줘',query:'supporting paper search'});
 assert.equal(ok.ok,true);assert.equal(count,1);
});

test('five search queries use one paid request, zero-results remain billable',async()=>{
 let count=0;
 const fetchImpl=async(_url,req)=>{
   count++;
   assert.deepEqual(JSON.parse(req.body).query,['original research','systematic review','official statistics','clinical trials','guidelines']);
   return yes({results:[]});
 };
 const result=await searchPerplexityEvidence({apiKey:KEY,fetchImpl,query:['original research','systematic review','official statistics','clinical trials','guidelines']});
 assert.equal(count,1);assert.equal(result.ok,true);assert.equal(result.returned_sources,0);assert.equal(result.billed,true);
});

test('reject bad queries and personal identifiers BEFORE external network',async()=>{
 let count=0;
 const fetchImpl=async()=>{count++;return yes({results:[]});};
 for(const query of ['', ['a','b','c','d'],['a','b','c','d','e','f'],'010-1234-5678 medical report','900101-1234567 name','valid\nmalicious','person@example.com study','환자명: 김철수 진료 기록']){
   const result=await searchPerplexityEvidence({query,apiKey:KEY,fetchImpl});
   assert.equal(result.code,'INVALID_OR_SENSITIVE_QUERY');
 }
 assert.equal(count,0);
});

test('upstream failure is sanitized, no retry or credential exposure',async()=>{
 for(const [status,code] of [[401,'UPSTREAM_AUTH_REJECTED'],[402,'UPSTREAM_CREDITS_EXHAUSTED'],[429,'UPSTREAM_RATE_LIMITED'],[502,'UPSTREAM_UNAVAILABLE']]){
   let count=0;
   const fetchImpl=async()=>{count++;return {ok:false,status,text:async()=>'secret '+KEY};};
   const r=await searchPerplexityEvidence({query:'find supporting evidence',apiKey:KEY,fetchImpl});
   assert.equal(count,1);assert.equal(r.code,code);
   assert.equal(JSON.stringify(r).includes(KEY),false);
 }
});

test('success payload lacking sources is NOT passed off as evidence',async()=>{
 const r=await searchPerplexityEvidence({query:'find supporting evidence',apiKey:KEY,fetchImpl:async()=>yes({answer:'not sources'})});
 assert.equal(r.ok,false);assert.equal(r.code,'UPSTREAM_INVALID_SCHEMA');
 assert.equal(r.billing_status,'UNKNOWN');
});


test('documented Search API options travel under exact parameter names (no context_size)',async()=>{
 let calls=0;
 const fetchImpl=async(_url,req)=>{
   calls++;
   const body=JSON.parse(req.body);
   assert.deepEqual(body,{
     query:['clinical research','clinical guideline'],
     max_results:20,
     max_tokens:5000,
     max_tokens_per_page:1000,
     country:'KR',
     search_domain_filter:['pubmed.ncbi.nlm.nih.gov','nature.com'],
     search_language_filter:['en','ko'],
     search_after_date_filter:'01/01/2025',
     search_recency_filter:'year'
   });
   return yes({id:'search-mock',results:[{title:'Original',url:'https://nature.com/study',snippet:'Source excerpt'},
     {title:'Duplicate',url:'https://nature.com/study',snippet:'duplicated'},
     {title:'Other',url:'https://pubmed.ncbi.nlm.nih.gov/12345',snippet:'Another excerpt'}]});
 };
 const result=await searchPerplexityEvidence({
   query:['clinical research','clinical guideline'],apiKey:KEY,fetchImpl,
   max_results:20,max_tokens:5000,max_tokens_per_page:1000,country:'kr',
   search_domain_filter:['pubmed.ncbi.nlm.nih.gov','nature.com'],
   search_language_filter:['EN','ko'],search_after_date_filter:'01/01/2025',
   search_recency_filter:'year'
 });
 assert.equal(calls,1);
 assert.equal(result.ok,true);
 assert.equal(result.sources.length,2);
 assert.equal(result.sources[0].url,'https://nature.com/study');
});

test('invalid search options fail before network',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return yes({results:[]})};
 const options=[
  {max_results:0},{max_results:21},{max_results:1.5},{country:'KOR'},
  {search_language_filter:['english']},{search_domain_filter:['https://nature.com']},
  {search_domain_filter:['nature.com','-reddit.com']},
  {search_after_date_filter:'02/29/2025'},{search_recency_filter:'decade'},
  {max_tokens:-1},{max_tokens_per_page:0}
 ];
 for(const opt of options){
   const out=await searchPerplexityEvidence({query:'supporting study',apiKey:KEY,fetchImpl,...opt});
   assert.equal(out.code,'INVALID_SEARCH_OPTIONS',JSON.stringify(opt));
 }
 assert.equal(calls,0);
});

test('429 honors provider Retry-After without automatic retry',async()=>{
 let calls=0;
 const result=await searchPerplexityEvidence({query:'supporting study',apiKey:KEY,fetchImpl:async()=>{
  calls++;
  return {ok:false,status:429,headers:{get:(name)=>name==='retry-after'?'17':null},text:async()=> 'never expose upstream'};
 }});
 assert.equal(calls,1);
 assert.equal(result.code,'UPSTREAM_RATE_LIMITED');
 assert.equal(result.retry_after_seconds,17);
 assert.equal(result.automatic_retry,false);
 assert.equal(JSON.stringify(result).includes(KEY),false);
});
