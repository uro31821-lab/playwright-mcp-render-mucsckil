/** G10: JH167 GUIDE must show current signed right-pane elements, never past pages. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ScreenUnderstandingEngine} from './jh-screen-understanding/engine.mjs';
import {buildReadOnlyScreenGuide} from '../reservation-link/screen-guide.mjs';
import {buildCleanRestartRelease56} from './durable-clean-restart-release.mjs';

const T=Date.UTC(2026,9,18,0,0,0);
const binding={commandId:'a'.repeat(32),deviceKey:'synthetic-verified-device',trustKey:'synthetic-active-secure-session',observedAt:T};
const scope=verified=>({kind:'screen_scope',package:'com.android.chrome',windowId:'91',
  verifiedRightPane:verified?'true':'false',placement:'RIGHT',workBounds:'1200 0 2400 1800'});
const rows=(label,verified=true)=>[scope(verified),
 {kind:'snapshot_status',code:'complete',restricted:'false'},
 {package:'com.android.chrome',windowId:'91',kind:'accessibility',
  text:label,controlRole:'button',bounds:'1250 150 2050 230',sensitive:'false'}];
const question='현재 오른쪽 Chrome에서 검색어 또는 주소를 입력하려면 어디를 눌러야 해?';

test('G10 current EVIDENCE finds a visible control that exact-query EXPLAIN misses',()=>{
 const engine=new ScreenUnderstandingEngine({clock:()=>T});
 const explain=engine.analyze({mode:'EXPLAIN',query:question,rows:rows('Google 검색 또는 URL 입력'),...binding});
 assert.equal(explain.ok,true);
 assert.equal(explain.observed.length,0);
 const now=engine.analyze({mode:'EVIDENCE',query:'',rows:rows('Google 검색 또는 URL 입력'),...binding});
 assert.equal(now.ok,true);assert.equal(now.readOnly,true);
 assert.equal(now.screen.verifiedRightPane,true);
 assert.equal(now.observed.length,1);
 assert.equal(now.observed[0].quote,'Google 검색 또는 URL 입력');
 const guide=buildReadOnlyScreenGuide({question,now:()=>T,observation:{
  app:now.screen.package,window_id:now.screen.windowId,
  observed_at:new Date(T).toISOString(),partial:now.screen.partial,
  visible_elements:now.observed.map(x=>({label:x.quote,role:'observed',visible:true}))
 }});
 assert.equal(guide.screen_verified,true);
 assert.equal(guide.screen.visible_elements.length,1);
 assert.equal(guide.screen.visible_elements[0].label,'Google 검색 또는 URL 입력');
 assert.equal(guide.external_effect_status,'NOT_EXECUTED');
 assert.deepEqual(guide.allowed_effects,[]);
});
test('G10 EVIDENCE does not leak prior page controls into a changed current screen',()=>{
 const engine=new ScreenUnderstandingEngine({clock:()=>T});
 const first=engine.analyze({mode:'EVIDENCE',query:'',rows:rows('Google 검색 또는 URL 입력'),...binding});
 const second=engine.analyze({mode:'EVIDENCE',query:'',rows:rows('다른 페이지의 다음 버튼'),...binding});
 assert.equal(first.ok,true);assert.equal(second.ok,true);
 assert(second.observed.some(x=>x.quote.includes('다른 페이지')));
 assert(!second.observed.some(x=>x.quote.includes('Google 검색')));
});
test('G10 unverified screen fails closed without accessible evidence',()=>{
 const engine=new ScreenUnderstandingEngine({clock:()=>T});
 const failed=engine.analyze({mode:'EVIDENCE',query:'',rows:rows('비공개 화면',false),...binding});
 assert.equal(failed.ok,false);
 assert.equal(failed.code,'RIGHT_SPLIT_PANE_NOT_VERIFIED');
 const guide=buildReadOnlyScreenGuide({question,now:()=>T,observation:null});
 assert.equal(guide.screen_verified,false);
});
test('G10 generated JH167 live host preserves signed readback and current evidence mode',async()=>{
 const built=buildCleanRestartRelease56();
 const mod=await import(pathToFileURL(built.file).href+'?g10-current-pane-proof');
 const root=path.resolve(import.meta.dirname,'..');
 const runtime=mod.buildDurableRoutedOperationalEntrypoint(root);
 const src=readFileSync(runtime.runtimeFile,'utf8');
 assert.equal(src.split("jhScreenUnderstanding56.analyze({mode:'EVIDENCE',query:'',rows,").length,2);
 assert(!src.includes("jhScreenUnderstanding56.analyze({mode:'EXPLAIN',query:question,rows,"));
 for(const sentinel of ["jhRequireCommand56(device)!==commandId","jhInspectSplitEvidence155(done.result,rows)",
  "done.secureSessionId!==auth.sessionId","done.targetDeviceId!==device",
  "SAFE_SCREEN_EVIDENCE_UNAVAILABLE","jhRegisterReservationLinkTools"]){
  assert(src.includes(sentinel),'missing signed guard '+sentinel);
 }
 const toolsSource=readFileSync(path.join(root,'reservation-link/host-tools.mjs'),'utf8');
 assert(toolsSource.includes("registerOAuthTool('life_reservation_screen_guide',"),
  'registered guide tool missing from its imported module');
});
