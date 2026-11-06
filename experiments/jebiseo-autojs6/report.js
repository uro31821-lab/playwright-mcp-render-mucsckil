/* Pure ES5 result presentation. No screen reads, clicks, storage or network. */
'use strict';

var STATUS = {
    probe_ok: ['화면 읽기 확인', '분할 화면과 Gemini 입력 화면을 읽었습니다. 글 선택·전달·전송 성공을 뜻하지 않습니다.'],
    selection_verified: ['글 선택 확인', '시험 문장의 정확한 선택 범위를 확인했습니다. 이번 시험 범위는 글 선택까지입니다.'],
    menu_verified: ['⋯ 메뉴 열기·항목 찾기 확인', '선택 메뉴의 ⋯를 열고 Gemini 항목을 찾았습니다. Gemini 항목을 누르기 전 단계입니다.'],
    handoff_verified: ['Gemini 입력 내용 일치 확인', 'Gemini의 입력 내용이 시험 문장과 일치합니다. 명시적 전송 버튼을 누르는 단계는 수행하지 않았습니다.'],
    submission_observed: ['전송 결과 관찰', '전송 후 입력란 비움과 새 제출 증거를 확인했습니다. Gemini 답변 완료를 확인한 것은 아닙니다.'],
    blocked: ['현재 단계에서 중단', '필요한 화면이나 조건을 확인하지 못해 멈췄습니다. 아래 코드와 관찰 내용을 확인하세요.'],
    cancelled: ['중지 요청 확인', '현재 시험을 중지했습니다. 이미 실행된 동작은 아래 기록으로 확인하세요.'],
    completion_unknown: ['전달·전송 결과 미확인', '전달이나 전송이 이미 일어났을 수 있습니다. 자동 재실행하지 말고 Gemini의 현재 결과와 이전 기록을 확인하세요.'],
    unknown: ['결과 형식 확인 필요', '확인할 수 없는 결과입니다. 성공으로 판단하지 않습니다.']
};
var STAGE = {
    VALIDATE: '시험 조건 확인', SPLIT: '분할 화면 읽기', SELECT: '시험 문장 선택',
    MORE: '⋯ 메뉴 열기', MENU: 'Gemini 항목 찾기', DRAFT: 'Gemini 입력 내용 확인',
    SUBMIT: '전송 버튼 누르기', VERIFY_SUBMIT: '전송 결과 확인', UNKNOWN: '미확인'
};
var MODE = {
    probe: '1. 화면·메뉴 읽기', selection: '2. 글 선택', more: '3. ⋯ 메뉴 열기·항목 찾기',
    handoff: '4. Gemini에 전달', submit: '5. Gemini 전송까지'
};
var UNRESOLVED = {
    running: '진행 중으로 남은 기록',
    handoff_intent: '전달 시도 기록·결과 미확인',
    submit_intent: '전송 시도 기록·결과 미확인',
    completion_unknown: '완료 결과 미확인'
};
var HINT = {
    SOURCE_WINDOW_MISSING: '왼쪽에 ChatGPT 앱이 보이는지 확인하세요. AutoJs6 편집기 대신 떠 있는 실행 버튼에서 시험을 시작합니다.',
    SOURCE_WINDOW_AMBIGUOUS: 'ChatGPT 창이 여러 개로 읽혔습니다. 시험할 창 하나만 남긴 배치를 확인하세요.',
    TARGET_WINDOW_MISSING: '오른쪽에 Gemini 앱이 보이는지 확인하세요. 앱이 보이는데도 이 코드가 나오면 읽기 결과로 화면 식별 정보를 확인해야 합니다.',
    TARGET_WINDOW_AMBIGUOUS: 'Gemini 후보 창이 여러 개로 읽혔습니다. 현재 분할 배치를 확인하세요.',
    NOT_LEFT_RIGHT_SPLIT: 'ChatGPT는 왼쪽, Gemini는 오른쪽인 좌우 분할 화면을 준비하세요.',
    WINDOW_OCCLUDED: '다른 앱이나 큰 안내창이 분할 화면을 가리고 있는지 확인하세요.',
    CONTROL_OCCLUDED: '대상 버튼 위를 키보드나 다른 창이 가리고 있는지 확인하세요.',
    SOURCE_TEXT_MISSING: '시험 문장이 왼쪽 ChatGPT의 답변에 보이게 하세요. 입력창에 쓴 글은 선택 대상으로 사용하지 않습니다.',
    SOURCE_TEXT_AMBIGUOUS: '화면에서 시험 문장이 여러 번 읽혔습니다. 선택할 문장 하나만 보이도록 위치를 조정하세요.',
    GEMINI_SURFACE_UNVERIFIED: 'Gemini 제목과 입력란을 함께 확인하지 못했습니다. 오른쪽 입력 화면을 확인하고 이 읽기 결과를 전달해 주세요.',
    SELECTION_API_UNAVAILABLE: '이 화면에서 글자 선택 동작을 제공하지 않습니다. 선택 범위와 손잡이 정보를 확인해 보완해야 합니다.',
    EXACT_SELECTION_NOT_OBSERVED: '선택한 글의 정확한 범위를 확인하지 못했습니다. 현재 선택 상태를 확인하세요.',
    MORE_CONTROL_NOT_FOUND: '글 선택 메뉴의 ⋯를 찾지 못했습니다. 현재 선택 메뉴가 보이게 한 뒤 1번으로 읽힌 항목을 확인하세요.',
    GEMINI_MENU_NOT_FOUND: '열린 선택 메뉴에서 Gemini 항목을 찾지 못했습니다. 현재 메뉴를 1번으로 읽어 실제 항목 이름을 확인하세요.',
    TARGET_DRAFT_NOT_EMPTY: 'Gemini 입력란에 기존 글이 있습니다. 내용을 직접 확인하고, 새 시험은 빈 입력란에서 시작하세요.',
    TARGET_DRAFT_CHANGED: 'Gemini 입력란 내용이 바뀌었습니다. 현재 내용을 먼저 확인하세요.',
    TARGET_BUSY: 'Gemini가 응답 중인 것으로 읽혔습니다. 현재 응답 상태를 확인하세요.',
    MENU_MAY_HAVE_SUBMITTED: 'Gemini 메뉴를 누르는 과정에서 바로 전송됐을 수 있습니다. 전송 버튼을 다시 누르지 말고 현재 대화를 확인하세요.',
    PREVIOUS_ATTEMPT_UNRESOLVED: '이전 시험의 전달·전송 결과가 미확인입니다. 1번 읽기와 실제 Gemini 대화로 결과를 먼저 확인하세요. 읽기만으로 기록이 해제되지는 않습니다.',
    JOURNAL_WRITE_FAILED: '시험 기록 저장을 확인하지 못했습니다. 화면과 이전 결과를 확인하기 전에는 전달·전송을 반복하지 마세요.',
    ACCESSIBILITY_UNAVAILABLE: 'AutoJs6의 접근성 사용 설정을 확인하세요.',
    CANCELLED: '현재 화면과 기록을 확인한 뒤 다음 시험 범위를 결정하세요.'
};

