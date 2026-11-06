'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createAdapter} = require('../autojs-adapter.js');

const {fixture, target, calibration, SOURCE, TARGET, box} = require('./fixtures/android.cjs');

const observedEditorId = TARGET + ':id/assistant_robin_input_collapsed_text_half_sheet';
function observedSurfaceClick(lab) {
    lab.draft.viewId = observedEditorId;
    const snapshot = lab.io.read();
    return {kind: 'click', ...target(snapshot, 11, 'android:id/overflow'),
        surfaceGuard: {verificationMethod: 'observed_gemini_editor', ...target(snapshot, 22, observedEditorId)}};
}

function installEditorHintApis(lab, apis) {
    const originalWindows = lab.env.auto.service.getWindowsOnAllDisplays;
    function decorate(raw) {
        if (!raw) return raw;
        const originalChild = raw.getChild;
        raw.getChild = index => decorate(originalChild(index));
        if (raw.getPackageName() === TARGET && raw.isEditable()) {
            for (const [name, value] of Object.entries(apis)) raw[name] = value;
        }
        return raw;
    }
    lab.env.auto.service.getWindowsOnAllDisplays = () => {
        const groups = originalWindows();
        return {size: () => groups.size(), valueAt: index => groups.valueAt(index).map(window => {
            const originalRoot = window.getRoot;
            window.getRoot = () => decorate(originalRoot());
            return window;
        })};
    };
}

test('optional hint observations expose booleans without replacing text or changing native guard identity', () => {
    const lab = fixture();
    const privateHint = 'PRIVATE_HINT_AND_INPUT_VALUE';
    lab.draft.text = privateHint;
    let hint = privateHint;
    let showing = true;
    installEditorHintApis(lab, {getHintText: () => hint, isShowingHintText: () => showing});
    const snapshot = lab.io.read();
    const draft = target(snapshot, 22, lab.draft.viewId).node;
    assert.equal(draft.text, privateHint);
    assert.deepEqual(draft.editorTextDiagnostics, {textEmpty: false, hintTextApiAvailable: true,
        hintTextAvailable: true, textMatchesHint: true, showingHintTextApiAvailable: true, showingHintText: true});
    assert.doesNotMatch(JSON.stringify(draft.editorTextDiagnostics), /PRIVATE_HINT|length|value/);
    hint = 'DIFFERENT_PRIVATE_HINT';
    showing = false;
    const click = {kind: 'click', ...target(snapshot, 22, 'test:send'), guards: [draft]};
    assert.equal(lab.io.perform(click).dispatched, true, 'hint-only changes are not action identity changes');
    assert.equal(lab.draft.text, privateHint);
});

test('missing or throwing hint APIs remain unknown while observed empty hints remain distinct', () => {
    for (const kind of ['missing', 'throws', 'empty']) {
        const lab = fixture();
        lab.draft.text = '';
        if (kind === 'throws') installEditorHintApis(lab, {
            getHintText() { throw new Error('PRIVATE_HINT_FAILURE'); },
            isShowingHintText() { throw new Error('PRIVATE_SHOWING_FAILURE'); }
        });
        if (kind === 'empty') installEditorHintApis(lab, {getHintText: () => null, isShowingHintText: () => false});
        const draft = target(lab.io.read(), 22, lab.draft.viewId).node;
        assert.equal(draft.text, '');
        assert.deepEqual(draft.editorTextDiagnostics, kind === 'empty' ? {textEmpty: true, hintTextApiAvailable: true,
            hintTextAvailable: false, textMatchesHint: false, showingHintTextApiAvailable: true, showingHintText: false} :
            {textEmpty: true, hintTextApiAvailable: false, showingHintTextApiAvailable: false}, kind);
    }
});

