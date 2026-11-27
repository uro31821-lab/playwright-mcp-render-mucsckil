import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMediaRequest,estimateMediaCost,calculateMediaActualCost,isExplicitMediaExecutionRequest,MEDIA_MODELS} from './gemini-policy.mjs';

const analysis=(overrides={})=>({kind:'analysis',requestId:'req-analysis-1',taskRef:'task-media-1',userRequest:'이 영상의 내용을 요약해줘',prompt:'요청한 구간의 내용과 근거를 한국어로 요약해 주세요.',sourceUrl:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',...overrides});
const generation=(overrides={})=>({kind:'generation',requestId:'req-generation-1',taskRef:'task-media-2',userRequest:'바다가 잔잔히 움직이는 영상을 만들어줘',prompt:'고요한 제주 바다. 고정된 카메라로 자연스러운 파도를 담는다.',...overrides});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=';
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code&&error.message===code);

test('public YouTube forms canonicalize to one identity and explicit analysis interval',()=>{
  for(const sourceUrl of ['https://youtu.be/dQw4w9WgXcQ?si=track','https://youtube.com/shorts/dQw4w9WgXcQ','https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&utm_source=test']) {
    const n=normalizeMediaRequest(analysis({sourceUrl}));
    assert.equal(n.source.url,'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(n.source.videoId,'dQw4w9WgXcQ');
    assert.equal(n.source.fullLengthKnown,false);assert.equal(n.source.publicAccessVerified,false);
    assert.equal(n.source.coverage,'requested_interval_only');
    assert.equal(n.actor,'video');assert.equal(n.model,MEDIA_MODELS.analysis);
    assert.deepEqual(n.body.input[0],{type:'video',uri:n.source.url,resolution:'low',processing:{type:'static',fps:1,start_offset:'0s',end_offset:'600s'}});
    assert.deepEqual(n.body.generation_config,{max_output_tokens:2048});
    assert.equal(n.body.store,false);assert.equal(n.body.background,false);assert.equal(n.body.tools,undefined);
    assert.match(n.body.system_instruction,/untrusted evidence/);
  }
});
test('rejects nonofficial or ambiguous sources without guessing another video',()=>{
  for(const sourceUrl of ['http://youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:8443/watch?v=dQw4w9WgXcQ','https://youtube.com/watch?v=dQw4w9WgXcQ#t=30','https://youtube.com/watch?v=dQw4w9WgXcQ#','https://youtube.com/watch?v=short','https://youtube.com/watch?v=dQw4w9WgXcQ&v=aaaaaaaaaaa','https://youtube.com/embed/dQw4w9WgXcQ','https://youtube.com/watch?v=dQw4w9WgXcQ\n','https://youtu.be/dQw4w9WgXcQ?v=aaaaaaaaaaa']) rejects(()=>normalizeMediaRequest(analysis({sourceUrl})),'INVALID_SOURCE_URL');
  rejects(()=>normalizeMediaRequest(analysis({sourceUrl:'https://youtu.be/dQw4w9WgXcQ?t=30'})),'SOURCE_INTERVAL_PARAMETERS_REQUIRE_EXPLICIT_FIELDS');
  rejects(()=>normalizeMediaRequest(analysis({sourceUrl:'https://youtu.be/dQw4w9WgXcQ?access_token=secret'})),'UNSUPPORTED_SOURCE_PARAMETER');
});
test('does not silently replace requested intervals or invalid options',()=>{
  const n=normalizeMediaRequest(analysis({startSeconds:60,endSeconds:180,resolution:'high'}));
  assert.equal(n.source.requestedDurationSeconds,120);assert.equal(n.body.input[0].processing.start_offset,'60s');
  for(const delta of [{startSeconds:600},{startSeconds:20,endSeconds:10},{endSeconds:1801}]) rejects(()=>normalizeMediaRequest(analysis(delta)),'INVALID_ANALYSIS_INTERVAL');
  for(const delta of [{startSeconds:-1},{endSeconds:1.2},{resolution:'720p'}]) rejects(()=>normalizeMediaRequest(analysis(delta)),'INVALID_MEDIA_OPTION');
  rejects(()=>normalizeMediaRequest(analysis({image:{}})),'INCOMPATIBLE_MEDIA_OPTION');
});
test('generation requires a current explicit request, including quoted standalone commands',()=>{
  for(const userRequest of ['이 사진으로 영상을 만들어줘','영상 제작해줘','이 글로 동영상을 생성해주세요','“이 사진으로 영상 만들어줘”','Create a short video of the sea','Please generate a video with natural motion','얼굴은 변형하지 말고 이 사진으로 영상 만들어줘']) {
    assert.equal(normalizeMediaRequest(generation({userRequest})).actor,'pyeonbiseo',userRequest);
  }
  for(const userRequest of ['카비서 이 사진 구도 알려줘','영상 만드는 방법 알려줘','이 영상 내용 분석해줘','영상 만들 수 있어?','영비서 편비서 기능 제작 시작','영상 제작 기능 만들어줘','“영상 만들어줘”라고 말하면 되나?','영상 생성 기능을 개발해줘','영상을 만들어주는 방법 알려줘','영상 만들어줘도 되는지 알려줘','How do I create a video?','Explain how to make a video','Teach me to generate a video','Create a video generation feature']) rejects(()=>normalizeMediaRequest(generation({userRequest})),'EXPLICIT_VIDEO_REQUEST_REQUIRED');
  for(const userRequest of ['영상 만들지 마','영상을 생성하지 말아줘','영상 제작 중단','취소','영상 만들어줘. 아니, 취소','Do not create a video','Cancel the video request']) rejects(()=>normalizeMediaRequest(generation({userRequest})),'MEDIA_REQUEST_CANCELLED');
  for(const userRequest of ['영상 분석 취소','분석하지 마','요약은 그만','Do not analyze this video']) rejects(()=>normalizeMediaRequest(analysis({userRequest})),'MEDIA_REQUEST_CANCELLED');
});
test('one short generation has the documented Interactions body and no analysis token ceiling',()=>{
  const n=normalizeMediaRequest(generation());
  assert.deepEqual(n.body.response_format,{type:'video',duration:'8s',resolution:'720p',aspect_ratio:'16:9'});
  assert.equal(n.count,1);assert.equal(n.body.generation_config,undefined);assert.equal(n.body.store,false);assert.equal(n.body.tools,undefined);
  assert.equal(n.body.input.length,1);assert.equal(n.body.input[0].type,'text');
  for(const delta of [{count:2},{durationSeconds:2},{durationSeconds:16},{resolution:'8k'},{aspectRatio:'1:1'}]) rejects(()=>normalizeMediaRequest(generation(delta)),'INVALID_MEDIA_OPTION');
  rejects(()=>normalizeMediaRequest(generation({sourceUrl:'https://youtu.be/dQw4w9WgXcQ'})),'INCOMPATIBLE_MEDIA_OPTION');
});
test('image input uses raw base64, retains the asset reference, and enforces type/size',()=>{
  const n=normalizeMediaRequest(generation({image:{mimeType:'image/png',data:png,assetRef:'asset:photo-1'},aspectRatio:'9:16'}));
  assert.equal(n.image.assetRef,'asset:photo-1');assert.equal(n.image.byteLength,Buffer.from(png,'base64').length);
  assert.deepEqual(n.body.input[0],{type:'image',data:png,mime_type:'image/png'});
  assert.equal(n.body.response_format.aspect_ratio,'9:16');
  for(const data of ['',`data:image/png;base64,${png}`,'not-base64',png+'\n',Buffer.alloc(4*1024*1024+1).toString('base64')]) rejects(()=>normalizeMediaRequest(generation({image:{mimeType:'image/png',data,assetRef:'asset:x'}})),'INVALID_IMAGE_INPUT');
  rejects(()=>normalizeMediaRequest(generation({image:{mimeType:'image/jpeg',data:png,assetRef:'asset:x'}})),'IMAGE_MIME_SIGNATURE_MISMATCH');
  rejects(()=>normalizeMediaRequest(generation({image:{mimeType:'image/png',data:png,assetRef:'https://example.org/photo'}})),'INVALID_MEDIA_REFERENCE');
});
test('rejects sensitive or credential text before preparing any external body',()=>{
  for(const prompt of ['환자명: 홍길동','주민등록번호 900101-1234567','연락처 010-1234-5678','환자 사진입니다 person@example.com','api_key=secret123','password: example-pass','Authorization: Bearer token12345678','진료기록을 사용해줘']) rejects(()=>normalizeMediaRequest(generation({prompt})),'SENSITIVE_MEDIA_INPUT_BLOCKED');
  assert.equal(normalizeMediaRequest(generation({prompt:'고령 환자를 위한 일반적인 물 마시기 교육 영상'})).kind,'generation');
  rejects(()=>normalizeMediaRequest(analysis({userRequest:'비밀번호: secret'})),'SENSITIVE_MEDIA_INPUT_BLOCKED');
});
test('identifiers, actor and model cannot redirect the policy or provider',()=>{
  for(const key of ['requestId','taskRef']) for(const value of ['','../other','with space','request:colon','x'.repeat(81)]) rejects(()=>normalizeMediaRequest(analysis({[key]:value})),'INVALID_MEDIA_REFERENCE');
  for(const value of ['A_b.c-1','x'.repeat(80)]) assert.equal(normalizeMediaRequest(analysis({requestId:value,taskRef:value})).requestId,value);
  rejects(()=>normalizeMediaRequest(analysis({model:'gemini-4-carbon'})),'UNSUPPORTED_MEDIA_MODEL');
  rejects(()=>normalizeMediaRequest(analysis({actor:'pyeonbiseo'})),'INVALID_MEDIA_ACTOR');
  rejects(()=>normalizeMediaRequest(analysis({tools:[{}]})),'UNSUPPORTED_MEDIA_FIELD');
  rejects(()=>normalizeMediaRequest(analysis({prompt:'text\0secret'})),'INVALID_MEDIA_TEXT');
});
test('submit intent gate distinguishes media execution from explanation, setup and development',()=>{
  for(const request of ['이 영상 분석해줘','이 영상 내용 알려줘','유튜브 영상을 요약해주세요','이 영상에서 뭐라고 하는 거야?','요약해줘','이걸 분석해줘','Please analyze this video','Can you summarize this YouTube video?']) assert.equal(isExplicitMediaExecutionRequest('analysis',request),true,request);
  for(const request of ['API 키 발급 방법 알려줘','영상 분석 기능 만들어줘','영비서 편비서 기능 제작 시작','영상 제작 기능 만들어줘','영상 분석하는 방법 설명해줘','How do I analyze this video?','영상 분석할 수 있어?','이 영상 요약하지 마','분석 취소','“이 영상 분석해줘”라는 말이면 될까?']) assert.equal(isExplicitMediaExecutionRequest('analysis',request),false,request);
  for(const request of ['이 사진으로 영상 만들어줘','영상 제작해줘','Create a short video']) assert.equal(isExplicitMediaExecutionRequest('generation',request),true,request);
  for(const request of ['영비서 편비서 기능 제작 시작','영상 제작 기능 만들어줘','영상 만들 수 있어?','영상 만들지 마','How do I create a video?']) assert.equal(isExplicitMediaExecutionRequest('generation',request),false,request);
  for(const request of [undefined,null,'',42,{},'비밀번호: secret']) assert.equal(isExplicitMediaExecutionRequest('analysis',request),false);
  assert.equal(isExplicitMediaExecutionRequest('unknown','이 영상 분석해줘'),false);
});
test('informational analysis can be quoted locally but has no paid execution intent',()=>{
  for(const userRequest of ['API 키 발급 방법 알려줘','영상 분석 기능 만들어줘']) {
    const n=normalizeMediaRequest(analysis({userRequest}));
    assert.ok(estimateMediaCost(n).estimatedMicros>0);
    assert.equal(isExplicitMediaExecutionRequest(n.kind,n.userRequest),false);
  }
});
test('normalization and estimates do not mutate user data and preserve price provenance',()=>{
  const input=analysis();const before=structuredClone(input);
  const n=normalizeMediaRequest(input);const nBefore=structuredClone(n);
  const cost=estimateMediaCost(n);
  assert.deepEqual(input,before);assert.deepEqual(n,nBefore);
  assert.ok(Number.isSafeInteger(cost.estimatedMicros)&&Number.isSafeInteger(cost.reserveMicros));
  assert.ok(cost.reserveMicros>cost.estimatedMicros);assert.equal(cost.currency,'USD');assert.equal(cost.priceVersion,'2026-11-27');
  assert.equal(cost.hardCapGuaranteed,false);assert.equal(cost.creditApplied,false);assert.equal(cost.invoiceVerified,false);
  assert.equal(cost.basis.videoTokensPerSecond,100);assert.equal(cost.basis.reservedVideoTokensPerSecond,300);
  const high=estimateMediaCost(normalizeMediaRequest(analysis({resolution:'high'})));
  assert.equal(high.estimatedMicros-cost.estimatedMicros,600*200*0.3);
});
test('generation estimates keep audio/video output cost and extra-token reserve nonzero',()=>{
  for(const [resolution,tps] of [['360p',1931],['720p',5792],['1080p',8688],['4k',17376]]) {
    const c=estimateMediaCost(normalizeMediaRequest(generation({resolution})));
    assert.equal(c.basis.videoOutputTokens,8*tps);
    assert.ok(c.estimatedMicros>8*tps*12);assert.ok(c.reserveMicros>c.estimatedMicros);
  }
  const one=estimateMediaCost(normalizeMediaRequest(generation()));
  const image=estimateMediaCost(normalizeMediaRequest(generation({image:{mimeType:'image/png',data:png,assetRef:'asset:x'}})));
  assert.ok(image.estimatedMicros>one.estimatedMicros);assert.ok(image.reserveMicros>one.reserveMicros);
});
test('analysis actual cost adds thought tokens once and handles reported cache discount',()=>{
  const n=normalizeMediaRequest(analysis());
  const a=calculateMediaActualCost(n,{total_input_tokens:61000,total_output_tokens:1000,total_thought_tokens:1000,total_cached_tokens:0,total_tokens:63000});
  assert.equal(a.actualMicros,23300);assert.equal(a.billingStatus,'usage_reported');assert.equal(a.invoiceVerified,false);
  const b=calculateMediaActualCost(n,{total_input_tokens:100000,total_output_tokens:100,total_thought_tokens:100,total_cached_tokens:50000});
  assert.equal(b.actualMicros,17000);
  assert.equal(calculateMediaActualCost(n,{total_input_tokens:1,total_output_tokens:0,total_thought_tokens:0}).actualMicros,1);
});
test('generation actual cost needs video/text modality, bills thought at text output rate',()=>{
  const n=normalizeMediaRequest(generation());
  const usage={total_input_tokens:1000,total_output_tokens:46436,total_thought_tokens:20,total_cached_tokens:0,output_tokens_by_modality:[{modality:'video',tokens:46336},{modality:'text',tokens:100}]};
  const result=calculateMediaActualCost(n,usage);
  assert.equal(result.actualMicros,558612);assert.equal(result.billingStatus,'usage_reported');
  const capital={...usage,output_tokens_by_modality:[{modality:'VIDEO',tokens:46336},{modality:'TEXT',tokens:100}]};
  assert.equal(calculateMediaActualCost(n,capital).actualMicros,558612);
  for(const delta of [{output_tokens_by_modality:[]},{output_tokens_by_modality:null},{output_tokens_by_modality:[{modality:'text',tokens:100}]},{output_tokens_by_modality:[{modality:'audio',tokens:46436}]},{total_cached_tokens:1}]) {
    const r=calculateMediaActualCost(n,{...usage,...delta});assert.equal(r.actualMicros,null);assert.equal(r.billingStatus,'unknown');
  }
});
test('missing, malformed, contradictory or tool usage is unknown, never a free call',()=>{
  const n=normalizeMediaRequest(analysis());
  for(const usage of [null,{}, {total_input_tokens:100,total_output_tokens:10}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:null}, {total_input_tokens:-1,total_output_tokens:10,total_thought_tokens:0}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:0,total_tokens:200}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:0,total_tool_use_tokens:50}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:0,input_tokens_by_modality:[{modality:'text',tokens:1}]}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:0,total_cached_tokens:101}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:0,output_tokens_by_modality:[{modality:'video',tokens:10}]}, {total_input_tokens:100,total_output_tokens:10,total_thought_tokens:0,input_tokens_by_modality:'unknown'}]) {
    const r=calculateMediaActualCost(n,usage);assert.equal(r.actualMicros,null);assert.equal(r.billingStatus,'unknown');
  }
});
