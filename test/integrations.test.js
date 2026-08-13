'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var integrations = require('../src/integrations');

function description(pluginId) {
    return {
        protocol: integrations.PROTOCOL,
        protocolVersion: 1,
        provider: { pluginId: pluginId, pluginVersion: '2.1.0', schemaVersion: 1 },
        capabilities: [{ id: integrations.INNER_CIRCLE_CAPABILITY, version: 1, access: 'read', context: 'save-promotion' }]
    };
}

function snapshot(api, pluginId, revision) {
    var context = integrations.contextIdentity(api, null);
    return {
        protocol: integrations.PROTOCOL,
        protocolVersion: 1,
        capability: { id: integrations.INNER_CIRCLE_CAPABILITY, version: 1 },
        provider: { pluginId: pluginId, pluginVersion: '2.1.0', schemaVersion: 1 },
        context: { saveHash: context.saveHash, promotionId: context.promotionId, revision: revision, currentDate: '1992-04-20' },
        data: {
            summary: { roles: 2, totalSlots: 3, assignedSlots: 2, assignedWorkers: 2, unavailableAssignments: 1 },
            roles: [
                { id: 'lockerRoomLeader', label: 'Locker Room Leader', category: 'Morale', slots: 2 },
                { id: 'chiefEnforcer', label: 'Chief Enforcer', category: 'Morale', slots: 1 }
            ],
            assignments: [
                { roleId: 'lockerRoomLeader', slot: 1, workerId: 10, contractId: 20, name: 'Bret Hart', status: 'active', assignedDate: '1992-01-01' },
                { roleId: 'chiefEnforcer', slot: 1, workerId: 11, contractId: null, name: 'Nikita Koloff', status: 'unavailable', assignedDate: '1991-10-01' }
            ]
        }
    };
}

function mockApi(options) {
    options = options || {};
    var handlers = {};
    var api = {
        game: {
            getState: function () { return { gameWorldName: 'VWE1', promotionName: 'Vanguard Wrestling Entertainment', promotionId: 7, currentDate: '1992-04-20' }; },
            getCurrentPromotion: function () { return { promotionID: 7 }; }
        },
        database: { get: function () { return { saveUserPromotion: 7 }; } },
        events: {
            on: function (name, handler) { handlers[name] = handler; },
            off: function (name) { delete handlers[name]; }
        },
        interPlugin: {
            list: function () { return options.list == null ? ['inner-circle'] : options.list; },
            send: function (target, channel) {
                if (options.send) return options.send(target, channel, api);
                if (channel === integrations.DESCRIBE_CHANNEL) return description(target);
                if (channel === integrations.SNAPSHOT_CHANNEL) return snapshot(api, target, 4);
                throw new Error('Unexpected channel');
            }
        },
        __handlers: handlers
    };
    return api;
}

test('missing optional plugins are harmless', async function () {
    var api = mockApi({ list: [] });
    var manager = integrations.createManager(api);
    var discovered = await manager.list();
    var innerCircle = await manager.innerCircle({});
    assert.equal(discovered.capabilities[0].available, false);
    assert.deepEqual(discovered.providers, []);
    assert.deepEqual(innerCircle, {
        available: false,
        capability: integrations.INNER_CIRCLE_CAPABILITY,
        reason: 'provider-not-installed-or-incompatible',
        providers: []
    });
});

test('discovers and validates a sanitized Inner Circle snapshot', async function () {
    var api = mockApi();
    var manager = integrations.createManager(api);
    var discovered = await manager.list();
    var result = await manager.innerCircle({});
    assert.equal(discovered.providers[0].compatible, true);
    assert.equal(result.available, true);
    assert.equal(result.provider.pluginId, 'inner-circle');
    assert.equal(result.context.promotionId, 7);
    assert.deepEqual(result.data.assignments.map(function (assignment) { return assignment.workerId; }), [10, 11]);
    assert.equal(JSON.stringify(result).indexOf('notes'), -1);
    assert.equal(JSON.stringify(result).indexOf('history'), -1);
});

test('supports an explicitly selected side-by-side TEST provider', async function () {
    var api = mockApi({ list: [{ id: 'inner-circle' }, { pluginId: 'inner-circle-test' }] });
    var manager = integrations.createManager(api);
    var result = await manager.innerCircle({ providerId: 'inner-circle-test' });
    assert.equal(result.provider.pluginId, 'inner-circle-test');
});

test('rejects stale save context, older revisions, and changed data at one revision', async function () {
    var mode = 'fresh';
    var api = mockApi({ send: function (target, channel, currentApi) {
        if (channel === integrations.DESCRIBE_CHANNEL) return description(target);
        var value = snapshot(currentApi, target, mode === 'older' ? 3 : 4);
        if (mode === 'wrong-save') value.context.saveHash = '000000000000000000000000';
        if (mode === 'changed') value.data.assignments[0].name = 'Changed without revision';
        return value;
    } });
    var manager = integrations.createManager(api);
    await manager.innerCircle({});
    mode = 'wrong-save';
    await assert.rejects(manager.innerCircle({}), /different save or player promotion/);
    mode = 'older';
    await assert.rejects(manager.innerCircle({}), /older Inner Circle revision/);
    mode = 'changed';
    await assert.rejects(manager.innerCircle({}), /without advancing its revision/);
});

test('rejects malformed or oversized provider data', async function () {
    var mode = 'malformed';
    var api = mockApi({ send: function (target, channel, currentApi) {
        if (channel === integrations.DESCRIBE_CHANNEL) return description(target);
        var value = snapshot(currentApi, target, 1);
        if (mode === 'malformed') value.data.summary.assignedSlots = 99;
        else value.padding = 'x'.repeat(integrations.MAX_SNAPSHOT_BYTES);
        return value;
    } });
    var manager = integrations.createManager(api);
    await assert.rejects(manager.innerCircle({}), /summary does not match/);
    mode = 'oversized';
    await assert.rejects(manager.innerCircle({}), /size limit/);
});

test('database switches clear cached revision state and update save identity', async function () {
    var activePath = null;
    var revision = 5;
    var api = mockApi({ send: function (target, channel, currentApi) {
        if (channel === integrations.DESCRIBE_CHANNEL) return description(target);
        var value = snapshot(currentApi, target, revision);
        if (activePath) value.context = Object.assign(value.context, integrations.contextIdentity(currentApi, activePath));
        return value;
    } });
    var manager = integrations.createManager(api);
    manager.start();
    await manager.innerCircle({});
    activePath = 'C:\\saves\\second.db';
    revision = 0;
    api.__handlers['database:opened']({ data: { dbPath: activePath } });
    var result = await manager.innerCircle({});
    assert.equal(result.context.revision, 0);
    assert.equal(result.context.saveHash, integrations.contextIdentity(api, activePath).saveHash);
    manager.stop();
});
