'use strict';

// Backend must hold an exclusive process lock and durably replace one JSON file.
function createJournal(backend) {
    var state = backend.load();
    if (state === null) state = { schema: 'jebiseo.autojs6.store.v1', records: [] };
    if (!state || state.schema !== 'jebiseo.autojs6.store.v1' || !Array.isArray(state.records)) {
        throw new Error('JOURNAL_INVALID');
    }
    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function index(id) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new Error('REQUEST_ID_INVALID');
        for (var i = 0; i < state.records.length; i++) if (state.records[i].requestId === id) return i;
        return -1;
    }
    function persist(next) {
        // Commit in memory only after durable storage succeeds.
        if (backend.saveAtomic(copy(next)) !== true) throw new Error('JOURNAL_WRITE_FAILED');
        state = next;
    }
    return {
        get: function (id) {
            var i = index(id);
            return i < 0 ? null : copy(state.records[i].record);
        },
        claim: function (id, record) {
            if (index(id) >= 0) return false;
            if (state.records.length >= 500) throw new Error('JOURNAL_CAPACITY_REACHED');
            var next = copy(state);
            next.records.push({ requestId: id, record: copy(record) });
            persist(next);
            return true;
        },
        put: function (id, record) {
            var i = index(id);
            if (i < 0) throw new Error('JOURNAL_CLAIM_REQUIRED');
            var next = copy(state);
            next.records[i].record = copy(record);
            persist(next);
        },
        unresolved: function () {
            return copy(state.records.filter(function (entry) {
                return ['running', 'handoff_intent', 'submit_intent', 'completion_unknown'].indexOf(entry.record.status) >= 0;
            }).map(function (entry) { return { requestId: entry.requestId, status: entry.record.status, stage: entry.record.stage }; }));
        }
    };
}
module.exports = { createJournal: createJournal };
