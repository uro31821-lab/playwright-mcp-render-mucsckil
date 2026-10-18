/** G11: article guides must resolve and read the FULL source before claiming a summary. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS,NEWS_FULL_ARTICLE_POLICY,prepareGuide13} from './core.mjs';
import {registerJHGuide13Tools} from './host-tools.mjs';
const host={protocol_version:'1.0',command_id:'a'.repeat(32),generation:null,plan_revision:null};
const make=(request,hint='NEWS')=>prepareGuide13({request,hint,hostContext:host});

test('G11 article route resolves original URL then reads body, not screen-only',()=>{
 const news=SCENARIOS.find(x=>x.key==='NEWS');
 assert.equal(news.port,'life_web_navigate');
 assert(news.requires.includes('VERIFIED_ORIGINAL_ARTICLE_URL'));
 assert(news.requires.includes('FULL_ARTICLE_BODY_READBACK'));
 const a=make('이 기사 전체 요약해줘');
 assert.equal(a.ok,true);
 assert.equal(a.scenario.key,'NEWS');
 assert.equal(a.suggested_existing_tool,'life_web_navigate');
 assert.equal(a.article_workflow.mode,'ORIGINAL_ARTICLE_FULL_BODY_FIRST');
 assert.equal(a.article_workflow.screen_role,'IDENTIFY_ARTICLE_AND_CONTEXT_NOT_FULL_TEXT');
 assert.equal(a.article_workflow.full_body_readback_verified,false);
 assert.equal(a.article_workflow.original_link_verified,false);
 assert.equal(a.article_workflow.source_status,'AWAITING_LINK_RESOLUTION');
 assert.equal(a.article_workflow.source_url,null);
 assert.equal(a.article_workflow.summary_scope,'NOT_YET_DETERMINED');
 assert.equal(a.guide_only,true);
 assert.equal(a.perform_action,false);
 assert.equal(a.external_effect_status,'NOT_EXECUTED');
 assert.equal(a.sources.length,0);
});
test('G11 source-first plan explicitly requires link, full body, citations and honest partial',()=>{
 const p=NEWS_FULL_ARTICLE_POLICY;
 assert.equal(p.planner_does_not_fetch,true);
 assert.equal(p.required_steps.length,6);
 assert(p.required_steps.some(x=>x.includes('original publication URL')));
 assert(p.required_steps.some(x=>x.includes('complete article body')));
 assert(p.required_steps.some(x=>x.includes('ChatGPT web search/open')));
 assert(p.required_steps.some(x=>x.includes('PARTIAL_SOURCE_ONLY')));
 assert(p.full_summary_requires.includes('FULL_BODY_ACCESSIBLE'));
 assert(p.prohibited_full_sources.includes('VISIBLE_ANDROID_SCREEN_ONLY'));
 assert(p.prohibited_full_sources.includes('SEARCH_SNIPPET_ONLY'));
 assert(p.prohibited_full_sources.includes('BROWSER_403_CAPTCHA'));
 assert(p.output_contract.includes('SOURCE_URL'));
 assert(p.output_contract.includes('ARTICLE_SCOPE'));
 assert(p.fallback_on_access_block.includes('INDEPENDENT_CHATGPT_WEB_SEARCH_OR_OPEN'));
});
test('G11 article gate never fabricates a fetched result even when user supplies URL in prose',()=>{
 const a=make('https://wikidocs.net/blog/@bamtiuniverse/33647/ 기사 전체 요약해줘');
 assert.equal(a.article_workflow.source_url,null);
 assert.equal(a.article_workflow.full_body_readback_verified,false);
 assert.equal(a.article_workflow.original_link_verified,false);
 assert.equal(a.result.status,'NOT_EXECUTED');
});
test('G11 unrelated guide scenarios remain unchanged and have no article claim',()=>{
 for(const hint of ['SCREEN','BOOKING','MAIL','PRODUCT']){
  const a=make('어디 눌러?',hint);
  assert.equal(a.scenario.key,hint);
  assert.equal(a.article_workflow,undefined);
  assert.equal(a.external_effect_status,'NOT_EXECUTED');
 }
});
test('G11 NEWS tool still read-only and registration count unchanged',async()=>{
 const entries=new Map();
 const val={min(){return this},max(){return this},optional(){return this}};
 const z={string:()=>val,enum:()=>val};
 registerJHGuide13Tools({
  z, textResult:x=>x,
  registerOAuthTool:(name,definition,handler)=>entries.set(name,{definition,handler}),
  getHostContext:()=>host
 });
 assert.deepEqual([...entries.keys()],['life_guide13_catalog','life_guide13_plan']);
 const c=await entries.get('life_guide13_catalog').handler({});
 assert.equal(c.scenarios.find(x=>x.key==='NEWS').existing_tool,'life_web_navigate');
 const reg=entries.get('life_guide13_plan');
 assert.equal(reg.definition.annotations.readOnlyHint,true);
 const x=await reg.handler({request:'이 기사 요약',hint:'NEWS'});
 assert.equal(x.article_workflow.full_body_readback_verified,false);
 assert.equal(x.result.status,'NOT_EXECUTED');
});
