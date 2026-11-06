"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

const SOURCE = "com.openai.chatgpt";
const TARGET = "com.google.android.googlequicksearchbox";
const INPUT = TARGET + ":id/assistant_robin_input_collapsed_text_half_sheet";
const EXPECTED = "독립 시험 문장 🙂";
const clone = value => JSON.parse(JSON.stringify(value));

function request(overrides) {
    return Object.assign({requestId: "offline-test-1", expectedText: EXPECTED, sourcePackage: SOURCE, targetPackage: TARGET,
        requestFingerprint: "f".repeat(64), mode: "submit", timeoutMs: 400, pollMs: 50}, overrides);
}

function node(id, key, path, bounds, options) {
    return Object.assign({key, windowId: id, packageName: id === 2 ? TARGET : SOURCE, path, text: "", desc: "", viewId: "", className: "android.widget.TextView",
        bounds, visible: true, enabled: true, clickable: false, editable: false, selectionStart: -1, selectionEnd: -1, actions: []}, options);
}

function fixture(options = {}) {
    const req = request(options.request);
    const sourceText = options.sourceText === undefined ? "앞부분 " + req.expectedText + " 뒷부분" : options.sourceText;
    const state = {clock: 0, reads: 0, selectionMode: false, selectionStart: -1, selectionEnd: -1, more: false,
        handoff: false, submitted: false, draft: options.initialDraft || "", messages: options.oldMessages || 0,
        stops: options.initialStops || 0, afterMoreReads: 0, afterHandoffReads: 0, cancelled: false};
    const actions = [];
    const actionTimes = [];
    const records = {};
    const journalHistory = [];
    const sleeps = [];
    const journal = {
        get(id) { if (options.getFails) throw new Error("private read error"); return records[id] ? clone(records[id]) : null; },
        claim(id, value) {
            if (options.claimFails || records[id]) return false;
            records[id] = clone(value);
            journalHistory.push(clone(value));
            return true;
        },
        put(id, value) {
            if (options.failWrite && options.failWrite(value, state)) throw new Error("private disk error");
            records[id] = clone(value);
            journalHistory.push(clone(value));
        }
    };

    function snapshot() {
        const sourceBounds = {left: 0, top: 0, right: 490, bottom: 800};
        const targetBounds = {left: 510, top: 0, right: 1000, bottom: options.keyboardResize && state.handoff ? 500 : 800};
        const editorTop = targetBounds.bottom - 100;
        const windows = [{id: 1, displayId: 0, type: 1, packageName: SOURCE, parentId: null, active: !state.handoff, focused: !state.handoff, layer: 1,
            bounds: sourceBounds, nodes: [
                node(1, "source-root", [], sourceBounds, {className: "android.widget.FrameLayout"}),
                node(1, "source-text", [0], {left: 20, top: 80, right: 460, bottom: 240}, {
                    text: sourceText, editable: options.sourceEditable === true,
                    selectionStart: state.selectionStart, selectionEnd: state.selectionEnd,
                    actions: options.noSelectionApi ? [] : [131072]
                }),
                node(1, "conversation-more", [1], {left: 430, top: 10, right: 475, bottom: 50}, {
                    viewId: SOURCE + ":id/conversation_more", desc: "More options", clickable: true, className: "android.widget.ImageButton"
                })
            ]},
        {id: 2, displayId: 0, type: 1, packageName: TARGET, parentId: null, active: state.handoff, focused: state.handoff, layer: 1,
            bounds: targetBounds, nodes: [
                node(2, "target-root", [], targetBounds, {className: "android.widget.FrameLayout"}),
                node(2, "gemini-title", [0], {left: 550, top: 20, right: 750, bottom: 60}, {text: options.targetTitle || "Gemini"}),
                node(2, "gemini-draft", [1], {left: 540, top: editorTop, right: 900, bottom: editorTop + 60}, {
                    viewId: options.inputId || INPUT, editable: true, text: state.draft, className: "android.widget.EditText"
                }),
                node(2, "gemini-send", [2], {left: 920, top: editorTop, right: 980, bottom: editorTop + 60}, {
                    desc: "Send", clickable: true, className: "android.widget.ImageButton"
                })
            ]}];
        for (let i = 0; i < state.messages; i += 1) {
            windows[1].nodes.push(node(2, "message-" + i, [3 + i], {left: 550, top: 100 + i * 40, right: 900, bottom: 135 + i * 40}, {text: req.expectedText}));
        }
        for (let i = 0; i < state.stops; i += 1) {
            windows[1].nodes.push(node(2, "stop-" + i, [20 + i], {left: 920, top: 300, right: 980, bottom: 350}, {desc: "Stop generating", clickable: true, className: "android.widget.Button"}));
        }
        if (state.selectionMode && !state.handoff && !options.noToolbar) {
            const toolbarBounds = {left: 20, top: 270, right: 470, bottom: 335};
            const toolbar = {id: 3, displayId: 0, type: 3, packageName: SOURCE, parentId: 1, active: false, focused: false, layer: 3,
                bounds: toolbarBounds, nodes: [
                    node(3, "toolbar-root", [], toolbarBounds, {viewId: options.noToolbarIdentity ? "android:id/content" : "android:id/floating_popup_container", className: "android.widget.LinearLayout"}),
                    node(3, "toolbar-more", [0], {left: 410, top: 275, right: 465, bottom: 330}, {
                        viewId: "android:id/overflow", desc: state.more ? "오버플로우 닫기" : "옵션 더보기", clickable: true, className: "android.widget.ImageButton"
                    })
                ]};
            if (state.more && !options.missingMenu && state.afterMoreReads > (options.menuDelayReads || 0)) {
                toolbar.nodes.push(node(3, "gemini-menu", [1], {left: 30, top: 275, right: 390, bottom: 330}, {
                    viewId: "android:id/floating_toolbar_menu_item_text", text: "Gemini에게 물어보기", clickable: true
                }));
                if (options.unownedMenu) toolbar.parentId = null;
            }
            windows.push(toolbar);
        }
        const result = {observedAt: state.clock - (options.snapshotAge || 0), display: {id: 0, width: 1000, height: 800, rotation: 0}, windows};
        if (options.mutateSnapshot) options.mutateSnapshot(result, state);
        return result;
    }

    const io = {
        now: () => state.clock,
        sleep(ms) { sleeps.push(ms); if (!options.frozenClock) state.clock += ms; },
        cancelled: () => state.cancelled,
        read() {
            state.reads += 1;
            if (state.more) state.afterMoreReads += 1;
            if (state.handoff) state.afterHandoffReads += 1;
            if (options.beforeRead) options.beforeRead(state);
            return snapshot();
        },
        perform(action) {
            actions.push(clone(action));
            actionTimes.push(state.clock);
            if (options.onPerform) {
                const override = options.onPerform(action, state, records, actions);
                if (override) return override;
            }
            if (action.kind === "long_press") {
                assert.equal(action.node.key, "source-text");
                state.selectionMode = true;
                state.selectionStart = sourceText.indexOf(req.expectedText);
                state.selectionEnd = state.selectionStart + 1;
            } else if (action.kind === "set_selection") {
                if (!options.ignoreSelection) {
                    state.selectionStart = action.start;
                    state.selectionEnd = action.end;
                }
            } else if (action.kind === "gesture_select") {
                state.selectionMode = true;
                state.selectionStart = sourceText.indexOf(req.expectedText);
                state.selectionEnd = state.selectionStart + req.expectedText.length;
            } else if (action.kind === "click" && action.node.key === "toolbar-more") {
                state.more = true;
            } else if (action.kind === "click" && action.node.key === "gemini-menu") {
                assert.equal(state.more, true, "menu cannot be clicked until More has expanded it");
                assert.equal(records[req.requestId].status, "handoff_intent", "handoff intent must be durable before the menu call");
                state.handoff = true;
                state.draft = options.handoffDraft === undefined ? req.expectedText : options.handoffDraft;
                if (options.menuAutoSubmits) { state.draft = ""; state.messages += 1; state.stops += 1; }
            } else if (action.kind === "click" && action.node.key === "gemini-send") {
                assert.equal(records[req.requestId].status, "submit_intent", "submit intent must be durable before the send call");
                assert.equal(action.guards[0].text, req.expectedText, "final draft is a native dispatch guard");
                state.submitted = true;
                if (!options.keepDraftAfterSend) state.draft = "";
                if (!options.noNewMessage) state.messages += 1;
                if (options.newStopAfterSend) state.stops += 1;
            } else {
                throw new Error("Unexpected action: " + action.kind + " " + action.node.key);
            }
            return {dispatched: true, attempted: true};
        }
    };
    return {req, state, actions, actionTimes, records, journalHistory, sleeps, journal, io, snapshot};
}

