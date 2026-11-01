/** JH168 9/9 verification-first: execute GENERATED Android RIGHT alias bodies
 * against inert signed-native doubles. No phone, Playwright, source changes,
 * extra approvals or assertion of real device E2E success. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {patchJH168MobileWebCommands56} from './mobile-web-tool-patch.mjs';

const source=readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
const start='  registerOAuthTool("life_web_navigate",{';
const inject=[
 '  let jhRightWebOpen56=null;',
 '  function jhSplitScreenJob56(){}',
 '  function jhSplitScreenContextId56(){}',
 '  function jhSplitScreenPayloadHasLocalOnly56(){}',
 '  function jhRequireCommand56(device){}',
 "  registerOAuthTool('life_android_split_screen_assistant',{});"
].join('\n')+'\n';
assert.ok(source.includes(start));
const patched=patchJH168MobileWebCommands56(source.replace(start,inject+start));
const a=patched.indexOf('  // JH168: all nine historical web commands');
const b=patched.indexOf('  registerOAuthTool("life_android_devices",{',a);
assert.ok(a>=0&&b>a);
const body=patched.slice(a,b);
const names=['navigate','snapshot','click','type','select','press_key','wait','back','screenshot'];
const ctx='ssc_'+'1'.repeat(32),item='item_'+'2'.repeat(16);
const parse=x=>JSON.parse(x.content[0].text);
function setup({inputAllowed=true,localOnly=false}={}){
 const calls=[],opens=[],captures=[],handlers=new Map();
 const z=new Proxy(()=>z,{get:()=>z,apply:()=>z});
 const textResult=v=>({content:[{type:'text',text:JSON.stringify(v)}]});
 const sandbox={
  URL,z,textResult,randomBytes:n=>Buffer.alloc(n,1),
  registerOAuthTool:(n,c,h)=>handlers.set(n,h),
  jhSplitScreenContextId56:x=>typeof x==='string'&&/^ssc_[a-f0-9]{32}$/.test(x),
  jhSplitScreenPayloadHasLocalOnly56:p=>localOnly&&p?.action==='SET_TEXT',
  jhRightWebOpen56:async x=>{opens.push(x);return textResult({ok:true,opened:x.service})},
  jhSplitScreenJob56:async(type,payload,effect,tool)=>{
   calls.push({type,payload,effect,tool});
   return type==='split_screen_session_input_preflight'?
    {inputAllowed,inputGrantToken:inputAllowed?'synthetic-only':undefined,code:'PREFLIGHT'}:
    {ok:true,type,action:payload?.action,automaticReplay:false};
  },
  fakeCapture:async args=>{captures.push(args);return textResult({ok:true,syntheticCaptured:true})}
 };
 vm.runInNewContext(body+'\njhMobileWebCapture56=async(args)=>fakeCapture(args)',sandbox,{timeout:2000});
 assert.equal(handlers.size,9);
 return {calls,opens,captures,run:(n,args)=>handlers.get('life_web_'+n)(args)};
}
test('navigate signed RIGHT; rejects unsupported URLs and embedded credentials',async()=>{
 const f=setup();assert.equal(parse(await f.run('navigate',{url:'https://example.org/a'})).opened,'https://example.org/a');
 for(const url of ['ftp://example.org','https://u:p@example.org','bad']){
  assert.equal(parse(await f.run('navigate',{url})).code,'MOBILE_URL_INVALID');
 }
 assert.equal(f.opens.length,1);
});
test('snapshot sends only signed START or STATUS, rejects invalid original context',async()=>{
 const f=setup();
 await f.run('snapshot',{goal:'read neutral page'});await f.run('snapshot',{context_id:ctx});
 assert.deepEqual(f.calls.map(x=>x.type),['split_screen_session_start','split_screen_session_status']);
 assert.equal(f.calls[0].effect,'READ_ONLY');
 assert.equal(parse(await f.run('snapshot',{context_id:'bad'})).code,'MOBILE_CONTEXT_ID_INVALID');
});
test('click requires exact fresh item and dispatches one signed RIGHT CLICK',async()=>{
 const f=setup();assert.equal(parse(await f.run('click',{context_id:ctx,target_item_ref:item})).action,'CLICK');
 assert.equal(f.calls[0].tool,'life_android_execute_computer_action');
 assert.equal(f.calls[0].effect,'REVERSIBLE_WRITE');
 assert.equal(parse(await f.run('click',{context_id:ctx,target:'css .button'})).code,'MOBILE_FRESH_ITEM_REF_REQUIRED');
 assert.equal(f.calls.length,1);
});
test('type requires original input grant, no implicit submit/CSS, no fallback',async()=>{
 const f=setup();assert.equal(parse(await f.run('type',{context_id:ctx,target_item_ref:item,text:'safe probe'})).action,'SET_TEXT');
 assert.deepEqual(f.calls.map(x=>x.type),['split_screen_session_input_preflight','split_screen_session_followup']);
 assert.equal(f.calls[1].payload.inputGrantToken,'synthetic-only');
 assert.equal(f.calls[1].payload.value,'safe probe');
 assert.equal(parse(await f.run('type',{context_id:ctx,target_item_ref:item,text:'x',submit:true})).code,'MOBILE_SUBMIT_SEPARATE_ACTION_REQUIRED');
 assert.equal(parse(await f.run('type',{context_id:ctx,target_item_ref:item,text:'x',element:'input#a'})).code,'MOBILE_CSS_SELECTOR_UNSUPPORTED');
 assert.equal(f.calls.length,2);
 const denied=setup({inputAllowed:false});await denied.run('type',{context_id:ctx,target_item_ref:item,text:'x'});
 assert.equal(denied.calls.length,1);
 const local=setup({localOnly:true});assert.equal(parse(await local.run('type',{context_id:ctx,target_item_ref:item,text:'x'})).code,'MOBILE_LOCAL_INPUT_REQUIRED');
});
test('select OPEN then PICK requires fresh item, rejects HTML internal values',async()=>{
 const f=setup();await f.run('select',{context_id:ctx,phase:'OPEN',target_item_ref:item});
 await f.run('select',{context_id:ctx,phase:'PICK',target_item_ref:'item_'+'3'.repeat(16)});
 assert.deepEqual(f.calls.map(x=>x.payload.action),['CLICK','CLICK']);
 assert.equal(parse(await f.run('select',{context_id:ctx,phase:'PICK',values:['opaque-html-option']})).code,'MOBILE_SELECT_VISIBLE_ITEM_REQUIRED');
});
test('press_key only BACK supported, Enter/Tab/Escape are explicitly unverified',async()=>{
 const f=setup();
 for(const key of ['Enter','Tab','Escape'])assert.equal(parse(await f.run('press_key',{key,context_id:ctx})).code,'MOBILE_KEY_NOT_VERIFIED');
 assert.equal(f.calls.length,0);
 assert.equal(parse(await f.run('press_key',{key:'BACK',context_id:ctx})).action,'BACK');
 assert.equal(f.calls.length,1);
});
test('wait always reports unverified condition, no spurious Android action',async()=>{
 const f=setup();
 const r=parse(await f.run('wait',{context_id:ctx,time:2,expected_text:'ready'}));
 assert.equal(r.code,'MOBILE_WAIT_CONDITION_UNVERIFIED');
 assert.equal(r.conditionVerified,false);
 assert.equal(f.calls[0].effect,'READ_ONLY');
 assert.equal(parse(await f.run('wait',{context_id:ctx,time:31})).code,'MOBILE_WAIT_BUDGET_INVALID');
});
test('back sends one RIGHT BACK, does not claim browser history navigation',async()=>{
 const f=setup();const r=parse(await f.run('back',{context_id:ctx}));
 assert.equal(r.action,'BACK');assert.equal(r.browserHistoryNavigationVerified,false);
 assert.equal(f.calls.length,1);
});
test('screenshot requires local consent fields and delegates only to original capture handler',async()=>{
 const f=setup();
 assert.equal(parse(await f.run('screenshot',{})).code,'MOBILE_CAPTURE_REQUIRES_PHONE_CONSENT');
 assert.equal(f.captures.length,0);
 const r=parse(await f.run('screenshot',{screen_grant_token:'synthetic',screen_consent_digest:'synthetic',lease_token:'synthetic'}));
 assert.equal(r.syntheticCaptured,true);assert.equal(f.captures.length,1);
});
test('all nine are generated Android RIGHT-only; no cloud Playwright fallback remains',()=>{
 const f=setup();assert.equal(f.opens.length,0);
 assert.equal((body.match(/registerOAuthTool\("life_web_/g)||[]).length,9);
 assert.ok(!body.includes('browserTool('));
 assert.ok(!body.includes('browser_navigate('));
});
