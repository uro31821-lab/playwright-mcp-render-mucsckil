'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const core = require('../core.js');
const {fixture, SOURCE, TARGET, box} = require('./fixtures/android.cjs');

function workflow() {
    const lab = fixture();
    const expectedText = '😀B 시험';
    lab.draft.text = '';
    lab.draft.selectionStart = lab.draft.selectionEnd = 0;
    lab.draft.viewId = TARGET + ':id/assistant_robin_input_collapsed_text_half_sheet';
    lab.send.viewId = ''; // The contract binds an exact label inside the verified Gemini window.
    lab.toolbar.viewId = 'android:id/floating_popup_container';
    lab.toolbar.visible = false;
    lab.more.visible = false;
    lab.right.root.children.push(lab.node({text: 'Gemini', bounds: box(540, 40, 680, 90)}));
    const menu = lab.node({text: 'Gemini에게 물어보기', viewId: 'android:id/floating_toolbar_menu_item_text',
        bounds: box(120, 130, 420, 175), clickable: true, actions: [16]});
    const popup = {id: 33, displayId: 0, type: 3, packageName: SOURCE, title: 'Selection actions', parentId: 11,
        bounds: box(100, 120, 450, 185), active: true, focused: false, layer: 3,
        root: lab.node({viewId: 'android:id/floating_popup_container', bounds: box(100, 120, 450, 185), children: [menu]})};
    const stages = [];
    let readyAt = Infinity;
    lab.state.readHook = () => {
        if (lab.state.clock >= readyAt && !lab.state.windows.includes(popup)) lab.state.windows.push(popup);
    };
    lab.state.actionHook = ({model, id}) => {
        if (model === lab.sourceText && id === 32) {
            stages.push('long_press');
            lab.sourceText.selectionStart = 0;
            lab.sourceText.selectionEnd = 1;
            lab.toolbar.visible = lab.more.visible = true;
        } else if (model === lab.sourceText && id === 131072) {
            stages.push('set_selection');
        } else if (model === lab.more && id === 16) {
            stages.push('more');
            readyAt = lab.state.clock + 400;
        } else if (model === menu && id === 16) {
            stages.push('gemini_menu');
            assert.ok(lab.state.clock >= readyAt, 'the menu must appear after More before it can be clicked');
            readyAt = Infinity;
            lab.state.windows = lab.state.windows.filter(w => w !== popup);
            lab.toolbar.visible = lab.more.visible = false;
            lab.draft.text = expectedText;
            lab.draft.selectionStart = lab.draft.selectionEnd = expectedText.length;
        } else if (model === lab.send && id === 16) {
            stages.push('send');
            assert.equal(lab.draft.text, expectedText);
            lab.draft.text = '';
            lab.draft.selectionStart = lab.draft.selectionEnd = 0;
            lab.right.root.children.push(lab.node({text: expectedText, bounds: box(540, 160, 900, 220)}));
        }
    };
    const records = new Map();
    const journal = {
        get: id => records.get(id) || null,
        claim(id, value) { if (records.has(id)) return false; records.set(id, structuredClone(value)); return true; },
        put(id, value) { records.set(id, structuredClone(value)); return true; }
    };
    const request = {requestId: 'adapter-core-flow', mode: 'submit', expectedText,
        requestFingerprint: createHash('sha256').update(JSON.stringify({mode: 'submit', expectedText, sourcePackage: SOURCE, targetPackage: TARGET})).digest('hex'),
        sourcePackage: SOURCE, targetPackage: TARGET, timeoutMs: 2000, pollMs: 100};
    return {lab, expectedText, menu, stages, records, journal, request};
}

test('actual core and adapter complete the mandatory More flow over Android-shaped windows without claiming phone E2E', () => {
    const flow = workflow();
    const result = core.run(flow.request, flow.lab.io, flow.journal);
    assert.equal(result.status, 'submission_observed', JSON.stringify(result));
    assert.equal(result.submissionDispatched, true);
    assert.equal(result.submissionObserved, true);
    assert.equal(result.liveDeviceVerified, false);
    assert.deepEqual(flow.stages, ['long_press', 'set_selection', 'more', 'gemini_menu', 'send']);
    assert.equal(flow.lab.state.touchLog.length, 0, 'the semantic selection path uses no coordinate fallback');
    assert.ok(flow.lab.state.clock >= 500, 'at least the simulated 400 ms menu delay was observed');
    const selection = flow.lab.state.actionLog.find(a => a.id === 131072);
    assert.deepEqual(selection.values, {ACTION_ARGUMENT_SELECTION_START_INT: 1, ACTION_ARGUMENT_SELECTION_END_INT: 7});
    assert.ok(!JSON.stringify(flow.records.get(flow.request.requestId)).includes(flow.expectedText), 'journal does not retain selected text');
    const attempts = flow.lab.state.actionLog.length;
    const repeated = core.run(flow.request, flow.lab.io, flow.journal);
    assert.equal(repeated.reusedReceipt, true);
    assert.equal(flow.lab.state.actionLog.length, attempts, 'same request is never replayed');
});

test('actual adapter refuses a menu target changed after core inspection and core retains an unresolved handoff', () => {
    const flow = workflow();
    flow.lab.state.refreshHook = ({model}) => {
        if (model === flow.menu) model.text = '다른 작업';
    };
    const result = core.run({...flow.request, requestId: 'adapter-core-stale'}, flow.lab.io, flow.journal);
    assert.equal(result.status, 'completion_unknown', JSON.stringify(result));
    assert.equal(result.handoffDispatched, false);
    assert.equal(result.submissionDispatched, false);
    assert.deepEqual(flow.stages, ['long_press', 'set_selection', 'more']);
    assert.equal(flow.lab.state.actionLog.some(a => a.window === 33), false);
    const attempts = flow.lab.state.actionLog.length;
    core.run({...flow.request, requestId: 'adapter-core-stale'}, flow.lab.io, flow.journal);
    assert.equal(flow.lab.state.actionLog.length, attempts, 'uncertain handoff does not lead to a retry');
});
