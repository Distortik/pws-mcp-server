'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var booking = require('../src/booking');
var domain = require('../src/domain');

function withDomainStubs(callback) {
    var originals = { show: domain.show, context: domain.context, rosterRows: domain.rosterRows };
    domain.show = function () { return { show: { showId: 50, promotionID: 2, length: 60, complete: 0, isCancelled: 0 }, bookedMinutes: 0, segments: [] }; };
    domain.context = function () { return { promotionId: 2 }; };
    domain.rosterRows = function () { return [
        { contractID: 10, workerID: 1, name: 'Face', injuryType: '', isSuspended: 0, contractSuspended: 0, onTimeOff: 0 },
        { contractID: 20, workerID: 2, name: 'Heel', injuryType: '', isSuspended: 0, contractSuspended: 0, onTimeOff: 0 },
        { contractID: 30, workerID: 3, name: 'Face Two', injuryType: '', isSuspended: 0, contractSuspended: 0, onTimeOff: 0 },
        { contractID: 40, workerID: 4, name: 'Heel Two', injuryType: '', isSuspended: 0, contractSuspended: 0, onTimeOff: 0 }
    ]; };
    try { callback(); } finally {
        domain.show = originals.show;
        domain.context = originals.context;
        domain.rosterRows = originals.rosterRows;
    }
}

function makeBookingApi(options) {
    options = options || {};
    var nextSegmentId = 90;
    var state = { segments: {}, opponents: [], matchtitles: [], removed: [] };
    var contracts = {
        10: { contractID: 10, workerID: 1, name: 'Face', gender: 'Male' },
        20: { contractID: 20, workerID: 2, name: 'Heel', gender: 'Male' },
        30: { contractID: 30, workerID: 3, name: 'Face Two', gender: 'Male' },
        40: { contractID: 40, workerID: 4, name: 'Heel Two', gender: 'Male' }
    };
    var titles = options.titles || {};
    function titleRows(segmentId) {
        return state.matchtitles.filter(function (row) { return row.segmentID === segmentId; }).map(function (row, index) {
            return Object.assign({ matchTitleID: index + 1, champion: null, winner: null }, titles[row.titleID] || {}, row);
        });
    }
    var api = {
        _state: state,
        database: {
            get: function (sql, params) {
                if (sql.indexOf('FROM titles WHERE titleID=?') !== -1) return titles[Number(params[0])] || null;
                if (sql.indexOf('FROM segments s JOIN eventinstance') !== -1) {
                    var segment = state.segments[Number(params[0])];
                    return segment ? Object.assign({}, segment, { complete: 0, isCancelled: 0, promotionID: 2, showBrand: null }) : null;
                }
                return null;
            },
            query: function (sql, params) {
                var segmentId = Number(params[0]);
                if (sql.indexOf('FROM opponents o') !== -1) return state.opponents.filter(function (row) { return row.segmentID === segmentId; });
                if (sql.indexOf('FROM matchtitles mt') !== -1) return titleRows(segmentId);
                return [];
            }
        },
        actions: {
            bookMatch: function (input) {
                var segmentId = nextSegmentId++;
                var winner = input.winner == null ? 'auto' : String(input.winner);
                var flat = [].concat.apply([], input.participants);
                var winnerContract = contracts[Number(winner)];
                state.segments[segmentId] = {
                    segmentID: segmentId, showID: input.showId, segmentType: 'Match', segmentLength: input.segmentLength || 1,
                    segmentorder: input.segmentPosition || 1, purpose: input.purpose || 'Regular Match', winType: input.winType || 'Pinfall',
                    winner: winner, winnerWorkerID: winnerContract ? winnerContract.workerID : 0,
                    winningSet: winnerContract ? String(input.participants.findIndex(function (group) { return group.indexOf(Number(winner)) !== -1; })) : winner,
                    purposeWorker: input.purposeWorker || '', losers: input.losers || 'Unspecified', gimmick: input.gimmick || 'None',
                    segmentName: input.segmentName || '', description: input.description || '', finishSpecific: input.finishSpecific || '',
                    matchStoryID: input.matchStoryId || 'None', referee: input.referee || '', agent: input.agent || '',
                    announcer1: (input.announcers || [])[0] || '', announcer2: (input.announcers || [])[1] || '',
                    announcer3: (input.announcers || [])[2] || '', announcer4: (input.announcers || [])[3] || '',
                    isPreshow: input.cardPosition === 'preshow' ? 1 : 0, isMainshow: input.cardPosition === 'preshow' || input.cardPosition === 'postshow' ? 0 : 1,
                    isPostshow: input.cardPosition === 'postshow' ? 1 : 0
                };
                flat.forEach(function (contractId) {
                    state.opponents.push({ opponentID: state.opponents.length + 1, segmentID: segmentId, opponentSet: input.participants.findIndex(function (group) { return group.indexOf(contractId) !== -1; }), contractID: contractId, workerID: contracts[contractId].workerID, isRingside: 0, isSubject: 0, name: contracts[contractId].name });
                });
                if (!options.dropTitles) (input.titleIds || []).forEach(function (titleId) { state.matchtitles.push({ segmentID: segmentId, titleID: titleId }); });
                return { success: true, segmentId: segmentId };
            },
            bookAngle: function () { throw new Error('not expected'); },
            removeSegment: function (segmentId) {
                state.removed.push(segmentId); delete state.segments[segmentId];
                state.opponents = state.opponents.filter(function (row) { return row.segmentID !== segmentId; });
                state.matchtitles = state.matchtitles.filter(function (row) { return row.segmentID !== segmentId; });
                return { success: true };
            }
        }
    };
    return api;
}

