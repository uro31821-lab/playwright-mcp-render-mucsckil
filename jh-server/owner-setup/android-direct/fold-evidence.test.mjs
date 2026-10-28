import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFoldPair,guardFoldAction,FOLD_LAYOUTS} from './fold-evidence.mjs';
const clock=1800000000000;
const box=(left,top,right,bottom)=>[left,top,right,bottom].join(',');
function fixture(o={}) {
 const p={
  kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
  chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',
  chatWindowId:'18',chatBounds:box(1080,0,2160,1800),
  workPackage:'com.android.chrome',workWindowId:'17',
  workBounds:box(0,0,1080,1800),observedAtMs:String(clock-1000),...o
 };
 const rows=[{...p},{package:p.workPackage,windowId:p.workWindowId,
  text:'web search',clickable:true,bounds:box(25,50,1000,1700)}];
 return {result:{ok:true,splitScreenRequired:true,splitScreen:p},
   rows,proof:p};
}
const action=(x=420,y=600,extra={})=>({action:'CLICK',x,y,
  viewport_width:2160,viewport_height:1800,...extra});
test('unfolded-size left Chrome and right GPT verified from signed roles',()=>{
 const f=fixture();const x=inspectFoldPair(f.result,f.rows,undefined,clock);
 assert.equal(x.ok,true);assert.equal(x.workSide,'LEFT');
 assert.equal(x.chatSide,'RIGHT');assert.equal(x.workPackage,'com.android.chrome');
 assert.equal(x.displayFoldPosture,'UNVERIFIED');
 assert.equal(x.physicalUnfoldVerified,false);
 assert.equal(guardFoldAction(x,action()).ok,true);
});
test('swapped application panes must not be treated as matching requested layout',()=>{
 const f=fixture({chatBounds:box(0,0,1080,1800),
  workBounds:box(1080,0,2160,1800)});
 assert.equal(inspectFoldPair(f.result,f.rows,undefined,clock).code,
  'FOLD_WEB_NOT_LEFT_OF_GPT');
});
test('wrong GPT or web app, fake proof, overlay and bad geometry fail closed',()=>{
 const overrides=[
 {chatPackage:'com.android.chrome'}, {chatKind:'BROWSER_VERIFIED'},
 {workPackage:'com.some.otherapp'}, {verified:'false'},
 {layout:'TOP_BOTTOM'}, {workBounds:box(0,0,1400,1800)},
 {chatBounds:box(800,0,2160,1800)}, {chatWindowId:'17'},
 {workWindowId:'xx'}, {workBounds:box(0,0,0,0)}
 ];
 for(const change of overrides) {
  const f=fixture(change);
  assert.equal(inspectFoldPair(f.result,f.rows,undefined,clock).ok,false,
    JSON.stringify(change));
 }
});
test('must have signed proof row consistent with current browser window ID and bounds',()=>{
 const f=fixture();
 for(const rows of [
  null,[],[f.rows[1]],
  [{...f.rows[0],workWindowId:'99'},f.rows[1]],
  [f.rows[0],{...f.rows[1],package:'com.openai.chatgpt'}],
  [f.rows[0],{...f.rows[1],windowId:'99'}],
  [f.rows[0],{...f.rows[1],bounds:box(1000,50,1250,1700)}],
  [f.rows[0],{...f.rows[1],bounds:box(100,50,200,1700)},f.rows[0]]
 ])assert.equal(inspectFoldPair(f.result,rows,undefined,clock).ok,false);
});
test('stale screen and user moving splitter blocks use of old work bounds',()=>{
 const f=fixture({observedAtMs:String(clock-50000)});
 assert.equal(inspectFoldPair(f.result,f.rows,undefined,clock).code,'FOLD_SCREEN_STALE');
 const good=fixture();
 const proof=inspectFoldPair(good.result,good.rows,undefined,clock);
 assert.equal(guardFoldAction(proof,action(1500)).code,'FOLD_ACTION_OUTSIDE_LEFT_BROWSER');
 assert.equal(guardFoldAction(proof,action(1080)).code,'FOLD_ACTION_OUTSIDE_LEFT_BROWSER');
 assert.equal(guardFoldAction(proof,action(5,200)).ok,true);
 assert.equal(guardFoldAction(proof,action(1079,200)).ok,false);
 assert.equal(guardFoldAction(proof,action(500,600,{viewport_width:1080})).code,
   'FOLD_GLOBAL_VIEWPORT_REQUIRED');
});
test('browser work input focus must come from signed accessibility row',()=>{
 const f=fixture(),base=inspectFoldPair(f.result,f.rows,undefined,clock);
 assert.equal(guardFoldAction(base,action(300,500,{action:'TYPE'})).code,
  'FOLD_LEFT_WEB_INPUT_FOCUS_REQUIRED');
 const rows=[...f.rows,{package:'com.android.chrome',windowId:'17',
   editable:true,focused:true,bounds:box(100,100,700,160),text:'search field'}];
 const r=inspectFoldPair(f.result,rows,undefined,clock);
 assert.equal(r.workInputFocused,true);
 assert.equal(guardFoldAction(r,action(300,500,{action:'TYPE'})).ok,true);
});
test('Samsung Internet supported; physical FLAT not inferred from dimensions',()=>{
 const f=fixture({workPackage:'com.sec.android.app.sbrowser'});
 f.rows[1].package='com.sec.android.app.sbrowser';
 const p=inspectFoldPair(f.result,f.rows,undefined,clock);
 assert.equal(p.ok,true);assert.equal(p.physicalUnfoldVerified,false);
 const signed=fixture({foldPosture:'FLAT',foldPostureSource:'ANDROIDX_WINDOW_MANAGER'});
 assert.equal(inspectFoldPair(signed.result,signed.rows,undefined,clock).physicalUnfoldVerified,true);
});
test('existing left GPT/right work route is still verified by original JH inspector',()=>{
 const f=fixture({chatBounds:box(0,0,1080,1800),
  workBounds:box(1080,0,2160,1800),workPackage:'com.example.app'});
 const p=inspectFoldPair(f.result,f.rows,FOLD_LAYOUTS.LEGACY_LEFT_GPT_RIGHT_WORK,clock);
 assert.equal(p.ok,true);assert.equal(p.workSide,'RIGHT');
 const reverse=inspectFoldPair(f.result,f.rows,FOLD_LAYOUTS.LEFT_WEB_RIGHT_GPT,clock);
 assert.equal(reverse.ok,false);
});

