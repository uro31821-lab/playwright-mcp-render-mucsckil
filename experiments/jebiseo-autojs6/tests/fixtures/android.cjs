'use strict';
const assert = require('node:assert/strict');
const {createAdapter} = require('../../autojs-adapter.js');

const SOURCE = 'com.openai.chatgpt';
const TARGET = 'com.google.android.googlequicksearchbox';
const box = (left, top, right, bottom) => ({left, top, right, bottom});

function fixture() {
    const state = {
        clock: 100, cancelled: false, flags: 80, actionLog: [], touchLog: [], allWindowReads: 0,
        display: {id: 0, width: 1000, height: 1000, rotation: 0}, refreshHook: null,
        actionResult: true, actionError: false, pressHook: null, windows: []
    };
    function node(extra = {}) {
        return Object.assign({text: '', desc: '', viewId: '', className: 'android.widget.TextView',
            bounds: box(0, 0, 500, 1000), visible: true, enabled: true, clickable: false,
            editable: false, selectionStart: -1, selectionEnd: -1, actions: [], children: []}, extra);
    }
    const sourceText = node({text: 'A😀B 시험 문장', viewId: 'test:source', bounds: box(20, 200, 480, 280),
        actions: [32, 131072]});
    const more = node({desc: 'More options', viewId: 'android:id/overflow', bounds: box(300, 100, 350, 150),
        actions: [16], clickable: true});
    const toolbar = node({viewId: 'android:id/floating_toolbar', className: 'android.widget.LinearLayout',
        bounds: box(100, 100, 350, 150), children: [more]});
    const draft = node({viewId: TARGET + ':id/assistant_robin_input_edit_text', text: sourceText.text,
        bounds: box(530, 800, 900, 880), editable: true, actions: [131072], selectionStart: 0,
        selectionEnd: sourceText.text.length});
    const send = node({desc: 'Send', viewId: 'test:send', className: 'android.widget.ImageButton', bounds: box(920, 800, 970, 850),
        actions: [16], clickable: true});
    const left = {id: 11, displayId: 0, type: 1, packageName: SOURCE, title: 'ChatGPT', parentId: null,
        bounds: box(0, 0, 500, 1000), active: false, focused: false, layer: 1,
        root: node({className: 'android.widget.FrameLayout', children: [sourceText, toolbar]})};
    const right = {id: 22, displayId: 0, type: 1, packageName: TARGET, title: 'Gemini', parentId: null,
        bounds: box(500, 0, 1000, 1000), active: true, focused: true, layer: 1,
        root: node({className: 'android.widget.FrameLayout', bounds: box(500, 0, 1000, 1000), children: [draft, send]})};
    state.windows = [left, right];
    class Rect { constructor() { this.left = this.top = this.right = this.bottom = 0; } }
    class Point { constructor() { this.x = this.y = 0; } }
    class Bundle { constructor() { this.values = {}; } putInt(k, v) { this.values[k] = v; } }
    function rawNode(window, model, path) {
        return {
            getWindowId: () => model.windowId === undefined ? window.id : model.windowId,
            getPackageName: () => model.packageName === undefined ? window.packageName : model.packageName,
            getText: () => model.text, getContentDescription: () => model.desc,
            getViewIdResourceName: () => model.viewId, getClassName: () => model.className,
            getBoundsInScreen: out => Object.assign(out, model.bounds),
            isVisibleToUser: () => model.visible, isEnabled: () => model.enabled,
            isClickable: () => model.clickable, isEditable: () => model.editable,
            getTextSelectionStart: () => model.selectionStart, getTextSelectionEnd: () => model.selectionEnd,
            getActionList: () => model.actions.map(id => ({getId: () => id})),
            getChildCount: () => model.children.length,
            getChild: i => model.children[i] ? rawNode(window, model.children[i], path.concat(i)) : null,
            refresh() {
                if (state.refreshHook) state.refreshHook({window, model, path});
                return model.stale !== true;
            },
            performAction(id, bundle) {
                state.actionLog.push({window: window.id, path: path.slice(), id,
                    values: bundle ? {...bundle.values} : null});
                if (state.actionError) throw new Error('private native error must not be logged');
                if (state.actionResult && id === 131072) {
                    model.selectionStart = bundle.values.ACTION_ARGUMENT_SELECTION_START_INT;
                    model.selectionEnd = bundle.values.ACTION_ARGUMENT_SELECTION_END_INT;
                }
                if (state.actionResult && state.actionHook) state.actionHook({window, model, path, id});
                return state.actionResult;
            },
            recycle() {}
        };
    }
    function rawWindow(model) {
        return {
            getId: () => model.id, getDisplayId: () => model.displayId, getType: () => model.type,
            getTitle: () => model.title,
            getParent: () => model.parentId === null ? null : ({getId: () => model.parentId, recycle() {}}),
            getBoundsInScreen: out => Object.assign(out, model.bounds),
            isActive: () => model.active, isFocused: () => model.focused, getLayer: () => model.layer,
            getRoot: () => model.root ? rawNode(model, model.root, []) : null, recycle() {}
        };
    }
    const service = {
        getServiceInfo: () => ({flags: state.flags}),
        getWindows() { throw new Error('default window getter should not replace all-display support'); },
        getWindowsOnAllDisplays() {
            state.allWindowReads += 1;
            if (state.readHook) state.readHook();
            const ids = [...new Set(state.windows.map(w => w.displayId))];
            const grouped = ids.map(id => state.windows.filter(w => w.displayId === id).map(rawWindow));
            return {size: () => grouped.length, valueAt: i => grouped[i]};
        }
    };
    const env = {
        auto: {service},
        android: {graphics: {Rect, Point}, os: {Bundle, SystemClock: {elapsedRealtime: () => state.clock}}},
        context: {WINDOW_SERVICE: 'window', getSystemService: () => ({getDefaultDisplay: () => ({
            getDisplayId: () => state.display.id, getRotation: () => state.display.rotation,
            getRealSize: p => Object.assign(p, {x: state.display.width, y: state.display.height})
        })})},
        sleep(ms) { state.clock += ms; },
        press(x, y, ms) { state.touchLog.push({kind: 'press', x, y, ms}); if (state.pressHook) state.pressHook(); return true; },
        swipe(x1, y1, x2, y2, ms) { state.touchLog.push({kind: 'swipe', x1, y1, x2, y2, ms}); return true; }
    };
    const io = createAdapter(env, {cancelled: () => state.cancelled});
    return {state, env, io, sourceText, more, toolbar, draft, send, left, right, node};
}

function target(snapshot, windowId, viewId) {
    const window = snapshot.windows.find(w => w.id === windowId);
    const node = window.nodes.find(n => n.viewId === viewId);
    assert.ok(node);
    return {window, node};
}

function calibration(lab, snapshot) {
    return {display: {...snapshot.display}, sourceBounds: {...lab.left.bounds},
        sourceText: lab.sourceText.text, longPress: {x: 100, y: 230, durationMs: 650},
        drags: [{from: {x: 100, y: 250}, to: {x: 250, y: 250}, durationMs: 300}]};
}


module.exports = {fixture, target, calibration, SOURCE, TARGET, box};