function actionNames(f) {
    return f.actions.map(action => action.kind === "click" ? action.node.key : action.kind);
}

test("required sequence waits for More's popup, verifies draft, and submits only once", () => {
    const f = fixture({menuDelayReads: 2});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "submission_observed");
    assert.equal(result.submissionObserved, true);
    assert.equal(result.handoffObserved, true);
    assert.equal(result.liveDeviceVerified, false, "offline state-machine tests are never phone proof");
    assert.deepEqual(actionNames(f), ["long_press", "set_selection", "toolbar-more", "gemini-menu", "gemini-send"]);
    assert.ok(f.actionTimes[3] >= f.actionTimes[2] + 100, "popup was awaited instead of clicking a stale coordinate");
    assert.deepEqual(result.trace.filter(item => item.status === "verified").map(item => item.stage), ["SPLIT", "SELECT", "MENU", "DRAFT", "VERIFY_SUBMIT"]);
    assert.equal(f.records[f.req.requestId].status, "submission_observed");
    assert.ok(!JSON.stringify({result, journal: f.journalHistory}).includes(EXPECTED), "reports and durable records must not copy selected text");
});

test("selection and handoff are separately observable stopping points", () => {
    const selection = fixture({request: {mode: "selection"}, initialDraft: "leave existing draft alone"});
    const selected = core.run(selection.req, selection.io, selection.journal);
    assert.equal(selected.status, "selection_verified");
    assert.deepEqual(actionNames(selection), ["long_press", "set_selection"]);
    assert.equal(selection.state.draft, "leave existing draft alone");
    const handoff = fixture({request: {mode: "handoff"}});
    const handed = core.run(handoff.req, handoff.io, handoff.journal);
    assert.equal(handed.status, "handoff_verified");
    assert.equal(handed.submissionDispatched, false);
    assert.deepEqual(actionNames(handoff), ["long_press", "set_selection", "toolbar-more", "gemini-menu"]);
});

test("More-only observes the delayed Gemini menu without handing off or touching an existing draft", () => {
    const originalDraft = "existing private Gemini draft";
    const f = fixture({request: {mode: "more"}, initialDraft: originalDraft, menuDelayReads: 2});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "menu_verified");
    assert.equal(result.code, "GEMINI_MENU_VERIFIED");
    assert.equal(result.stage, "MENU");
    assert.equal(result.handoffDispatched, false);
    assert.equal(result.handoffObserved, false);
    assert.equal(result.submissionDispatched, false);
    assert.equal(result.submissionObserved, false);
    assert.equal(result.liveDeviceVerified, false);
    assert.deepEqual(actionNames(f), ["long_press", "set_selection", "toolbar-more"]);
    assert.ok(f.state.clock >= f.actionTimes[2] + 100, "menu appearance is observed after the More click");
    assert.equal(f.state.draft, originalDraft);
    assert.equal(result.diagnostics.targetDraftEmpty, false);
    assert.equal(result.diagnostics.geminiMenu[0].text, "Gemini에게 물어보기");
    assert.ok(result.diagnostics.observedMenuControls.some(item => item.role === "menu_item" && item.text === "Gemini에게 물어보기"));
    assert.equal(f.records[f.req.requestId].status, "menu_verified");
    assert.equal(f.journalHistory.some(record => ["handoff_intent", "submit_intent"].includes(record.status)), false);
    assert.ok(!JSON.stringify({result, records: f.records}).includes(EXPECTED));
    assert.ok(!JSON.stringify({result, records: f.records}).includes(originalDraft));
    const attempts = f.actions.length;
    const reads = f.state.reads;
    const repeated = core.run(f.req, f.io, f.journal);
    assert.equal(repeated.status, "menu_verified");
    assert.equal(repeated.reusedReceipt, true);
    assert.equal(f.actions.length, attempts);
    assert.equal(f.state.reads, reads, "a completed More-only request is never replayed");
});