test('reads inactive source, focused target, popup ownership and other display without active-window fallback', () => {
    const lab = fixture();
    lab.state.windows.push({id: 33, displayId: 0, type: 3, packageName: SOURCE, title: 'Selection', parentId: 11,
        active: false, focused: false, layer: 3, bounds: box(100, 100, 350, 150),
        root: lab.node({bounds: box(100, 100, 350, 150)})});
    lab.state.windows.push({id: 44, displayId: 2, type: 1, packageName: 'external.app', title: 'External', parentId: null,
        active: false, focused: false, layer: 1, bounds: box(0, 0, 500, 1000), root: lab.node()});
    const snapshot = lab.io.read();
    assert.deepEqual(snapshot.windows.map(w => [w.id, w.displayId, w.parentId]), [[11, 0, null], [22, 0, null], [33, 0, 11], [44, 2, null]]);
    assert.equal(snapshot.windows[1].title, 'Gemini');
    assert.equal(snapshot.windows[0].active, false);
    assert.deepEqual(target(snapshot, 11, 'android:id/overflow').node.path, [1, 0]);
    assert.equal(lab.state.allWindowReads, 1);
    assert.equal(lab.io.liveDevice, false, 'a fixture is never live phone evidence');
    assert.deepEqual(lab.state.actionLog, []);
});

test('rejects unavailable interactive-window/view-ID capability without changing service settings', () => {
    const lab = fixture();
    lab.state.flags = 16;
    assert.throws(() => lab.io.read(), {code: 'INTERACTIVE_WINDOWS_DISABLED'});
    lab.state.flags = 64;
    assert.throws(() => lab.io.read(), {code: 'VIEW_IDS_DISABLED'});
    assert.equal(lab.state.allWindowReads, 0);
});

test('refuses a partial tree instead of hiding ambiguous controls beyond the node limit', () => {
    const lab = fixture();
    const io = createAdapter(lab.env, {maxNodes: 2});
    assert.throws(() => io.read(), {code: 'NODE_LIMIT_EXCEEDED'});
    assert.equal(lab.state.actionLog.length, 0);
});

test('click resolves a fresh label and only its nearest same-window clickable ancestor', () => {
    const lab = fixture();
    lab.more.clickable = false;
    lab.more.actions = [];
    lab.toolbar.clickable = true;
    lab.toolbar.actions = [16];
    const click = {kind: 'click', ...target(lab.io.read(), 11, 'android:id/overflow')};
    assert.equal(lab.io.perform(click).dispatched, true);
    assert.deepEqual(lab.state.actionLog, [{window: 11, path: [1], id: 16, values: null}]);
    assert.equal(lab.state.touchLog.length, 0);
});

test('an original label changed during ancestor refresh prevents the parent click', () => {
    const lab = fixture();
    lab.more.clickable = false;
    lab.more.actions = [];
    lab.toolbar.clickable = true;
    lab.toolbar.actions = [16];
    const click = {kind: 'click', ...target(lab.io.read(), 11, 'android:id/overflow')};
    lab.state.refreshHook = ({model}) => {
        if (model === lab.toolbar) lab.more.desc = 'Close conversation';
    };
    assert.equal(lab.io.perform(click).reason, 'NODE_CHANGED');
    assert.equal(lab.state.actionLog.length, 0);
    assert.equal(lab.state.touchLog.length, 0);
});

test('changed button text/description is rejected before dispatch', () => {
    const lab = fixture();
    const click = {kind: 'click', ...target(lab.io.read(), 22, 'test:send')};
    lab.send.desc = 'Delete conversation';
    assert.deepEqual(lab.io.perform(click), {dispatched: false, attempted: false, uncertain: false, reason: 'NODE_CHANGED'});
    assert.equal(lab.state.actionLog.length, 0);
});

test('a changed split boundary invalidates an action even when its button remains at the same location', () => {
    const lab = fixture();
    const click = {kind: 'click', ...target(lab.io.read(), 22, 'test:send')};
    lab.right.bounds.left = 450;
    assert.equal(lab.io.perform(click).reason, 'WINDOW_CHANGED');
    assert.equal(lab.state.actionLog.length, 0);
});

test('refresh failure and post-snapshot identity drift both prevent dispatch', () => {
    const lab = fixture();
    const click = {kind: 'click', ...target(lab.io.read(), 22, 'test:send')};
    lab.send.stale = true;
    assert.equal(lab.io.perform(click).reason, 'NODE_STALE');
    lab.send.stale = false;
    lab.state.refreshHook = ({model}) => { if (model === lab.send) model.viewId = 'test:changed'; };
    assert.equal(lab.io.perform(click).reason, 'NODE_CHANGED');
    assert.equal(lab.state.actionLog.length, 0);
});

