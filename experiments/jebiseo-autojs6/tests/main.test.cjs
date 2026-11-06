'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {createJournal} = require('../journal.js');
const reports = require('../report.js');
const phoneLaunch = require('../phone-launch.js');
const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const profile = require('../profile.example.json');
const privateRoot = '/private/jebiseo-autojs6-lab';

function launcher(options = {}) {
    const storage = new Map(Object.entries(options.storage || {}));
    const calls = {permissions: 0, adapters: 0, runs: [], sleeps: [], alerts: [], toasts: [],
        clip: [], observe: 0, recycle: 0, released: 0, closed: 0};
    const choices = (options.choices || [-1]).slice();
    function File(parent, name) { this.path = name ? path.posix.join(String(parent), name) : String(parent); }
    File.prototype.toString = function () { return this.path; };
    File.prototype.exists = function () { return this.path === privateRoot || storage.has(this.path); };
    File.prototype.mkdirs = function () { return true; };
    File.prototype.getName = function () { return path.posix.basename(this.path); };
    File.prototype.length = function () { return Buffer.byteLength(storage.get(this.path) || ''); };
    File.prototype.getAbsolutePath = function () { return this.path; };
    File.prototype.renameTo = function (target) {
        assert.equal(path.posix.dirname(this.path), path.posix.dirname(String(target)), 'atomic rename stays on one filesystem');
        if (options.exportFailure && String(target).endsWith('RESULT_PHONE.json')) return false;
        storage.set(String(target), storage.get(this.path)); storage.delete(this.path); return true;
    };
    function JavaString(value) { this.value = String(value); }
    JavaString.prototype.getBytes = function () { return Buffer.from(this.value, 'utf8'); };
    const env = {
        context: {getFilesDir: () => '/private'},
        java: {
            io: {
                File,
                RandomAccessFile: function () {
                    this.getChannel = () => ({tryLock: () => ({release: () => calls.released++})});
                    this.close = () => calls.closed++;
                },
                FileOutputStream: function (file) {
                    this.write = bytes => storage.set(String(file), Buffer.from(bytes).toString('utf8'));
                    this.getFD = () => ({sync() {}});
                    this.close = () => {};
                }
            },
            lang: {String: JavaString},
            util: {UUID: {randomUUID: () => ({toString: () => 'launcher-test-id'})},
                concurrent: {atomic: {AtomicBoolean: function (value) {
                    this.get = () => value; this.set = next => {value = next;};
                }}}},
            security: {MessageDigest: {getInstance: () => ({digest: bytes => createHash('sha256').update(bytes).digest()})}}
        },
        android: {system: {Os: {open: () => 1, fsync() {}, close() {}}, OsConstants: {O_RDONLY: 0, O_DIRECTORY: 65536}}},
        files: {
            getParent: value => path.posix.dirname(value), join: (...values) => path.posix.join(...values),
            exists: value => storage.has(value), read: value => {
                assert.ok(storage.has(value), 'only an existing file can be read'); return storage.get(value);
            }
        },
        engines: {myEngine: () => ({source: '/scripts/jebiseo-independent-test.js'})},
        embeddedProfile: profile,
        dialogs: {select: () => choices.length ? choices.shift() : 2,
            alert: (title, content) => calls.alerts.push({title, content})},
        auto: {waitFor: () => calls.permissions++},
        events: {observeKey: () => {calls.observe++; if (options.keyFailure) throw new Error('unsupported');},
            onKeyDown() {}, recycle: () => calls.recycle++},
        toast: value => calls.toasts.push(value),
        sleep: value => calls.sleeps.push(value),
        console: {log() {}},
        setClip: value => {if (options.clipFailure) throw new Error('clipboard failed'); calls.clip.push(value);}
    };
    const module = {exports: {}};
    const core = {run: (request, io, journal) => {
        calls.runs.push({request, io, journal});
        if (options.coreFailure) throw new Error('TEST_RUNTIME_FAILURE');
        return {schema: 'jebiseo.autojs6.result.v1', requestId: request.requestId,
            status: request.mode === 'more' ? 'menu_verified' : 'probe_ok',
            stage: request.mode === 'more' ? 'MENU' : 'SPLIT',
            code: request.mode === 'more' ? 'GEMINI_MENU_VERIFIED' : 'SPLIT_PROBE_OK',
            liveDeviceVerified: false, handoffDispatched: false, handoffObserved: false,
            submissionDispatched: false, submissionObserved: false};
    }};
    vm.runInNewContext(source, {module, require: name => {
        if (name === './core.js') return core;
        if (name === './autojs-adapter.js') return {createAdapter: () => {calls.adapters++; return {};}};
        if (name === './journal.js') return {createJournal};
        if (name === './report.js') return reports;
        if (name === './phone-launch.js') return phoneLaunch;
        throw new Error('Unexpected module: ' + name);
    }});
    return {env, calls, storage, run: () => module.exports.runPhone(env)};
}