test("More-only still blocks a changed selection before reporting the menu verified", () => {
    const f = fixture({request: {mode: "more"}, beforeRead(state) { if (state.more) state.selectionEnd -= 1; }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "SELECTION_CHANGED");
    assert.deepEqual(actionNames(f), ["long_press", "set_selection", "toolbar-more"]);
    assert.equal(result.handoffDispatched, false);
    assert.equal(result.submissionDispatched, false);
});

test("More-only diagnostics cannot turn an observed menu into a failed action result", () => {
    const f = fixture({request: {mode: "more"}, mutateSnapshot(snapshot, state) {
        if (state.more) snapshot.windows[1].nodes.find(item => item.key === "gemini-title").text = "Google";
    }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "menu_verified");
    assert.equal(result.code, "GEMINI_MENU_VERIFIED");
    assert.equal(result.diagnostics.supported, false);
    assert.equal(result.diagnostics.code, "GEMINI_SURFACE_UNVERIFIED");
    assert.deepEqual(actionNames(f), ["long_press", "set_selection", "toolbar-more"]);
});

test("probe has no journal or actions, includes only scoped control labels and window metadata", () => {
    const f = fixture({request: {mode: "probe"}});
    const result = core.run(f.req, f.io, null);
    assert.equal(result.status, "probe_ok");
    assert.equal(result.diagnostics.geminiSurfaceVerified, true);
    assert.equal(result.diagnostics.sourceTextFound, true);
    assert.deepEqual(f.actions, []);
    assert.deepEqual(f.journalHistory, []);
    assert.equal(result.diagnostics.windows.length, 2);
    assert.deepEqual(result.diagnostics.observedMenuControls, []);
    assert.equal(result.diagnostics.sendControls[0].description, "Send");
    assert.ok(!JSON.stringify(result).includes(EXPECTED));
    const missing = fixture({request: {mode: "probe"}, mutateSnapshot(s) { s.windows.splice(1, 1); }});
    const unsupported = core.run(missing.req, missing.io, null);
    assert.equal(unsupported.code, "TARGET_WINDOW_MISSING");
    assert.equal(unsupported.diagnostics.windows.length, 1, "unsupported probe still diagnoses observed windows");
});

test("surface diagnostics distinguish a title in description while the text-only gate stays blocked", () => {
    const f = fixture({request: {mode: "probe"}, mutateSnapshot(snapshot) {
        const title = snapshot.windows[1].nodes.find(item => item.key === "gemini-title");
        title.text = "";
        title.desc = "Gemini";
    }});
    const result = core.run(f.req, f.io, null);
    const diagnostic = result.diagnostics.targetSurfaceDiagnostics;
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "GEMINI_SURFACE_UNVERIFIED");
    assert.equal(diagnostic.titleTextMatches, 0);
    assert.equal(diagnostic.titleDescriptionMatches, 1);
    assert.equal(diagnostic.configuredEditorMatches, 1);
    assert.equal(diagnostic.allEditableCount, 1);
    assert.equal(diagnostic.eligibleEditableCount, 1);
    assert.equal(diagnostic.emptyIdCandidateCount, 0);
    assert.equal(diagnostic.candidateEditorCount, 1);
    assert.equal(diagnostic.candidatesTruncated, false);
    assert.deepEqual(f.actions, []);
    const action = core.run(Object.assign({}, f.req, {mode: "handoff"}), f.io, f.journal);
    assert.equal(action.code, "GEMINI_SURFACE_UNVERIFIED", "description evidence must not relax title matching");
    assert.deepEqual(f.actions, []);
});

test("surface diagnostics expose an alternate editor ID without exporting content or authorizing it", () => {
    const alternateId = TARGET + ":id/observed_editor_variant";
    const privateFields = [EXPECTED, "PRIVATE_EDITOR_TEXT", "PRIVATE_EDITOR_DESCRIPTION", "PRIVATE_EDITOR_HINT", "PRIVATE_EDITOR_VALUE", "PRIVATE_CHAT_TEXT"];
    const f = fixture({request: {mode: "probe"}, inputId: alternateId, initialDraft: privateFields[1], mutateSnapshot(snapshot) {
        const target = snapshot.windows[1];
        const editor = target.nodes.find(item => item.key === "gemini-draft");
        editor.desc = privateFields[2];
        editor.hint = privateFields[3];
        editor.value = privateFields[4];
        editor.actions = [2097152, 131072];
        target.nodes.push(node(2, "ordinary-private-message", [31], {left: 550, top: 200, right: 900, bottom: 250}, {text: privateFields[5]}));
    }});
    const result = core.run(f.req, f.io, null);
    const diagnostic = result.diagnostics.targetSurfaceDiagnostics;
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "GEMINI_SURFACE_UNVERIFIED");
    assert.equal(diagnostic.titleTextMatches, 1);
    assert.equal(diagnostic.configuredEditorMatches, 0);
    assert.equal(diagnostic.candidateEditorCount, 1);
    assert.deepEqual(diagnostic.eligibleEditorCandidates, [{
        windowId: 2, viewId: alternateId, className: "android.widget.EditText",
        bounds: {left: 540, top: 700, right: 900, bottom: 760}, editable: true, enabled: true, visible: true,
        matchesConfiguredId: false, hasSetTextAction: true, hasSetSelectionAction: true
    }]);
    for (const text of privateFields) assert.ok(!JSON.stringify(result).includes(text), "content was not exported: " + text);
    assert.deepEqual(f.actions, []);
    assert.equal(core.run(Object.assign({}, f.req, {mode: "submit"}), f.io, f.journal).code, "GEMINI_SURFACE_UNVERIFIED");
    assert.deepEqual(f.actions, [], "observed candidate IDs are not adopted as selectors");
});

