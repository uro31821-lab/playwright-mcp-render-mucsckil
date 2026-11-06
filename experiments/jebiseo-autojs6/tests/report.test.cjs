'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {formatResult, formatSummary} = require('../report.js');

function result(overrides = {}) {
    return Object.assign({schema: 'jebiseo.autojs6.result.v1', requestId: 'phone-report-1', status: 'probe_ok', stage: 'SPLIT', code: 'SPLIT_PROBE_OK',
        handoffDispatched: false, handoffObserved: false, submissionDispatched: false, submissionObserved: false,
        liveDeviceVerified: false, jhIntegrated: false, executionEnvironment: 'android-autojs6', trace: []}, overrides);
}
function details(text) { return JSON.parse(text.split('\n\n상세 결과\n')[1]); }

test('probe describes observations without implying that selection, handoff or full phone flow passed', () => {
    const text = formatResult(result({diagnostics: {supported: true, sourceTextFound: true, exactSelection: false, selectionApi: true,
        geminiSurfaceVerified: true, targetDraftEmpty: true, more: [], geminiMenu: [], sendControls: []}}), {mode: 'probe'});
    assert.match(text, /시험: 1\. 화면·메뉴 읽기/);
    assert.match(text, /글 선택·전달·전송 성공을 뜻하지 않습니다/);
    assert.match(text, /시험 문장: 발견/);
    assert.match(text, /정확한 선택 범위: 현재 일치 확인 안 됨/);
    assert.match(text, /글을 선택하기 전에는 선택 메뉴의 ⋯가 보이지 않을 수 있습니다/);
    assert.match(text, /실폰 전체 동작: 아직 검증되지 않음/);
    assert.equal(details(text).diagnostics.exactSelection, false);
});

test('More-only success shows observed menu labels while stopping short of the Gemini click', () => {
    const text = formatResult(result({status: 'menu_verified', stage: 'MENU', code: 'GEMINI_MENU_VERIFIED', diagnostics: {
        exactSelection: true, more: [], geminiMenu: [{windowId: 3, viewId: 'android:id/floating_toolbar_menu_item_text', text: 'Gemini에게 물어보기', clickable: true}],
        observedMenuControls: [{role: 'menu_item', windowId: 3, viewId: 'android:id/floating_toolbar_menu_item_text', text: 'Gemini에게 물어보기', description: '', enabled: true, clickable: true}]
    }}), {mode: 'more'});
    assert.match(text, /Gemini 항목을 누르기 전 단계/);
    assert.match(text, /읽힌 이름: “Gemini에게 물어보기”/);
    assert.match(text, /Gemini 전달: 클릭 기록 없음 \/ 입력 내용 일치 미확인/);
    assert.equal(details(text).status, 'menu_verified');
    assert.equal(details(text).mode, 'more');
});

test('an uncertain handoff warns against replay even when no click confirmation was returned', () => {
    const text = formatResult(result({status: 'completion_unknown', stage: 'DRAFT', code: 'MENU_MAY_HAVE_SUBMITTED', handoffDispatched: true}), {mode: 'handoff'});
    assert.match(text, /전달이나 전송이 이미 일어났을 수 있습니다/);
    assert.match(text, /자동 재실행하지 말고/);
    assert.match(text, /전송 버튼을 다시 누르지 말고/);
    assert.match(text, /제출 결과 미확인/);
    assert.equal(details(text).submissionObserved, false);
    assert.equal(details(text).liveDeviceVerified, false);
});

test('unread fields remain unverified rather than being reported as absent or successful', () => {
    const text = formatResult({status: 'blocked', stage: 'SPLIT', code: 'SOURCE_WINDOW_MISSING', diagnostics: {windows: []}});
    assert.match(text, /시험 문장: 미확인/);
    assert.match(text, /Gemini 빈 입력란: 미확인/);
    assert.match(text, /Gemini 메뉴 항목: 미확인/);
    assert.match(text, /실폰 전체 동작: 미확인/);
    assert.match(text, /왼쪽에 ChatGPT 앱이 보이는지 확인/);
    assert.equal(Object.hasOwn(details(text), 'handoffDispatched'), false);
});

