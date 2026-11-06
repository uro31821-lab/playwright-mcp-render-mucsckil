'use strict';

/* AutoJs6 entry. USB launch request or manual floating script button. */
var core = require('./core.js');
var adapter = require('./autojs-adapter.js');
var journals = require('./journal.js');
var reports = require('./report.js');
var phoneLaunch = require('./phone-launch.js');

function showResult(env, result, mode) {
    var options = { mode: mode || result.mode, includeDetails: false };
    env.dialogs.alert('제비서 독립 시험 결과', reports.formatResult(result, options));
    var action = env.dialogs.select('시험 결과 가져오기', [
        '결과 복사 — 이 대화에 붙여넣기',
        '상세 결과 보기',
        '닫기'
    ]);
    if (action === 0) {
        try {
            if (typeof env.setClip !== 'function') throw new Error('CLIPBOARD_UNAVAILABLE');
            env.setClip(reports.formatResult(result, { mode: mode || result.mode }));
            env.toast('이 대화 입력창에 시험 결과를 붙여넣어 주세요.');
        } catch (clipboardError) {
            env.dialogs.alert('시험 결과는 보존되어 있습니다', '결과 복사를 완료하지 못했습니다. 결과 화면을 캡처하거나 6번 최근 결과 보기로 다시 확인하세요.');
        }
    } else if (action === 1) {
        env.dialogs.alert('상세 결과', reports.formatResult(result, { mode: mode || result.mode }));
    }
}