test("surface candidates are bounded and distinguish editable, EditText, action, hidden, disabled, and empty-ID cases", () => {
    const f = fixture({request: {mode: "probe"}, mutateSnapshot(snapshot) {
        const target = snapshot.windows[1];
        target.nodes = target.nodes.filter(item => item.key !== "gemini-draft");
        for (let index = 0; index < 10; index += 1) {
            target.nodes.push(node(2, "candidate-" + index, [40 + index], {left: 550, top: 400, right: 900, bottom: 450}, {
                viewId: index === 0 ? "" : TARGET + ":id/candidate_" + index,
                editable: index !== 1 && index !== 2,
                className: index === 0 || index === 2 ? "android.view.View" : "android.widget.EditText",
                visible: index !== 1 && index !== 3,
                enabled: index !== 2 && index !== 4,
                actions: index === 0 ? [2097152, 131072] : (index === 2 ? [2097152] : [])
            }));
        }
        target.nodes.push(node(2, "selection-only-node", [80], {left: 550, top: 500, right: 900, bottom: 550}, {actions: [131072]}));
    }});
    const result = core.run(f.req, f.io, null);
    const diagnostic = result.diagnostics.targetSurfaceDiagnostics;
    assert.equal(result.code, "GEMINI_SURFACE_UNVERIFIED");
    assert.equal(diagnostic.configuredEditorMatches, 0);
    assert.equal(diagnostic.allEditableCount, 8);
    assert.equal(diagnostic.eligibleEditableCount, 6);
    assert.equal(diagnostic.emptyIdCandidateCount, 1);
    assert.equal(diagnostic.candidateEditorCount, 10);
    assert.equal(diagnostic.candidatesTruncated, true);
    assert.equal(diagnostic.eligibleEditorCandidates.length, 8);
    assert.equal(diagnostic.eligibleEditorCandidates[1].editable, false);
    assert.equal(diagnostic.eligibleEditorCandidates[1].visible, false);
    assert.equal(diagnostic.eligibleEditorCandidates[2].hasSetTextAction, true);
    assert.equal(diagnostic.eligibleEditorCandidates[2].enabled, false);
    assert.deepEqual(f.actions, []);
});

test("surface diagnostics exclude invalid, off-window, foreign-package, and other-window candidates", () => {
    const f = fixture({request: {mode: "probe"}, mutateSnapshot(snapshot) {
        const target = snapshot.windows[1];
        const bounds = {left: 550, top: 400, right: 900, bottom: 450};
        const cases = [
            {bounds: {left: 500, top: 400, right: 900, bottom: 450}},
            {bounds: {left: 550, top: 400, right: 550, bottom: 450}},
            {bounds: {left: NaN, top: 400, right: 900, bottom: 450}},
            {bounds: null}, {packageName: SOURCE}, {windowId: 99}, {key: null}, {path: null}, {path: [-1]}, {editable: "true"}
        ];
        cases.forEach((bad, index) => target.nodes.push(node(2, "invalid-" + index, [40 + index], bounds, Object.assign({
            editable: true, className: "android.widget.EditText", viewId: TARGET + ":id/excluded_" + index, actions: [2097152]
        }, bad))));
        snapshot.windows[0].nodes.push(node(1, "source-editor", [50], {left: 20, top: 400, right: 450, bottom: 450}, {
            editable: true, className: "android.widget.EditText", viewId: SOURCE + ":id/source_editor", actions: [2097152]
        }));
    }});
    const result = core.run(f.req, f.io, null);
    const diagnostic = result.diagnostics.targetSurfaceDiagnostics;
    assert.equal(result.status, "probe_ok");
    assert.equal(diagnostic.candidateEditorCount, 1);
    assert.equal(diagnostic.allEditableCount, 1);
    assert.equal(diagnostic.eligibleEditableCount, 1);
    assert.equal(diagnostic.configuredEditorMatches, 1);
    assert.equal(diagnostic.eligibleEditorCandidates[0].viewId, INPUT);
    assert.ok(!JSON.stringify(diagnostic).includes("excluded_"));
    assert.ok(!JSON.stringify(diagnostic).includes("source_editor"));
    assert.deepEqual(f.actions, []);
});

test("surface diagnostic numeric counts and metadata lengths are bounded", () => {
    const f = fixture({request: {mode: "probe"}, mutateSnapshot(snapshot) {
        const target = snapshot.windows[1];
        target.nodes.find(item => item.key === "gemini-draft").viewId = TARGET + ":id/" + "x".repeat(700);
        target.nodes.find(item => item.key === "gemini-draft").className = "a".repeat(300) + ".EditText";
        for (let index = 0; index < 6001; index += 1) {
            target.nodes.push(node(2, "extra-" + index, [40 + index], {left: 550, top: 400, right: 900, bottom: 450}, {
                editable: true, viewId: "", text: "PRIVATE_TEXT_NOT_EXPORTED", desc: "PRIVATE_DESC_NOT_EXPORTED"
            }));
        }
    }});
    const result = core.run(f.req, f.io, null);
    const diagnostic = result.diagnostics.targetSurfaceDiagnostics;
    assert.equal(diagnostic.candidateEditorCount, 6000);
    assert.equal(diagnostic.allEditableCount, 6000);
    assert.equal(diagnostic.eligibleEditableCount, 6000);
    assert.equal(diagnostic.emptyIdCandidateCount, 6000);
    assert.equal(diagnostic.eligibleEditorCandidates.length, 8);
    assert.equal(diagnostic.candidatesTruncated, true);
    assert.equal(diagnostic.eligibleEditorCandidates[0].viewId.length, 512);
    assert.equal(diagnostic.eligibleEditorCandidates[0].className.length, 256);
    assert.ok(!JSON.stringify(result).includes("PRIVATE_TEXT_NOT_EXPORTED"));
    assert.ok(!JSON.stringify(result).includes("PRIVATE_DESC_NOT_EXPORTED"));
    assert.deepEqual(f.actions, []);
});

