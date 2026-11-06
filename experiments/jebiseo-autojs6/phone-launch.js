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
    // Keep the actionable diagnosis at the bottom of the Windows console too.
    var summary = reports.formatSummary(result || {}, {mode: valid.mode});
    var formatted = reports.formatResult(result || {}, {mode: valid.mode}) + '\n\n' + summary;
    // The unchanged Windows receiver accepts at most 50,000 UTF-16 code units.
    // Keep the observed outcome and diagnosis even when detailed JSON is large.
    if (formatted.length > 50000) {
        formatted = reports.formatResult(result || {}, {mode: valid.mode, includeDetails: false}) +
            '\n\n보고서 크기 제한으로 상세 JSON은 생략했습니다.\n\n' + summary;
    }
    if (formatted.length > 50000) throw new Error('PHONE_REPORT_TOO_LARGE');
    return {schema: 'jebiseo.phone-result.v1', launchId: valid.launchId,
        recordedAt: new Date().toISOString(), mode: valid.mode, status: status, code: code, reportText: formatted};
}
module.exports = {parseRequest: parseRequest, envelope: envelope};