test('public output projects only bounded metadata and control labels, excluding raw content and editable nodes', () => {
    const privateMarker = 'PRIVATE_CONVERSATION_AND_DRAFT_42';
    const cycle = {};
    cycle.self = cycle;
    const input = result({expectedText: privateMarker, snapshot: cycle, debug: {text: privateMarker}, diagnostics: {
        expectedText: privateMarker, source: {text: privateMarker}, draft: {text: privateMarker},
        windows: [{id: 1, packageName: 'com.openai.chatgpt', title: privateMarker, nodes: [{text: privateMarker}]}],
        more: [{text: '옵션 더보기', description: 'More options', editable: false, secret: privateMarker}, {text: privateMarker, editable: true}],
        observedMenuControls: Array.from({length: 30}, (_, i) => ({role: 'menu_item', windowId: i, text: 'Gemini\n항목 ' + '가'.repeat(100), description: '설명\u202e',
            viewId: 'android:id/floating_toolbar_menu_item_text', secret: privateMarker})),
        sendControls: [{text: '전송', rawNode: {text: privateMarker}}]
    }});
    const text = formatResult(input);
    const publicResult = details(text);
    assert.ok(!text.includes(privateMarker));
    assert.equal(publicResult.schema, 'jebiseo.autojs6.public-report.v1');
    assert.equal(publicResult.diagnostics.observedMenuControls.length, 16);
    assert.equal(publicResult.diagnostics.observedMenuControls[0].text.length, 80);
    assert.ok(!publicResult.diagnostics.observedMenuControls[0].text.includes('\n'));
    assert.ok(!publicResult.diagnostics.observedMenuControls[0].description.includes('\u202e'));
    assert.equal(publicResult.diagnostics.more.length, 1);
    assert.equal(Object.hasOwn(publicResult.diagnostics.windows[0], 'title'), false);
    assert.equal(Object.hasOwn(publicResult.diagnostics.windows[0], 'nodes'), false);
    assert.equal(Object.hasOwn(publicResult, 'snapshot'), false);
});

test('human-only presentation is deterministic, leaves input untouched, and preserves observed submission limits', () => {
    const input = result({status: 'submission_observed', stage: 'VERIFY_SUBMIT', code: 'SUBMISSION_OBSERVED', handoffDispatched: true,
        handoffObserved: true, submissionDispatched: true, submissionObserved: true, liveDeviceVerified: true,
        recordedAt: '2026-11-06T02:00:00Z', trace: [{stage: 'SUBMIT', status: 'dispatched', at: 12}]});
    const before = structuredClone(input);
    const first = formatResult(input, {includeDetails: false, mode: 'submit'});
    assert.equal(first, formatResult(input, {includeDetails: false, mode: 'submit'}));
    assert.deepEqual(input, before);
    assert.ok(!first.includes('상세 결과'));
    assert.match(first, /Gemini 답변 완료를 확인한 것은 아닙니다/);
    assert.match(first, /실폰 전체 동작: 확인/);
});

test('invalid result strings are not echoed and unresolved prior attempts require outcome inspection', () => {
    const invalid = formatResult({status: 'private status', stage: 'private stage', code: 'private code', requestId: 'private id\n', mode: 'private mode'});
    assert.ok(!invalid.includes('private'));
    assert.equal(details(invalid).status, 'unknown');
    assert.equal(details(invalid).code, 'RESULT_INVALID');
    assert.match(formatResult(null), /성공으로 판단하지 않습니다/);
    const blocked = formatResult({status: 'blocked', code: 'PREVIOUS_ATTEMPT_UNRESOLVED'});
    assert.match(blocked, /읽기만으로 기록이 해제되지는 않습니다/);
});