test("unknown framework toolbar labels are visible to probe but are never auto-selected", () => {
    function renameMenu(snapshot) {
        const toolbar = snapshot.windows.find(window => window.id === 3);
        const item = toolbar && toolbar.nodes.find(item => item.key === "gemini-menu");
        if (item) item.text = "Gemini에서 이어 하기";
    }
    const probe = fixture({request: {mode: "probe"}, mutateSnapshot: renameMenu});
    probe.state.selectionMode = probe.state.more = true;
    const observed = core.run(probe.req, probe.io, null);
    assert.equal(observed.status, "probe_ok");
    assert.equal(observed.diagnostics.geminiMenu.length, 0);
    assert.ok(observed.diagnostics.observedMenuControls.some(item => item.text === "Gemini에서 이어 하기"));
    assert.deepEqual(probe.actions, []);
    const action = fixture({request: {mode: "more"}, mutateSnapshot: renameMenu});
    const blocked = core.run(action.req, action.io, action.journal);
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.code, "GEMINI_MENU_NOT_FOUND");
    assert.deepEqual(actionNames(action), ["long_press", "set_selection", "toolbar-more"]);
    assert.equal(blocked.handoffDispatched, false);
});

test("probe omits conversation, source content, editable nodes, and foreign or unowned popup labels", () => {
    const privateDraft = "PRIVATE_DRAFT_NEVER_EXPORTED";
    const excluded = [EXPECTED, privateDraft, "PRIVATE_CONVERSATION", "PRIVATE_EDITOR", "FOREIGN_POPUP", "UNOWNED_POPUP"];
    const f = fixture({request: {mode: "probe"}, initialDraft: privateDraft, mutateSnapshot(snapshot) {
        const source = snapshot.windows[0];
        const toolbar = snapshot.windows.find(window => window.id === 3);
        source.nodes.find(item => item.key === "source-text").viewId = "android:id/floating_toolbar_menu_item_text";
        source.nodes.push(node(1, "ordinary-conversation", [8], {left: 30, top: 350, right: 400, bottom: 390}, {text: "PRIVATE_CONVERSATION"}));
        toolbar.nodes.push(node(3, "editable-toolbar", [8], toolbar.bounds, {
            viewId: "android:id/floating_toolbar_menu_item_text", text: "Gemini에게 물어보기", desc: "PRIVATE_EDITOR", editable: true
        }));
        toolbar.nodes.push(node(3, "label-with-selection", [9], toolbar.bounds, {
            viewId: "android:id/floating_toolbar_menu_item_text", text: "검색: " + EXPECTED
        }));
        toolbar.nodes.push(node(3, "disabled-toolbar-action", [10], toolbar.bounds, {
            viewId: "android:id/floating_toolbar_menu_item_text", text: "사용 불가 메뉴", enabled: false
        }));
        for (const [id, label, packageName, parentId] of [[8, "FOREIGN_POPUP", "foreign.app", 1], [9, "UNOWNED_POPUP", SOURCE, null]]) {
            snapshot.windows.push({id, displayId: 0, type: 3, packageName, parentId, active: false, focused: false, layer: 4,
                bounds: toolbar.bounds, nodes: [node(id, label, [0], toolbar.bounds, {
                    packageName, viewId: "android:id/floating_toolbar_menu_item_text", text: label
                })]});
        }
    }});
    f.state.selectionMode = true;
    const result = core.run(f.req, f.io, null);
    assert.equal(result.status, "probe_ok");
    const observed = result.diagnostics.observedMenuControls;
    assert.deepEqual(observed.map(item => item.text || item.description), ["옵션 더보기", "사용 불가 메뉴"]);
    assert.equal(observed[1].enabled, false, "disabled controls are observational evidence, not click candidates");
    assert.deepEqual(result.diagnostics.geminiMenu, [], "an editable field is not a matched menu even with a matching label/ID");
    for (const text of excluded) assert.ok(!JSON.stringify(result).includes(text), "private/untrusted label omitted: " + text);
    assert.deepEqual(f.actions, []);
});

test("probe bounds toolbar observations and labels without treating the extra labels as matches", () => {
    const f = fixture({request: {mode: "probe"}, mutateSnapshot(snapshot) {
        const toolbar = snapshot.windows.find(window => window.id === 3);
        for (let index = 0; index < 20; index += 1) {
            toolbar.nodes.push(node(3, "unknown-" + index, [index + 1], toolbar.bounds, {
                text: "메뉴-" + index + ":" + "가".repeat(100), desc: "설명".repeat(60)
            }));
        }
    }});
    f.state.selectionMode = true;
    const result = core.run(f.req, f.io, null);
    assert.equal(result.status, "probe_ok");
    assert.equal(result.diagnostics.observedMenuControls.length, 16);
    assert.ok(result.diagnostics.observedMenuControls.every(item => item.text.length <= 80 && item.description.length <= 80));
    assert.equal(result.diagnostics.geminiMenu.length, 0);
    assert.deepEqual(f.actions, []);
});

test("probe reports an actual Send child label rather than its unlabelled clickable ancestor", () => {
    const f = fixture({request: {mode: "probe"}, mutateSnapshot(snapshot) {
        const target = snapshot.windows[1];
        const send = target.nodes.find(item => item.key === "gemini-send");
        send.desc = "";
        target.nodes.push(node(2, "actual-send-label", [2, 0], send.bounds, {text: "전송"}));
    }});
    const result = core.run(f.req, f.io, null);
    assert.equal(result.status, "probe_ok");
    assert.equal(result.diagnostics.sendControls.length, 1);
    assert.equal(result.diagnostics.sendControls[0].key, "gemini-send");
    assert.equal(result.diagnostics.sendControls[0].text, "전송");
    assert.equal(result.diagnostics.sendControls[0].description, "");
    assert.deepEqual(f.actions, []);
});

