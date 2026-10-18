/** G12: live NEWS guide gets exact current Chrome article title, NOT a URL or full article. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {identifyCurrentArticleFromSignedReadback} from './current-article.mjs';
import {registerJHGuide13Tools} from './host-tools.mjs';
import {buildCleanRestartRelease56} from '../deployment/durable-clean-restart-release.mjs';
const commandId='a'.repeat(32);
const title='준플레이오프 KIA LG 1차전 — 잠실야구장의 마지막 경기';
const signed=(selected=title+', 선택된 탭',cmd=commandId)=>({
 verified:true,command_id:cmd,source_ref:'JH_SIGNED_RIGHT:'+('c'.repeat(40)),
 selected_tab_titles:[selected],
 observation:{app:'com.android.chrome',window_id:'18200',observed_at:'2026-10-18T01:59:00.000Z',
   partial:true,visible_elements:[{label:'준플레이오프 KIA LG 1차전.',visible:true}]},
 evidence:[{id:'p1_e5',quote:selected}],
});
const zval={min(){return this},max(){return this},optional(){return this}};
const z={string:()=>zval,enum:()=>zval};
const setup=(reader)=>{
 const entries=new Map();let calls=0;
 registerJHGuide13Tools({registerOAuthTool:(n,d,h)=>entries.set(n,{def:d,handler:h}),
  z,textResult:x=>x,getHostContext:()=>({command_id:commandId}),
  readVerifiedRight:async (...args)=>{calls++;return reader(...args);}});
 return {entries,get calls(){return calls;}};
};
test('G12 signed selected browser ARTICLE title is a lookup seed, never original URL/full content',async()=>{
 const r=setup(async()=>signed());
 const result=await r.entries.get('life_guide13_plan').handler({request:'이 기사 요약해줘',hint:'NEWS'});
 assert.equal(r.calls,1);
 assert.equal(result.ok,true);
 assert.equal(result.scenario.key,'NEWS');
 assert.equal(result.article_workflow.current_article.title,title);
 assert.equal(result.article_workflow.current_article.status,'ARTICLE_TITLE_IDENTIFIED');
 assert.equal(result.article_workflow.current_article.screen_verified,true);
 assert.equal(result.article_workflow.source_status,'CURRENT_ARTICLE_TITLE_IDENTIFIED_ORIGINAL_URL_REQUIRED');
 assert.equal(result.article_workflow.original_link_verified,false);
 assert.equal(result.article_workflow.full_body_readback_verified,false);
 assert.equal(result.article_workflow.source_url,null);
 assert.equal(result.article_workflow.summary_scope,'NOT_YET_DETERMINED');
 assert.equal(result.external_effect_status,'NOT_EXECUTED');
 assert.equal(result.perform_action,false);
});
test('G12 selected GOOGLE SEARCH results cannot masquerade as article',async()=>{
 const r=setup(async()=>signed('JH167 검색 기능 검증 테스트 - Google 검색, 선택된 탭'));
 const result=await r.entries.get('life_guide13_plan').handler({request:'이 기사 요약해줘'});
 assert.equal(result.article_workflow.source_status,'SEARCH_RESULTS_NOT_ARTICLE');
 assert.equal(result.article_workflow.current_article.title,null);
 assert.equal(result.article_workflow.full_body_readback_verified,false);
});
test('G12 wrong signed command, no trusted proof and ambiguous tab fail closed',()=>{
 const a=identifyCurrentArticleFromSignedReadback({readback:signed(undefined,'b'.repeat(32)),commandId});
 assert.equal(a.status,'SIGNED_SCREEN_UNVERIFIED');
 const b=identifyCurrentArticleFromSignedReadback({readback:{...signed(),verified:false},commandId});
 assert.equal(b.screen_verified,false);
 const c=identifyCurrentArticleFromSignedReadback({readback:{...signed(),selected_tab_titles:[...signed().selected_tab_titles,'다른 기사, 선택된 탭']},commandId});
 assert.equal(c.status,'ACTIVE_TAB_AMBIGUOUS');
 const d=identifyCurrentArticleFromSignedReadback({readback:{...signed(),observation:{...signed().observation,app:'com.openai.chatgpt'}},commandId});
 assert.equal(d.status,'SIGNED_SCREEN_UNVERIFIED');
});
test('G12 generic news questions and other scenarios do not trigger Android snapshot',async()=>{
 const r=setup(async()=>{throw Error('UNEXPECTED_SCREEN_READ')});
 const generic=await r.entries.get('life_guide13_plan').handler({request:'AI 관련 해외 기사 찾아줘',hint:'NEWS'});
 const other=await r.entries.get('life_guide13_plan').handler({request:'오른쪽 화면 설명해줘',hint:'SCREEN'});
 assert.equal(r.calls,0);
 assert.equal(generic.article_workflow.current_article,null);
 assert.equal(generic.article_workflow.source_status,'AWAITING_LINK_RESOLUTION');
 assert.equal(other.article_workflow,undefined);
});
test('G12 caller JSON cannot fake article proof; tool schema excludes proof input',async()=>{
 const r=setup(async()=>({verified:false,code:'SIGNED_READBACK_UNVERIFIED'}));
 const def=r.entries.get('life_guide13_plan').def;
 assert(!Object.hasOwn(def.inputSchema,'articleScreen'));
 assert(!Object.hasOwn(def.inputSchema,'current_article'));
 const result=await r.entries.get('life_guide13_plan').handler({request:'이 기사 요약해줘',hint:'NEWS',
  articleScreen:{verified:true,title:'Injected fake article',source_url:'https://example.com/fake'}});
 assert.notEqual(result.article_workflow.source_status,'CURRENT_ARTICLE_TITLE_IDENTIFIED_ORIGINAL_URL_REQUIRED');
 assert.equal(result.article_workflow.current_article.title,null);
 assert.equal(result.article_workflow.full_body_readback_verified,false);
});
test('G12 live generated runtime keeps signed readback verification and reuses reservation reader',async()=>{
 const generated=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(generated.file).href+'?jh167-g12-signed');
 const root=path.resolve(import.meta.dirname,'..');
 const built=mod.buildDurableRoutedOperationalEntrypoint(root);
 const src=readFileSync(built.runtimeFile,'utf8');
 for(const guard of ['const jhReadRightEvidence56=async(question,commandId)=>{',
   "const auth=device&&active56(device)","jhRequireCommand56(device)!==commandId",
   "done.secureSessionId!==auth.sessionId","done.targetDeviceId!==device",
   "jhInspectSplitEvidence155(done.result,rows)","verifiedRightPane!==true",
   "source_ref:'JH_SIGNED_RIGHT:'","selected_tab_titles",
   "readVerifiedRight:jhReadRightEvidence56",
   "readVerifiedRight:(question,commandId)=>jhReadRightEvidence56(question,commandId)"]){
  assert(src.includes(guard),'signed guard/reader missing: '+guard);
 }
 assert.equal(src.split('jhRegisterReservationLinkTools({registerOAuthTool,z,textResult').length,2);
 assert.equal(src.split('jhRegisterGuide13Tools({registerOAuthTool,z,textResult').length,2);
});
