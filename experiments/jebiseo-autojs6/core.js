/* Standalone experiment. ES5/CommonJS: usable by AutoJs6 and offline Node tests. */
"use strict";

var RESULT_SCHEMA = "jebiseo.autojs6.result.v1";
var JOURNAL_SCHEMA = "jebiseo.autojs6.journal.v1";
var SET_SELECTION = 131072;
var SET_TEXT = 2097152;
var DEFAULT_INPUT_ID = "com.google.android.googlequicksearchbox:id/assistant_robin_input_collapsed_text_half_sheet";
var MODES = ["probe", "selection", "more", "handoff", "submit"];
var TERMINAL = ["selection_verified", "menu_verified", "handoff_verified", "submission_observed", "blocked", "cancelled", "completion_unknown"];
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
            if (!usableNode(node, w) || node.editable === true || !includes([request.sourcePackage, "android", "com.android.systemui"], node.packageName)) { return; }
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
function diagnoseTargetSurface(request, pair) {
    var report = {titleTextMatches: 0, titleDescriptionMatches: 0, configuredEditorMatches: 0,
        allEditableCount: 0, eligibleEditableCount: 0, emptyIdCandidateCount: 0,
        candidateEditorCount: 0, candidatesTruncated: false, eligibleEditorCandidates: []};
    function count(field) { if (report[field] < 6000) { report[field] += 1; } }
    pair.target.nodes.forEach(function (node) {
        var eligible;
        var hasSetText;
        var hasSetSelection;
        var viewId;
        var className;
        // This is structural observation only. Hidden/disabled candidates help
        // diagnose the strict surface gate but never become action selectors.
        if (!node || node.windowId !== pair.target.id || node.packageName !== request.targetPackage ||
            typeof node.key !== "string" || !node.key || !Array.isArray(node.path) ||
            node.path.some(function (part) { return !integer(part) || part < 0; }) ||
            typeof node.editable !== "boolean" || typeof node.visible !== "boolean" || typeof node.enabled !== "boolean" ||
            !inside(node.bounds, pair.target.bounds)) { return; }
        eligible = usableNode(node, pair.target);
        if (node.editable) {
            count("allEditableCount");
            if (eligible) { count("eligibleEditableCount"); }
            if (eligible && includes(request.targetInputIds, node.viewId)) { count("configuredEditorMatches"); }
        } else if (eligible) {
            if (includes(request.targetTitleLabels, node.text)) { count("titleTextMatches"); }
            if (includes(request.targetTitleLabels, node.desc)) { count("titleDescriptionMatches"); }
        }
        hasSetText = Array.isArray(node.actions) && includes(node.actions, SET_TEXT);
        hasSetSelection = Array.isArray(node.actions) && includes(node.actions, SET_SELECTION);
        className = typeof node.className === "string" ? node.className : "";
        if (!node.editable && !/(?:^|\.)[A-Za-z0-9_$]*EditText$/.test(className) && !hasSetText) { return; }
        count("candidateEditorCount");
        viewId = typeof node.viewId === "string" ? node.viewId : "";
        if (!viewId) { count("emptyIdCandidateCount"); }
        if (report.eligibleEditorCandidates.length >= 8) { report.candidatesTruncated = true; return; }
        report.eligibleEditorCandidates.push({windowId: node.windowId, viewId: viewId.slice(0, 512), className: className.slice(0, 256),
            bounds: rectCopy(node.bounds), editable: node.editable, enabled: node.enabled, visible: node.visible,
            matchesConfiguredId: includes(request.targetInputIds, node.viewId), hasSetTextAction: hasSetText, hasSetSelectionAction: hasSetSelection});
    });
    return report;
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
function diagnosticLabel(value, request) {
    if (typeof value !== "string" || (request.expectedText && value.indexOf(request.expectedText) !== -1)) { return ""; }
    return value.slice(0, 80);
}
function metadata(target, request) {
    var node = target.node;
    var label = target.labelNode || node;
    return {key: node.key, windowId: node.windowId, viewId: node.viewId || "", className: node.className || "", bounds: rectCopy(node.bounds),
        clickable: node.clickable === true, editable: node.editable === true,
        text: diagnosticLabel(label.text, request), description: diagnosticLabel(label.desc, request)};
}
function observedMenuControls(request, snapshot, pair, source) {
    var result = [];
    snapshot.windows.forEach(function (w) {
        if (result.length >= 16 || !ownedWindow(snapshot, w, pair.source) ||
            !includes([request.sourcePackage, "android", "com.android.systemui"], w.packageName)) { return; }
        w.nodes.forEach(function (node) {
            var more;
            var text;
            var description;
            // Observation is broader than execution only in label matching and
            // enabled state. Window ownership and framework toolbar identity
            // still apply; observing an unknown label never makes it actionable.
            if (result.length >= 16 || !node || node.windowId !== w.id || node.visible !== true || node.editable === true ||
                typeof node.key !== "string" || !Array.isArray(node.path) || !inside(node.bounds, w.bounds) ||
                !includes([request.sourcePackage, "android", "com.android.systemui"], node.packageName) ||
                includes(TOOLBAR_CONTAINERS, node.viewId) ||
                (source && source.node.key === node.key && source.window.id === w.id)) { return; }
            more = (node.viewId === "android:id/overflow" && hasToolbarAncestor(node, w)) ||
                node.viewId === "android:id/floating_toolbar_overflow_button";
            if (!more && node.viewId !== "android:id/floating_toolbar_menu_item_text" && !hasToolbarAncestor(node, w)) { return; }
            text = diagnosticLabel(node.text, request);
            description = diagnosticLabel(node.desc, request);
            if (!text && !description) { return; }
            result.push({role: more ? "more" : "menu_item", text: text, description: description,
                viewId: node.viewId || "", windowId: w.id, clickable: node.clickable === true, enabled: node.enabled === true});
        });
    });
    return result;
}
function inspect(request, snapshot) {
    var report = {schema: "jebiseo.autojs6.probe.v1", supported: false, code: "INVALID_REQUEST", windows: [], observedMenuControls: []};
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
        report.targetSurfaceDiagnostics = diagnoseTargetSurface(r, pair);
        match = sourceMatch(r, pair);
        surface = targetSurface(r, pair, true);
        report.sourceTextFound = !!match;
        report.exactSelection = exactSelection(match) === true;
        report.selectionApi = !!match && Array.isArray(match.node.actions) && includes(match.node.actions, SET_SELECTION);
        report.geminiSurfaceVerified = !!surface;
        report.targetDraftEmpty = !!surface && surface.draft.text === "";
        report.observedMenuControls = observedMenuControls(r, snapshot, pair, match);
        report.more = toolbarNodes(r, snapshot, pair, "more").map(function (target) { return metadata(target, r); });
        report.geminiMenu = toolbarNodes(r, snapshot, pair, "menu").map(function (target) { return metadata(target, r); });
        report.sendControls = controls(r, pair, r.sendLabels, r.targetSendIds).map(function (target) { return metadata(target, r); });
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
        if (r.mode === "more") {
            // Use the snapshot that already proved the owned Gemini item was
            // visible. Diagnostic support is informational, not a second action
            // gate, and no handoff intent or Gemini click is created here.
            result.diagnostics = inspect(r, handoff.context.snapshot);
            return finish("menu_verified", "GEMINI_MENU_VERIFIED");
        }
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