const badWindows = [
    ["missing target", "TARGET_WINDOW_MISSING", s => { s.windows.splice(1, 1); }],
    ["ambiguous source", "SOURCE_WINDOW_AMBIGUOUS", s => { const extra = clone(s.windows[0]); extra.id = 7; s.windows.push(extra); }],
    ["overlapping panes", "NOT_LEFT_RIGHT_SPLIT", s => { s.windows[1].bounds.left = 400; }],
    ["reversed panes", "NOT_LEFT_RIGHT_SPLIT", s => { [s.windows[0].bounds, s.windows[1].bounds] = [s.windows[1].bounds, s.windows[0].bounds]; }],
    ["stacked panes", "NOT_LEFT_RIGHT_SPLIT", s => { s.windows[0].bounds = {left: 0, top: 0, right: 1000, bottom: 390}; s.windows[1].bounds = {left: 0, top: 410, right: 1000, bottom: 800}; }],
    ["different displays", "DIFFERENT_DISPLAYS", s => { s.windows[1].displayId = 2; }],
    ["external display pair", "WRONG_DISPLAY", s => { s.windows.forEach(w => { w.displayId = 2; }); }],
    ["full-screen occlusion", "WINDOW_OCCLUDED", s => { s.windows.push({id: 8, displayId: 0, type: 1, packageName: "other.app", parentId: null, layer: 9,
        bounds: {left: 0, top: 0, right: 1000, bottom: 800}, nodes: []}); }]
];
for (const [name, code, mutate] of badWindows) {
    test("refuses " + name + " before UI actions", () => {
        const f = fixture({mutateSnapshot: mutate});
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.code, code);
        assert.equal(result.status, "blocked");
        assert.deepEqual(f.actions, []);
        assert.deepEqual(f.journalHistory, []);
    });
}

test("Google host package requires both Gemini heading and the configured editor identity", () => {
    for (const options of [{targetTitle: "Google"}, {inputId: TARGET + ":id/search_box"}]) {
        const f = fixture(options);
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.code, "GEMINI_SURFACE_UNVERIFIED");
        assert.equal(f.actions.length, 0);
    }
});

test("rejects ambiguous source occurrences and editable ChatGPT composer text", () => {
    const repeated = fixture({sourceText: EXPECTED + " / " + EXPECTED});
    assert.equal(core.run(repeated.req, repeated.io, repeated.journal).code, "SOURCE_TEXT_AMBIGUOUS");
    const composer = fixture({sourceEditable: true});
    assert.equal(core.run(composer.req, composer.io, composer.journal).code, "SOURCE_TEXT_MISSING");
    assert.equal(composer.actions.length, 0);
});

test("selection offsets are exact UTF-16 offsets including emoji", () => {
    const f = fixture({request: {mode: "selection"}, sourceText: "🙂 " + EXPECTED + " tail"});
    const result = core.run(f.req, f.io, f.journal);
    const select = f.actions.find(action => action.kind === "set_selection");
    assert.equal(result.status, "selection_verified");
    assert.equal(select.start, 3);
    assert.equal(select.end, 3 + EXPECTED.length);
});

test("does not treat conversation ellipsis or generic framework overflow as selection More", () => {
    for (const options of [{noToolbar: true}, {noToolbarIdentity: true}]) {
        const f = fixture(options);
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.code, "MORE_CONTROL_NOT_FOUND");
        assert.equal(result.stage, "MORE");
        assert.deepEqual(actionNames(f), ["long_press", "set_selection"]);
    }
});

test("a Gemini-looking menu in an unowned popup is not eligible", () => {
    const f = fixture({unownedMenu: true});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.code, "GEMINI_MENU_NOT_FOUND");
    assert.deepEqual(actionNames(f), ["long_press", "set_selection", "toolbar-more"]);
});

test("missing expanded menu times out without repeating More", () => {
    const f = fixture({missingMenu: true});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.code, "GEMINI_MENU_NOT_FOUND");
    assert.equal(actionNames(f).filter(name => name === "toolbar-more").length, 1);
    assert.equal(result.handoffDispatched, false);
});

test("fresh-node rejection reports the concrete adapter reason and does not continue", () => {
    const f = fixture({onPerform(action) {
        if (action.node.key === "toolbar-more") return {dispatched: false, attempted: false, reason: "NODE_CHANGED"};
    }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.code, "NODE_CHANGED");
    assert.equal(result.status, "blocked");
    assert.equal(actionNames(f).includes("gemini-menu"), false);
});

test("missing selection capability or absent readback never advances to More", () => {
    const unsupported = fixture({noSelectionApi: true});
    assert.equal(core.run(unsupported.req, unsupported.io, unsupported.journal).code, "SELECTION_API_UNAVAILABLE");
    assert.deepEqual(actionNames(unsupported), ["long_press"]);
    const notSelected = fixture({ignoreSelection: true});
    assert.equal(core.run(notSelected.req, notSelected.io, notSelected.journal).code, "EXACT_SELECTION_NOT_OBSERVED");
    assert.deepEqual(actionNames(notSelected), ["long_press", "set_selection"]);
});

test("pre-calibrated gesture route still requires exact selected-offset readback", () => {
    const calibration = {display: {id: 0, width: 1000, height: 800, rotation: 0}, sourceBounds: {left: 0, top: 0, right: 490, bottom: 800},
        sourceText: "앞부분 " + EXPECTED + " 뒷부분", longPress: {x: 100, y: 100, durationMs: 800}, drags: [{from: {x: 100, y: 120}, to: {x: 300, y: 120}, durationMs: 500}]};
    const f = fixture({request: {mode: "selection", gestureSelection: calibration}});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "selection_verified");
    assert.deepEqual(actionNames(f), ["gesture_select"]);
    assert.equal(result.liveDeviceVerified, false);
});

