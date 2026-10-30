import test from 'node:test';
import assert from 'node:assert/strict';
import { GEMINI_NATIVE_PROFILE as profile, nativeWorkViewport, nodeToWorkPoint, discoverGeminiInput } from '../src/gemini-ui.mjs';

// Sanitized geometry from the live Fold screen. No account, window ID or token retained.
const screen = { windowId: 7, packageName: profile.hostPackage, left: 1233, top: 0, right: 2448, bottom: 1713 };
const account = { windowId: '7', package: profile.hostPackage, bounds: '2313 121 2415 223' };
const title = { windowId: '7', package: profile.hostPackage, text: 'Gemini Flash', editable: 'false' };
const input = { windowId: '7', package: profile.hostPackage, viewId: profile.inputViewId,
  bounds: '1334 1431 2347 1553', editable: 'true', text: 'private draft', sensitive: 'false' };

test('absolute avatar bounds map to the centre, not the screen edge', () => {
  const p = nodeToWorkPoint(screen, account);
  assert.deepEqual(p, { x: 1131, y: 172, viewport_width: 1215, viewport_height: 1713 });
  // Reproduce JH runtime mapping: this must hit the exact observed native centre.
  assert.equal(screen.left + Math.floor(p.x * (screen.right - screen.left) / p.viewport_width), 2364);
});
test('capture viewport matches native work size even if inspect had a display-sized override', () => {
  assert.deepEqual(nativeWorkViewport({ ...screen, viewportWidth: 2448, viewportHeight: 1713 }),
    { viewport_width: 1215, viewport_height: 1713 });
});
test('nonzero top offset is removed for a vertically shifted work pane', () => {
  assert.deepEqual(nodeToWorkPoint({ ...screen, top: 100, bottom: 1813 },
    { ...account, bounds: '2313 221 2415 323' }), { x: 1131, y: 172, viewport_width: 1215, viewport_height: 1713 });
});
test('wrong windows, foreign apps and nodes crossing a pane boundary cannot become actions', () => {
  for (const node of [{ ...account, windowId: '8' }, { ...account, package: 'other.app' },
    { ...account, bounds: '1200 121 1300 223' }, { ...account, bounds: '2313 121 2450 223' }])
    assert.throws(() => nodeToWorkPoint(screen, node));
  assert.throws(() => nativeWorkViewport({ ...screen, right: NaN }));
  assert.throws(() => nodeToWorkPoint(screen, { ...account, bounds: '2313 121 2313 223' }));
});
test('Google package or text alone cannot identify the Gemini native input', () => {
  assert.notEqual(discoverGeminiInput([input], screen).code, 'GEMINI_INPUT_CANDIDATE');
  assert.notEqual(discoverGeminiInput([title], screen).code, 'GEMINI_INPUT_CANDIDATE');
  assert.notEqual(discoverGeminiInput([title, input, input], screen).code, 'GEMINI_INPUT_CANDIDATE');
});
test('candidate discovery never claims signed proof, entitlement or an unseen send button', () => {
  const result = discoverGeminiInput([title, input], screen);
  assert.equal(result.code, 'GEMINI_INPUT_CANDIDATE');
  assert.equal(result.verified, false);
  assert.equal(result.needsFreshJhValidation, true);
  assert.equal(result.submitIdentified, false);
  assert.equal(result.entitlementVerified, false);
  assert.equal(JSON.stringify(result).includes('private draft'), false);
});

import {discoverGeminiSubmit} from '../src/gemini-ui.mjs';
const send = {windowId:'7',package:profile.hostPackage,viewId:'',text:'전송',
 bounds:'2271 1553 2372 1654',clickable:'true',editable:'false',sensitive:'false'};
const unlabeled = [
 {windowId:'7',package:profile.hostPackage,viewId:'',text:'',bounds:'1309 1553 1410 1654',clickable:'true',editable:'false'},
 {windowId:'7',package:profile.hostPackage,viewId:'',text:'',bounds:'2170 1553 2271 1654',clickable:'true',editable:'false'},
 {...send,text:''}
];
test('Gemini accessible SEND label creates an untrusted single target candidate',()=>{
 const result=discoverGeminiSubmit([title,input,send],screen,'private draft');
 assert.equal(result.code,'SEND_CANDIDATE_REQUIRES_LOCAL_REVIEW');
 assert.equal(result.unique,true);
 assert.deepEqual(result.point,{x:1088,y:1603,viewport_width:1215,viewport_height:1713});
 assert.equal(result.verified,false);
 assert.equal(result.actionAuthority,false);
 assert.equal(result.automaticSend,false);
 assert.equal(result.needsFreshJhValidation,true);
});
test('contentDescription may identify SEND but microphone or duplicate send cannot',()=>{
 const semantic={...send,text:'',contentDescription:'보내기'};
 assert.equal(discoverGeminiSubmit([title,input,semantic],screen,'private draft').unique,true);
 assert.equal(discoverGeminiSubmit([title,input,{...semantic,contentDescription:'마이크'}],screen,'private draft').unique,false);
 assert.equal(discoverGeminiSubmit([title,input,send,semantic],screen,'private draft').code,'EXACT_SEND_CONTROL_NOT_UNIQUE');
});
test('live JH168 editor serializer suffix matches exact draft; no prefix or changed draft',()=>{
 const serialized={...input,text:'private draft Gemini에게 물어보세요 '+profile.inputViewId};
 assert.equal(discoverGeminiSubmit([title,serialized,send],screen,'private draft').unique,true);
 assert.equal(discoverGeminiSubmit([title,{...serialized,text:serialized.text+'!'},send],screen,'private draft').code,'DRAFT_NOT_EXACT');
 assert.equal(discoverGeminiSubmit([title,{...serialized,geminiPlainText:'other draft'},send],screen,'private draft').code,'DRAFT_NOT_EXACT');
 assert.equal(discoverGeminiSubmit([title,{...input,geminiTextPartial:true},send],screen,'private draft').code,'DRAFT_NOT_EXACT');
});
test('unlabeled live Fold icons only yield a visual-proof-required, non-clickable candidate',()=>{
 const r=discoverGeminiSubmit([title,input,...unlabeled],screen,'private draft');
 assert.equal(r.code,'GEMINI_UNLABELED_SEND_VISUAL_PROOF_REQUIRED');
 assert.equal(r.unique,false);
 assert.equal(r.actionAuthority,false);
 assert.equal(r.automaticSend,false);
 assert.equal(r.verified,false);
 assert.equal(r.visualProofRequired,true);
 assert.deepEqual(r.candidatePoint,{x:1088,y:1603,viewport_width:1215,viewport_height:1713});
 assert.equal('point' in r,false);
 assert.equal('selector' in r,false);
 assert.equal(JSON.stringify(r).includes('private draft'),false);
});
test('wrong window, missing composer, changed icon layout and off-pane targets fail closed',()=>{
 const badWindow={...send,windowId:'88'};
 assert.equal(discoverGeminiSubmit([title,input,badWindow],screen,'private draft').unique,false);
 assert.equal(discoverGeminiSubmit([input,send],screen,'private draft').unique,false);
 assert.equal(discoverGeminiSubmit([title,input,...unlabeled.slice(1)],screen,'private draft').unique,false);
 assert.equal(discoverGeminiSubmit([title,input,...unlabeled.map(n=>({...n,bounds:'100 1553 201 1654'}))],screen,'private draft').unique,false);
 assert.equal(discoverGeminiSubmit([title,input,{...send,bounds:'2500 1553 2601 1654'}],screen,'private draft').unique,false);
});
