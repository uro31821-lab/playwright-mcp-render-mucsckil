'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const launch = require('../phone-launch.js');
const request = {schema: 'jebiseo.phone-launch.v1', launchId: 'pc-0123456789', mode: 'probe'};
test('local launch accepts only one bounded explicit mode and safe request ID', () => {
    assert.deepEqual(launch.parseRequest(JSON.stringify(request)), request);
    for (const update of [{launchId: '../escape'}, {launchId: 'x'.repeat(129)}, {mode: 'all'}, {mode: 'submit', command: 'anything'}, {schema: 'unknown'}]) {
        assert.throws(() => launch.parseRequest(JSON.stringify({...request, ...update})), /LAUNCH_REQUEST_INVALID/);
    }
    assert.throws(() => launch.parseRequest(' '.repeat(2049)), /LAUNCH_REQUEST_INVALID/);
    assert.throws(() => launch.parseRequest('broken'), /LAUNCH_REQUEST_INVALID/);
});
test('public result never exports private conversation, drafts or platform exception strings', () => {
    const result = {schema: 'jebiseo.autojs6.result.v1', status: 'blocked', code: 'SOURCE_WINDOW_MISSING',
        expectedText: 'PRIVATE_SOURCE', draft: 'PRIVATE_DRAFT', exception: 'PRIVATE_EXCEPTION'};
    const envelope = launch.envelope(request, result);
    assert.equal(envelope.schema, 'jebiseo.phone-result.v1');
    assert.equal(envelope.launchId, request.launchId);
    assert.equal(envelope.code, 'SOURCE_WINDOW_MISSING');
    assert.doesNotMatch(JSON.stringify(envelope), /PRIVATE_/);
    const invalid = launch.envelope(request, {status: 'PRIVATE_SOURCE', code: 'PRIVATE TEXT'});
    assert.equal(invalid.status, 'unknown');
    assert.equal(invalid.code, 'PHONE_RUNTIME_ERROR');
});

test('large bounded diagnostics retain the observed outcome within the Windows receiver limit', () => {
    const reports = require('../report.js');
    const packageName = 'com.' + 'a'.repeat(252);
    const prefix = 'com.google.android.googlequicksearchbox:id/';
    const control = {windowId: 2, viewId: prefix + 'i'.repeat(512 - prefix.length),
        key: '0:2/' + '1.'.repeat(125) + '1', className: 'android.widget.' + 'E'.repeat(241),
        bounds: {left: 500, top: 0, right: 1000, bottom: 800},
        clickable: true, enabled: true, text: 't'.repeat(80), description: 'd'.repeat(80)};
    const diagnostics = {
        windows: Array.from({length: 16}, (_, id) => ({id, packageName, bounds: control.bounds})),
        more: Array(8).fill(control), geminiMenu: Array(8).fill(control), sendControls: Array(8).fill(control),
        observedMenuControls: Array.from({length: 16}, () => ({...control, role: 'menu_item'})),
        targetSurfaceDiagnostics: {titleTextMatches: 1, titleDescriptionMatches: 1,
            configuredEditorMatches: 0, candidateEditorCount: 8, allEditableCount: 8,
            eligibleEditableCount: 8, emptyIdCandidateCount: 0, candidatesTruncated: false,
            eligibleEditorCandidates: Array.from({length: 8}, () => ({...control,
                editable: true, visible: true, matchesConfiguredId: false,
                hasSetTextAction: true, hasSetSelectionAction: false}))}
    };
    for (const mode of ['probe', 'handoff']) {
        const result = {status: mode === 'probe' ? 'blocked' : 'completion_unknown',
            stage: 'SPLIT', code: 'GEMINI_SURFACE_UNVERIFIED', diagnostics,
            lastResultStorage: {status: 'FAILED', stage: 'DIR_SYNC', kind: 'android.system.ErrnoException', errno: 22}};
        assert.ok((reports.formatResult(result, {mode}) + '\n\n' + reports.formatSummary(result, {mode})).length > 50000);
        const output = launch.envelope({...request, mode}, result);
        assert.ok(output.reportText.length <= 50000);
        assert.equal(output.launchId, request.launchId);
        assert.equal(output.mode, mode);
        assert.equal(output.status, result.status);
        assert.equal(output.code, result.code);
        assert.match(output.reportText, /상세 JSON은 생략했습니다/);
        assert.match(output.reportText, /이번 시험 요약/);
        assert.match(output.reportText, /DIR_SYNC.*errno=22/);
        assert.match(output.reportText, /설정된 입력칸 일치: 0/);
    }
});
