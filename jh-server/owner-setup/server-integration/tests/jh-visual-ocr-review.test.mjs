import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewCommand,safeOcrReviewOutcome} from '../jh-visual-ocr-review-bridge.mjs';
import {inspectSplitEvidenceForOcr} from '../jh-visual-ocr-split-proof.mjs';
const check=(result,rows)=>inspectSplitEvidenceForOcr(result,rows);
function fixture(observedAtMs=Date.now()){
 const pair={kind:'split_screen_evidence',version:'1',verified:'true',layout:'LEFT_RIGHT',
  chatPackage:'com.openai.chatgpt',chatKind:'NATIVE',chatWindowId:'100',chatBounds:'0,0,1200,1800',
  workPackage:'com.kakao.talk',workWindowId:'101',workBounds:'1201,0,2400,1800',observedAtMs:String(observedAtMs)};
 const args={action:'set_text',text:'__JH_VISUAL_OCR_V1__|aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee|abcabcabc-123|visual_ocr_review|',value:''};
 const rows=[pair,{kind:'native_photo_ocr_review_available',visualOcr:JSON.stringify({carrier:'android_step:set_text',reviewToolArguments:args})},
  {kind:'snapshot_status',package:'com.koreanlifehub.bridge.protocol',restricted:'false'}];
 return {status:'complete',result:{ok:true,splitScreenRequired:true,splitScreen:pair,url:JSON.stringify(rows)}};
}
test('exact signed right-pane evidence yields only device-emitted review command',()=>{
 const r=readReviewCommand(fixture(),check);assert.equal(r.ok,true);assert.equal(r.args.action,'set_text');
 assert.ok(r.args.text.endsWith('|visual_ocr_review|'));assert.equal(r.args.value,'');
});
test('expired evidence rejected',()=>{
 assert.equal(readReviewCommand(fixture(Date.now()-120000),check).code,'OCR_SPLIT_PROOF_REQUIRED');
});
test('changed right window rejected',()=>{
 const s=fixture(),a=JSON.parse(s.result.url);a[0].workWindowId='999';s.result.url=JSON.stringify(a);
 assert.equal(readReviewCommand(s,check).code,'OCR_SPLIT_PROOF_REQUIRED');
});
test('no split evidence rejected',()=>{
 const s=fixture();delete s.result.splitScreenRequired;
 assert.equal(readReviewCommand(s,check).code,'OCR_SPLIT_PROOF_REQUIRED');
});
test('OCR-start selector injection denied',()=>{
 const s=fixture(),a=JSON.parse(s.result.url),v=JSON.parse(a[1].visualOcr);
 v.reviewToolArguments.text=v.reviewToolArguments.text.replace('visual_ocr_review','visual_ocr_start');
 a[1].visualOcr=JSON.stringify(v);s.result.url=JSON.stringify(a);
 assert.equal(readReviewCommand(s,check).code,'OCR_REVIEW_COMMAND_INVALID');
});
test('duplicate photo command ambiguous',()=>{
 const s=fixture(),a=JSON.parse(s.result.url);a.push({...a[1]});s.result.url=JSON.stringify(a);
 assert.equal(readReviewCommand(s,check).code,'OCR_REVIEW_AMBIGUOUS');
});
test('secure view blocks review',()=>{
 const s=fixture(),a=JSON.parse(s.result.url);a.push({kind:'snapshot_status',restricted:'true'});s.result.url=JSON.stringify(a);
 assert.equal(readReviewCommand(s,check).code,'OCR_SECURE_VIEW_BLOCKED');
});
test('tokens and account numbers never leaked on result readback',()=>{
 const r=safeOcrReviewOutcome({status:'complete',result:{ok:true,url:JSON.stringify({ok:true,code:'fresh_consent_required',freshConsentRequired:true,reviewToken:'TOPSECRET_TEST_ABC',account:'000-123'})}});
 assert.equal(r.ok,true);assert.equal(r.capturePerformed,false);
 assert.doesNotMatch(JSON.stringify(r),/TOPSECRET_TEST_ABC|000-123/);
});
test('unexpected OCR-start receipt is not success',()=>{
 const r=safeOcrReviewOutcome({status:'complete',result:{ok:true,url:JSON.stringify({ok:true,code:'ocr_started',capturePerformed:true})}});
 assert.equal(r.ok,false);assert.equal(r.code,'OCR_REVIEW_UNEXPECTED_RESULT');
});
test('unfinished job is not replayed',()=>{
 assert.equal(safeOcrReviewOutcome({status:'in_progress'}).code,'OCR_REVIEW_RESULT_UNKNOWN_NO_REPLAY');
});