test("cancellation after More stops before Gemini menu dispatch", () => {
    const f = fixture({onPerform(action, state) { if (action.node.key === "toolbar-more") state.cancelled = true; }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "cancelled");
    assert.equal(result.code, "CANCELLED");
    assert.equal(actionNames(f).includes("gemini-menu"), false);
});

test("journal unavailable, exclusive-claim loss, and pre-handoff write failure prevent consequential click", () => {
    const absent = fixture();
    assert.equal(core.run(absent.req, absent.io, null).code, "JOURNAL_UNAVAILABLE");
    assert.equal(absent.actions.length, 0);
    const race = fixture({claimFails: true});
    assert.equal(core.run(race.req, race.io, race.journal).code, "REQUEST_ALREADY_RECORDED");
    assert.equal(race.actions.length, 0);
    const disk = fixture({failWrite: value => value.status === "handoff_intent"});
    const result = core.run(disk.req, disk.io, disk.journal);
    assert.equal(result.code, "JOURNAL_WRITE_FAILED");
    assert.equal(result.journalSaved, false);
    assert.equal(result.handoffDispatched, false);
    assert.equal(actionNames(disk).includes("gemini-menu"), false);
    assert.equal(disk.records[disk.req.requestId].status, "running");
});

test("completed, running, and unknown request IDs never repeat UI actions", () => {
    const f = fixture();
    const first = core.run(f.req, f.io, f.journal);
    const count = f.actions.length;
    const reads = f.state.reads;
    const second = core.run(f.req, f.io, f.journal);
    assert.equal(second.status, first.status);
    assert.equal(second.reusedReceipt, true);
    assert.equal(f.actions.length, count);
    assert.equal(f.state.reads, reads);
    const running = fixture();
    running.records[running.req.requestId] = {schema: "jebiseo.autojs6.journal.v1", requestId: running.req.requestId, status: "submit_intent"};
    assert.equal(core.run(running.req, running.io, running.journal).code, "REQUEST_ALREADY_RECORDED");
    assert.equal(running.actions.length, 0);
    const unknown = fixture({noNewMessage: true});
    assert.equal(core.run(unknown.req, unknown.io, unknown.journal).status, "completion_unknown");
    const unknownCount = unknown.actions.length;
    assert.equal(core.run(unknown.req, unknown.io, unknown.journal).reusedReceipt, true);
    assert.equal(unknown.actions.length, unknownCount);
});

test("request ID with another fingerprint cannot borrow a completed receipt", () => {
    const f = fixture({request: {requestFingerprint: "a".repeat(64)}});
    core.run(f.req, f.io, f.journal);
    const count = f.actions.length;
    const changed = core.run(Object.assign({}, f.req, {requestFingerprint: "b".repeat(64)}), f.io, f.journal);
    assert.equal(changed.code, "REQUEST_ID_CONFLICT");
    assert.equal(f.actions.length, count);
});

test("without matching fingerprints an old receipt is blocked, never attributed to new content", () => {
    const f = fixture({request: {requestFingerprint: undefined}});
    assert.equal(core.run(f.req, f.io, f.journal).status, "submission_observed");
    const count = f.actions.length;
    const changed = core.run(Object.assign({}, f.req, {expectedText: "another intended message"}), f.io, f.journal);
    assert.equal(changed.status, "blocked");
    assert.equal(changed.code, "REQUEST_ALREADY_RECORDED");
    assert.equal(changed.submissionObserved, false);
    assert.equal(f.actions.length, count);
});

test("a chat message labelled Send inside a clickable nonbutton container is not a send control", () => {
    const f = fixture({mutateSnapshot(s) {
        const target = s.windows[1];
        target.nodes = target.nodes.filter(n => n.key !== "gemini-send");
        const bounds = {left: 550, top: 400, right: 900, bottom: 450};
        target.nodes.push(node(2, "message-container", [30], bounds, {clickable: true, className: "android.view.ViewGroup"}));
        target.nodes.push(node(2, "message-send-text", [30, 0], bounds, {text: "Send"}));
    }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "blocked");
    assert.equal(result.code, "SEND_CONTROL_NOT_FOUND");
    assert.equal(result.submissionDispatched, false);
    assert.equal(actionNames(f).includes("message-container"), false);
});

test("a Send label under a real button is resolved to that button and guarded", () => {
    const f = fixture({mutateSnapshot(s) {
        const target = s.windows[1];
        const send = target.nodes.find(n => n.key === "gemini-send");
        send.desc = "";
        target.nodes.push(node(2, "send-label", [2, 0], send.bounds, {text: "Send"}));
    }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "submission_observed");
    const action = f.actions.find(a => a.node.key === "gemini-send");
    assert.ok(action.guards.some(n => n.key === "send-label"));
});

test("chat text Stop generating neither blocks ready input nor proves response generation", () => {
    const f = fixture({noNewMessage: true, mutateSnapshot(s, state) {
        const target = s.windows[1];
        const bounds = {left: 550, top: 400, right: 900, bottom: 450};
        if (!state.submitted) return;
        target.nodes.push(node(2, "fake-stop-parent", [30], bounds, {clickable: true, className: "android.view.ViewGroup"}));
        target.nodes.push(node(2, "fake-stop-message", [30, 0], bounds, {text: "Stop generating"}));
    }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.code, "SUBMISSION_NOT_OBSERVED");
    assert.equal(result.status, "completion_unknown");
    assert.equal(result.submissionDispatched, true);
});

test("an existing Gemini draft, including the same text, is never overwritten", () => {
    for (const draft of ["unrelated draft", EXPECTED]) {
        const f = fixture({initialDraft: draft});
        assert.equal(core.run(f.req, f.io, f.journal).code, "TARGET_DRAFT_NOT_EMPTY");
        assert.equal(f.actions.length, 0);
    }
    const changed = fixture({onPerform(action, state) { if (action.node.key === "toolbar-more") state.draft = "new unrelated draft"; }});
    assert.equal(core.run(changed.req, changed.io, changed.journal).code, "TARGET_DRAFT_CHANGED");
    assert.equal(actionNames(changed).includes("gemini-menu"), false);
});

test("a currently generating Gemini surface is not treated as ready", () => {
    const f = fixture({initialStops: 1});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.code, "TARGET_BUSY");
    assert.equal(f.actions.length, 0);
});

test("menu auto-submit is unresolved external completion and never followed by Send", () => {
    const f = fixture({menuAutoSubmits: true});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "completion_unknown");
    assert.equal(result.code, "MENU_MAY_HAVE_SUBMITTED");
    assert.equal(result.handoffDispatched, true);
    assert.equal(result.handoffObserved, false);
    assert.equal(result.submissionDispatched, false);
    assert.equal(actionNames(f).includes("gemini-send"), false);
    assert.equal(f.records[f.req.requestId].status, "completion_unknown");
});

test("missing or mismatched draft after Gemini menu remains unknown, not retryable failure", () => {
    for (const [draft, code] of [["", "HANDOFF_DRAFT_NOT_OBSERVED"], ["different text", "DRAFT_TEXT_MISMATCH"]]) {
        const f = fixture({handoffDraft: draft});
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.status, "completion_unknown");
        assert.equal(result.code, code);
        assert.equal(result.handoffDispatched, true);
        assert.equal(actionNames(f).includes("gemini-send"), false);
    }
});

test("cancellation after menu preserves unknown result and no automatic send", () => {
    const f = fixture({onPerform(action, state) { if (action.node.key === "gemini-menu") state.cancelled = true; }});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "completion_unknown");
    assert.equal(result.code, "CANCELLED");
    assert.equal(result.handoffDispatched, true);
    assert.equal(result.submissionDispatched, false);
});

