'use strict';

// Small local-file protocol for the USB Windows launcher. No network or UI.
var reports = require('./report.js');
var MODES = ['probe', 'selection', 'more', 'handoff', 'submit'];
function parseRequest(text) {
    if (typeof text !== 'string' || text.length > 2048) throw new Error('LAUNCH_REQUEST_INVALID');
    var value;
    try { value = JSON.parse(text); } catch (invalid) { throw new Error('LAUNCH_REQUEST_INVALID'); }
    if (!value || Array.isArray(value) || value.schema !== 'jebiseo.phone-launch.v1' ||
        typeof value.launchId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{7,127}$/.test(value.launchId) ||
        MODES.indexOf(value.mode) < 0) throw new Error('LAUNCH_REQUEST_INVALID');
    if (Object.keys(value).some(function (key) { return ['schema', 'launchId', 'mode'].indexOf(key) < 0; })) {
        throw new Error('LAUNCH_REQUEST_INVALID');
    }
    return {schema: value.schema, launchId: value.launchId, mode: value.mode};
}
function envelope(request, result) {
    var valid = parseRequest(JSON.stringify(request));
    var status = result && result.status;
    var code = result && result.code;
    if (['probe_ok', 'selection_verified', 'menu_verified', 'handoff_verified', 'submission_observed',
        'blocked', 'cancelled', 'completion_unknown'].indexOf(status) < 0) status = 'unknown';
    if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) code = 'PHONE_RUNTIME_ERROR';
    var formatted = reports.formatResult(result || {}, {mode: valid.mode});
    if (formatted.length > 60000) throw new Error('PHONE_REPORT_TOO_LARGE');
    return {schema: 'jebiseo.phone-result.v1', launchId: valid.launchId,
        recordedAt: new Date().toISOString(), mode: valid.mode, status: status, code: code, reportText: formatted};
}
module.exports = {parseRequest: parseRequest, envelope: envelope};