test('V4 left native Gemini/right GPT is accepted only from signed Gemini window pair',()=>{
 const f=fixture({workPackage:'com.google.android.googlequicksearchbox'});
 f.rows[1].package='com.google.android.googlequicksearchbox';
 const proof=inspectFoldPair(f.result,f.rows,FOLD_LAYOUTS.LEFT_NATIVE_GEMINI_RIGHT_GPT,clock);
 assert.equal(proof.ok,true);
 assert.equal(proof.workSide,'LEFT');assert.equal(proof.chatSide,'RIGHT');
 assert.equal(proof.code,'SIGNED_LEFT_NATIVE_GEMINI_RIGHT_GPT_GEOMETRY_VERIFIED');
 assert.equal(proof.nativeGeminiWindowVerified,true);
 assert.equal(proof.geminiSurfaceVerified,false);
 assert.equal(proof.geminiAccountVerified,false);
 assert.equal(guardFoldAction(proof,action()).ok,true);
 assert.equal(guardFoldAction(proof,action(1600)).ok,false);
 // The legacy web route must still refuse the native Gemini activity.
 assert.equal(inspectFoldPair(f.result,f.rows,FOLD_LAYOUTS.LEFT_WEB_RIGHT_GPT,clock).ok,false);
});
test('V4 Gemini fold proof refuses Chrome, unrelated app, swapped GPT and stale frames',()=>{
 for(const extra of [
  {workPackage:'com.android.chrome'},{workPackage:'com.untrusted.app'},
  {chatPackage:'com.google.android.googlequicksearchbox'},
  {chatBounds:box(0,0,1080,1800),workBounds:box(1080,0,2160,1800)},
  {observedAtMs:String(clock-60000)}]){
  const f=fixture(extra);f.rows[1].package=f.proof.workPackage;
  const result=inspectFoldPair(f.result,f.rows,FOLD_LAYOUTS.LEFT_NATIVE_GEMINI_RIGHT_GPT,clock);
  assert.equal(result.ok,false,JSON.stringify(extra));
 }
 const f=fixture({workPackage:'com.google.android.googlequicksearchbox'});
 f.rows[1].package='com.google.android.googlequicksearchbox';
 f.rows[1].windowId='999';
 assert.equal(inspectFoldPair(f.result,f.rows,FOLD_LAYOUTS.LEFT_NATIVE_GEMINI_RIGHT_GPT,clock).ok,false);
});
test('native Gemini typing requires signed focused editor and never crosses divider',()=>{
 const f=fixture({workPackage:'com.google.android.googlequicksearchbox'});
 f.rows[1].package='com.google.android.googlequicksearchbox';
 const mode=FOLD_LAYOUTS.LEFT_NATIVE_GEMINI_RIGHT_GPT;
 let p=inspectFoldPair(f.result,f.rows,mode,clock);
 assert.equal(guardFoldAction(p,action(250,500,{action:'TYPE'})).ok,false);
 const signed=[...f.rows,{package:'com.google.android.googlequicksearchbox',windowId:'17',
  editable:true,focused:true,bounds:box(120,200,880,300),text:'Gemini editor'}];
 p=inspectFoldPair(f.result,signed,mode,clock);
 assert.equal(p.ok,true);
 assert.equal(guardFoldAction(p,action(250,500,{action:'TYPE'})).ok,true);
 assert.equal(guardFoldAction(p,action(1600,500)).ok,false);
});