test('unresolved original attempts retain identity in exports without disclosing payloads or resolving records', () => {
    const privateMarker = 'PRIVATE_ORIGINAL_MESSAGE_91';
    const input = result({status: 'blocked', stage: 'VALIDATE', code: 'PREVIOUS_ATTEMPT_UNRESOLVED', unresolvedAttempts: [
        {requestId: 'original-handoff-1', status: 'handoff_intent', stage: 'MENU', expectedText: privateMarker, result: {body: privateMarker}},
        {requestId: 'original-submit-2', status: 'submit_intent', stage: 'SUBMIT', snapshot: {text: privateMarker}},
        {requestId: 'invalid id\n', status: 'completion_unknown', stage: 'DRAFT'},
        {requestId: 'wrong-status', status: privateMarker, stage: 'DRAFT'},
        {requestId: 'unknown-stage', status: 'completion_unknown', stage: privateMarker},
        ...Array.from({length: 6}, (_, i) => ({requestId: 'older-' + i, status: 'running', stage: 'SELECT', raw: privateMarker}))
    ]});
    const before = structuredClone(input);
    const text = formatResult(input);
    const publicResult = details(text);
    assert.match(text, /이전 미확인 시도/);
    assert.match(text, /original-handoff-1 \/ Gemini 항목 찾기 \/ 전달 시도 기록·결과 미확인/);
    assert.match(text, /읽기 전용 점검은 이 기록을 자동 해제하지 않습니다/);
    assert.equal(publicResult.unresolvedAttempts.length, 5);
    assert.deepEqual(publicResult.unresolvedAttempts[0], {requestId: 'original-handoff-1', status: 'handoff_intent', stage: 'MENU'});
    assert.deepEqual(publicResult.unresolvedAttempts[1], {requestId: 'original-submit-2', status: 'submit_intent', stage: 'SUBMIT'});
    assert.equal(publicResult.unresolvedAttempts[2].stage, 'UNKNOWN');
    assert.ok(!text.includes(privateMarker));
    assert.ok(!text.includes('wrong-status'));
    assert.ok(!text.includes('invalid id'));
    assert.deepEqual(input, before);
});

test('target editor diagnostics and private storage metadata exclude values, hints, paths and raw errors', () => {
    const secret = 'PRIVATE_INPUT_OR_EXCEPTION_VALUE';
    const input = result({status: 'blocked', code: 'GEMINI_SURFACE_UNVERIFIED',
        lastResultStorage: {status: 'FAILED', stage: 'DIR_SYNC', kind: 'android.system.ErrnoException', errno: 22, message: secret, path: secret},
        diagnostics: {targetSurfaceDiagnostics: {titleTextMatches: 0, titleDescriptionMatches: 1, configuredEditorMatches: 0,
            candidateEditorCount: 12, allEditableCount: 12, eligibleEditableCount: 10, emptyIdCandidateCount: 1, candidatesTruncated: true,
            text: secret, eligibleEditorCandidates: Array.from({length: 12}, (_, i) => ({windowId: 2,
                viewId: 'com.google.android.googlequicksearchbox:id/observed_editor_' + i, className: 'android.widget.EditText',
                bounds: {left: 500, top: 100, right: 900, bottom: 150}, editable: true, visible: true, enabled: true,
                matchesConfiguredId: false, hasSetTextAction: true, hasSetSelectionAction: true, text: secret, desc: secret, hint: secret, value: secret}))}}});
    const text = formatResult(input);
    const projected = details(text);
    assert.doesNotMatch(text, new RegExp(secret));
    assert.equal(projected.status, 'blocked');
    assert.equal(projected.diagnostics.targetSurfaceDiagnostics.eligibleEditorCandidates.length, 8);
    assert.equal(projected.lastResultStorage.code, 'STORAGE_DIR_SYNC_FAILED');
    assert.match(formatSummary(input), /설정된 입력칸 일치: 0/);
    assert.match(formatSummary(input), /DIR_SYNC/);
    assert.doesNotMatch(formatSummary(input), new RegExp(secret));
});

test('untrusted storage diagnostic names and unbounded surface counts are not echoed', () => {
    const text = formatResult(result({lastResultStorage: {status: 'FAILED', stage: 'PRIVATE_PATH', kind: 'PRIVATE_CLASS', errno: 999999},
        diagnostics: {targetSurfaceDiagnostics: {titleTextMatches: -1, candidateEditorCount: 999999}}}));
    assert.doesNotMatch(text, /PRIVATE_PATH|PRIVATE_CLASS|999999/);
    assert.equal(details(text).lastResultStorage.stage, 'UNKNOWN');
    assert.equal(details(text).lastResultStorage.kind, 'OTHER');
    assert.deepEqual(details(text).diagnostics.targetSurfaceDiagnostics, {});
});

