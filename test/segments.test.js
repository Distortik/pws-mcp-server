'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var bridge = require('../src/bridge');
var domain = require('../src/domain');
var segments = require('../src/segments');

function withContext(callback) {
    var original = domain.context;
    domain.context = function () { return { promotionId: 2 }; };
    try { callback(); } finally { domain.context = original; }
}

function fakeApi(options) {
    options = options || {};
    var contracts = {
        10: { contractID: 10, workerID: 1, promotionID: 2, name: 'Champion', type: 'Wrestler', gender: 'Male', injuryType: '', isSuspended: 0, suspended: 0, onTimeOff: 0 },
        20: { contractID: 20, workerID: 2, promotionID: 2, name: 'Challenger', type: 'Wrestler', gender: 'Male', injuryType: '', isSuspended: 0, suspended: 0, onTimeOff: 0 },
        30: { contractID: 30, workerID: 3, promotionID: 2, name: 'Third', type: 'Wrestler', gender: 'Male', injuryType: '', isSuspended: 0, suspended: 0, onTimeOff: 0 }
    };
    Object.keys(options.workerTypes || {}).forEach(function (contractId) {
        contracts[contractId].type = options.workerTypes[contractId];
    });
    var titles = {
        101: { titleID: 101, promotionID: 2, name: 'World Title', type: 'Singles', inactive: 0, brand: null, genderLimits: 'Male', defendable: 1, currentChampion: 1, currentChampion2: null, currentChampion3: null, defences: 5 },
        102: { titleID: 102, promotionID: 2, name: 'Vacant Cup', type: 'Singles', inactive: 0, brand: null, genderLimits: 'Open', defendable: 1, currentChampion: null, currentChampion2: null, currentChampion3: null, defences: 0 }
    };
    var state = {
        segment: {
            segmentID: 7, showID: 50, segmentType: 'Match', segmentLength: 15, segmentorder: 2,
            purpose: 'Regular Match', winType: 'Pinfall', purposeWorker: '', winner: 'auto', winnerWorkerID: 0, winningSet: 'auto',
            referee: '', announcer1: '', announcer2: '', announcer3: '', announcer4: '', agent: '', gimmick: 'None',
            segmentName: 'Original match', losers: 'Unspecified', description: 'Keep this note', finishSpecific: '',
            isPreshow: 0, isMainshow: 1, isPostshow: 0, matchStoryID: 'None'
        },
        opponents: [
            { opponentID: 1, segmentID: 7, opponentSet: 0, contractID: 10, workerID: 1, isRingside: 0, isSubject: 0, name: 'Champion' },
            { opponentID: 2, segmentID: 7, opponentSet: 1, contractID: 20, workerID: 2, isRingside: 0, isSubject: 0, name: 'Challenger' }
        ],
        matchtitles: [],
        statements: []
    };
    if (options.angle) {
        Object.assign(state.segment, {
            segmentType: 'Angle', segmentLength: 5, angleType: 'Promo', beats: JSON.stringify([{
                type: 'promo', length: 5, group1: [{ contractID: 10, workerID: 1 }], group2: [{ contractID: 20, workerID: 2 }]
            }]), videoOnly: 0
        });
        state.opponents[1].isSubject = 1;
    }
    var snapshot = null;
    function restore(value) {
        state.segment = value.segment;
        state.opponents = value.opponents;
        state.matchtitles = value.matchtitles;
    }
    var api = {
        _state: state,
        actions: { getAuditLog: function () { return []; } },
        database: {
            get: function (sql, params) {
                if (sql.indexOf('FROM titles WHERE titleID=?') !== -1) return titles[Number(params[0])] || null;
                if (sql.indexOf('FROM segments s JOIN eventinstance') !== -1 && Number(params[0]) === 7) {
                    return Object.assign({}, state.segment, { complete: 0, isCancelled: 0, promotionID: 2, showBrand: null });
                }
                return null;
            },
            query: function (sql, params) {
                if (sql.indexOf('FROM contracts c JOIN workers') !== -1) return Object.keys(contracts).map(function (id) { return contracts[id]; });
                if (sql.indexOf('FROM opponents o') !== -1) return state.opponents.filter(function (row) { return row.segmentID === Number(params[0]); });
                if (sql.indexOf('FROM matchtitles mt') !== -1) return state.matchtitles.filter(function (row) { return row.segmentID === Number(params[0]); }).map(function (row, index) {
                    return Object.assign({ matchTitleID: index + 1, champion: null, winner: null }, titles[row.titleID], row);
                });
                return [];
            },
            execute: function (sql, params) {
                state.statements.push(sql);
                if (sql === 'BEGIN IMMEDIATE') { snapshot = JSON.parse(JSON.stringify(state)); return {}; }
                if (sql === 'COMMIT') { snapshot = null; return {}; }
                if (sql === 'ROLLBACK') { restore(snapshot); snapshot = null; return {}; }
                if (sql.indexOf('UPDATE segments SET ') === 0) {
                    var columns = sql.slice('UPDATE segments SET '.length, sql.indexOf(' WHERE')).split(',').map(function (part) { return part.slice(0, -2); });
                    columns.forEach(function (column, index) { state.segment[column] = params[index]; });
                    return { changes: 1 };
                }
                if (sql.indexOf('DELETE FROM opponents') === 0) { state.opponents = []; return { changes: 2 }; }
                if (sql.indexOf('INSERT INTO opponents') === 0) {
                    state.opponents.push({ opponentID: state.opponents.length + 1, segmentID: params[0], opponentSet: params[1], contractID: params[2], workerID: params[3], isRingside: params[4], isSubject: params[5], name: contracts[params[2]].name });
                    return { changes: 1 };
                }
                if (sql.indexOf('DELETE FROM matchtitles') === 0) { state.matchtitles = []; return { changes: 1 }; }
                if (sql.indexOf('INSERT INTO matchtitles') === 0) {
                    if (!options.dropTitleInserts) state.matchtitles.push({ segmentID: params[0], titleID: params[1] });
                    return { changes: options.dropTitleInserts ? 0 : 1 };
                }
                throw new Error('Unexpected SQL: ' + sql);
            }
        }
    };
    return api;
}

