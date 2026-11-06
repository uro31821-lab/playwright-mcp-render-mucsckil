/* Executed by the pinned Rhino JVM, not Node or JavaScript Java-object mocks. */
(function () {
    'use strict';
    var jvm = Packages.java;
    var mockedOs = Packages.android.system.Os;
    var root = new jvm.io.File(String(__interopRoot));
    var env = {java: jvm};
    var cases = [];

    function check(value, message) {
        if (!value) throw new Error('RHINO_STORAGE_ASSERTION: ' + message);
    }
    // Direct JavaPackage convenience access was the previous failure boundary.
    // Production must use Class.forName + public typed reflection instead.
    Object.defineProperty(env, 'android', {get: function () {
        throw new Error('DIRECT_ANDROID_PACKAGE_ACCESS_FORBIDDEN');
    }});
    check(typeof module.exports.durableWrite === 'function', 'actual main.js must export durableWrite');
    check(root.mkdirs() || root.isDirectory(), 'temporary root creation');

    function runCase(name, expectedStage, expectedErrno) {
        var directory = new jvm.io.File(root, name);
        var target = new jvm.io.File(directory, 'result.json');
        var payload = {schema: 'rhino.storage.interop.v1', test: name, unicode: '\ud55c\uae00 \ud83d\ude42'};
        var error = null;
        var returned;
        check(directory.mkdirs(), 'fresh case directory');
        mockedOs.reset(name, String(target.getAbsolutePath()));
        try {
            returned = module.exports.durableWrite(env, directory, target, payload);
        } catch (caught) { error = caught; }
        if (expectedStage === null) {
            check(error === null, 'normal typed-reflection write: ' + (error && JSON.stringify(error.storageFailure)));
            check(returned === true, 'successful durableWrite result');
        } else {
            check(error !== null && error.storageFailure, 'storage error must propagate');
            check(error.storageFailure.stage === expectedStage, 'failure stage ' + expectedStage + ': ' + JSON.stringify(error.storageFailure));
            check(error.storageFailure.code === 'STORAGE_' + expectedStage + '_FAILED', 'fixed failure code');
            check(error.storageFailure.kind === 'android.system.ErrnoException', 'unwrap real InvocationTargetException');
            check(error.storageFailure.errno === expectedErrno, 'preserve first errno, including sync+close failure');
            check(JSON.stringify(error.storageFailure).indexOf('PRIVATE_NATIVE_DETAIL') < 0, 'no native exception message disclosure');
            check(returned !== true, 'failed durability must not report success');
        }
        var expectedEvents = name === 'open' ? 'open' : 'open,fsync,close';
        check(String(mockedOs.events()) === expectedEvents, 'directory sync/close order and no retry for ' + name);
        check(target.isFile(), 'actual Java file write and rename');
        check(!new jvm.io.File(directory, 'result.json.new').exists(), 'no unrenamed temporary');
        var bytes = jvm.nio.file.Files.readAllBytes(target.toPath());
        var saved = JSON.parse(String(new jvm.lang.String(bytes, 'UTF-8')));
        check(saved.schema === payload.schema && saved.test === name && saved.unicode === '\ud55c\uae00 \ud83d\ude42', 'actual UTF-8 Java file bytes');
        cases.push({name: name, passed: true, expectedStage: expectedStage, errno: expectedErrno, directoryEvents: expectedEvents});
    }

    runCase('success', null, null);
    runCase('open', 'DIR_OPEN', 2);
    runCase('sync_close', 'DIR_SYNC', 5);
    runCase('close', 'DIR_CLOSE', 9);
    return JSON.stringify({androidOsMock: true, passed: cases.length, cases: cases});
}());
