'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var actions = require('../src/actions');
var audit = require('../src/audit');
var domain = require('../src/domain');
var segments = require('../src/segments');

function withContext(callback) {
    var original = domain.context;
    domain.context = function () { return { promotionId: 2 }; };
    try { callback(); } finally { domain.context = original; }
}

function fakeApi() {
    var state = {
        storyline: { storylineID: 5, storylineName: 'Feud', promotionID: 2, active: 1 },
        contract: { contractID: 10, workerID: 1, promotionID: 2, finalised: 1, expired: 0, contractStarted: 1, name: 'Worker' },
        membership: null,
        title: { titleID: 20, name: 'World', promotionID: 2, inactive: 0, currentChampion: 1, currentChampion2: null, currentChampion3: null }
    };
    var calls = [];
    var api = {
        _state: state,
        _calls: calls,
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM storylines WHERE') !== -1) return Object.assign({}, state.storyline);
                if (sql.indexOf('FROM storylineworkers WHERE') !== -1) return state.membership && Object.assign({}, state.membership);
                if (sql.indexOf('FROM contracts c LEFT JOIN workers') !== -1) return Object.assign({}, state.contract);
                if (sql.indexOf('FROM contracts WHERE') !== -1) return Object.assign({}, state.contract);
                if (sql.indexOf('FROM titles WHERE') !== -1) return Object.assign({}, state.title);
                if (sql.indexOf('FROM promotions WHERE') !== -1) return { promotionID: 2 };
                return null;
            }
        },
        actions: {
            endStoryline: function (id) { calls.push(['end', id]); state.storyline.active = 0; return { success: true }; },
            addWorkerToStoryline: function (storylineId, contractId) { calls.push(['add', storylineId, contractId]); state.membership = { storylineID: storylineId, contractID: contractId }; return { success: true }; },
            removeWorkerFromStoryline: function (storylineId, contractId) { calls.push(['remove', storylineId, contractId]); state.membership = null; return { success: true }; },
            releaseWorker: function (id) { calls.push(['release', id]); state.contract.expired = 1; return { success: true }; },
            vacateTitle: function (id, reason) { calls.push(['vacate', id, reason]); state.title.currentChampion = null; return { success: true }; }
        }
    };
    return api;
}

test('purpose-built actions preview without mutating', function () {
    withContext(function () {
        var api = fakeApi();
        var result = actions.endStoryline(api, { storylineId: 5 });
        assert.equal(result.status, 'preview');
        assert.equal(result.proposed.active, false);
        assert.deepEqual(api._calls, []);
        assert.equal(audit.get(api).length, 0);
    });
});

test('ends a storyline and verifies the persisted state', function () {
    withContext(function () {
        var api = fakeApi();
        var result = actions.endStoryline(api, { storylineId: 5, preview: false, confirmed: true });
        assert.equal(result.status, 'applied');
        assert.equal(result.after.active, 0);
        assert.deepEqual(api._calls, [['end', 5]]);
        assert.equal(audit.get(api)[0].action, 'storyline.end');
    });
});

test('adds and removes a storyline worker with membership verification', function () {
    withContext(function () {
        var api = fakeApi();
        var added = actions.changeStorylineMember(api, { storylineId: 5, contractId: 10, preview: false, confirmed: true }, true);
        assert.deepEqual(added.after, { storylineID: 5, contractID: 10 });
        var removed = actions.changeStorylineMember(api, { storylineId: 5, contractId: 10, preview: false, confirmed: true }, false);
        assert.equal(removed.after, null);
        assert.deepEqual(api._calls, [['add', 5, 10], ['remove', 5, 10]]);
    });
});

test('releases a contract and verifies it became inactive', function () {
    withContext(function () {
        var api = fakeApi();
        var result = actions.releaseWorker(api, { contractId: 10, preview: false, confirmed: true });
        assert.equal(result.after.expired, 1);
        assert.deepEqual(api._calls, [['release', 10]]);
    });
});

