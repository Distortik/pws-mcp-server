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
        database: { get: function (sql, params) {
            if (sql.indexOf('FROM gimmicks WHERE') !== -1) return String(params[0]).toLowerCase() === 'arrogant' ? { name: 'Arrogant' } : null;
            if (sql.indexOf('FROM contracts WHERE') !== -1 && Number(params[0]) === 7) return {
                contractID: 7, workerID: received.workerId, promotionID: received.promotionId, contractType: received.contractType,
                exclusive: received.exclusive ? 1 : 0, role: received.role, wagePerMonth: received.wagePerMonth || 0,
                wagePerAppearance: received.wagePerAppearance || 0, contractLength: received.contractLength == null ? 365 : received.contractLength,
                push: received.push || 'Midcarder', gimmick: received.gimmick || 'None', contractName: received.contractName || 'Worker',
                brand: received.brand || null, finalised: 1, expired: 0, contractStarted: 1
            };
            return null;
        } },
        actions: { signWorker: function (value) { received = value; return { success: true, contractId: 7 }; } }
    };
    var result = bridge.dispatch(api, { method: 'actions.execute', params: { action: 'sign_worker', arguments: { workerId: 1, promotionId: 2, contractType: 'PPA', role: 'Wrestler', gimmick: 'arrogant', wages: 750, contractLength: 365 }, confirmed: true } });
    assert.equal(received.gimmick, 'Arrogant');
    assert.equal(received.wagePerAppearance, 750);
    assert.equal(received.wagePerMonth, undefined);
    assert.equal(received.wages, undefined);
    assert.equal(result.verification.success, true);
    assert.equal(result.after.contractLengthDays, 365);
    assert.throws(function () {
        bridge.dispatch(api, { method: 'actions.execute', params: { action: 'sign_worker', arguments: { workerId: 1, promotionId: 2, contractType: 'PPA', role: 'Wrestler', gimmick: 'Missing' }, confirmed: true } });
    }, /Gimmick not found/);
});

test('sign_worker reports requested-term persistence failures', function () {
    var api = {
        database: { get: function (sql) {
            if (sql.indexOf('FROM contracts WHERE') !== -1) return { contractID: 9, workerID: 1, promotionID: 2, contractType: 'Written', exclusive: 0, role: 'Wrestler', wagePerMonth: 0, wagePerAppearance: 0, contractLength: 35, finalised: 1, expired: 0, contractStarted: 1 };
            return null;
        } },
        actions: { signWorker: function () { return { success: true, contractId: 9 }; } }
    };
    var result = bridge.dispatch(api, { method: 'actions.execute', params: { action: 'sign_worker', arguments: { workerId: 1, promotionId: 2, contractType: 'Written', role: 'Wrestler', wagePerMonth: 5000, contractLength: 365 }, confirmed: true } });
    assert.equal(result.success, false);
    assert.deepEqual(result.verification.mismatches.map(function (item) { return item.field; }), ['wagePerMonth', 'contractLength']);
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

test('dispatch routes optional integration reads through the bridge-owned manager', async function () {
    var services = { integrations: {
        list: function () { return Promise.resolve({ optional: true, providers: [] }); },
        innerCircle: function (params) { return Promise.resolve({ available: true, providerId: params.providerId }); },
        investments: function (params) { return Promise.resolve({ available: true, providerId: params.providerId }); }
    } };
    assert.deepEqual(await bridge.dispatch({}, { method: 'integrations.list' }, services), { optional: true, providers: [] });
    assert.deepEqual(await bridge.dispatch({}, { method: 'integrations.innerCircle', params: { providerId: 'inner-circle-test' } }, services), { available: true, providerId: 'inner-circle-test' });
    assert.deepEqual(await bridge.dispatch({}, { method: 'integrations.investments', params: { providerId: 'investments-test' } }, services), { available: true, providerId: 'investments-test' });
});
