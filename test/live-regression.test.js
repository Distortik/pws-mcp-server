'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var live = require('../scripts/live-regression');

test('live regression arguments keep mutation checks explicit', function () {
    assert.deepEqual(live.parseArgs([]), { personaId: null, eventId: null, output: null });
    assert.deepEqual(live.parseArgs(['--persona-id', '79', '--event-id', '7', '--output', 'report.json']), {
        personaId: 79, eventId: 7, output: 'report.json'
    });
    assert.throws(function () { live.parseArgs(['--persona-id', '0']); }, /positive integer/);
    assert.throws(function () { live.parseArgs(['--mutating']); }, /Unknown argument/);
    assert.match(live.usage(), /restored in a finally block/);
});
