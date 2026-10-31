import test from 'node:test';
import assert from 'node:assert/strict';
import {isExplicitEvidenceRequest,registerJHEvidenceSearchTool,searchPerplexityEvidence} from './perplexity-search.mjs';
const KEY='test-only-fake-api-key-000000';
const yes=x=>({ok:true,status:200,text:async()=>JSON.stringify(x)});
const z=(()=>{
  const leaf={min(){return this;},max(){return this;}};
  return {string:()=>({...leaf}),array:()=>({...leaf}),union:()=>({...leaf})};
})();

test('only explicit evidence requests qualify',()=>{
  for(const s of ['이 기사의 근거 찾아줘','관련 논문과 원문 링크 보여줘','이 주장의 증거 자료 제시해 줘','출처?','팩트체크해줘','show citation sources'])
    assert.equal(isExplicitEvidenceRequest(s),true,s);
  for(const s of ['이 기사 요약해 줘','내 생각을 확장해 줘','주식 아이디어 줘','오늘 날씨?','자료를 찾지 마','근거를 요구하지 않아'])
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
   assert.equal(body.max_results,8);
   assert.equal(body.max_tokens,12000);
   assert.equal(body.max_tokens_per_page,1500);
   for(const forbidden of ['model','tools','search_type'])assert.equal(body[forbidden],undefined);
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
 const handler=registered[0].handler;
 const blocked=await handler({user_request:'이 기사 요약해 줘',query:'the general article'});
 assert.equal(blocked.code,'EXPLICIT_EVIDENCE_REQUEST_REQUIRED');assert.equal(count,0);
 const ok=await handler({user_request:'이 기사의 근거와 링크 찾아줘',query:'supporting paper search'});
 assert.equal(ok.ok,true);assert.equal(count,1);
});

test('three search queries use one paid request, zero-results remain billable',async()=>{
 let count=0;
 const fetchImpl=async(_url,req)=>{
   count++;
   assert.deepEqual(JSON.parse(req.body).query,['original research','systematic review','official statistics']);
   return yes({results:[]});
 };
 const result=await searchPerplexityEvidence({apiKey:KEY,fetchImpl,query:['original research','systematic review','official statistics']});
 assert.equal(count,1);assert.equal(result.ok,true);assert.equal(result.returned_sources,0);assert.equal(result.billed,true);
});

test('reject bad queries and personal identifiers BEFORE external network',async()=>{
 let count=0;
 const fetchImpl=async()=>{count++;return yes({results:[]});};
 for(const query of ['', ['a','b','c','d'],'010-1234-5678 medical report','900101-1234567 name','valid\nmalicious']){
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