test('vacates a title and passes the reason to PWS', function () {
    withContext(function () {
        var api = fakeApi();
        var result = actions.vacateTitle(api, { titleId: 20, reason: 'Injury', preview: false, confirmed: true });
        assert.equal(result.after.currentChampion, null);
        assert.deepEqual(api._calls, [['vacate', 20, 'Injury']]);
    });
});

test('refuses mutation without confirmation and rejects duplicate membership', function () {
    withContext(function () {
        var api = fakeApi();
        assert.throws(function () { actions.releaseWorker(api, { contractId: 10, preview: false }); }, /confirmed=true/);
        api._state.membership = { storylineID: 5, contractID: 10 };
        assert.throws(function () { actions.changeStorylineMember(api, { storylineId: 5, contractId: 10 }, true); }, /already in the storyline/);
        assert.deepEqual(api._calls, []);
    });
});

test('does not report success when PWS fails to persist a mutation', function () {
    withContext(function () {
        var api = fakeApi();
        api.actions.endStoryline = function () { return { success: true }; };
        assert.throws(function () { actions.endStoryline(api, { storylineId: 5, preview: false, confirmed: true }); }, /Post-action verification failed/);
        assert.equal(audit.get(api).length, 0);
    });
});

test('removes an unfinished player-company segment and verifies deletion', function () {
    withContext(function () {
        var original = segments.readSegment;
        var exists = true;
        segments.readSegment = function () { return { segmentId: 7, showId: 50, type: 'match', participants: [[10], [20]] }; };
        var api = {
            database: {
                get: function (sql) {
                    if (sql.indexOf('JOIN eventinstance') !== -1) return { segmentID: 7, complete: 0, isCancelled: 0, promotionID: 2 };
                    if (sql.indexOf('SELECT segmentID FROM segments') !== -1) return exists ? { segmentID: 7 } : null;
                    return null;
                }
            },
            actions: { removeSegment: function (id) { assert.equal(id, 7); exists = false; return { success: true }; } }
        };
        try {
            var preview = actions.removeSegment(api, { segmentId: 7 });
            assert.equal(preview.status, 'preview');
            assert.equal(exists, true);
            var applied = actions.removeSegment(api, { segmentId: 7, preview: false, confirmed: true });
            assert.equal(applied.status, 'applied');
            assert.equal(applied.after, null);
        } finally {
            segments.readSegment = original;
        }
    });
});

test('sets and verifies an unfinished show venue and event default', function () {
    var state = { venueId: 10, preferredVenue: 0 };
    var api = {
        game: { getState: function () { return { promotionId: 2 }; } },
        plugin: { version: 'test' },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveUserPromotion: 2 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'Test', basedIn: 'Europe' };
                if (sql.indexOf('JOIN events') !== -1) return { showId: 50, venueId: state.venueId, complete: 0, isCancelled: 0, promotionID: 2, eventID: 7, preferredVenue: state.preferredVenue };
                if (sql.indexOf('FROM venues') !== -1) return { venueId: 99, name: 'Arena', capacity: 10000 };
                if (sql.indexOf('FROM eventinstance WHERE') !== -1) return { showId: 50, venueId: state.venueId };
                return null;
            },
            execute: function (sql, params) {
                if (sql.indexOf('UPDATE eventinstance') !== -1) state.venueId = Number(params[0]);
                if (sql.indexOf('UPDATE events') !== -1) state.preferredVenue = Number(params[0]);
            }
        }
    };
    var preview = actions.setShowVenue(api, { showId: 50, venueId: 99 });
    assert.equal(preview.status, 'preview');
    var applied = actions.setShowVenue(api, { showId: 50, venueId: 99, setEventDefault: true, preview: false, confirmed: true });
    assert.equal(applied.after.venueId, 99);
    assert.equal(applied.after.preferredVenue, 99);
});
