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

test('allows semicolons inside SQL string literals and comments', function () {
    assert.equal(bridge.assertReadOnlySql("SELECT group_concat(name, ' ; ') FROM workers"), "SELECT group_concat(name, ' ; ') FROM workers");
    assert.equal(bridge.assertReadOnlySql('SELECT 1 /* ; harmless */'), 'SELECT 1 /* ; harmless */');
    assert.throws(function () { bridge.assertReadOnlySql("SELECT ';'; SELECT 2"); }, /Only one SQL statement/);
});

test('dispatch routes actions through the validated game API', function () {
    var received;
    var api = { actions: { createNewsItem: function (value) { received = value; return { success: true, newsId: 7 }; } } };
    var result = bridge.dispatch(api, { method: 'actions.execute', params: { action: 'create_news_item', arguments: { headline: 'Test' }, confirmed: true } });
    assert.deepEqual(received, { headline: 'Test' });
    assert.deepEqual(result, { success: true, newsId: 7 });
});

test('sign_worker validates and canonicalizes a database-specific gimmick', function () {
    var received;
    var api = {
        database: { get: function (sql, params) { return sql.indexOf('FROM gimmicks WHERE') !== -1 && String(params[0]).toLowerCase() === 'arrogant' ? { name: 'Arrogant' } : null; } },
        actions: { signWorker: function (value) { received = value; return { success: true, contractId: 7 }; } }
    };
    bridge.dispatch(api, { method: 'actions.execute', params: { action: 'sign_worker', arguments: { workerId: 1, promotionId: 2, contractType: 'PPA', role: 'Wrestler', gimmick: 'arrogant' }, confirmed: true } });
    assert.equal(received.gimmick, 'Arrogant');
    assert.throws(function () {
        bridge.dispatch(api, { method: 'actions.execute', params: { action: 'sign_worker', arguments: { workerId: 1, promotionId: 2, contractType: 'PPA', role: 'Wrestler', gimmick: 'Missing' }, confirmed: true } });
    }, /Gimmick not found/);
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
