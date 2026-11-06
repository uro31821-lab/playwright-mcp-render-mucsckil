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
