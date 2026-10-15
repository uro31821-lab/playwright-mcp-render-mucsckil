import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectSplitEvidence} from './split-screen-evidence.mjs';
import {patchScreenUnderstandMcp56} from './jh-screen-understanding/jh-screen-mcp-patch.mjs';

const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
function extract(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return text.slice(a,b);}
const multi=extract(source('./jh155-multistep-patch.mjs'),'  async function jhMultiRead155','  async function jhMultiNavigate155');
const owner=extract(source('./jh155-all-modules-patch.mjs'),'  async function jhOwnerAdmission155','\n'+String.fromCharCode(96)+';\n');
const APP='com.android.chrome';
function fixture(){
 const at=Date.now(),pair={kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
 chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'12',chatBounds:'0,0,500,900',
 workPackage:APP,workWindowId:'34',workBounds:'510,0,1000,900',observedAtMs:String(at)};
 return {status:'complete',targetDeviceId:'device',secureSessionId:'session',
 result:{ok:true,splitScreenRequired:true,splitScreen:pair,url:JSON.stringify([
 {package:APP,windowId:'34',text:'Visible test page'}, {...pair,package:'com.koreanlifehub.bridge.protocol'}
 ])}};
}
function harness({delay=18000,receipt=fixture(),bindingError=false,changeCommand=false}={}){
 const calls={dispatch:0,wait:0,budgets:[],analysis:0};let command='command';
 const deps={
 jhRequireCommand56:()=>command,
 jhPaymentLifecycle:{captureBinding:()=>({}),assertBinding:()=>{if(bindingError)throw Error('BINDING_CHANGED');}},
 active56:()=>({sessionId:'session',trustId:'trust'}),
 waitJob:async(_j,budget)=>{calls.wait++;calls.budgets.push(budget);if(changeCommand)command='new';return delay<=budget?receipt:{status:'queued'};},
 mk:()=>{calls.dispatch++;return {id:'read-only-job'};},
 jhInspectSplitEvidence155:inspectSplitEvidence,
 jhBlockedCommands56:new Set(),
 jhGateRecoveredDispatch155:args=>({allowDispatch:args.bridgeAuthenticated&&args.trustedScopeValid&&args.isFreshScreen})
 };
 const build=(body,name)=>Function(...Object.keys(deps),body+'\nreturn '+name+';')(...Object.values(deps));
 return {calls,read:build(multi,'jhMultiRead155'),admission:build(owner,'jhOwnerAdmission155'),receipt,deps};
}
const ctx={deviceId:'device',commandId:'command'};
test('18-second signed split read completes with one request, no redispatch',async()=>{
 const h=harness();const r=await h.read(ctx,{app:APP});
 assert.equal(r.resultVerified,true);assert.equal(r.summarySource,'Visible test page');
 assert.equal(h.calls.dispatch,1);assert.equal(h.calls.wait,1);
});
test('fast signed split read is unchanged',async()=>{
 const h=harness({delay:100});assert.equal((await h.read(ctx,{app:APP})).resultVerified,true);
});
test('pending beyond bounded budget remains unconfirmed and is not parsed or retried',async()=>{
 const h=harness({delay:31000});
 await assert.rejects(()=>h.read(ctx,{app:APP}),/SIGNED_SCREEN_READBACK_UNCONFIRMED/);
 assert.equal(h.calls.dispatch,1);assert.equal(h.calls.wait,1);assert.ok(h.calls.budgets[0]<=30000);
});
test('changed command after waiting rejects the observation',async()=>{
 const h=harness({changeCommand:true});
 await assert.rejects(()=>h.read(ctx,{app:APP}),/MULTISTEP_COMMAND_CHANGED/);
});
test('invalid trust/process binding still rejects before result use',async()=>{
 const h=harness({bindingError:true});
 await assert.rejects(()=>h.read(ctx,{app:APP}),/BINDING_CHANGED/);
});
test('cancelled signal dispatches no snapshot',async()=>{
 const h=harness();
 await assert.rejects(()=>h.read(ctx,{app:APP,signal:{aborted:true}}),/WORK_CANCELLED/);
 assert.equal(h.calls.dispatch,0);
});
for(const [name,modify] of [
 ['session mismatch',r=>{r.secureSessionId='other';}],
 ['device mismatch',r=>{r.targetDeviceId='other';}],
 ['stale screen',r=>{r.result.splitScreen.observedAtMs=String(Date.now()-60000);}],
 ['wrong work app',r=>{r.result.splitScreen.workPackage='com.kakao.talk';}],
 ['mixed screen rows',r=>{const rows=JSON.parse(r.result.url);rows.push({package:'com.openai.chatgpt',windowId:'12',text:'private chat'});r.result.url=JSON.stringify(rows);}]
])test(name+' still fails closed',async()=>{
 const receipt=fixture();modify(receipt);const h=harness({receipt});
 await assert.rejects(()=>h.read(ctx,{app:APP}),/SIGNED_SCREEN_UNVERIFIED/);
 assert.equal(h.calls.dispatch,1);
});
test('owner admission waits for the same signed observation without opening an app',async()=>{
 const h=harness();
 const allowed=await h.admission('device','command',{state:'PREPARING',attemptCount:1,executionId:'execution',dedupeKey:'dedupe'},true);
 assert.equal(allowed,true);assert.equal(h.calls.dispatch,1);assert.equal(h.calls.wait,1);
});
test('owner admission cannot use an overdue observation',async()=>{
 const h=harness({delay:31000});
 assert.equal(await h.admission('device','command',{state:'PREPARING',attemptCount:1,executionId:'execution',dedupeKey:'dedupe'},true),false);
 assert.equal(h.calls.dispatch,1);
});
function screenHandler(h){
 const registrations=new Map();
 class Engine {snapshot(){return null;} analyze(args){h.calls.analysis++;return {ok:true,rowCount:args.rows.length};}}
 const host='function mk(){}\nfunction jhRequireCommand56(){}\nfunction createMcp(){\n  registerOAuthTool("life_android_snapshot",{});\n}';
 const generated=patchScreenUnderstandMcp56(host);
 const start=generated.indexOf('  registerOAuthTool("life_android_screen_understand"');
 const end=generated.indexOf('  registerOAuthTool("life_android_snapshot"',start);
 const chain={optional(){return this;},max(){return this;}};
 const deps={...h.deps,chooseDevice:()=> 'device',registerOAuthTool:(name,_schema,fn)=>registrations.set(name,fn),
 z:{enum:()=>chain,string:()=>chain},textResult:x=>x,sha56:x=>'digest:'+x,
 jhScreenUnderstanding56:new Engine(),jhConsumedOcrJobs56:new Set()};
 Function(...Object.keys(deps),generated.slice(start,end))(...Object.values(deps));
 return registrations.get('life_android_screen_understand');
}
test('screen-understanding adapter accepts delayed signed receipt',async()=>{
 const h=harness();const r=await screenHandler(h)({mode:'EVIDENCE'});
 assert.equal(r.ok,true);assert.equal(h.calls.analysis,1);assert.equal(h.calls.dispatch,1);
});
test('screen-understanding adapter reports pending without inventing evidence',async()=>{
 const h=harness({delay:31000});const r=await screenHandler(h)({mode:'EVIDENCE'});
 assert.equal(r.ok,false);assert.equal(r.code,'signed_screen_readback_unconfirmed');assert.equal(r.state,'queued');
 assert.equal(h.calls.analysis,0);assert.equal(h.calls.dispatch,1);
});