test("an exception or rejection after submit intent is unknown and persists no secret exception text", () => {
    for (const throwing of [true, false]) {
        const f = fixture({onPerform(action) {
            if (action.node.key === "gemini-send") {
                if (throwing) throw new Error("secret error: " + EXPECTED);
                return {dispatched: false, attempted: true, uncertain: true, reason: "ACTION_EXCEPTION"};
            }
        }});
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.status, "completion_unknown");
        assert.equal(result.code, throwing ? "ADAPTER_FAILURE" : "ACTION_EXCEPTION");
        assert.equal(result.submissionObserved, false);
        assert.equal(actionNames(f).filter(name => name === "gemini-send").length, 1);
        assert.ok(!JSON.stringify({result, records: f.records}).includes(EXPECTED));
    }
});

test("submission proof needs cleared input plus new evidence, not old identical messages", () => {
    for (const options of [{noNewMessage: true}, {oldMessages: 1, noNewMessage: true}, {keepDraftAfterSend: true}]) {
        const f = fixture(options);
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.status, "completion_unknown");
        assert.equal(result.code, "SUBMISSION_NOT_OBSERVED");
        assert.equal(result.submissionDispatched, true);
        assert.equal(result.submissionObserved, false);
        assert.equal(actionNames(f).filter(name => name === "gemini-send").length, 1);
    }
    const stop = fixture({noNewMessage: true, newStopAfterSend: true});
    assert.equal(core.run(stop.req, stop.io, stop.journal).status, "submission_observed");
});

test("post-dispatch journal failure keeps the durable submit fence and does not claim success", () => {
    const f = fixture({failWrite: value => value.status === "submit_intent" && value.submissionDispatched === true});
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.status, "completion_unknown");
    assert.equal(result.code, "JOURNAL_WRITE_FAILED");
    assert.equal(result.submissionDispatched, true);
    assert.equal(result.journalSaved, false);
    assert.equal(f.records[f.req.requestId].status, "submit_intent");
});

test("keyboard resize is allowed while same split identities remain; fullscreen takeover is not", () => {
    const resized = fixture({keyboardResize: true});
    assert.equal(core.run(resized.req, resized.io, resized.journal).status, "submission_observed");
    const takeover = fixture({mutateSnapshot(s, state) { if (state.handoff) s.windows[1].bounds.left = 0; }});
    const result = core.run(takeover.req, takeover.io, takeover.journal);
    assert.equal(result.status, "completion_unknown");
    assert.equal(result.code, "NOT_LEFT_RIGHT_SPLIT");
    assert.equal(actionNames(takeover).includes("gemini-send"), false);
});

test("stale observations and frozen-clock waits are bounded", () => {
    const stale = fixture({snapshotAge: 2000});
    assert.equal(core.run(stale.req, stale.io, stale.journal).code, "STALE_SNAPSHOT");
    assert.equal(stale.actions.length, 0);
    const frozen = fixture({missingMenu: true, frozenClock: true});
    assert.equal(core.run(frozen.req, frozen.io, frozen.journal).code, "GEMINI_MENU_NOT_FOUND");
    assert.ok(frozen.state.reads < 25, "iteration cap is independent of the device clock");
});

test("adapter service errors are reported with their sanitized public code", () => {
    const f = fixture();
    f.io.read = () => { const error = new Error("private native stack"); error.code = "ACCESSIBILITY_SERVICE_UNAVAILABLE"; throw error; };
    const result = core.run(f.req, f.io, f.journal);
    assert.equal(result.code, "ACCESSIBILITY_SERVICE_UNAVAILABLE");
    assert.equal(result.status, "blocked");
    assert.equal(f.actions.length, 0);
    assert.ok(!JSON.stringify(result).includes("private native"));
});

test("request IDs with path characters or unsupported punctuation never reach journal", () => {
    for (const id of ["../private", "invalid:id", EXPECTED]) {
        const f = fixture({request: {requestId: id}});
        const result = core.run(f.req, f.io, f.journal);
        assert.equal(result.code, "INVALID_REQUEST_ID");
        assert.equal(result.requestId, "");
        assert.equal(f.journalHistory.length, 0);
        assert.equal(f.actions.length, 0);
    }
});