test('draft guard is refreshed again before submit, so a concurrent text change blocks the click', () => {
    const lab = fixture();
    const snapshot = lab.io.read();
    const click = {kind: 'click', ...target(snapshot, 22, 'test:send'),
        guards: [target(snapshot, 22, TARGET + ':id/assistant_robin_input_edit_text').node]};
    lab.state.refreshHook = ({model}) => { if (model === lab.draft) model.text = 'another draft'; };
    assert.equal(lab.io.perform(click).reason, 'NODE_CHANGED');
    assert.equal(lab.state.actionLog.length, 0);
});

test('observed surface guard permits one current editor while hidden or disabled controls remain ineligible', () => {
    const lab = fixture();
    lab.right.root.children.push(lab.node({viewId: TARGET + ':id/hidden_input', editable: true,
        className: 'android.widget.EditText', visible: false, bounds: box(540, 600, 880, 650)}));
    lab.right.root.children.push(lab.node({viewId: TARGET + ':id/disabled_input', editable: true,
        enabled: false, bounds: box(540, 660, 880, 700)}));
    const action = observedSurfaceClick(lab);
    assert.equal(lab.io.perform(action).dispatched, true);
    assert.deepEqual(lab.state.actionLog, [{window: 11, path: [1, 0], id: 16, values: null}]);
    assert.equal(lab.state.touchLog.length, 0);
});

test('new target overlay or any second eligible input blocks a source click at the adapter capture', () => {
    for (const variant of ['overlay', 'editable', 'EditText', 'setText']) {
        const lab = fixture();
        const action = observedSurfaceClick(lab);
        if (variant === 'overlay') {
            lab.state.windows.push({id: 44, displayId: 0, type: 4, packageName: '', title: '', parentId: null,
                bounds: box(540, 810, 880, 860), active: false, focused: false, layer: 9, root: null});
        } else {
            lab.right.root.children.push(lab.node({viewId: TARGET + ':id/other_input',
                bounds: box(540, 600, 880, 650), editable: variant === 'editable',
                className: variant === 'EditText' ? 'android.widget.EditText' : 'android.widget.TextView',
                actions: variant === 'setText' ? [2097152] : []}));
        }
        assert.deepEqual(lab.io.perform(action), {dispatched: false, attempted: false, uncertain: false,
            reason: variant === 'overlay' ? 'TARGET_OCCLUDED' : 'TARGET_EDITOR_AMBIGUOUS'}, variant);
        assert.equal(lab.state.actionLog.length, 0, variant + ' must stop the source click');
        assert.equal(lab.state.touchLog.length, 0, variant + ' must not fall back to coordinates');
    }
});

test('observed surface guard refresh rejects a changed editor identity or availability before a source click', () => {
    const variants = [
        ['id', model => { model.viewId = TARGET + ':id/changed'; }, 'NODE_CHANGED'],
        ['class', model => { model.className = 'android.widget.Button'; }, 'NODE_CHANGED'],
        ['draft', model => { model.text = 'a new draft'; }, 'NODE_CHANGED'],
        ['editable', model => { model.editable = false; }, 'NODE_CHANGED'],
        ['visible', model => { model.visible = false; }, 'NODE_UNAVAILABLE'],
        ['enabled', model => { model.enabled = false; }, 'NODE_UNAVAILABLE'],
        ['stale', model => { model.stale = true; }, 'NODE_STALE']
    ];
    for (const [name, mutate, reason] of variants) {
        const lab = fixture();
        const action = observedSurfaceClick(lab);
        lab.state.refreshHook = ({model}) => { if (model === lab.draft) mutate(model); };
        assert.deepEqual(lab.io.perform(action), {dispatched: false, attempted: false, uncertain: false, reason}, name);
        assert.equal(lab.state.actionLog.length, 0, name);
        assert.equal(lab.state.touchLog.length, 0, name);
    }
});

