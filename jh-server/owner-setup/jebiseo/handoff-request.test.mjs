import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareJebiseoHandoff, createJebiseoManualHandoff} from './handoff-request.mjs';

const input = (extra = {}) => ({taskRef: 'task:youtube-001', threadRef: 'thread:current-001',
  sourceRef: 'message:user-001', intent: 'execute', basis: 'direct', feature: 'YOUTUBE',
  requestText: '핵심 주장과 근거를 정리해 줘.',
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ?si=tracking', ...extra});
const android = (extra = {}) => input({feature: 'ANDROID', youtubeUrl: undefined,
  requestText: '삼성 계산기를 열어 줘.', ...extra});
const transition = (request, extra = {}) => ({taskRef: request.taskRef, threadRef: request.threadRef,
  sourceRef: request.sourceRef, requestDigest: request.requestDigest,
  step: 'INPUT', outcome: 'NOT_ATTEMPTED', ...extra});
const noSuccess = value => {
  for (const key of ['authorityVerified', 'toolInvoked', 'requestSent', 'externalEffectVerified',
    'resultVerified', 'geminiReplyVerified', 'screenVerified', 'automaticReplay', 'automaticResume', 'automaticReturnToGpt'])
    assert.equal(value[key], false, key);
  assert.equal(value.advisoryOnly, true);
};

test('Samsung requests remain broad native Gemini delegation, with no phone command or app allowlist', () => {
  for (const [target, requestText] of [
    ['삼성 노트', '방금 정리한 내용을 메모로 저장해 줘.'],
    ['삼성 계산기', '계산기를 열어 줘.'],
    ['거실 삼성 TV', '연결된 TV 볼륨을 낮춰 줘.'],
    ['추가로 연결한 삼성 기기', '현재 지원하는 동작을 확인해 줘.']
  ]) {
    const request = prepareJebiseoHandoff(android({target, requestText}));
    assert.equal(request.ok, true);
    assert.equal(request.surface, 'GEMINI_NATIVE');
    assert.equal(request.nativeGeminiRequired, true);
    assert.equal(request.supportsCurrentTargetVerified, false);
    assert.equal(request.layout, 'LEFT_GPT_RIGHT_GEMINI');
    assert.equal(request.resultDestination, 'GEMINI');
    assert.equal(request.returnToGpt, false);
    assert.equal(Object.hasOwn(request, 'openUrl'), false);
    assert.equal(Object.hasOwn(request, 'appPackage'), false);
    assert.equal(Object.hasOwn(request, 'commandId'), false);
    assert.equal(request.prompt, `대상: ${target}\n요청: ${requestText}`);
    assert.equal(Object.isFrozen(request), true);
    noSuccess(request);
  }
});

test('a direct stand-alone app request does not require extracting existing chat content', () => {
  const request = prepareJebiseoHandoff(android());
  assert.equal(request.ok, true);
  assert.equal(request.prompt, '삼성 계산기를 열어 줘.');
});

test('development, quoted examples, negation and ordinary discussion do not activate a handoff', () => {
  for (const extra of [{intent: 'development'}, {intent: 'quote'}, {intent: 'none'},
    {intent: 'open_app'}, {basis: 'quoted_example'}, {basis: 'negation'},
    {basis: 'about_assistant'}, {intent: undefined}, {basis: undefined}]) {
    const result = prepareJebiseoHandoff(input(extra));
    assert.equal(result.status, 'INACTIVE');
    assert.equal(result.active, false);
    assert.equal(Object.hasOwn(result, 'prompt'), false);
    noSuccess(result);
  }
  assert.equal(prepareJebiseoHandoff(input({basis: 'contextual_user_request'})).active, true);
});

test('all active requests retain the exact task, current thread and user source reference', () => {
  const current = prepareJebiseoHandoff(input());
  for (const key of ['taskRef', 'threadRef', 'sourceRef']) {
    assert.equal(current[key], input()[key]);
    for (const value of [undefined, '', 'bad ref', 2]) {
      const result = prepareJebiseoHandoff(input({[key]: value}));
      assert.equal(result.ok, false);
      assert.equal(Object.hasOwn(result, 'prompt'), false);
    }
    const changed = prepareJebiseoHandoff(input({[key]: `${input()[key]}-other`}));
    assert.notEqual(current.requestDigest, changed.requestDigest);
  }
  assert.equal(current.promptDigest, createHash('sha256').update(current.prompt).digest('hex'));
});

test('YouTube formats normalize to one video without returning tracking data or claiming existence', () => {
  for (const youtubeUrl of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=tracking',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ?feature=share',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ'
  ]) {
    const request = prepareJebiseoHandoff(input({youtubeUrl}));
    assert.equal(request.ok, true, youtubeUrl);
    assert.equal(request.youtubeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(request.youtubeVideoId, 'dQw4w9WgXcQ');
    assert.equal(request.existenceVerified, false);
    assert.equal(request.resultDestination, 'GPT_AFTER_MANUAL_SHARE');
    assert.equal(request.returnToGpt, true);
    assert.equal(request.surface, 'GEMINI_WEB');
    assert.equal(request.openUrl, 'https://gemini.google.com/app');
    assert.equal(request.prompt.includes('tracking'), false);
    noSuccess(request);
  }
});

test('unrelated, malformed, ambiguous or deceptive video URLs are rejected before a prompt is prepared', () => {
  for (const youtubeUrl of [undefined, 'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ',
    'https://evil:password@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com:444/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&v=AAAAAAAAAAA',
    'https://youtube.com/watch?v=too-short', 'https://youtube.com/playlist?list=PL123',
    'https://youtu.be/dQw4w9WgXcQ/other', 'https://youtube.com/%77atch?v=dQw4w9WgXcQ',
    'javascript:alert(1)', 'https://youtu.be/dQw4w9WgXcQ\n']) {
    const request = prepareJebiseoHandoff(input({youtubeUrl}));
    assert.equal(request.ok, false, String(youtubeUrl));
    assert.equal(request.code, 'JEBISEO_YOUTUBE_VIDEO_URL_REQUIRED');
    assert.equal(Object.hasOwn(request, 'prompt'), false);
  }
});

test('video preparation keeps existing-plan/no-extra-payment policy without inventing availability or export', () => {
  const request = prepareJebiseoHandoff(input({feature: 'VIDEO', youtubeUrl: undefined,
    requestText: '제주의 바다를 배경으로 8초짜리 영상을 만들어 줘.'}));
  assert.equal(request.ok, true);
  assert.equal(request.existingPlanOnly, true);
  assert.equal(request.additionalPaymentAllowed, false);
  assert.equal(request.availabilityVerified, false);
  assert.equal(request.resultDestination, 'GEMINI');
  assert.equal(request.returnToGpt, false);
  assert.equal(request.prompt.includes('추가 결제는 진행하지 마세요'), true);
  assert.equal(Object.hasOwn(request, 'downloadUrl'), false);
  assert.equal(Object.hasOwn(request, 'reply'), false);
  noSuccess(request);
});

test('long selected content remains intact for manual input instead of being silently truncated', () => {
  const requestText = '설명'.repeat(900);
  const request = prepareJebiseoHandoff(android({requestText}));
  assert.equal(request.ok, true);
  assert.equal(request.prompt, requestText);
  assert.equal(request.automaticInputFits, false);
  assert.equal(prepareJebiseoHandoff(android({requestText: '가'.repeat(6000)})).ok, false);
  for (const requestText of ['', '  ', '\u0000비밀', '\ud800', '내용\u0007'])
    assert.equal(prepareJebiseoHandoff(android({requestText})).ok, false);
});

test('manual preparation cannot smuggle global chat data, other feature arguments or execution options', () => {
  for (const extra of [{allChats: 'private'}, {returnToGpt: true}, {commandId: '1'.repeat(32)},
    {requestSent: true}, {target: '삼성 노트'}])
    assert.equal(prepareJebiseoHandoff(input(extra)).ok, false);
  const withGetter = input();
  Object.defineProperty(withGetter, 'requestText', {enumerable: true, get() {throw Error('must not run');}});
  assert.equal(prepareJebiseoHandoff(withGetter).ok, false);
});

test('known no-effect gaps produce only the outstanding manual step with the same scope', () => {
  const request = prepareJebiseoHandoff(android());
  for (const outcome of ['NOT_ATTEMPTED', 'VERIFIED_UNSUPPORTED_NO_EFFECT', 'FAILED_NO_EFFECT']) {
    for (const step of ['OPEN', 'INPUT', 'SUBMIT']) {
      const guide = createJebiseoManualHandoff(request, transition(request, {step, outcome}));
      assert.equal(guide.ok, true);
      assert.equal(guide.status, 'MANUAL_GUIDE');
      assert.equal(guide.nextAction, step);
      assert.equal(guide.taskRef, request.taskRef);
      assert.equal(guide.sourceRef, request.sourceRef);
      assert.equal(Object.hasOwn(guide, 'prompt'), step === 'INPUT');
      if (step === 'OPEN') assert.match(guide.instruction, /Gemini 모바일 앱/);
      noSuccess(guide);
    }
  }
});

test('uncertain outcomes never recommend manual re-entry or resubmission or expose a copy prompt', () => {
  const request = prepareJebiseoHandoff(input());
  for (const outcome of ['PENDING', 'UNKNOWN', 'FAILED_AFTER_EFFECT', 'PHONE_SCOPED_SITE_DISCARD',
    'EFFECT_UNKNOWN', 'NEEDS_REVIEW_NO_REPLAY']) {
    for (const step of ['OPEN', 'INPUT', 'SUBMIT']) {
      const guide = createJebiseoManualHandoff(request, transition(request,
        {step, outcome, receiptRef: 'job_123'}));
      assert.equal(guide.status, 'OBSERVE_EXISTING');
      assert.equal(guide.nextAction, 'INSPECT_EXISTING');
      assert.equal(guide.readbackRequired, true);
      assert.equal(guide.manualExecutionRecommended, false);
      assert.equal(guide.receiptRef, 'job_123');
      assert.equal(Object.hasOwn(guide, 'prompt'), false);
      assert.doesNotMatch(guide.instruction, /실행 버튼을 누르세요|준비된 요청을 입력하세요/);
      noSuccess(guide);
    }
  }
});

test('user reports advance manual guidance while remaining unverified, without requiring automatic return', () => {
  const request = prepareJebiseoHandoff(input());
  for (const [step, nextAction] of [['OPEN', 'INPUT'], ['INPUT', 'SUBMIT'], ['SUBMIT', 'VIEW_GEMINI_RESULT']]) {
    const guide = createJebiseoManualHandoff(request, transition(request, {step, outcome: 'USER_REPORTED_DONE'}));
    assert.equal(guide.ok, true);
    assert.equal(guide.userReported, true);
    assert.equal(guide.nextAction, nextAction);
    assert.equal(guide.resultDestination, 'GPT_AFTER_MANUAL_SHARE');
    assert.equal(guide.returnToGpt, true);
    if (step === 'SUBMIT') {
      assert.equal(guide.status, 'VIEW_IN_GEMINI');
      assert.equal(guide.manualExecutionRecommended, false);
      assert.match(guide.instruction, /분석이 끝난 뒤.*공유.*GPT.*현재 대화/);
    }
    noSuccess(guide);
  }
});

test('a caller claiming VERIFIED_PASS cannot gain execution authority or provider success', () => {
  const request = prepareJebiseoHandoff(input());
  const guide = createJebiseoManualHandoff(request, transition(request, {step: 'SUBMIT', outcome: 'VERIFIED_PASS'}));
  assert.equal(guide.nextAction, 'VIEW_GEMINI_RESULT');
  assert.equal(guide.userReported, false);
  noSuccess(guide);
});

test('another task, thread, source or changed request cannot reuse a previous transition', () => {
  const request = prepareJebiseoHandoff(input());
  const original = transition(request);
  for (const field of ['taskRef', 'threadRef', 'sourceRef']) {
    const other = prepareJebiseoHandoff(input({[field]: `${input()[field]}-other`}));
    const guide = createJebiseoManualHandoff(other, original);
    assert.equal(guide.ok, false);
    assert.equal(guide.code, 'JEBISEO_HANDOFF_TRANSITION_SCOPE_MISMATCH');
  }
  const other = prepareJebiseoHandoff(input({requestText: '이 영상에서 여행 장소만 정리해 줘.'}));
  assert.equal(createJebiseoManualHandoff(other, original).ok, false);
  for (const tampering of [{prompt: request.prompt + '\n추가 동작'}, {surface: 'GEMINI_NATIVE'},
    {returnToGpt: false}, {resultDestination: 'GEMINI'}, {automaticReturnToGpt: true},
    {requestSent: true}, {openUrl: 'https://example.com'},
    {sourceRef: 'message:other-user'}])
    assert.equal(createJebiseoManualHandoff({...request, ...tampering}, original).ok, false);
});

test('manual transition validates minimal receipt references and rejects execution payloads', () => {
  const request = prepareJebiseoHandoff(input());
  for (const receiptRef of ['job_1', 'receipt:original-123', 'receipt_original123', 'observation:screen-001'])
    assert.equal(createJebiseoManualHandoff(request, transition(request, {receiptRef})).ok, true);
  for (const receiptRef of ['signed-token.with.secret', {token: 'secret'}, '', 'job_1\n', 'https://example.com'])
    assert.equal(createJebiseoManualHandoff(request, transition(request, {receiptRef})).ok, false);
  for (const extra of [{receiptToken: 'secret'}, {command_id: '1'.repeat(32)}, {outcome: 'ok'},
    {step: 'PAY'}, {requestDigest: '0'.repeat(64)}])
    assert.equal(createJebiseoManualHandoff(request, transition(request, extra)).ok, false);
});