test('surface verification method is bounded and does not relabel the observed mode outcome', () => {
    for (const method of ['title_and_configured_editor', 'observed_gemini_editor', 'unverified']) {
        const input = result({status: 'blocked', code: 'SOURCE_TEXT_MISSING', diagnostics: {
            targetSurfaceDiagnostics: {verificationMethod: method, titlelessObservedEditorVerified: method === 'observed_gemini_editor'}
        }});
        const output = details(formatResult(input));
        assert.equal(output.status, 'blocked');
        assert.equal(output.code, 'SOURCE_TEXT_MISSING');
        assert.equal(output.diagnostics.targetSurfaceDiagnostics.verificationMethod, method);
        assert.match(formatSummary(input), /화면 확인 기준:/);
    }
    const invalid = formatResult(result({diagnostics: {targetSurfaceDiagnostics: {
        verificationMethod: 'PRIVATE_UI_TEXT', titlelessObservedEditorVerified: 'PRIVATE_UI_TEXT'
    }}}));
    assert.doesNotMatch(invalid, /PRIVATE_UI_TEXT/);
    assert.deepEqual(details(invalid).diagnostics.targetSurfaceDiagnostics, {});
});

test('configured editor summary shows only boolean hint observations and preserves the probe outcome', () => {
    const secret = 'PRIVATE_HINT_OR_INPUT_034';
    const input = result({diagnostics: {targetDraftEmpty: false, targetSurfaceDiagnostics: {configuredEditorMatches: 1,
        configuredEditorText: {textEmpty: false, hintTextApiAvailable: true, hintTextAvailable: true, textMatchesHint: true,
            showingHintTextApiAvailable: true, showingHintText: true, hintText: secret, text: secret, length: 987654}}}});
    const text = formatResult(input);
    const projected = details(text);
    assert.equal(projected.status, 'probe_ok');
    assert.equal(projected.code, 'SPLIT_PROBE_OK');
    assert.equal(projected.diagnostics.targetDraftEmpty, false);
    assert.deepEqual(projected.diagnostics.targetSurfaceDiagnostics.configuredEditorText, {textEmpty: false,
        hintTextApiAvailable: true, hintTextAvailable: true, textMatchesHint: true, showingHintTextApiAvailable: true, showingHintText: true});
    assert.match(formatSummary(input), /입력란 읽힌 문자 비움: 아니오 \/ 힌트와 일치: 예/);
    assert.match(formatSummary(input), /힌트 정보: 있음 \/ 힌트 표시: 예/);
    assert.doesNotMatch(text + formatSummary(input), /PRIVATE_HINT_OR_INPUT_034|987654|"length"/);
});

test('unavailable or nonboolean editor observations stay unverified and ambiguous editors have no single-editor metadata', () => {
    const input = result({diagnostics: {targetSurfaceDiagnostics: {configuredEditorMatches: 1, configuredEditorText: {
        textEmpty: 'PRIVATE_VALUE', hintTextApiAvailable: false, hintTextAvailable: true, textMatchesHint: true,
        showingHintTextApiAvailable: false, showingHintText: true
    }}}});
    assert.deepEqual(details(formatResult(input)).diagnostics.targetSurfaceDiagnostics.configuredEditorText,
        {hintTextApiAvailable: false, showingHintTextApiAvailable: false});
    assert.match(formatSummary(input), /입력란 읽힌 문자 비움: 미확인 \/ 힌트와 일치: 미확인/);
    assert.match(formatSummary(input), /힌트 정보: 미확인 \/ 힌트 표시: 미확인/);
    assert.doesNotMatch(formatResult(input), /PRIVATE_VALUE/);
    input.diagnostics.targetSurfaceDiagnostics.configuredEditorMatches = 2;
    assert.equal(Object.hasOwn(details(formatResult(input)).diagnostics.targetSurfaceDiagnostics, 'configuredEditorText'), false);
});

test('private DIR_VERIFY failure remains specific without changing the observed phone outcome', () => {
    for (const [status, code] of [['probe_ok', 'SPLIT_PROBE_OK'], ['completion_unknown', 'PHONE_RUNTIME_ERROR']]) {
        const input = result({status, code, lastResultStorage: {status: 'FAILED', stage: 'DIR_VERIFY', kind: 'Error',
            message: 'PRIVATE_DIRECTORY_PATH', path: 'PRIVATE_DIRECTORY_PATH'}});
        const projected = details(formatResult(input));
        assert.equal(projected.status, status);
        assert.equal(projected.code, code);
        assert.deepEqual(projected.lastResultStorage, {status: 'FAILED', stage: 'DIR_VERIFY', code: 'STORAGE_DIR_VERIFY_FAILED', kind: 'Error'});
        assert.match(formatSummary(input), /DIR_VERIFY/);
        assert.doesNotMatch(formatResult(input) + formatSummary(input), /PRIVATE_DIRECTORY_PATH/);
    }
});