test('malformed or generalized observed-surface guards fail closed', () => {
    const variants = [
        guard => null,
        guard => undefined,
        guard => ({...guard, verificationMethod: 'any_editable'}),
        guard => ({...guard, window: {...guard.window, packageName: SOURCE}}),
        guard => ({...guard, node: {...guard.node, viewId: TARGET + ':id/other_input'}}),
        guard => ({...guard, node: {...guard.node, windowId: 11}}),
        guard => ({...guard, node: {...guard.node, actions: null}}),
        guard => ({...guard, node: {...guard.node, editable: false}})
    ];
    for (const mutate of variants) {
        const lab = fixture();
        const action = observedSurfaceClick(lab);
        action.surfaceGuard = mutate(action.surfaceGuard);
        assert.deepEqual(lab.io.perform(action), {dispatched: false, attempted: false, uncertain: false, reason: 'INVALID_SURFACE_GUARD'});
        assert.equal(lab.state.actionLog.length, 0);
        assert.equal(lab.state.touchLog.length, 0);
    }
});

test('a higher keyboard/overlay window covering the target stops native and coordinate actions', () => {
    const lab = fixture();
    const click = {kind: 'click', ...target(lab.io.read(), 22, 'test:send')};
    lab.state.windows.push({id: 33, displayId: 0, type: 2, packageName: '', title: '', parentId: null,
        bounds: box(500, 700, 1000, 1000), active: true, focused: true, layer: 9, root: null});
    assert.equal(lab.io.perform(click).reason, 'TARGET_OCCLUDED');
    assert.equal(lab.state.actionLog.length, 0);
    assert.equal(lab.state.touchLog.length, 0);
});

test('selection guard can remain readable beneath a toolbar while the actual click target is clear', () => {
    const lab = fixture();
    lab.sourceText.selectionStart = 0;
    lab.sourceText.selectionEnd = 3;
    const popup = {id: 33, displayId: 0, type: 3, packageName: SOURCE, title: '', parentId: 11,
        bounds: box(100, 190, 350, 230), active: true, focused: false, layer: 3,
        root: lab.node({bounds: box(100, 190, 350, 230), children: [lab.node({desc: 'More', viewId: 'android:id/overflow',
            bounds: box(300, 190, 350, 230), clickable: true, actions: [16]})]})};
    lab.state.windows.push(popup);
    const snapshot = lab.io.read();
    assert.equal(lab.io.perform({kind: 'click', ...target(snapshot, 33, 'android:id/overflow'),
        guards: [target(snapshot, 11, 'test:source').node]}).dispatched, true);
    assert.equal(lab.state.actionLog[0].window, 33);
});

test('ACTION_SET_SELECTION carries exact UTF-16 offsets and then allows separate readback', () => {
    const lab = fixture();
    const action = {kind: 'set_selection', ...target(lab.io.read(), 11, 'test:source'), start: 1, end: 3};
    assert.equal(lab.io.perform(action).dispatched, true);
    assert.deepEqual(lab.state.actionLog[0].values,
        {ACTION_ARGUMENT_SELECTION_START_INT: 1, ACTION_ARGUMENT_SELECTION_END_INT: 3});
    const selected = target(lab.io.read(), 11, 'test:source').node;
    assert.equal(selected.text.slice(selected.selectionStart, selected.selectionEnd), '😀');
});

test('semantic selection tolerates its own observed framework popup, but unrelated overlays still block', () => {
    const lab = fixture();
    const popup = {id: 33, displayId: 0, type: 3, packageName: SOURCE, title: '', parentId: 11,
        bounds: box(100, 190, 350, 230), active: true, focused: false, layer: 3,
        root: lab.node({viewId: 'android:id/floating_popup_container', bounds: box(100, 190, 350, 230)})};
    lab.state.windows.push(popup);
    const makeAction = () => ({kind: 'set_selection', ...target(lab.io.read(), 11, 'test:source'), start: 1, end: 3});
    assert.equal(lab.io.perform(makeAction()).dispatched, true);
    popup.parentId = null;
    assert.equal(lab.io.perform(makeAction()).reason, 'TARGET_OCCLUDED');
    assert.equal(lab.state.actionLog.length, 1);
});

test('invalid selection range and absent selection action fail before any native mutation', () => {
    const lab = fixture();
    assert.equal(lab.io.perform({kind: 'set_selection', ...target(lab.io.read(), 11, 'test:source'), start: 0, end: 1000}).reason,
        'INVALID_SELECTION_RANGE');
    lab.sourceText.actions = [32];
    assert.equal(lab.io.perform({kind: 'set_selection', ...target(lab.io.read(), 11, 'test:source'), start: 0, end: 1}).reason,
        'SELECTION_ACTION_UNAVAILABLE');
    assert.equal(lab.state.actionLog.length, 0);
});