test('read-only phone entry remains available with an unreadable journal and never clears it', () => {
    const journalPath = privateRoot + '/journal.json';
    const lab = launcher({choices: [0, 2], storage: {[journalPath]: 'broken private journal'}});
    const result = lab.run();
    assert.equal(result.mode, 'probe');
    assert.equal(lab.calls.runs[0].journal, null);
    assert.deepEqual(lab.calls.sleeps, [10000]);
    assert.equal(lab.storage.get(journalPath), 'broken private journal');
    assert.equal(JSON.parse(lab.storage.get(privateRoot + '/last-result.json')).mode, 'probe');
    assert.equal(lab.calls.clip.length, 0, 'closing result never writes the clipboard');
    assert.equal(lab.calls.recycle, 1);
    assert.equal(lab.calls.released, 1);
    assert.equal(lab.calls.closed, 1);
});

test('third phone choice runs only more mode with a journal, preserving the controller boundary', () => {
    const lab = launcher({choices: [2, 2]});
    const result = lab.run();
    assert.equal(lab.calls.runs[0].request.mode, 'more');
    assert.equal(typeof lab.calls.runs[0].journal.claim, 'function');
    assert.equal(result.status, 'menu_verified');
    assert.equal(result.handoffDispatched, false);
    assert.equal(result.submissionDispatched, false);
    assert.deepEqual(lab.calls.sleeps, [3500]);
});

test('all effectful phone choices stop before permission or adapter access if an old handoff is unresolved', () => {
    const journalPath = privateRoot + '/journal.json';
    const previous = JSON.stringify({schema: 'jebiseo.autojs6.store.v1', records: [
        {requestId: 'old-attempt', record: {status: 'handoff_intent', stage: 'MENU'}}
    ]});
    for (const choice of [1, 2, 3, 4]) {
        const lab = launcher({choices: [choice, 2], storage: {[journalPath]: previous}});
        const result = lab.run();
        assert.equal(result.code, 'PREVIOUS_ATTEMPT_UNRESOLVED');
        assert.equal(lab.calls.permissions, 0);
        assert.equal(lab.calls.adapters, 0);
        assert.equal(lab.calls.runs.length, 0);
        assert.equal(lab.storage.get(journalPath), previous);
        assert.equal(result.unresolvedAttempts[0].requestId, 'old-attempt');
        assert.ok(lab.calls.alerts[0].content.includes('old-attempt'), 'the original unresolved attempt can be retrieved');
        assert.equal(lab.calls.released, 1);
    }
});

test('recent-result copy needs no accessibility permission and exports only the bounded report', () => {
    const result = {schema: 'jebiseo.autojs6.result.v1', mode: 'more', status: 'menu_verified',
        stage: 'MENU', code: 'GEMINI_MENU_VERIFIED', expectedText: 'PRIVATE_CONVERSATION',
        handoffDispatched: false, submissionDispatched: false, liveDeviceVerified: false};
    const saved = JSON.stringify(result);
    const lab = launcher({choices: [5, 0], storage: {[privateRoot + '/last-result.json']: saved}});
    lab.run();
    assert.equal(lab.calls.permissions, 0);
    assert.equal(lab.calls.adapters, 0);
    assert.equal(lab.calls.observe, 0);
    assert.equal(lab.calls.runs.length, 0);
    assert.equal(lab.calls.clip.length, 1);
    assert.ok(!lab.calls.clip[0].includes('PRIVATE_CONVERSATION'));
    assert.ok(lab.calls.clip[0].includes('GEMINI_MENU_VERIFIED'));
    assert.equal(lab.storage.get(privateRoot + '/last-result.json'), saved);
});

test('cancelling the test picker leaves phone and clipboard untouched and releases the lock', () => {
    const lab = launcher({choices: [-1]});
    assert.equal(lab.run(), null);
    assert.equal(lab.calls.permissions, 0);
    assert.equal(lab.calls.adapters, 0);
    assert.equal(lab.calls.clip.length, 0);
    assert.equal(lab.storage.size, 0);
    assert.equal(lab.calls.released, 1);
    assert.equal(lab.calls.closed, 1);
});

