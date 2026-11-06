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