function runPhone(env) {
    var File = env.java.io.File;
    var root = null;
    var lockFile = null;
    var lock = null;
    var keyObserverStarted = false;
    var keyCancelAvailable = false;
    var launchRequest = null;
    var mode = null;
    var coreStarted = false;
    var result = null;
    var exportResult = null;
    var startupStage = 'BOOTSTRAP';
    try {
        var sourcePath = String(env.engines.myEngine().source);
        // AutoJs6 6.8.0 files has no getParent/getDir API. Use java.io.File.
        var sourceFile = new File(sourcePath);
        if (!sourceFile.isAbsolute()) throw new Error('SCRIPT_PATH_NOT_ABSOLUTE');
        var parent = sourceFile.getParent();
        if (parent === null) throw new Error('SCRIPT_PARENT_MISSING');
        var scriptDir = String(parent);
        var requestPath = env.files.join(scriptDir, 'launch-request.json');
        if (env.files.exists(requestPath)) {
            if (Number(new File(requestPath).length()) > 2048) throw new Error('LAUNCH_REQUEST_INVALID');
            launchRequest = phoneLaunch.parseRequest(env.files.read(requestPath));
            mode = launchRequest.mode;
        }
        exportResult = function (value) {
            if (!launchRequest) return;
            // Temp file must share the PUBLIC destination directory, not private storage.
            var destination = new File(scriptDir, 'RESULT_PHONE.json');
            var temporary = new File(scriptDir, 'RESULT_PHONE.json.new');
            var stream = new env.java.io.FileOutputStream(temporary);
            try {
                stream.write(new env.java.lang.String(JSON.stringify(phoneLaunch.envelope(launchRequest, value))).getBytes('UTF-8'));
                stream.getFD().sync();
            } finally { stream.close(); }
            if (!temporary.renameTo(destination)) throw new Error('PHONE_REPORT_RENAME_FAILED');
        };
        // Prepare the trusted USB result channel before private storage/locking.
        // Failures below can now finish the current PC wait without rerunning.
        startupStage = 'STORAGE';
        root = new File(env.context.getFilesDir(), 'jebiseo-autojs6-lab');
        if (!root.exists() && !root.mkdirs()) throw new Error('PRIVATE_STORAGE_UNAVAILABLE');
        lockFile = new env.java.io.RandomAccessFile(new File(root, 'run.lock'), 'rw');
        try { lock = lockFile.getChannel().tryLock(); } catch (busy) { lock = null; }
        if (lock === null) {
            // Another engine may still be processing this same launch. Do not
            // overwrite its result with a misleading blocked/failed receipt.
            env.dialogs.alert('제비서 독립 시험', '이미 시험이 실행 중입니다. 중복으로 실행하지 않습니다.');
            return null;
        }
        startupStage = 'VALIDATE';
        var profilePath = env.files.join(scriptDir, 'profile.json');
        if (!env.files.exists(profilePath)) profilePath = env.files.join(scriptDir, 'profile.example.json');
        var profile;
        if (launchRequest && env.embeddedProfile) profile = JSON.parse(JSON.stringify(env.embeddedProfile));
        else if (launchRequest) throw new Error('EMBEDDED_PROFILE_REQUIRED');
        else if (env.files.exists(profilePath)) profile = JSON.parse(env.files.read(profilePath));
        else if (env.embeddedProfile) profile = JSON.parse(JSON.stringify(env.embeddedProfile));
        else throw new Error('PROFILE_MISSING');
        if (profile.schema !== 'jebiseo.autojs6.profile.v1') throw new Error('PROFILE_INVALID');
        var dataFile = new File(root, 'journal.json');
        var resultFile = new File(root, 'last-result.json');
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
        function finish(value) {
            value.mode = mode;
            value.executionEnvironment = 'android-autojs6';
            value.jhIntegrated = false;
            value.recordedAt = new Date().toISOString();
            var saveFailed = false;
            var exportFailed = false;
            try { durableWrite(resultFile, value); } catch (privateError) { saveFailed = true; }
            try { exportResult(value); } catch (publicError) { exportFailed = true; }
            if (launchRequest) {
                env.toast(exportFailed ? 'PC 결과 전달 실패. 현재 시험을 다시 실행하지 말고 화면을 확인하세요.' :
                    '시험 결과를 저장했습니다. PC 실행창을 확인하세요.');
            } else { showResult(env, value, mode); }
            if (saveFailed || exportFailed) {
                env.dialogs.alert('결과 파일 저장 확인 필요',
                    reports.formatResult(value, {mode: mode, includeDetails: false}) +
                    '\n파일 저장 일부를 확인하지 못했습니다. 시험을 자동 반복하지 않습니다.');
            }
            return value;
        }
        var choice = launchRequest ? ['probe', 'selection', 'more', 'handoff', 'submit'].indexOf(mode) :
            env.dialogs.select('제비서 독립 시험 0.3.1\n2~5번은 문장 선택 단계부터 시작합니다.\n시험 문장: ' + profile.testText, [
            '1. 화면·메뉴 읽기 — 버튼을 누르지 않음',
            '2. 시험 문장 선택까지만',
            '3. ⋯ 열고 Gemini 항목 확인까지만 — 전달 안 함',
            '4. 문장 선택부터 Gemini에 전달 — 메뉴가 즉시 전송할 수도 있음',
            '5. 문장 선택부터 Gemini 전송까지 — 시험 문장 1회 전송',
            '6. 최근 결과 보기·복사 — 화면 조작 없음'
        ]);
        if (choice < 0) return null;
        if (choice === 5) {
            if (!resultFile.exists()) {
                env.dialogs.alert('최근 결과 없음', '먼저 1번 화면·메뉴 읽기를 실행하세요.');
                return null;
            }
            var previousResult = JSON.parse(env.files.read(String(resultFile.getAbsolutePath())));
            showResult(env, previousResult, previousResult.mode);
            return previousResult;
        }
        mode = ['probe', 'selection', 'more', 'handoff', 'submit'][choice];
        if (!mode) throw new Error('MODE_INVALID');
        var journal = null;
        if (mode !== 'probe') {
            journal = journals.createJournal({
                load: function () { return dataFile.exists() ? JSON.parse(env.files.read(String(dataFile.getAbsolutePath()))) : null; },
                saveAtomic: function (value) { return durableWrite(dataFile, value); }
            });
            var unresolved = journal.unresolved();
            if (unresolved.length) {
                var blockedResult = { schema: 'jebiseo.autojs6.result.v1', mode: mode,
                    status: 'blocked', stage: 'VALIDATE', code: 'PREVIOUS_ATTEMPT_UNRESOLVED',
                    executionEnvironment: 'android-autojs6', jhIntegrated: false,
                    liveDeviceVerified: false, handoffDispatched: false, handoffObserved: false,
                    submissionDispatched: false, submissionObserved: false,
                    unresolvedAttempts: unresolved };
                return finish(blockedResult);
            }
        }
        startupStage = 'ACCESSIBILITY';
        env.auto.waitFor();
        var cancelled = new env.java.util.concurrent.atomic.AtomicBoolean(false);
        try {
            keyObserverStarted = true;
            env.events.observeKey();
            env.events.onKeyDown('volume_down', function () { cancelled.set(true); });
            keyCancelAvailable = true;
        } catch (keyUnavailable) {
            // AutoJs6's own stop control still terminates the engine. Journal remains claimed.
        }
        var delay = mode === 'probe' ? (Number(profile.probeDelayMs) || 10000) : (Number(profile.startDelayMs) || 3500);
        delay = Math.min(15000, Math.max(2000, delay));
        env.toast(mode === 'probe' ?
            Math.ceil(delay / 1000) + '초 뒤 현재 화면을 읽습니다. 메뉴를 보고 싶으면 그동안 직접 열어 두세요.' :
            Math.ceil(delay / 1000) + '초 뒤 선택한 시험을 시작합니다. ' +
                (keyCancelAvailable ? '볼륨 아래 버튼은 중지입니다.' : '중지는 AutoJs6의 중지 버튼을 사용하세요.'));
        env.sleep(delay);
        startupStage = 'ADAPTER';
        var io = adapter.createAdapter(env, { liveDevice: true, cancelled: function () { return cancelled.get() === true; } });
        var request = {
            // The same PC launch always uses the same journal key, including after a crash.
            requestId: launchRequest ? launchRequest.launchId : String(env.java.util.UUID.randomUUID().toString()),
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
        coreStarted = true;
        result = core.run(request, io, journal);
        // Only bounded menu-control labels and metadata, never conversations/drafts.
        env.console.log(JSON.stringify(result, null, 2));
        return finish(result);
    } catch (failure) {
        if (launchRequest && exportResult) {
            var message = String(failure && failure.message || 'PHONE_RUNTIME_ERROR');
            var failureCode = /^[A-Z0-9_]{3,80}$/.test(message) ? message : 'PHONE_RUNTIME_ERROR';
            // Before acquiring the lock we cannot rule out a different engine
            // already processing the same outbound launch.
            var unknown = (coreStarted || lock === null) && (mode === 'handoff' || mode === 'submit');
            var failed = result || {schema: 'jebiseo.autojs6.result.v1', requestId: launchRequest.launchId, mode: mode,
                status: unknown ? 'completion_unknown' : 'blocked', stage: coreStarted ? 'UNKNOWN' : startupStage, code: failureCode,
                executionEnvironment: 'android-autojs6', jhIntegrated: false, liveDeviceVerified: false};
            try { exportResult(failed); } catch (exportError) { /* PC must report missing current result as unknown. */ }
        }
        throw failure;
    } finally {
        try {
            // observeKey keeps AutoJs6's looper alive. This is a dedicated runtime;
            // recycle removes this runtime's observer and clears waitWhenIdle.
            if (keyObserverStarted) env.events.recycle();
        } finally {
            try { if (lock !== null) lock.release(); }
            finally { if (lockFile !== null) lockFile.close(); }
        }
    }
}

module.exports = { runPhone: runPhone, showResult: showResult };

if (typeof context !== 'undefined' && typeof android !== 'undefined') {
    try {
        runPhone({
            auto: auto, android: android, java: java, context: context, device: device,
            files: files, engines: engines, dialogs: dialogs, events: events,
            sleep: sleep, press: press, swipe: swipe, gesture: gesture,
            toast: toast, console: console, setClip: setClip,
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