test('a failed clipboard export does not discard or relabel an observed test result', () => {
    const lab = launcher({choices: [2, 0], clipFailure: true});
    const result = lab.run();
    assert.equal(result.status, 'menu_verified');
    assert.equal(JSON.parse(lab.storage.get(privateRoot + '/last-result.json')).status, 'menu_verified');
    assert.ok(lab.calls.alerts.some(a => a.title === '시험 결과는 보존되어 있습니다'));
    assert.equal(lab.calls.released, 1);
});

test('key-listener failure gives the actual AutoJs6 stop fallback instead of promising volume cancellation', () => {
    const lab = launcher({choices: [2, 2], keyFailure: true});
    lab.run();
    assert.ok(lab.calls.toasts.some(value => value.includes('AutoJs6의 중지 버튼')));
    assert.ok(lab.calls.toasts.every(value => !value.includes('볼륨 아래 버튼은 중지')));
    assert.equal(lab.calls.recycle, 1);
});

test('USB launch skips phone picker, binds journal ID and exports a bounded current result', () => {
    const request = {schema: 'jebiseo.phone-launch.v1', launchId: 'pc-current-run-123', mode: 'more'};
    const lab = launcher({choices: [-1], storage: {'/scripts/launch-request.json': JSON.stringify(request)}});
    const result = lab.run();
    assert.equal(result.status, 'menu_verified');
    assert.equal(lab.calls.runs[0].request.requestId, request.launchId);
    assert.equal(lab.calls.alerts.length, 0, 'no result-copy interaction is needed');
    const exported = JSON.parse(lab.storage.get('/scripts/RESULT_PHONE.json'));
    assert.equal(exported.launchId, request.launchId);
    assert.equal(exported.mode, 'more');
    assert.equal(exported.status, 'menu_verified');
    assert.equal(exported.reportText.includes(profile.testText), false);
});

test('invalid USB request cannot fall back to a clicked phone choice or run', () => {
    const lab = launcher({choices: [4], storage: {'/scripts/launch-request.json': '{"mode":"submit"}'}});
    assert.throws(() => lab.run(), /LAUNCH_REQUEST_INVALID/);
    assert.equal(lab.calls.permissions, 0);
    assert.equal(lab.calls.runs.length, 0);
    assert.equal(lab.calls.released, 1);
});

test('USB mode ignores an old public profile and uses the reviewed bundled settings', () => {
    const request = {schema: 'jebiseo.phone-launch.v1', launchId: 'pc-current-run-123', mode: 'more'};
    const stale = {...profile, testText: 'UNREVIEWED_OLD_TEXT', sourcePackage: 'old.app'};
    const lab = launcher({storage: {'/scripts/launch-request.json': JSON.stringify(request), '/scripts/profile.json': JSON.stringify(stale)}});
    lab.run();
    assert.equal(lab.calls.runs[0].request.expectedText, profile.testText);
    assert.equal(lab.calls.runs[0].request.sourcePackage, profile.sourcePackage);
    assert.equal(JSON.parse(lab.storage.get('/scripts/profile.json')).testText, 'UNREVIEWED_OLD_TEXT');
});

test('public export failure preserves the observed result without replay or relabelling', () => {
    const request = {schema: 'jebiseo.phone-launch.v1', launchId: 'pc-current-run-123', mode: 'more'};
    const lab = launcher({exportFailure: true, storage: {'/scripts/launch-request.json': JSON.stringify(request)}});
    assert.equal(lab.run().status, 'menu_verified');
    assert.equal(lab.calls.runs.length, 1);
    assert.equal(JSON.parse(lab.storage.get(privateRoot + '/last-result.json')).status, 'menu_verified');
    assert.ok(lab.calls.alerts.some(a => a.title === '결과 파일 저장 확인 필요'));
});

test('unknown outbound runtime failure exports unknown to the same PC launch', () => {
    const request = {schema: 'jebiseo.phone-launch.v1', launchId: 'pc-current-run-123', mode: 'submit'};
    const lab = launcher({coreFailure: true, storage: {'/scripts/launch-request.json': JSON.stringify(request)}});
    assert.throws(() => lab.run(), /TEST_RUNTIME_FAILURE/);
    const result = JSON.parse(lab.storage.get('/scripts/RESULT_PHONE.json'));
    assert.equal(result.status, 'completion_unknown');
    assert.equal(result.launchId, request.launchId);
    assert.equal(lab.calls.runs.length, 1);
});