function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function finite(value) { return typeof value === 'number' && isFinite(value); }
function integer(value) { return finite(value) && Math.floor(value) === value; }
function copyBoolean(source, target, key) {
    if (source[key] === true || source[key] === false) target[key] = source[key];
}
function identifier(value, pattern, maximum) {
    return typeof value === 'string' && value.length <= maximum && pattern.test(value) ? value : '';
}
function label(value) {
    if (typeof value !== 'string') return '';
    // UI labels are data. Keep each one on a single short line in a report.
    return value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
        .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, 80);
}
function bounds(value) {
    var box = record(value);
    if (!finite(box.left) || !finite(box.top) || !finite(box.right) || !finite(box.bottom)) return null;
    return {left: box.left, top: box.top, right: box.right, bottom: box.bottom};
}
function control(value, observed) {
    var input = record(value);
    var output = {};
    var box;
    if (input.editable === true || (observed && input.role !== 'more' && input.role !== 'menu_item')) return null;
    if (observed) output.role = input.role;
    if (integer(input.windowId)) output.windowId = input.windowId;
    output.viewId = identifier(input.viewId, /^(?:[A-Za-z][A-Za-z0-9_]*\.)*[A-Za-z][A-Za-z0-9_]*:id\/[A-Za-z0-9_.$]+$/, 512);
    if (!observed) {
        output.key = identifier(input.key, /^-?\d+:-?\d+\/(?:\d+(?:\.\d+)*)?$/, 256);
        output.className = identifier(input.className, /^[A-Za-z_$][A-Za-z0-9_.$]*$/, 256);
        box = bounds(input.bounds);
        if (box) output.bounds = box;
    }
    copyBoolean(input, output, 'clickable');
    copyBoolean(input, output, 'enabled');
    // These label fields are accepted only inside the core's trusted control lists.
    output.text = label(input.text);
    output.description = label(input.description);
    return output;
}
function controls(value, observed) {
    if (!Array.isArray(value)) return null;
    return value.slice(0, observed ? 16 : 8).map(function (item) {
        return control(item, observed);
    }).filter(function (item) { return item !== null; });
}
function diagnostic(value) {
    var input = record(value);
    var output = {};
    var display = record(input.display);
    var list;
    ['supported', 'sourceTextFound', 'exactSelection', 'selectionApi', 'geminiSurfaceVerified', 'targetDraftEmpty'].forEach(function (key) {
        copyBoolean(input, output, key);
    });
    if (typeof input.code === 'string') output.code = identifier(input.code, /^[A-Z][A-Z0-9_]{1,79}$/, 80) || 'PROBE_FAILED';
    if (finite(display.width) && finite(display.height) && integer(display.rotation)) {
        output.display = {width: display.width, height: display.height, rotation: display.rotation};
    }
    if (Array.isArray(input.windows)) {
        output.windows = input.windows.slice(0, 16).filter(function (w) { return w && integer(w.id); }).map(function (w) {
            var item = {id: w.id, packageName: identifier(w.packageName, /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/, 256)};
            ['displayId', 'type', 'parentId'].forEach(function (key) { if (integer(w[key])) item[key] = w[key]; });
            if (w.parentId === null) item.parentId = null;
            if (bounds(w.bounds)) item.bounds = bounds(w.bounds);
            copyBoolean(w, item, 'active');
            copyBoolean(w, item, 'focused');
            return item;
        });
    }
    ['more', 'geminiMenu', 'sendControls', 'observedMenuControls'].forEach(function (key) {
        list = controls(input[key], key === 'observedMenuControls');
        if (list) output[key] = list;
    });
    return output;
}
function project(value, options) {
    var input = record(value);
    var settings = record(options);
    var status = typeof input.status === 'string' && own(STATUS, input.status) ? input.status : 'unknown';
    var output = {
        schema: 'jebiseo.autojs6.public-report.v1',
        requestId: identifier(input.requestId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, 128),
        status: status,
        stage: typeof input.stage === 'string' && own(STAGE, input.stage) ? input.stage : 'UNKNOWN',
        code: identifier(input.code, /^[A-Z][A-Z0-9_]{1,79}$/, 80) || 'RESULT_INVALID'
    };
    var mode = settings.mode || input.mode;
    if (typeof mode === 'string' && own(MODE, mode)) output.mode = mode;
    ['handoffDispatched', 'handoffObserved', 'submissionDispatched', 'submissionObserved', 'liveDeviceVerified', 'jhIntegrated', 'reusedReceipt', 'journalSaved'].forEach(function (key) {
        copyBoolean(input, output, key);
    });
    if (input.executionEnvironment === 'android-autojs6' || input.executionEnvironment === 'offline-node') output.executionEnvironment = input.executionEnvironment;
    if (typeof input.recordedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.recordedAt)) output.recordedAt = input.recordedAt;
    if (Array.isArray(input.trace)) {
        output.trace = input.trace.slice(0, 48).filter(function (entry) {
            return entry && typeof entry.stage === 'string' && own(STAGE, entry.stage) &&
                typeof entry.status === 'string' && (own(STATUS, entry.status) || ['started', 'verified', 'dispatched'].indexOf(entry.status) >= 0) && finite(entry.at);
        }).map(function (entry) { return {stage: entry.stage, status: entry.status, at: entry.at}; });
    }
    if (Array.isArray(input.unresolvedAttempts)) {
        output.unresolvedAttempts = input.unresolvedAttempts.filter(function (entry) {
            return entry && identifier(entry.requestId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, 128) &&
                typeof entry.status === 'string' && own(UNRESOLVED, entry.status);
        }).slice(0, 5).map(function (entry) {
            return {requestId: entry.requestId, status: entry.status,
                stage: typeof entry.stage === 'string' && own(STAGE, entry.stage) ? entry.stage : 'UNKNOWN'};
        });
    }
    if (input.diagnostics && typeof input.diagnostics === 'object') output.diagnostics = diagnostic(input.diagnostics);
    return output;
}
function observation(value, yes, no) { return value === true ? yes : (value === false ? no : '미확인'); }
function count(value) { return Array.isArray(value) ? (value.length ? value.length + '개 관찰' : '현재 화면에서 없음') : '미확인'; }
function observedLabels(diagnostics) {
    var output = [];
    ['observedMenuControls', 'more', 'geminiMenu', 'sendControls'].forEach(function (key) {
        var entries = diagnostics[key];
        if (!Array.isArray(entries)) return;
        entries.forEach(function (item) {
            var values = [item.text, item.description];
            values.forEach(function (value) {
                if (value && output.indexOf(value) < 0 && output.length < 8) output.push(value);
            });
        });
    });
    return output;
}
function formatResult(value, options) {
    var result = project(value, options);
    var details = STATUS[result.status];
    var lines = ['제비서 독립 시험 결과'];
    var d = result.diagnostics;
    var labels;
    if (result.mode) lines.push('시험: ' + MODE[result.mode]);
    lines.push('판정: ' + details[0], '확인 단계: ' + STAGE[result.stage], '코드: ' + result.code, '', details[1]);
    if (result.reusedReceipt === true) lines.push('이전에 저장한 결과입니다. 같은 시험을 다시 실행하지 않았습니다.');
    if (d) {
        lines.push('', '화면에서 읽은 내용',
            '• 시험 문장: ' + observation(d.sourceTextFound, '발견', '찾지 못함'),
            '• 정확한 선택 범위: ' + observation(d.exactSelection, '일치 확인', '현재 일치 확인 안 됨'),
            '• 글자 선택 기능: ' + observation(d.selectionApi, '지원 정보 있음', '지원 정보 확인 안 됨'),
            '• Gemini 입력 화면: ' + observation(d.geminiSurfaceVerified, '확인', '확인 안 됨'),
            '• Gemini 빈 입력란: ' + observation(d.targetDraftEmpty, '확인', '확인 안 됨'),
            '• 선택 메뉴의 ⋯: ' + count(d.more),
            '• Gemini 메뉴 항목: ' + count(d.geminiMenu),
            '• 전송 버튼: ' + count(d.sendControls));
        labels = observedLabels(d);
        if (labels.length) lines.push('읽힌 이름: ' + labels.map(function (item) { return '“' + item + '”'; }).join(' / '));
        if (Array.isArray(d.more) && d.more.length === 0 && d.exactSelection !== true) {
            lines.push('글을 선택하기 전에는 선택 메뉴의 ⋯가 보이지 않을 수 있습니다.');
        }
    }
    lines.push('', '실행·결과 기록',
        '• Gemini 전달: ' + observation(result.handoffDispatched, '클릭 기록 있음', '클릭 기록 없음') + ' / ' + observation(result.handoffObserved, '입력 내용 일치 확인', '입력 내용 일치 미확인'),
        '• 명시적 전송: ' + observation(result.submissionDispatched, '클릭 기록 있음', '클릭 기록 없음') + ' / ' + observation(result.submissionObserved, '새 제출 증거 확인', '제출 결과 미확인'),
        '• 실폰 전체 동작: ' + observation(result.liveDeviceVerified, '확인', '아직 검증되지 않음'));
    if (result.unresolvedAttempts && result.unresolvedAttempts.length) {
        lines.push('', '이전 미확인 시도');
        result.unresolvedAttempts.forEach(function (entry) {
            lines.push('• ' + entry.requestId + ' / ' + STAGE[entry.stage] + ' / ' + UNRESOLVED[entry.status]);
        });
        lines.push('읽기 전용 점검은 이 기록을 자동 해제하지 않습니다. 이전 시도의 실제 결과를 먼저 확인해야 합니다.');
    }
    if (own(HINT, result.code)) lines.push('', '다음 확인', HINT[result.code]);
    if (result.requestId) lines.push('', '시험 ID: ' + result.requestId);
    if (!options || options.includeDetails !== false) lines.push('', '상세 결과', JSON.stringify(result, null, 2));
    return lines.join('\n');
}

module.exports = {formatResult: formatResult};
