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

test('validates and applies a confirmed match plan', function () {
    withDomainStubs(function () {
        var received;
        var api = { actions: {
            bookMatch: function (options) { received = options; return { success: true, segmentId: 99 }; },
            bookAngle: function () { throw new Error('not expected'); }, removeSegment: function () { return { success: true }; }
        } };
        var result = booking.applyPlan(api, { showId: 50, confirmed: true, segments: [{ type: 'match', participants: [[10], [20]], segmentLength: 15 }] });
        assert.equal(result.success, true);
        assert.equal(received.showId, 50);
        assert.deepEqual(received.participants, [[10], [20]]);
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
