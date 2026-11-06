'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const launch = require('../phone-launch.js');
const request = {schema: 'jebiseo.phone-launch.v1', launchId: 'pc-0123456789', mode: 'probe'};
test('local launch accepts only one bounded explicit mode and safe request ID', () => {
    assert.deepEqual(launch.parseRequest(JSON.stringify(request)), request);
    for (const update of [{launchId: '../escape'}, {launchId: 'x'.repeat(129)}, {mode: 'all'}, {mode: 'submit', command: 'anything'}, {schema: 'unknown'}]) {
        assert.throws(() => launch.parseRequest(JSON.stringify({...request, ...update})), /LAUNCH_REQUEST_INVALID/);
    }
    assert.throws(() => launch.parseRequest(' '.repeat(2049)), /LAUNCH_REQUEST_INVALID/);
    assert.throws(() => launch.parseRequest('broken'), /LAUNCH_REQUEST_INVALID/);
});
test('public result never exports private conversation, drafts or platform exception strings', () => {
    const result = {schema: 'jebiseo.autojs6.result.v1', status: 'blocked', code: 'SOURCE_WINDOW_MISSING',
        expectedText: 'PRIVATE_SOURCE', draft: 'PRIVATE_DRAFT', exception: 'PRIVATE_EXCEPTION'};
    const envelope = launch.envelope(request, result);
    assert.equal(envelope.schema, 'jebiseo.phone-result.v1');
    assert.equal(envelope.launchId, request.launchId);
    assert.equal(envelope.code, 'SOURCE_WINDOW_MISSING');
    assert.doesNotMatch(JSON.stringify(envelope), /PRIVATE_/);
    const invalid = launch.envelope(request, {status: 'PRIVATE_SOURCE', code: 'PRIVATE TEXT'});
    assert.equal(invalid.status, 'unknown');
    assert.equal(invalid.code, 'PHONE_RUNTIME_ERROR');
});
