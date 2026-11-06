// JH 제비서 독립 시험 0.1.0 — AutoJs6에서 실행. JH 운영 미연결.
// Generated with node build-bundle.cjs. Edit source modules, not this file.
(function () {
'use strict';
var __JEBISEO_LAB_PROFILE = {
  "schema": "jebiseo.autojs6.profile.v1",
  "sourcePackage": "com.openai.chatgpt",
  "targetPackage": "com.google.android.googlequicksearchbox",
  "targetInputIds": [
    "com.google.android.googlequicksearchbox:id/assistant_robin_input_collapsed_text_half_sheet"
  ],
  "targetTitleLabels": [
    "Gemini"
  ],
  "targetSendIds": [],
  "targetStopIds": [],
  "testText": "제비서 독립시험: 이 문장을 받으면 확인이라고만 답해 주세요.",
  "timeoutMs": 8000,
  "pollMs": 200,
  "startDelayMs": 3500,
  "moreLabels": [
    "옵션 더보기",
    "더보기",
    "더 보기",
    "More options",
    "More",
    "⋯",
    "…"
  ],
  "menuLabels": [
    "Gemini로 보내기",
    "Gemini에게 물어보기",
    "Send to Gemini",
    "Ask Gemini"
  ],
  "sendLabels": [
    "보내기",
    "전송",
    "Send",
    "Submit"
  ],
  "stopLabels": [
    "응답 중지",
    "생성 중지",
    "Stop response",
    "Stop generating"
  ],
  "gestureSelection": null
};
var factories = {}, loaded = {};
function require(id) {
  if (!Object.prototype.hasOwnProperty.call(factories, id)) throw new Error("MODULE_UNKNOWN");
  if (!Object.prototype.hasOwnProperty.call(loaded, id)) {
    var module = {exports:{}}; loaded[id] = module;
    factories[id](module.exports, module, require);
  }
  return loaded[id].exports;
}
factories["./core.js"] = function (exports, module, require) {
/* Standalone experiment. ES5/CommonJS: usable by AutoJs6 and offline Node tests. */
"use strict";

var RESULT_SCHEMA = "jebiseo.autojs6.result.v1";
var JOURNAL_SCHEMA = "jebiseo.autojs6.journal.v1";
var SET_SELECTION = 131072;
var DEFAULT_INPUT_ID = "com.google.android.googlequicksearchbox:id/assistant_robin_input_collapsed_text_half_sheet";
var MODES = ["probe", "selection", "handoff", "submit"];
var TERMINAL = ["selection_verified", "handoff_verified", "submission_observed", "blocked", "cancelled", "completion_unknown"];
var TOOLBAR_CONTAINERS = [
    "android:id/floating_popup_container",
    "android:id/floating_toolbar",
    "android:id/floating_toolbar_main_panel",
    "android:id/floating_toolbar_overflow_panel",
    "android:id/floating_toolbar_content_container"
];

function includes(list, value) { return list.indexOf(value) !== -1; }
function finite(value) { return typeof value === "number" && isFinite(value); }
function integer(value) { return finite(value) && Math.floor(value) === value; }
function publicCode(value) { return typeof value === "string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(value) ? value : null; }
function stop(code) { var error = new Error(code); error.labCode = code; throw error; }
function rectValid(b) {
    return b && finite(b.left) && finite(b.top) && finite(b.right) && finite(b.bottom) && b.right > b.left && b.bottom > b.top;
}
function rectCopy(b) { return {left: b.left, top: b.top, right: b.right, bottom: b.bottom}; }
function inside(inner, outer) {
    return rectValid(inner) && rectValid(outer) && inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
}
function intersection(a, b) {
    if (!rectValid(a) || !rectValid(b)) { return 0; }
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}
function area(b) { return (b.right - b.left) * (b.bottom - b.top); }
function pathPrefix(prefix, path) {
    var i;
    if (!Array.isArray(prefix) || !Array.isArray(path) || prefix.length >= path.length) { return false; }
    for (i = 0; i < prefix.length; i += 1) { if (prefix[i] !== path[i]) { return false; } }
    return true;
}
function labelMatches(node, labels) {
    return includes(labels, node.text) || includes(labels, node.desc);
}
function listOption(value, fallback) {
    var result = typeof value === "undefined" ? fallback : value;
    if (!Array.isArray(result) || result.length === 0 || result.length > 32 || result.some(function (item) {
        return typeof item !== "string" || item.length === 0 || item.length > 512;
    })) { stop("INVALID_REQUEST"); }
    return result.slice();
}
function idOption(value, packageName) {
    if (typeof value === "undefined") { return []; }
    if (!Array.isArray(value) || value.length > 32 || value.some(function (id) {
        return typeof id !== "string" || id.length > 512 || id.indexOf(packageName + ":id/") !== 0;
    })) { stop("INVALID_CONTROL_IDS"); }
    return value.slice();
}
function normalize(request, forInspect) {
    var r = request || {};
    var target = r.targetPackage || "com.google.android.googlequicksearchbox";
    var result = {
        requestId: r.requestId,
        expectedText: r.expectedText,
        sourcePackage: r.sourcePackage || "com.openai.chatgpt",
        targetPackage: target,
        mode: r.mode || "probe",
        timeoutMs: typeof r.timeoutMs === "undefined" ? 8000 : r.timeoutMs,
        pollMs: typeof r.pollMs === "undefined" ? 200 : r.pollMs,
        moreLabels: listOption(r.moreLabels, ["옵션 더보기", "더보기", "더 보기", "More", "More options", "⋯", "…"]),
        menuLabels: listOption(r.menuLabels, ["Gemini로 보내기", "Gemini에게 물어보기", "Send to Gemini", "Ask Gemini"]),
        sendLabels: listOption(r.sendLabels, ["보내기", "전송", "Send", "Submit"]),
        stopLabels: listOption(r.stopLabels, ["응답 중지", "생성 중지", "Stop response", "Stop generating"]),
        targetInputIds: listOption(r.targetInputIds, [DEFAULT_INPUT_ID]),
        targetTitleLabels: listOption(r.targetTitleLabels, ["Gemini"]),
        targetSendIds: idOption(r.targetSendIds, target),
        targetStopIds: idOption(r.targetStopIds, target),
        gestureSelection: r.gestureSelection || null,
        requestFingerprint: r.requestFingerprint
    };
    if (!forInspect && (typeof result.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(result.requestId))) { stop("INVALID_REQUEST_ID"); }
    if (!includes(MODES, result.mode)) { stop("INVALID_REQUEST"); }
    if (typeof result.expectedText === "undefined" && (forInspect || result.mode === "probe")) { result.expectedText = ""; }
    if (typeof result.expectedText !== "string" || result.expectedText.length > 100000 || (!(forInspect || result.mode === "probe") && result.expectedText.length === 0)) { stop("INVALID_EXPECTED_TEXT"); }
    if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(result.sourcePackage) ||
        !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(result.targetPackage) || result.sourcePackage === result.targetPackage) { stop("INVALID_PACKAGES"); }
    if (!integer(result.timeoutMs) || result.timeoutMs < 100 || result.timeoutMs > 60000 ||
        !integer(result.pollMs) || result.pollMs < 20 || result.pollMs > 1000 || result.pollMs > result.timeoutMs) { stop("INVALID_TIMING"); }
    if (typeof result.requestFingerprint !== "undefined" && !/^[a-f0-9]{64}$/.test(result.requestFingerprint)) { stop("INVALID_REQUEST_FINGERPRINT"); }
    if (result.targetInputIds.some(function (id) { return id.indexOf(target + ":id/") !== 0; })) { stop("INVALID_TARGET_INPUT_ID"); }
    return result;
}
function validateSnapshot(snapshot) {
    var display = snapshot && snapshot.display;
    var seen = {};
    if (!snapshot || !Array.isArray(snapshot.windows) || !finite(snapshot.observedAt) ||
        !display || !finite(display.width) || !finite(display.height) || display.width <= 0 || display.height <= 0 || !integer(display.rotation) ||
        (typeof display.id !== "undefined" && !integer(display.id))) { stop("INVALID_SNAPSHOT"); }
    snapshot.windows.forEach(function (w) {
        var key;
        if (!w || !integer(w.id) || !integer(w.displayId) || !integer(w.type) || !finite(w.layer) || !Array.isArray(w.nodes)) { stop("INVALID_SNAPSHOT"); }
        key = w.displayId + ":" + w.id;
        if (seen[key]) { stop("DUPLICATE_WINDOW_ID"); }
        seen[key] = true;
    });
}
function byId(snapshot, id, displayId) {
    var items = snapshot.windows.filter(function (w) { return w.id === id && w.displayId === displayId; });
    return items.length === 1 ? items[0] : null;
}
function ownedWindow(snapshot, candidate, source) {
    var current = candidate;
    var visited = {};
    var count = 0;
    if (candidate.displayId !== source.displayId) { return false; }
    while (current && count < 16) {
        if (current.id === source.id) { return true; }
        if (visited[current.id] || !integer(current.parentId)) { return false; }
        visited[current.id] = true;
        current = byId(snapshot, current.parentId, source.displayId);
        count += 1;
    }
    return false;
}
function usableNode(node, window) {
    return node && node.windowId === window.id && node.visible === true && node.enabled === true &&
        typeof node.key === "string" && Array.isArray(node.path) && inside(node.bounds, window.bounds);
}
function appNodes(window, packageName) {
    return window.nodes.filter(function (node) { return usableNode(node, window) && node.packageName === packageName; });
}
function findPair(request, snapshot, binding) {
    var sources;
    var targets;
    var pair;
    var screen = {left: 0, top: 0, right: snapshot.display.width, bottom: snapshot.display.height};
    function rootsFor(pkg) {
        return snapshot.windows.filter(function (w) {
            var parent = integer(w.parentId) ? byId(snapshot, w.parentId, w.displayId) : null;
            return w.type === 1 && w.packageName === pkg && !(parent && parent.packageName === pkg);
        });
    }
    sources = rootsFor(request.sourcePackage);
    targets = rootsFor(request.targetPackage);
    if (sources.length !== 1) { stop(sources.length ? "SOURCE_WINDOW_AMBIGUOUS" : "SOURCE_WINDOW_MISSING"); }
    if (targets.length !== 1) { stop(targets.length ? "TARGET_WINDOW_AMBIGUOUS" : "TARGET_WINDOW_MISSING"); }
    pair = {source: sources[0], target: targets[0]};
    if (pair.source.displayId !== pair.target.displayId) { stop("DIFFERENT_DISPLAYS"); }
    if (integer(snapshot.display.id) && pair.source.displayId !== snapshot.display.id) { stop("WRONG_DISPLAY"); }
    if (!inside(pair.source.bounds, screen) || !inside(pair.target.bounds, screen)) { stop("WINDOW_OUTSIDE_DISPLAY"); }
    if (pair.source.bounds.right > pair.target.bounds.left ||
        Math.min(pair.source.bounds.bottom, pair.target.bounds.bottom) <= Math.max(pair.source.bounds.top, pair.target.bounds.top)) { stop("NOT_LEFT_RIGHT_SPLIT"); }
    if (appNodes(pair.source, request.sourcePackage).length === 0 || appNodes(pair.target, request.targetPackage).length === 0) { stop("WINDOW_CONTENT_UNAVAILABLE"); }
    if (binding && (binding.sourceId !== pair.source.id || binding.targetId !== pair.target.id ||
        binding.displayId !== pair.source.displayId || binding.width !== snapshot.display.width ||
        binding.height !== snapshot.display.height || binding.rotation !== snapshot.display.rotation)) { stop("SPLIT_IDENTITY_CHANGED"); }
    [pair.source, pair.target].forEach(function (w) {
        if (snapshot.windows.some(function (other) {
            return other.id !== w.id && other.displayId === w.displayId && other.layer > w.layer &&
                rectValid(other.bounds) && !ownedWindow(snapshot, other, w) && intersection(other.bounds, w.bounds) >= area(w.bounds) * 0.95;
        })) { stop("WINDOW_OCCLUDED"); }
    });
    return pair;
}
function sourceMatch(request, pair) {
    var matches = [];
    var ambiguous = false;
    if (!request.expectedText) { return null; }
    appNodes(pair.source, request.sourcePackage).forEach(function (node) {
        var start;
        if (node.editable === true || typeof node.text !== "string") { return; }
        start = node.text.indexOf(request.expectedText);
        if (start === -1) { return; }
        if (node.text.indexOf(request.expectedText, start + 1) !== -1) { ambiguous = true; }
        matches.push({node: node, window: pair.source, start: start, end: start + request.expectedText.length});
    });
    if (ambiguous || matches.length > 1) { stop("SOURCE_TEXT_AMBIGUOUS"); }
    return matches.length ? matches[0] : null;
}
function exactSelection(match) {
    return match && match.node.selectionStart === match.start && match.node.selectionEnd === match.end;
}
function hasToolbarAncestor(node, window) {
    return window.nodes.some(function (ancestor) {
        return ancestor.windowId === window.id && includes(TOOLBAR_CONTAINERS, ancestor.viewId) && pathPrefix(ancestor.path, node.path);
    });
}
function toolbarNodes(request, snapshot, pair, role) {
    var result = [];
    snapshot.windows.forEach(function (w) {
        if (!ownedWindow(snapshot, w, pair.source) || !includes([request.sourcePackage, "android", "com.android.systemui"], w.packageName)) { return; }
        w.nodes.forEach(function (node) {
            var trusted;
            if (!usableNode(node, w) || !includes([request.sourcePackage, "android", "com.android.systemui"], node.packageName)) { return; }
            if (role === "more") {
                trusted = (node.viewId === "android:id/overflow" && hasToolbarAncestor(node, w)) ||
                    node.viewId === "android:id/floating_toolbar_overflow_button";
                if (trusted && labelMatches(node, request.moreLabels)) { result.push({node: node, window: w}); }
            } else {
                trusted = node.viewId === "android:id/floating_toolbar_menu_item_text" || hasToolbarAncestor(node, w);
                if (trusted && labelMatches(node, request.menuLabels)) { result.push({node: node, window: w}); }
            }
        });
    });
    if (result.length > 1) { stop(role === "more" ? "MORE_CONTROL_AMBIGUOUS" : "GEMINI_MENU_AMBIGUOUS"); }
    return result;
}
function targetSurface(request, pair, allowMissing) {
    var nodes = appNodes(pair.target, request.targetPackage);
    var titles = nodes.filter(function (node) { return !node.editable && includes(request.targetTitleLabels, node.text); });
    var editors = nodes.filter(function (node) { return node.editable === true && includes(request.targetInputIds, node.viewId); });
    if (editors.length > 1) { stop("TARGET_EDITOR_AMBIGUOUS"); }
    if (titles.length === 0 || editors.length === 0) {
        if (allowMissing) { return null; }
        stop("GEMINI_SURFACE_UNVERIFIED");
    }
    return {draft: editors[0], title: titles[0], window: pair.target};
}
function buttonFor(label, window, packageName, ids) {
    var candidates = window.nodes.filter(function (node) {
        return usableNode(node, window) && node.packageName === packageName && !node.editable &&
            (node.key === label.key || pathPrefix(node.path, label.path)) && inside(label.bounds, node.bounds) &&
            (/(?:^|\.)[A-Za-z0-9_]*Button$/.test(node.className || "") || includes(ids, node.viewId)) &&
            (node.clickable === true || (Array.isArray(node.actions) && includes(node.actions, 16)));
    });
    candidates.sort(function (a, b) { return b.path.length - a.path.length; });
    return candidates.length ? candidates[0] : null;
}
function controls(request, pair, labels, ids) {
    var found = [];
    var seen = {};
    appNodes(pair.target, request.targetPackage).forEach(function (label) {
        var button;
        var key;
        if (label.editable || !labelMatches(label, labels)) { return; }
        button = buttonFor(label, pair.target, request.targetPackage, ids || []);
        if (!button) { return; }
        key = button.path.join(".");
        if (!seen[key]) {
            seen[key] = true;
            found.push({node: button, window: pair.target, labelNode: label});
        }
    });
    return found;
}
function evidence(request, pair) {
    var nodes = appNodes(pair.target, request.targetPackage);
    return {
        messages: nodes.filter(function (node) { return !node.editable && node.text === request.expectedText; }).length,
        stops: controls(request, pair, request.stopLabels, request.targetStopIds).length
    };
}
function newEvidence(before, after) { return after.messages > before.messages || after.stops > before.stops; }
function notCovered(snapshot, target) {
    if (snapshot.windows.some(function (w) {
        return w.id !== target.window.id && w.displayId === target.window.displayId && w.layer > target.window.layer && intersection(w.bounds, target.node.bounds) > 0;
    })) { stop("CONTROL_OCCLUDED"); }
}
function metadata(target) {
    var node = target.node;
    return {key: node.key, windowId: node.windowId, viewId: node.viewId || "", className: node.className || "", bounds: rectCopy(node.bounds), clickable: node.clickable === true, editable: node.editable === true};
}
function inspect(request, snapshot) {
    var report = {schema: "jebiseo.autojs6.probe.v1", supported: false, code: "INVALID_REQUEST", windows: []};
    var r;
    var pair;
    var match;
    var surface;
    try {
        r = normalize(request, true);
        validateSnapshot(snapshot);
        report.display = {width: snapshot.display.width, height: snapshot.display.height, rotation: snapshot.display.rotation};
        report.windows = snapshot.windows.map(function (w) {
            return {id: w.id, displayId: w.displayId, type: w.type, packageName: w.packageName || "", parentId: integer(w.parentId) ? w.parentId : null,
                bounds: rectValid(w.bounds) ? rectCopy(w.bounds) : null, active: w.active === true, focused: w.focused === true};
        });
        pair = findPair(r, snapshot, null);
        match = sourceMatch(r, pair);
        surface = targetSurface(r, pair, true);
        report.sourceTextFound = !!match;
        report.exactSelection = exactSelection(match) === true;
        report.selectionApi = !!match && Array.isArray(match.node.actions) && includes(match.node.actions, SET_SELECTION);
        report.geminiSurfaceVerified = !!surface;
        report.targetDraftEmpty = !!surface && surface.draft.text === "";
        report.more = toolbarNodes(r, snapshot, pair, "more").map(metadata);
        report.geminiMenu = toolbarNodes(r, snapshot, pair, "menu").map(metadata);
        report.sendControls = controls(r, pair, r.sendLabels, r.targetSendIds).map(metadata);
        report.supported = !!surface;
        report.code = surface ? "SPLIT_PROBE_OK" : "GEMINI_SURFACE_UNVERIFIED";
    } catch (error) { report.code = error.labCode || "PROBE_FAILED"; }
    return report;
}
function resultBase(requestId) {
    return {schema: RESULT_SCHEMA, requestId: typeof requestId === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(requestId) ? requestId : "", status: "blocked", stage: "VALIDATE", code: "INVALID_REQUEST", trace: [],
        handoffDispatched: false, handoffObserved: false, submissionDispatched: false, submissionObserved: false, liveDeviceVerified: false};
}
function savedResult(record, requestId) {
    var old = record && record.result;
    var result;
    if (!old || old.schema !== RESULT_SCHEMA || old.requestId !== requestId || !includes(TERMINAL, old.status) ||
        !/^[A-Z_]+$/.test(old.stage) || !/^[A-Z_]+$/.test(old.code)) { return null; }
    result = resultBase(requestId);
    result.status = old.status;
    result.stage = old.stage;
    result.code = old.code;
    result.trace = Array.isArray(old.trace) ? old.trace.filter(function (entry) {
        return entry && /^[A-Z_]+$/.test(entry.stage) && /^[a-z_]+$/.test(entry.status) && finite(entry.at);
    }).map(function (entry) { return {stage: entry.stage, status: entry.status, at: entry.at}; }) : [];
    result.handoffDispatched = old.handoffDispatched === true;
    result.handoffObserved = old.handoffObserved === true;
    result.submissionDispatched = old.submissionDispatched === true;
    result.submissionObserved = old.submissionObserved === true;
    result.liveDeviceVerified = old.liveDeviceVerified === true;
    result.reusedReceipt = true;
    return result;
}

function run(request, io, journal) {
    var result = resultBase(request && request.requestId);
    var r;
    var claimed = false;
    var startedAt = 0;
    var binding = null;
    var handoffIntent = false;
    var submitIntent = false;
    var persistFailed = false;
    var lastObservedAt = -Infinity;

    function now() {
        var value = io.now();
        if (!finite(value)) { stop("CLOCK_UNAVAILABLE"); }
        return value;
    }
    function cancelled() { if (io.cancelled && io.cancelled() === true) { stop("CANCELLED"); } }
    function record(status, terminal) {
        var value = {
            schema: JOURNAL_SCHEMA, requestId: r.requestId, mode: r.mode, sourcePackage: r.sourcePackage, targetPackage: r.targetPackage,
            status: status, stage: result.stage, trace: result.trace.slice(), startedAt: startedAt, updatedAt: now(),
            handoffDispatched: result.handoffDispatched, handoffObserved: result.handoffObserved,
            submissionDispatched: result.submissionDispatched, submissionObserved: result.submissionObserved
        };
        if (r.requestFingerprint) { value.requestFingerprint = r.requestFingerprint; }
        if (terminal) { value.result = result; }
        return value;
    }
    function persist(status, terminal) {
        if (!claimed) { return; }
        try {
            if (journal.put(r.requestId, record(status, terminal)) === false) { throw new Error("not saved"); }
        } catch (error) { persistFailed = true; stop("JOURNAL_WRITE_FAILED"); }
    }
    function currentStatus() { return submitIntent ? "submit_intent" : (handoffIntent && !result.handoffObserved ? "handoff_intent" : "running"); }
    function trace(status) { result.trace.push({stage: result.stage, status: status, at: now()}); }
    function stage(name) { result.stage = name; trace("started"); persist(currentStatus(), false); }
    function verified() { trace("verified"); persist(currentStatus(), false); }
    function readSnapshot() {
        var snapshot;
        var timestamp;
        cancelled();
        snapshot = io.read();
        validateSnapshot(snapshot);
        timestamp = now();
        if (snapshot.observedAt < lastObservedAt || snapshot.observedAt > timestamp + 100 || timestamp - snapshot.observedAt > Math.max(1000, r.pollMs * 4)) { stop("STALE_SNAPSHOT"); }
        lastObservedAt = snapshot.observedAt;
        return snapshot;
    }
    function read() {
        var snapshot = readSnapshot();
        return {snapshot: snapshot, pair: findPair(r, snapshot, binding)};
    }
    function waitFor(check, timeoutCode) {
        var deadline = now() + r.timeoutMs;
        var remaining = Math.ceil(r.timeoutMs / r.pollMs) + 2;
        var context;
        var value;
        while (remaining > 0) {
            cancelled();
            context = read();
            value = check(context);
            if (value) { return value; }
            if (now() >= deadline) { break; }
            io.sleep(Math.min(r.pollMs, Math.max(1, deadline - now())));
            remaining -= 1;
        }
        stop(timeoutCode);
    }
    function perform(kind, target, context, extra) {
        var action = {kind: kind, node: target.node, window: target.window};
        var outcome;
        cancelled();
        if (kind !== "set_selection") { notCovered(context.snapshot, target); }
        if (extra) { Object.keys(extra).forEach(function (key) { action[key] = extra[key]; }); }
        outcome = io.perform(action);
        if (!outcome || outcome.dispatched !== true) {
            stop((outcome && publicCode(outcome.reason)) || (kind === "click" ? "CLICK_NOT_DISPATCHED" : (kind === "set_selection" ? "SELECTION_NOT_DISPATCHED" : "GESTURE_NOT_DISPATCHED")));
        }
        trace("dispatched");
        return outcome;
    }
    function selected(context) {
        var match = sourceMatch(r, context.pair);
        if (!match) { stop("SOURCE_TEXT_MISSING"); }
        if (!exactSelection(match)) { stop("SELECTION_CHANGED"); }
        return match;
    }
    function finish(status, code) {
        result.status = status;
        result.code = code;
        result.liveDeviceVerified = io && io.liveDevice === true && status === "submission_observed" && result.submissionObserved;
        try { trace(status); } catch (ignoredClock) { /* Preserve the outcome even if the clock fails. */ }
        if (claimed && !persistFailed) {
            try { persist(status, true); }
            catch (ignoredJournal) {
                result.status = submitIntent || (handoffIntent && !result.handoffObserved) ? "completion_unknown" : "blocked";
                result.code = "JOURNAL_WRITE_FAILED";
                result.liveDeviceVerified = false;
                result.journalSaved = false;
            }
        } else if (persistFailed) { result.journalSaved = false; }
        return result;
    }

    try {
        var previous;
        var context;
        var match;
        var initialSurface;
        var preHandoffEvidence;
        var handoff;
        var send;
        var beforeSubmit;
        var priorResult;
        r = normalize(request, false);
        result.requestId = r.requestId;
        if (!io || typeof io.now !== "function" || typeof io.sleep !== "function" || typeof io.read !== "function" ||
            (r.mode !== "probe" && typeof io.perform !== "function")) { stop("INVALID_ADAPTER"); }
        startedAt = now();
        cancelled();
        if (r.mode === "probe") {
            stage("SPLIT");
            result.diagnostics = inspect(r, readSnapshot());
            return finish(result.diagnostics.supported ? "probe_ok" : "blocked", result.diagnostics.code);
        }
        if (!journal || typeof journal.get !== "function" || typeof journal.claim !== "function" || typeof journal.put !== "function") { stop("JOURNAL_UNAVAILABLE"); }
        try { previous = journal.get(r.requestId); }
        catch (journalReadError) { stop("JOURNAL_READ_FAILED"); }
        if (previous) {
            if (previous.schema !== JOURNAL_SCHEMA || previous.requestId !== r.requestId) { stop("JOURNAL_RECORD_INVALID"); }
            if (r.requestFingerprint && previous.requestFingerprint && r.requestFingerprint !== previous.requestFingerprint) { stop("REQUEST_ID_CONFLICT"); }
            if ((previous.mode && previous.mode !== r.mode) || (previous.sourcePackage && previous.sourcePackage !== r.sourcePackage) ||
                (previous.targetPackage && previous.targetPackage !== r.targetPackage)) { stop("REQUEST_ID_CONFLICT"); }
            if (r.requestFingerprint && previous.requestFingerprint === r.requestFingerprint) {
                priorResult = savedResult(previous, r.requestId);
                if (priorResult) { return priorResult; }
            }
            stop("REQUEST_ALREADY_RECORDED");
        }
        stage("SPLIT");
        context = read();
        binding = {sourceId: context.pair.source.id, targetId: context.pair.target.id, displayId: context.pair.source.displayId,
            width: context.snapshot.display.width, height: context.snapshot.display.height, rotation: context.snapshot.display.rotation};
        initialSurface = targetSurface(r, context.pair, false);
        match = sourceMatch(r, context.pair);
        if (!match) { stop("SOURCE_TEXT_MISSING"); }
        if ((r.mode === "handoff" || r.mode === "submit") && initialSurface.draft.text !== "") { stop("TARGET_DRAFT_NOT_EMPTY"); }
        if ((r.mode === "handoff" || r.mode === "submit") && evidence(r, context.pair).stops > 0) { stop("TARGET_BUSY"); }
        verified();
        try { claimed = journal.claim(r.requestId, record("running", false)) === true; }
        catch (claimError) { stop("JOURNAL_CLAIM_FAILED"); }
        if (!claimed) { stop("REQUEST_ALREADY_RECORDED"); }

        stage("SELECT");
        if (!exactSelection(match)) {
            if (r.gestureSelection) {
                perform("gesture_select", match, context, {gesture: r.gestureSelection});
            } else {
                perform("long_press", match, context, null);
                context = waitFor(function (item) {
                    var candidate = sourceMatch(r, item.pair);
                    if (!candidate) { return null; }
                    if ((integer(candidate.node.selectionStart) && candidate.node.selectionStart >= 0 && integer(candidate.node.selectionEnd) && candidate.node.selectionEnd > candidate.node.selectionStart) ||
                        toolbarNodes(r, item.snapshot, item.pair, "more").length === 1) { return item; }
                    return null;
                }, "SELECTION_MODE_NOT_OBSERVED");
                match = sourceMatch(r, context.pair);
                if (!exactSelection(match)) {
                    if (!Array.isArray(match.node.actions) || !includes(match.node.actions, SET_SELECTION)) { stop("SELECTION_API_UNAVAILABLE"); }
                    perform("set_selection", match, context, {start: match.start, end: match.end});
                }
            }
        }
        context = waitFor(function (item) {
            return exactSelection(sourceMatch(r, item.pair)) ? item : null;
        }, "EXACT_SELECTION_NOT_OBSERVED");
        verified();
        if (r.mode === "selection") { return finish("selection_verified", "EXACT_SELECTION_VERIFIED"); }

        stage("MORE");
        handoff = waitFor(function (item) {
            var selectedNode = selected(item);
            var items = toolbarNodes(r, item.snapshot, item.pair, "more");
            return items.length === 1 ? {context: item, target: items[0], selected: selectedNode} : null;
        }, "MORE_CONTROL_NOT_FOUND");
        perform("click", handoff.target, handoff.context, {guards: [handoff.selected.node]});

        stage("MENU");
        handoff = waitFor(function (item) {
            var selectedNode = selected(item);
            var items = toolbarNodes(r, item.snapshot, item.pair, "menu");
            return items.length === 1 ? {context: item, target: items[0], selected: selectedNode} : null;
        }, "GEMINI_MENU_NOT_FOUND");
        verified();
        initialSurface = targetSurface(r, handoff.context.pair, false);
        if (initialSurface.draft.text !== "") { stop("TARGET_DRAFT_CHANGED"); }
        preHandoffEvidence = evidence(r, handoff.context.pair);
        if (preHandoffEvidence.stops > 0) { stop("TARGET_BUSY"); }
        cancelled();
        persist("handoff_intent", false);
        handoffIntent = true;
        perform("click", handoff.target, handoff.context, {guards: [handoff.selected.node, initialSurface.draft, initialSurface.title]});
        result.handoffDispatched = true;
        persist("handoff_intent", false);

        stage("DRAFT");
        context = waitFor(function (item) {
            var surface = targetSurface(r, item.pair, true);
            if (newEvidence(preHandoffEvidence, evidence(r, item.pair))) { stop("MENU_MAY_HAVE_SUBMITTED"); }
            if (!surface) { return null; }
            if (surface.draft.text === r.expectedText) { return item; }
            if (surface.draft.text !== "") { stop("DRAFT_TEXT_MISMATCH"); }
            return null;
        }, "HANDOFF_DRAFT_NOT_OBSERVED");
        result.handoffObserved = true;
        verified();
        if (r.mode === "handoff") { return finish("handoff_verified", "HANDOFF_DRAFT_VERIFIED"); }

        stage("SUBMIT");
        send = waitFor(function (item) {
            var surface = targetSurface(r, item.pair, false);
            var items;
            if (surface.draft.text !== r.expectedText) { stop("DRAFT_CHANGED_BEFORE_SUBMIT"); }
            if (newEvidence(preHandoffEvidence, evidence(r, item.pair))) { stop("MENU_MAY_HAVE_SUBMITTED"); }
            items = controls(r, item.pair, r.sendLabels, r.targetSendIds);
            if (items.length > 1) { stop("SEND_CONTROL_AMBIGUOUS"); }
            return items.length === 1 ? {context: item, target: items[0], draft: surface.draft, title: surface.title} : null;
        }, "SEND_CONTROL_NOT_FOUND");
        beforeSubmit = evidence(r, send.context.pair);
        cancelled();
        persist("submit_intent", false);
        submitIntent = true;
        perform("click", send.target, send.context, {guards: [send.draft, send.title, send.target.labelNode]});
        result.submissionDispatched = true;
        persist("submit_intent", false);

        stage("VERIFY_SUBMIT");
        waitFor(function (item) {
            var surface = targetSurface(r, item.pair, true);
            return surface && surface.draft.text === "" && newEvidence(beforeSubmit, evidence(r, item.pair));
        }, "SUBMISSION_NOT_OBSERVED");
        result.submissionObserved = true;
        verified();
        return finish("submission_observed", "SUBMISSION_OBSERVED");
    } catch (error) {
        var code = error.labCode || publicCode(error.code) || "ADAPTER_FAILURE";
        var status = code === "CANCELLED" ? "cancelled" : "blocked";
        if (submitIntent || (handoffIntent && !result.handoffObserved) || code === "MENU_MAY_HAVE_SUBMITTED") { status = "completion_unknown"; }
        return finish(status, code);
    }
}

module.exports = {run: run, inspect: inspect};

};
factories["./autojs-adapter.js"] = function (exports, module, require) {
/*
 * AutoJs6 / Android accessibility adapter for the isolated split-screen lab.
 * ES5 + CommonJS: no Node dependencies, active-window fallback, clipboard, or network.
 * Sources checked at AutoJs6 b95b98b339c56ab12ba20b279d2b998eb6e2778c:
 *   sample/accessibility/smoke-legacy-api.js (auto.service)
 *   core/accessibility/AccessibilityService.kt (Android service subclass)
 *   res/xml-v30/accessibility_service_config.xml (interactive windows / view IDs)
 * Android AccessibilityWindowInfo / AccessibilityNodeInfo public APIs are used.
 */
'use strict';

var ACTION_CLICK = 16;
var ACTION_LONG_CLICK = 32;
var ACTION_SET_SELECTION = 131072;
var SELECTION_START = 'ACTION_ARGUMENT_SELECTION_START_INT';
var SELECTION_END = 'ACTION_ARGUMENT_SELECTION_END_INT';

function fail(code) {
    var error = new Error(code);
    error.code = code;
    throw error;
}

function method(object, name) {
    return object !== null && object !== undefined && typeof object[name] === 'function';
}

function string(value) {
    return value === null || value === undefined ? '' : String(value);
}

function finite(value) {
    return typeof value === 'number' && isFinite(value);
}

function integer(value) {
    return finite(value) && Math.floor(value) === value;
}

function rectValid(rect) {
    return !!rect && finite(rect.left) && finite(rect.top) && finite(rect.right) &&
        finite(rect.bottom) && rect.right > rect.left && rect.bottom > rect.top;
}

function sameRect(a, b) {
    return !!a && !!b && a.left === b.left && a.top === b.top &&
        a.right === b.right && a.bottom === b.bottom;
}

function contains(outer, inner) {
    return rectValid(outer) && rectValid(inner) && inner.left >= outer.left &&
        inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom;
}

function intersects(a, b) {
    return rectValid(a) && rectValid(b) && a.left < b.right && b.left < a.right &&
        a.top < b.bottom && b.top < a.bottom;
}

function containsPoint(rect, point) {
    return rectValid(rect) && !!point && finite(point.x) && finite(point.y) &&
        point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
}

function samePath(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.join('/') === b.join('/');
}

function asList(list) {
    var result = [];
    var count;
    var i;
    if (list === null || list === undefined) return result;
    if (Array.isArray(list)) return list.slice();
    if (!method(list, 'size') || !method(list, 'get')) fail('INVALID_JAVA_LIST');
    count = Number(list.size());
    if (!integer(count) || count < 0 || count > 100000) fail('INVALID_JAVA_LIST');
    for (i = 0; i < count; i += 1) result.push(list.get(i));
    return result;
}

function recycle(object) {
    if (method(object, 'recycle')) {
        try { object.recycle(); } catch (ignored) { /* Android 33+ pooling is removed. */ }
    }
}

function createAdapter(env, options) {
    options = options || {};
    if (!env || !env.auto || !env.android || !env.context) fail('ANDROID_ENVIRONMENT_REQUIRED');
    var maxWindows = options.maxWindows || 64;
    var maxNodes = options.maxNodes || 6000;
    var maxDepth = options.maxDepth || 80;
    var Rect = env.android.graphics.Rect;
    var Point = env.android.graphics.Point;
    var Bundle = env.android.os.Bundle;

    function now() {
        return Number(env.android.os.SystemClock.elapsedRealtime());
    }

    function cancelled() {
        try { return typeof options.cancelled === 'function' && options.cancelled() === true; }
        catch (ignored) { return true; }
    }

    function sleep(ms) {
        if (!integer(ms) || ms < 0 || ms > 60000) fail('INVALID_WAIT');
        if (cancelled()) fail('CANCELLED');
        env.sleep(ms);
    }

    function bounds(object) {
        var rect = new Rect();
        object.getBoundsInScreen(rect);
        return {left: Number(rect.left), top: Number(rect.top), right: Number(rect.right), bottom: Number(rect.bottom)};
    }

    function displayInfo() {
        var manager = env.context.getSystemService(env.context.WINDOW_SERVICE || 'window');
        if (!manager || !method(manager, 'getDefaultDisplay')) fail('DISPLAY_UNAVAILABLE');
        var display = manager.getDefaultDisplay();
        var size = new Point();
        display.getRealSize(size);
        var result = {
            id: Number(display.getDisplayId()), width: Number(size.x), height: Number(size.y),
            rotation: Number(display.getRotation())
        };
        if (!integer(result.id) || !(result.width > 0) || !(result.height > 0) ||
                !integer(result.rotation) || result.rotation < 0 || result.rotation > 3) fail('DISPLAY_UNAVAILABLE');
        return result;
    }

    function service() {
        // auto.service is an accessor returning the live Android AccessibilityService.
        // Never obtain rootInActiveWindow as a fallback: the other split pane would be lost.
        var current = env.auto.service;
        if (!current || !method(current, 'getWindows')) fail('ACCESSIBILITY_SERVICE_UNAVAILABLE');
        var info = current.getServiceInfo();
        if (!info || (Number(info.flags) & 64) === 0) fail('INTERACTIVE_WINDOWS_DISABLED');
        if ((Number(info.flags) & 16) === 0) fail('VIEW_IDS_DISABLED');
        return current;
    }

    function rawWindows(current) {
        var result = [];
        var grouped;
        var values;
        var i;
        var j;
        if (method(current, 'getWindowsOnAllDisplays')) {
            grouped = current.getWindowsOnAllDisplays();
            if (!grouped || !method(grouped, 'size') || !method(grouped, 'valueAt')) fail('WINDOWS_UNAVAILABLE');
            for (i = 0; i < Number(grouped.size()); i += 1) {
                values = asList(grouped.valueAt(i));
                for (j = 0; j < values.length; j += 1) result.push(values[j]);
            }
        } else {
            // Android <30 exposes interactive windows of the default display only.
            result = asList(current.getWindows());
        }
        if (result.length > maxWindows) {
            result.forEach(recycle);
            fail('WINDOW_LIMIT_EXCEEDED');
        }
        return result;
    }

    function nodeInfo(raw, window, path) {
        var actions = asList(raw.getActionList()).map(function (action) { return Number(action.getId()); });
        return {
            key: String(window.displayId) + ':' + String(window.id) + '/' + path.join('.'),
            windowId: Number(raw.getWindowId()), packageName: string(raw.getPackageName()), path: path.slice(),
            text: string(raw.getText()), desc: string(raw.getContentDescription()),
            viewId: string(raw.getViewIdResourceName()), className: string(raw.getClassName()),
            bounds: bounds(raw), visible: raw.isVisibleToUser() === true, enabled: raw.isEnabled() === true,
            clickable: raw.isClickable() === true, editable: raw.isEditable() === true,
            selectionStart: Number(raw.getTextSelectionStart()), selectionEnd: Number(raw.getTextSelectionEnd()),
            actions: actions
        };
    }

    function flatten(root, window, budget) {
        var result = [];
        var stack = [{raw: root, path: []}];
        var entry;
        var count;
        var child;
        var i;
        try {
            while (stack.length) {
                entry = stack.pop();
                try {
                    budget.count += 1;
                    if (budget.count > maxNodes || entry.path.length > maxDepth) fail('NODE_LIMIT_EXCEEDED');
                    result.push(nodeInfo(entry.raw, window, entry.path));
                    count = Number(entry.raw.getChildCount());
                    if (!integer(count) || count < 0 || count > maxNodes) fail('NODE_LIMIT_EXCEEDED');
                    for (i = count - 1; i >= 0; i -= 1) {
                        child = entry.raw.getChild(i);
                        if (child) stack.push({raw: child, path: entry.path.concat([i])});
                    }
                } finally { recycle(entry.raw); }
            }
        } finally {
            for (i = 0; i < stack.length; i += 1) recycle(stack[i].raw);
        }
        return result;
    }

    function windowInfo(raw, budget) {
        var parent = raw.getParent();
        var parentId = parent ? Number(parent.getId()) : null;
        recycle(parent);
        var result = {
            id: Number(raw.getId()),
            displayId: method(raw, 'getDisplayId') ? Number(raw.getDisplayId()) : 0,
            type: Number(raw.getType()), packageName: '', title: method(raw, 'getTitle') ? string(raw.getTitle()) : '',
            parentId: parentId, active: raw.isActive() === true, focused: raw.isFocused() === true,
            layer: Number(raw.getLayer()), bounds: bounds(raw), nodes: []
        };
        if (!integer(result.id) || !integer(result.displayId) || !integer(result.layer)) fail('INVALID_WINDOW_METADATA');
        var root = raw.getRoot();
        if (root) {
            result.packageName = string(root.getPackageName());
            result.nodes = flatten(root, result, budget);
        }
        return result;
    }

    function capture() {
        if (cancelled()) fail('CANCELLED');
        var current = service();
        var windows = rawWindows(current);
        var snapshot = {observedAt: now(), display: displayInfo(), windows: []};
        var budget = {count: 0};
        var seen = {};
        var i;
        var item;
        try {
            for (i = 0; i < windows.length; i += 1) {
                item = windowInfo(windows[i], budget);
                if (seen[item.displayId + ':' + item.id]) fail('WINDOW_ID_AMBIGUOUS');
                seen[item.displayId + ':' + item.id] = true;
                snapshot.windows.push(item);
            }
            snapshot.observedAt = now();
            return {snapshot: snapshot, windows: windows};
        } catch (error) {
            windows.forEach(recycle);
            throw error;
        }
    }

    function read() {
        var captured = capture();
        try { return captured.snapshot; }
        finally { captured.windows.forEach(recycle); }
    }

    function matchingWindow(snapshot, expected) {
        if (!expected || !integer(expected.id) || !integer(expected.displayId)) fail('INVALID_ACTION_WINDOW');
        var matches = snapshot.windows.filter(function (window) {
            return window.id === expected.id && window.displayId === expected.displayId;
        });
        if (matches.length !== 1) fail('WINDOW_CHANGED');
        var current = matches[0];
        if (current.packageName !== expected.packageName || current.type !== expected.type ||
                current.parentId !== expected.parentId || !sameRect(current.bounds, expected.bounds)) fail('WINDOW_CHANGED');
        return current;
    }

    function matchingNode(window, expected, selection) {
        if (!expected || !Array.isArray(expected.path)) fail('INVALID_ACTION_NODE');
        var matches = window.nodes.filter(function (node) { return samePath(node.path, expected.path); });
        if (matches.length !== 1) fail('NODE_CHANGED');
        var current = matches[0];
        verifyNode(current, expected, selection);
        return current;
    }

    function verifyNode(current, expected, selection) {
        if (!current || current.key !== expected.key || current.windowId !== expected.windowId ||
                current.packageName !== expected.packageName || current.text !== expected.text ||
                current.desc !== expected.desc || current.viewId !== expected.viewId ||
                current.className !== expected.className || current.editable !== expected.editable ||
                current.clickable !== expected.clickable || current.actions.join(',') !== expected.actions.join(',') ||
                !sameRect(current.bounds, expected.bounds) || !samePath(current.path, expected.path) ||
                (selection !== false && (current.selectionStart !== expected.selectionStart ||
                current.selectionEnd !== expected.selectionEnd))) fail('NODE_CHANGED');
        if (!current.visible || !current.enabled) fail('NODE_UNAVAILABLE');
    }

    function unobstructed(snapshot, window, rect, allowSelectionChild) {
        if (!contains(window.bounds, rect)) fail('TARGET_OUTSIDE_WINDOW');
        var covered = snapshot.windows.some(function (other) {
            // ACTION_SET_SELECTION addresses the source node directly; its own observed
            // framework selection toolbar may cover text. This exception never permits
            // coordinate actions through a popup or ignores an unrelated overlay.
            if (allowSelectionChild === true && other.parentId === window.id &&
                    other.nodes.some(function (node) { return node.viewId === 'android:id/floating_popup_container' ||
                        /^android:id\/floating_toolbar(?:_|$)/.test(node.viewId); })) return false;
            return other.displayId === window.displayId && other.id !== window.id &&
                other.layer > window.layer && intersects(other.bounds, rect);
        });
        if (covered) fail('TARGET_OCCLUDED');
    }

    function resolve(rawWindow, path) {
        var current = rawWindow.getRoot();
        var child;
        var i;
        try {
            for (i = 0; i < path.length; i += 1) {
                if (!current || !integer(path[i]) || path[i] < 0 || path[i] >= Number(current.getChildCount())) fail('NODE_CHANGED');
                child = current.getChild(path[i]);
                recycle(current);
                current = child;
            }
            if (!current || !method(current, 'refresh') || current.refresh() !== true) fail('NODE_STALE');
            return current;
        } catch (error) { recycle(current); throw error; }
    }

    function rawFor(captured, window) {
        var i;
        for (i = 0; i < captured.snapshot.windows.length; i += 1) {
            if (captured.snapshot.windows[i].id === window.id &&
                    captured.snapshot.windows[i].displayId === window.displayId) return captured.windows[i];
        }
        fail('WINDOW_CHANGED');
    }

    function verifyGuards(captured, guards, actionWindow) {
        var i;
        var guard;
        var candidates;
        var raw;
        for (i = 0; i < guards.length; i += 1) {
            guard = guards[i];
            candidates = captured.snapshot.windows.filter(function (window) {
                return window.id === guard.windowId && window.displayId === actionWindow.displayId;
            });
            if (candidates.length !== 1) fail('GUARD_WINDOW_CHANGED');
            matchingNode(candidates[0], guard, true);
            raw = resolve(rawFor(captured, candidates[0]), guard.path);
            try { verifyNode(nodeInfo(raw, candidates[0], guard.path), guard, true); }
            finally { recycle(raw); }
        }
    }

    function clickableTarget(captured, window, node) {
        var path = node.path.slice();
        var candidates;
        var candidate;
        while (true) {
            candidates = window.nodes.filter(function (other) { return samePath(other.path, path); });
            if (candidates.length !== 1) fail('NODE_CHANGED');
            candidate = candidates[0];
            if (candidate.windowId !== window.id || candidate.packageName !== node.packageName ||
                    !candidate.visible || !candidate.enabled || !contains(window.bounds, candidate.bounds) ||
                    !contains(candidate.bounds, node.bounds)) fail('CLICK_ANCESTOR_UNAVAILABLE');
            if (candidate.clickable || candidate.actions.indexOf(ACTION_CLICK) !== -1) {
                unobstructed(captured.snapshot, window, candidate.bounds);
                return candidate;
            }
            if (!path.length) fail('CLICK_ACTION_UNAVAILABLE');
            path.pop();
        }
    }

    function sameDisplay(a, b) {
        return !!a && !!b && a.width === b.width && a.height === b.height && a.rotation === b.rotation &&
            (a.id === undefined || b.id === undefined || a.id === b.id);
    }

    function gestureDisplay(snapshot, window) {
        if (window.displayId !== snapshot.display.id) fail('GESTURE_DISPLAY_UNSUPPORTED');
        var screen = {left: 0, top: 0, right: snapshot.display.width, bottom: snapshot.display.height};
        if (!contains(screen, window.bounds)) fail('GESTURE_WINDOW_OFFSCREEN');
    }

    function duration(value, minimum) {
        return integer(value) && value >= minimum && value <= 10000;
    }

    function pathBounds(from, to) {
        return {left: Math.min(from.x, to.x), top: Math.min(from.y, to.y),
            right: Math.max(from.x, to.x) + 1, bottom: Math.max(from.y, to.y) + 1};
    }

    function validateCalibration(gesture, captured, window, node) {
        if (!gesture || !sameDisplay(gesture.display, captured.snapshot.display) ||
                !sameRect(gesture.sourceBounds, window.bounds) || gesture.sourceText !== node.text ||
                !gesture.longPress || !containsPoint(node.bounds, gesture.longPress) ||
                !duration(gesture.longPress.durationMs, 500) || !Array.isArray(gesture.drags) ||
                gesture.drags.length < 1 || gesture.drags.length > 8) fail('GESTURE_CALIBRATION_REQUIRED');
        gestureDisplay(captured.snapshot, window);
        gesture.drags.forEach(function (drag) {
            if (!drag || !containsPoint(window.bounds, drag.from) || !containsPoint(window.bounds, drag.to) ||
                    !duration(drag.durationMs, 100)) fail('GESTURE_CALIBRATION_INVALID');
            unobstructed(captured.snapshot, window, pathBounds(drag.from, drag.to));
        });
        unobstructed(captured.snapshot, window, pathBounds(gesture.longPress, gesture.longPress));
    }

    function perform(action) {
        var captured = null;
        var raw = null;
        var originalRaw = null;
        var attempted = false;
        var anyDispatched = false;
        var current;
        var window;
        var target;
        var result;
        var bundle;
        var center;
        var gesture;
        var checked;
        var i;
        try {
            if (cancelled()) fail('CANCELLED');
            if (!action || ['click', 'long_press', 'set_selection', 'gesture_select'].indexOf(action.kind) === -1) fail('UNSUPPORTED_ACTION');
            captured = capture();
            window = matchingWindow(captured.snapshot, action.window);
            current = matchingNode(window, action.node, true);
            if (current.windowId !== window.id || current.packageName !== window.packageName) fail('NODE_OWNER_MISMATCH');
            unobstructed(captured.snapshot, window, current.bounds, action.kind === 'set_selection');
            verifyGuards(captured, action.guards || [], window);

            if (action.kind === 'gesture_select') {
                gesture = action.gesture;
                raw = resolve(rawFor(captured, window), current.path);
                verifyNode(nodeInfo(raw, window, current.path), current, true);
                validateCalibration(gesture, captured, window, current);
                if (typeof env.press !== 'function' || typeof env.swipe !== 'function') fail('GESTURE_API_UNAVAILABLE');
                if (cancelled()) fail('CANCELLED');
                attempted = true;
                result = env.press(gesture.longPress.x, gesture.longPress.y, gesture.longPress.durationMs);
                if (result !== true) return {dispatched: false, attempted: true, uncertain: true, reason: 'GESTURE_REJECTED'};
                anyDispatched = true;
                for (i = 0; i < gesture.drags.length; i += 1) {
                    if (cancelled()) fail('CANCELLED');
                    checked = read();
                    if (!sameDisplay(checked.display, gesture.display)) fail('GESTURE_LAYOUT_CHANGED');
                    target = matchingWindow(checked, window);
                    matchingNode(target, current, false);
                    gestureDisplay(checked, target);
                    unobstructed(checked, target, pathBounds(gesture.drags[i].from, gesture.drags[i].to));
                    result = env.swipe(gesture.drags[i].from.x, gesture.drags[i].from.y,
                        gesture.drags[i].to.x, gesture.drags[i].to.y, gesture.drags[i].durationMs);
                    if (result !== true) return {dispatched: false, attempted: true, uncertain: true, reason: 'GESTURE_REJECTED'};
                }
                return {dispatched: true, attempted: true};
            }

            target = action.kind === 'click' ? clickableTarget(captured, window, current) : current;
            raw = resolve(rawFor(captured, window), target.path);
            verifyNode(nodeInfo(raw, window, target.path), target, true);
            if (action.kind === 'click' && !samePath(target.path, current.path)) {
                // The label selected by the controller and its actionable ancestor are
                // separate nodes. Refreshing only the ancestor cannot prove the label
                // still denotes the requested menu item immediately before dispatch.
                originalRaw = resolve(rawFor(captured, window), current.path);
                verifyNode(nodeInfo(originalRaw, window, current.path), current, true);
            }
            if (cancelled()) fail('CANCELLED');

            if (action.kind === 'click') {
                attempted = true;
                result = raw.performAction(ACTION_CLICK);
            } else if (action.kind === 'set_selection') {
                if (current.actions.indexOf(ACTION_SET_SELECTION) === -1) fail('SELECTION_ACTION_UNAVAILABLE');
                if (!integer(action.start) || !integer(action.end) || action.start < 0 ||
                        action.end <= action.start || action.end > current.text.length) fail('INVALID_SELECTION_RANGE');
                bundle = new Bundle();
                bundle.putInt(SELECTION_START, action.start);
                bundle.putInt(SELECTION_END, action.end);
                attempted = true;
                result = raw.performAction(ACTION_SET_SELECTION, bundle);
            } else if (current.actions.indexOf(ACTION_LONG_CLICK) !== -1) {
                attempted = true;
                result = raw.performAction(ACTION_LONG_CLICK);
            } else {
                if (typeof env.press !== 'function') fail('LONG_PRESS_UNAVAILABLE');
                gestureDisplay(captured.snapshot, window);
                center = {x: Math.floor((current.bounds.left + current.bounds.right) / 2),
                    y: Math.floor((current.bounds.top + current.bounds.bottom) / 2)};
                unobstructed(captured.snapshot, window, pathBounds(center, center));
                attempted = true;
                result = env.press(center.x, center.y, 650);
            }
            return result === true ? {dispatched: true, attempted: true} :
                {dispatched: false, attempted: true, reason: 'ACTION_REJECTED'};
        } catch (error) {
            return {dispatched: false, attempted: attempted, uncertain: attempted || anyDispatched,
                reason: error && error.code ? error.code : (attempted ? 'ACTION_EXCEPTION' : 'ACCESSIBILITY_READ_FAILED')};
        } finally {
            recycle(originalRaw);
            recycle(raw);
            if (captured) captured.windows.forEach(recycle);
        }
    }

    return {now: now, sleep: sleep, read: read, perform: perform, cancelled: cancelled,
        liveDevice: options.liveDevice === true};
}

module.exports = {createAdapter: createAdapter};

};
factories["./journal.js"] = function (exports, module, require) {
'use strict';

// Backend must hold an exclusive process lock and durably replace one JSON file.
function createJournal(backend) {
    var state = backend.load();
    if (state === null) state = { schema: 'jebiseo.autojs6.store.v1', records: [] };
    if (!state || state.schema !== 'jebiseo.autojs6.store.v1' || !Array.isArray(state.records)) {
        throw new Error('JOURNAL_INVALID');
    }
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function index(id) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new Error('REQUEST_ID_INVALID');
        for (var i = 0; i < state.records.length; i++) if (state.records[i].requestId === id) return i;
        return -1;
    }
    function persist(next) {
        // Commit in memory only after durable storage succeeds.
        if (backend.saveAtomic(copy(next)) !== true) throw new Error('JOURNAL_WRITE_FAILED');
        state = next;
    }
    return {
        get: function (id) {
            var i = index(id);
            return i < 0 ? null : copy(state.records[i].record);
        },
        claim: function (id, record) {
            if (index(id) >= 0) return false;
            if (state.records.length >= 500) throw new Error('JOURNAL_CAPACITY_REACHED');
            var next = copy(state);
            next.records.push({ requestId: id, record: copy(record) });
            persist(next);
            return true;
        },
        put: function (id, record) {
            var i = index(id);
            if (i < 0) throw new Error('JOURNAL_CLAIM_REQUIRED');
            var next = copy(state);
            next.records[i].record = copy(record);
            persist(next);
        },
        unresolved: function () {
            return copy(state.records.filter(function (entry) {
                return ['running', 'handoff_intent', 'submit_intent', 'completion_unknown'].indexOf(entry.record.status) >= 0;
            }).map(function (entry) { return { requestId: entry.requestId, status: entry.record.status, stage: entry.record.stage }; }));
        }
    };
}
module.exports = { createJournal: createJournal };

};
factories["./main.js"] = function (exports, module, require) {
'use strict';

/* AutoJs6 entry. Start from its floating script button while the split is visible. */
var core = require('./core.js');
var adapter = require('./autojs-adapter.js');
var journals = require('./journal.js');

function runPhone(env) {
    var File = env.java.io.File;
    var root = new File(env.context.getFilesDir(), 'jebiseo-autojs6-lab');
    if (!root.exists() && !root.mkdirs()) throw new Error('PRIVATE_STORAGE_UNAVAILABLE');
    var lockFile = new env.java.io.RandomAccessFile(new File(root, 'run.lock'), 'rw');
    var lock = null;
    var keyObserverStarted = false;
    try {
        try { lock = lockFile.getChannel().tryLock(); } catch (busy) { lock = null; }
        if (lock === null) {
            env.dialogs.alert('제비서 독립 시험', '이미 시험이 실행 중입니다. 중복으로 실행하지 않습니다.');
            return null;
        }
        var sourcePath = String(env.engines.myEngine().source);
        var scriptDir = env.files.getParent(sourcePath);
        var profilePath = env.files.join(scriptDir, 'profile.json');
        if (!env.files.exists(profilePath)) profilePath = env.files.join(scriptDir, 'profile.example.json');
        var profile;
        if (env.files.exists(profilePath)) profile = JSON.parse(env.files.read(profilePath));
        else if (env.embeddedProfile) profile = JSON.parse(JSON.stringify(env.embeddedProfile));
        else throw new Error('PROFILE_MISSING');
        if (profile.schema !== 'jebiseo.autojs6.profile.v1') throw new Error('PROFILE_INVALID');
        var dataFile = new File(root, 'journal.json');
        function durableWrite(target, value) {
            var temporary = new File(root, target.getName() + '.new');
            var stream = new env.java.io.FileOutputStream(temporary);
            try {
                var encoded = new env.java.lang.String(JSON.stringify(value)).getBytes('UTF-8');
                stream.write(encoded);
                stream.getFD().sync();
            } finally { stream.close(); }
            if (!temporary.renameTo(target)) throw new Error('ATOMIC_RENAME_FAILED');
            // Android Os.fsync on the directory makes the rename durable as well.
            var directoryFd = env.android.system.Os.open(String(root.getAbsolutePath()), env.android.system.OsConstants.O_RDONLY | env.android.system.OsConstants.O_DIRECTORY, 0);
            try { env.android.system.Os.fsync(directoryFd); } finally { env.android.system.Os.close(directoryFd); }
            return true;
        }
        var journal = journals.createJournal({
            load: function () { return dataFile.exists() ? JSON.parse(env.files.read(String(dataFile.getAbsolutePath()))) : null; },
            saveAtomic: function (value) { return durableWrite(dataFile, value); }
        });
        var choice = env.dialogs.select('제비서 독립 시험\n시험 문장: ' + profile.testText, [
            '1. 읽기 전용 점검',
            '2. 글 선택까지만 시험',
            '3. ⋯ → Gemini 전달 시험 — 메뉴에 따라 즉시 전송 가능',
            '4. Gemini 전송까지 시험 — 위 문장 1회 전송'
        ]);
        if (choice < 0) return null;
        var mode = ['probe', 'selection', 'handoff', 'submit'][choice];
        if (!mode) throw new Error('MODE_INVALID');
        var unresolved = journal.unresolved();
        if (mode !== 'probe' && unresolved.length) {
            env.dialogs.alert('이전 시험 결과 확인 필요', '이전 실행의 결과가 미확인입니다. 먼저 읽기 전용 점검으로 현재 화면을 확인합니다.\n' + JSON.stringify(unresolved));
            return { status: 'blocked', code: 'PREVIOUS_ATTEMPT_UNRESOLVED' };
        }
        env.auto.waitFor();
        var cancelled = new env.java.util.concurrent.atomic.AtomicBoolean(false);
        try {
            keyObserverStarted = true;
            env.events.observeKey();
            env.events.onKeyDown('volume_down', function () { cancelled.set(true); });
        } catch (keyUnavailable) {
            // AutoJs6's own stop control still terminates the engine. Journal remains claimed.
        }
        env.toast('분할 화면을 유지하세요. 잠시 뒤 ' + mode + ' 시험을 시작합니다. 볼륨 아래 버튼은 중지입니다.');
        env.sleep(Math.min(10000, Math.max(2000, Number(profile.startDelayMs) || 3500)));
        var io = adapter.createAdapter(env, { liveDevice: true, cancelled: function () { return cancelled.get() === true; } });
        var request = {
            requestId: String(env.java.util.UUID.randomUUID().toString()),
            expectedText: profile.testText,
            sourcePackage: profile.sourcePackage,
            targetPackage: profile.targetPackage,
            targetInputIds: profile.targetInputIds,
            targetTitleLabels: profile.targetTitleLabels,
            targetSendIds: profile.targetSendIds,
            targetStopIds: profile.targetStopIds,
            mode: mode,
            timeoutMs: profile.timeoutMs,
            pollMs: profile.pollMs,
            moreLabels: profile.moreLabels,
            menuLabels: profile.menuLabels,
            sendLabels: profile.sendLabels,
            stopLabels: profile.stopLabels,
            gestureSelection: profile.gestureSelection
        };
        var requestBytes = new env.java.lang.String(JSON.stringify(request)).getBytes('UTF-8');
        var digestBytes = env.java.security.MessageDigest.getInstance('SHA-256').digest(requestBytes);
        var digestHex = '';
        for (var byteIndex = 0; byteIndex < digestBytes.length; byteIndex++) {
            digestHex += ('0' + (Number(digestBytes[byteIndex]) & 255).toString(16)).slice(-2);
        }
        request.requestFingerprint = digestHex;
        var result = core.run(request, io, journal);
        result.executionEnvironment = 'android-autojs6';
        result.jhIntegrated = false;
        result.recordedAt = new Date().toISOString();
        durableWrite(new File(root, 'last-result.json'), result);
        // No full UI dumps or selected text are written to the report.
        env.console.log(JSON.stringify(result, null, 2));
        env.dialogs.alert('제비서 독립 시험 결과', JSON.stringify(result, null, 2));
        return result;
    } finally {
        try {
            // observeKey keeps AutoJs6's looper alive. This is a dedicated runtime;
            // recycle removes this runtime's observer and clears waitWhenIdle.
            if (keyObserverStarted) env.events.recycle();
        } finally {
            try { if (lock !== null) lock.release(); }
            finally { lockFile.close(); }
        }
    }
}

module.exports = { runPhone: runPhone };

if (typeof context !== 'undefined' && typeof android !== 'undefined') {
    try {
        runPhone({
            auto: auto, android: android, java: java, context: context, device: device,
            files: files, engines: engines, dialogs: dialogs, events: events,
            sleep: sleep, press: press, swipe: swipe, gesture: gesture,
            toast: toast, console: console,
            embeddedProfile: typeof __JEBISEO_LAB_PROFILE === 'undefined' ? null : __JEBISEO_LAB_PROFILE
        });
    } catch (error) {
        // Avoid stringifying platform exceptions, which may contain UI text.
        var message = String(error && error.message || 'UNEXPECTED_ERROR');
        var code = /^[A-Z0-9_]{3,80}$/.test(message) ? message : 'PHONE_RUNTIME_ERROR';
        console.error(code);
        dialogs.alert('제비서 독립 시험 중단', code + '\n재전송하지 않고 현재 단계에서 중단했습니다.');
    }
}

};
require('./main.js');
}());