test('validates and applies a confirmed match plan', function () {
    withDomainStubs(function () {
        var api = makeBookingApi();
        var result = booking.applyPlan(api, { showId: 50, confirmed: true, segments: [{ type: 'match', participants: [[10], [20]], segmentLength: 15 }] });
        assert.equal(result.success, true);
        assert.equal(result.verifiedCard[0].showId, 50);
        assert.deepEqual(result.verifiedCard[0].participants, [[10], [20]]);
    });
});

test('rejects unsupported singular titleId instead of silently ignoring it', function () {
    withDomainStubs(function () {
        assert.throws(function () {
            booking.validatePlan(makeBookingApi(), { showId: 50, segments: [{ type: 'match', participants: [[10], [20]], titleId: 101 }] });
        }, /unsupported field "titleId"/);
    });
});

test('validates and persists multiple championship associations', function () {
    withDomainStubs(function () {
        var titleRows = {
            101: { titleID: 101, promotionID: 2, name: 'World Title', type: 'Singles', inactive: 0, defendable: 1, currentChampion: 1, defences: 4 },
            102: { titleID: 102, promotionID: 2, name: 'Vacant Cup', type: 'Singles', inactive: 0, defendable: 1, currentChampion: null, defences: 0 }
        };
        var api = makeBookingApi({ titles: titleRows });
        var input = { showId: 50, confirmed: true, segments: [{ type: 'match', participants: [[10], [20]], segmentLength: 20, winner: 20, titleIds: [101, 102] }] };
        var validated = booking.validatePlan(api, input);
        assert.deepEqual(validated.segments[0].options.titleIds, [101, 102]);
        assert.deepEqual(validated.selectedTitles.map(function (title) { return [title.titleId, title.defense, title.vacant]; }), [[101, true, false], [102, false, true]]);
        var applied = booking.applyPlan(api, input);
        assert.equal(applied.success, true);
        assert.deepEqual(applied.verifiedCard[0].titleIds, [101, 102]);
        assert.deepEqual(api._state.matchtitles.map(function (row) { return row.titleID; }), [101, 102]);
    });
});

test('never reports success when PWS drops a requested championship', function () {
    withDomainStubs(function () {
        var api = makeBookingApi({
            dropTitles: true,
            titles: { 101: { titleID: 101, promotionID: 2, name: 'Vacant Cup', type: 'Singles', inactive: 0, defendable: 1, currentChampion: null } }
        });
        var result = booking.applyPlan(api, { showId: 50, confirmed: true, segments: [{ type: 'match', participants: [[10], [20]], titleIds: [101] }] });
        assert.equal(result.success, false);
        assert.match(result.error, /verification failed/i);
        assert.deepEqual(api._state.removed, [90]);
    });
});

test('refuses to apply an unconfirmed plan', function () {
    assert.throws(function () { booking.applyPlan({}, { showId: 50, segments: [] }); }, /confirmed=true/);
});

test('rolls back segments created before a later failure', function () {
    withDomainStubs(function () {
        var calls = 0;
        var removed = [];
        var api = { actions: {
            bookMatch: function () { calls += 1; return calls === 1 ? { success: true, segmentId: 77 } : { success: false, error: 'bad segment' }; },
            bookAngle: function () { throw new Error('not expected'); },
            removeSegment: function (id) { removed.push(id); return { success: true }; }
        } };
        var result = booking.applyPlan(api, { showId: 50, confirmed: true, segments: [
            { type: 'match', participants: [[10], [20]], segmentLength: 15 },
            { type: 'match', participants: [[30], [40]], segmentLength: 15 }
        ] });
        assert.equal(result.success, false);
        assert.deepEqual(removed, [77]);
    });
});

test('generated short cards stay within available runtime', function () {
    var names = ['context', 'show', 'rosterRows', 'state', 'titles', 'storylines', 'query'];
    var originals = {};
    names.forEach(function (name) { originals[name] = domain[name]; });
    domain.context = function () { return { promotionId: 2, currentDate: '2026-01-01', promotion: { angleToWresRatio: 5 } }; };
    domain.show = function () { return { show: { showId: 50, promotionID: 2, length: 20, complete: 0, isCancelled: 0, brand: null }, bookedMinutes: 0, segments: [] }; };
    domain.rosterRows = function () { return [
        { contractID: 10, workerID: 1, name: 'A', role: 'Face', canDoAngles: 1, momentum: 80, marketPopularity: 80, wrestlingSkill: 70, entertainment: 70, starPower: 70, stamina: 70 },
        { contractID: 20, workerID: 2, name: 'B', role: 'Heel', canDoAngles: 1, momentum: 70, marketPopularity: 70, wrestlingSkill: 70, entertainment: 70, starPower: 70, stamina: 70 }
    ]; };
    domain.state = function () { return { promotionId: 2 }; };
    domain.titles = function () { return []; };
    domain.storylines = function () { return []; };
    domain.query = function () { return []; };
    try {
        var result = booking.planShow({}, { showId: 50, matchCount: 1, angleCount: 1, angleLength: 15 });
        assert.ok(result.plannedMinutes <= 20);
    } finally {
        names.forEach(function (name) { domain[name] = originals[name]; });
    }
});

test('auto-generates beats for all three angle participant groups', function () {
    withDomainStubs(function () {
        var validated = booking.validatePlan(makeBookingApi(), { showId: 50, segments: [{
            type: 'angle', participants: [[10], [20], [30]], segmentLength: 6
        }] });
        assert.deepEqual(validated.segments[0].options.beats[0].group3, [{ contractID: 30, workerID: 3 }]);
    });
});