test('previews a segment update without writing', function () {
    withContext(function () {
        var api = fakeApi();
        var result = segments.updateSegment(api, { segmentId: 7, changes: { titleIds: [101, 102], winner: 20 } });
        assert.equal(result.status, 'preview');
        assert.deepEqual(result.proposed.titleIds, [101, 102]);
        assert.equal(result.proposed.winner, '20');
        assert.equal(api._state.statements.length, 0);
    });
});

test('updates a match transactionally and returns the complete verified segment', function () {
    withContext(function () {
        var api = fakeApi();
        var result = segments.updateSegment(api, {
            segmentId: 7, preview: false, confirmed: true,
            changes: { titleIds: [101, 102], winner: 20, winType: 'Submission', finishSpecific: 'Crossface', segmentPosition: 4 }
        });
        assert.equal(result.success, true);
        assert.equal(result.status, 'applied');
        assert.equal(result.after, result.segment);
        assert.deepEqual(result.segment.titleIds, [101, 102]);
        assert.equal(result.segment.winner, '20');
        assert.equal(result.segment.winType, 'Submission');
        assert.equal(result.segment.description, 'Keep this note');
        assert.deepEqual(api._state.statements.slice(0, 1), ['BEGIN IMMEDIATE']);
        assert.equal(api._state.statements[api._state.statements.length - 1], 'COMMIT');
        assert.equal(bridge.dispatch(api, { method: 'actions.audit' }).slice(-1)[0].action, 'booking.updateSegment');
    });
});

test('rolls back when a championship association is not persisted', function () {
    withContext(function () {
        var api = fakeApi({ dropTitleInserts: true });
        assert.throws(function () {
            segments.updateSegment(api, { segmentId: 7, preview: false, confirmed: true, changes: { titleIds: [102] } });
        }, /Post-save verification failed/);
        assert.deepEqual(api._state.matchtitles, []);
        assert.equal(api._state.statements[api._state.statements.length - 1], 'ROLLBACK');
    });
});

