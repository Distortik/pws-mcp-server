'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fixture = require('../scripts/prepare-promise-fixture');

test('promise fixture arguments parse explicit source, output, and contract IDs', function () {
    var parsed = fixture.parseArgs(['source.db', 'fixture.db', '--contract-id', '7065']);
    assert.equal(parsed.contractId, 7065);
    assert.notEqual(parsed.source, parsed.output);
    assert.throws(function () { fixture.parseArgs(['source.db']); }, /Usage/);
    assert.throws(function () { fixture.parseArgs(['source.db', 'fixture.db', '--contract-id', 'zero']); }, /positive integer/);
});

test('promise fixture expiry calculation uses the in-game date', function () {
    assert.equal(fixture.addDays('1992-04-20', 60), '1992-06-19');
});