test('native action rejection or exception is never retried with a coordinate fallback', () => {
    const lab = fixture();
    const action = {kind: 'long_press', ...target(lab.io.read(), 11, 'test:source')};
    lab.state.actionResult = false;
    assert.deepEqual(lab.io.perform(action), {dispatched: false, attempted: true, reason: 'ACTION_REJECTED'});
    lab.state.actionError = true;
    assert.deepEqual(lab.io.perform(action), {dispatched: false, attempted: true, uncertain: true, reason: 'ACTION_EXCEPTION'});
    assert.equal(lab.state.actionLog.length, 2, 'one attempt per explicit perform call');
    assert.equal(lab.state.touchLog.length, 0);
});

test('long-press coordinate fallback is restricted to a clear current node on the default display', () => {
    const lab = fixture();
    lab.sourceText.actions = [131072];
    const action = {kind: 'long_press', ...target(lab.io.read(), 11, 'test:source')};
    assert.equal(lab.io.perform(action).dispatched, true);
    assert.deepEqual(lab.state.touchLog, [{kind: 'press', x: 250, y: 240, ms: 650}]);
    lab.left.displayId = 2;
    assert.equal(lab.io.perform({kind: 'long_press', ...target(lab.io.read(), 11, 'test:source')}).reason,
        'GESTURE_DISPLAY_UNSUPPORTED');
    assert.equal(lab.state.touchLog.length, 1);
});

test('calibrated selection executes one hold and drag only with exact text/display/window geometry', () => {
    const lab = fixture();
    const snapshot = lab.io.read();
    const action = {kind: 'gesture_select', ...target(snapshot, 11, 'test:source'), gesture: calibration(lab, snapshot)};
    assert.equal(lab.io.perform(action).dispatched, true);
    assert.deepEqual(lab.state.touchLog.map(t => t.kind), ['press', 'swipe']);
    action.gesture.sourceBounds.right -= 1;
    assert.equal(lab.io.perform(action).reason, 'GESTURE_CALIBRATION_REQUIRED');
    assert.equal(lab.state.touchLog.length, 2);
});

test('calibrated drag stops after a long press if layout changes or a higher window covers its path', () => {
    const lab = fixture();
    const snapshot = lab.io.read();
    const action = {kind: 'gesture_select', ...target(snapshot, 11, 'test:source'), gesture: calibration(lab, snapshot)};
    lab.state.pressHook = () => { lab.state.display.rotation = 1; };
    const result = lab.io.perform(action);
    assert.equal(result.reason, 'GESTURE_LAYOUT_CHANGED');
    assert.equal(result.uncertain, true, 'the preceding long press did execute');
    assert.deepEqual(lab.state.touchLog.map(t => t.kind), ['press']);
});

test('gesture path crossing another window is rejected even when its endpoints are uncovered', () => {
    const lab = fixture();
    lab.state.windows.push({id: 33, displayId: 0, type: 4, packageName: '', title: '', parentId: null,
        bounds: box(160, 245, 200, 260), active: false, focused: false, layer: 4, root: null});
    const snapshot = lab.io.read();
    const action = {kind: 'gesture_select', ...target(snapshot, 11, 'test:source'), gesture: calibration(lab, snapshot)};
    assert.equal(lab.io.perform(action).reason, 'TARGET_OCCLUDED');
    assert.equal(lab.state.touchLog.length, 0);
});

test('cancellation is checked before a native action and between calibrated strokes', () => {
    const lab = fixture();
    const snapshot = lab.io.read();
    lab.state.cancelled = true;
    assert.equal(lab.io.perform({kind: 'click', ...target(snapshot, 22, 'test:send')}).reason, 'CANCELLED');
    assert.equal(lab.state.actionLog.length, 0);
    lab.state.cancelled = false;
    lab.state.pressHook = () => { lab.state.cancelled = true; };
    const action = {kind: 'gesture_select', ...target(snapshot, 11, 'test:source'), gesture: calibration(lab, snapshot)};
    assert.equal(lab.io.perform(action).reason, 'CANCELLED');
    assert.deepEqual(lab.state.touchLog.map(t => t.kind), ['press']);
});