test('updates angle groups, subject roles, beats, and metadata', function () {
    withContext(function () {
        var api = fakeApi({ angle: true });
        var result = segments.updateSegment(api, {
            segmentId: 7, preview: false, confirmed: true,
            changes: {
                angleType: 'Interview', participants: [[10], [30]], subjectContractIds: [30],
                beats: [{ type: 'promo', length: 7, group1: [{ contractID: 10 }], group2: [{ contractID: 30 }] }],
                segmentName: 'New interview'
            }
        });
        assert.equal(result.segment.angleType, 'Interview');
        assert.equal(result.segment.segmentLength, 7);
        assert.deepEqual(result.segment.participants, [[10], [30]]);
        assert.deepEqual(result.segment.subjectContractIds, [30]);
        assert.equal(result.segment.segmentName, 'New interview');
    });
});

test('normalizes omitted groups when editing an angle beat', function () {
    withContext(function () {
        var api = fakeApi({ angle: true });
        var result = segments.updateSegment(api, {
            segmentId: 7, preview: false, confirmed: true,
            changes: { beats: [{ type: 'promo', length: 5, group1: [{ contractID: 10 }] }] }
        });
        assert.deepEqual(result.segment.beats, [{
            type: 'promo', length: 5,
            group1: [{ contractID: 10, workerID: 1 }], group2: [], group3: []
        }]);
    });
});

test('rejects unknown and segment-incompatible update fields', function () {
    withContext(function () {
        var api = fakeApi();
        assert.throws(function () { segments.updateSegment(api, { segmentId: 7, changes: { titleId: 101 } }); }, /unsupported field "titleId"/);
        assert.throws(function () { segments.updateSegment(api, { segmentId: 7, changes: { angleType: 'Promo' } }); }, /unsupported field "angleType"/);
    });
});

test('allows occasional wrestlers in match edits while rejecting angle-only worker types', function () {
    withContext(function () {
        var occasional = segments.updateSegment(fakeApi({ workerTypes: { 30: 'Occasional Wrestler' } }), {
            segmentId: 7, changes: { participants: [[10], [30]] }
        });
        assert.deepEqual(occasional.proposed.participants, [[10], [30]]);
        assert.throws(function () {
            segments.updateSegment(fakeApi({ workerTypes: { 30: 'Staff' } }), {
                segmentId: 7, changes: { participants: [[10], [30]] }
            });
        }, /Third is not a wrestler/);
    });
});

test('requires every current champion to participate in a defense', function () {
    withContext(function () {
        var api = fakeApi();
        api.database.get = (function (original) {
            return function (sql, params) {
                var row = original(sql, params);
                if (sql.indexOf('FROM titles WHERE titleID=?') !== -1 && row) return Object.assign({}, row, { currentChampion: 3 });
                return row;
            };
        }(api.database.get));
        assert.throws(function () { segments.updateSegment(api, { segmentId: 7, changes: { titleIds: [101] } }); }, /not every current champion is in the match/);
    });
});

test('can clear all title associations and book a draw', function () {
    withContext(function () {
        var api = fakeApi();
        var result = segments.updateSegment(api, {
            segmentId: 7, preview: false, confirmed: true,
            changes: { titleIds: [], winner: 'draw' }
        });
        assert.deepEqual(result.segment.titleIds, []);
        assert.equal(result.segment.winner, 'draw');
        assert.deepEqual(api._state.matchtitles, []);
    });
});

test('requires a new winner when participant changes remove the current winner', function () {
    withContext(function () {
        var api = fakeApi();
        api._state.segment.winner = '10';
        api._state.segment.winnerWorkerID = 1;
        api._state.segment.winningSet = '0';
        assert.throws(function () {
            segments.updateSegment(api, { segmentId: 7, changes: { participants: [[20], [30]] } });
        }, /Winner contract 10 is not among the participants/);
    });
});
