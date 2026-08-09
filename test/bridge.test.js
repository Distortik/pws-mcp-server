'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var bridge = require('../src/bridge');

test('accepts read-only SQL', function () {
    assert.equal(bridge.assertReadOnlySql('SELECT * FROM workers WHERE workerID = ?'), 'SELECT * FROM workers WHERE workerID = ?');
    assert.equal(bridge.assertReadOnlySql('WITH active AS (SELECT 1) SELECT * FROM active'), 'WITH active AS (SELECT 1) SELECT * FROM active');
});

test('rejects writes and stacked statements', function () {
    assert.throws(function () { bridge.assertReadOnlySql('UPDATE workers SET name = ?'); }, /Only SELECT/);
    assert.throws(function () { bridge.assertReadOnlySql('SELECT 1; DELETE FROM workers'); }, /one SQL statement/);
    assert.throws(function () { bridge.assertReadOnlySql('PRAGMA journal_mode=WAL'); }, /Only SELECT/);
});

test('dispatch routes actions through the validated game API', function () {
    var received;
    var api = { actions: { bookMatch: function (value) { received = value; return { success: true, segmentId: 7 }; } } };
    var result = bridge.dispatch(api, { method: 'actions.execute', params: { action: 'book_match', arguments: { showId: 4 }, confirmed: true } });
    assert.deepEqual(received, { showId: 4 });
    assert.deepEqual(result, { success: true, segmentId: 7 });
});

test('dispatch refuses unconfirmed save changes', function () {
    var api = { actions: { releaseWorker: function () { throw new Error('must not run'); } } };
    assert.throws(function () {
        bridge.dispatch(api, { method: 'actions.execute', params: { action: 'release_worker', arguments: { id: 8 } } });
    }, /confirmed=true/);
});

test('read-only queries are capped by an outer limit', function () {
    var received;
    var api = { database: { query: function (sql, params) { received = { sql: sql, params: params }; return []; } } };
    bridge.readOnlyQuery(api, { sql: 'SELECT * FROM workers WHERE name LIKE ?', parameters: ['A%'], maxRows: 25 });
    assert.match(received.sql, /SELECT \* FROM \(SELECT \* FROM workers/);
    assert.deepEqual(received.params, ['A%', 25]);
});
