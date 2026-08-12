'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var actions = require('../src/actions');
var audit = require('../src/audit');
var domain = require('../src/domain');
var segments = require('../src/segments');

function withContext(callback) {
    var original = domain.context;
    domain.context = function () { return { promotionId: 2, currentDate: '1992-04-20', promotion: { fullName: 'Player Promotion' } }; };
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

function stableApi() {
    var state = {
        nextId: 8, stable: null,
        contracts: {
            10: { contractID: 10, workerID: 1, promotionID: 2, finalised: 1, expired: 0, contractStarted: 1, name: 'One', contractName: 'One', gimmick: 'None', contractPicture: 'One.png', hasMask: 0 },
            20: { contractID: 20, workerID: 2, promotionID: 2, finalised: 1, expired: 0, contractStarted: 1, name: 'Two', gimmick: 'None' },
            30: { contractID: 30, workerID: 3, promotionID: 2, finalised: 1, expired: 0, contractStarted: 1, name: 'Three', gimmick: 'None' }
        }
    };
    function members() { return state.stable ? state.stable.members.map(function (member) { return Object.assign({}, member, state.contracts[member.contractID]); }) : []; }
    return {
        _state: state,
        database: {
            get: function (sql, params) {
                if (sql.indexOf('FROM contracts c LEFT JOIN workers') !== -1) return Object.assign({}, state.contracts[Number(params[0])]);
                if (sql.indexOf('SELECT contractID,workerID,promotionID,gimmick') !== -1) return Object.assign({}, state.contracts[Number(params[0])]);
                if (sql.indexOf('FROM alteregos ae LEFT JOIN promotions') !== -1) return Number(params[0]) === 77 ? { personaId: 77, workerID: 1, name: 'The One', preferredGimmick: 'Heel Manager', promotionExclusive: 2, exclusivePromotion: 'Player Promotion', picture: 'The%20One.png', hasMask: 1 } : null;
                if (sql.indexOf('SELECT contractID,workerID,promotionID,contractName') !== -1) return Object.assign({ activeName: state.contracts[Number(params[0])].contractName }, state.contracts[Number(params[0])]);
                if (sql.indexOf('SELECT stableID FROM stables') !== -1) return state.stable ? { stableID: state.stable.stableID } : null;
                if (sql.indexOf('FROM stables WHERE') !== -1) return state.stable ? Object.assign({}, state.stable) : null;
                if (sql.indexOf('FROM gimmicks WHERE') !== -1) return String(params[0]).toLowerCase() === 'heel manager' ? { name: 'Heel Manager' } : null;
                return null;
            },
            query: function (sql) { return sql.indexOf('FROM stableworkers') !== -1 ? members() : []; },
            execute: function (sql, params) {
                if (sql.indexOf('UPDATE contracts SET contractPicture') !== -1) state.contracts[Number(params[1])].contractPicture = params[0];
            }
        },
        actions: {
            createStable: function (opts) {
                state.stable = { stableID: state.nextId++, stableName: opts.name, stableHeat: opts.heat, promotionID: opts.promotionId, stableImage: '', members: opts.contractIds.map(function (id) { return { contractID: id, isLeader: id === opts.leaderContractId ? 'true' : 'false' }; }) };
                return { success: true, stableId: state.stable.stableID };
            },
            addWorkerToStable: function (_stableId, contractId, leader) { state.stable.members.push({ contractID: contractId, isLeader: leader ? 'true' : 'false' }); return { success: true }; },
            removeWorkerFromStable: function (_stableId, contractId) { state.stable.members = state.stable.members.filter(function (member) { return member.contractID !== contractId; }); return { success: true }; },
            dissolveStable: function () { state.stable = null; return { success: true }; },
            modifyContract: function (opts) { Object.assign(state.contracts[opts.contractId], opts.changes); return { success: true }; }
        }
    };
}

test('creates and verifies a stable with a leader', function () {
    withContext(function () {
        var api = stableApi();
        var preview = actions.createStable(api, { name: 'The Group', contractIds: [10, 20], leaderContractId: 10, heat: 65 });
        assert.equal(preview.status, 'preview');
        var result = actions.createStable(api, { name: 'The Group', contractIds: [10, 20], leaderContractId: 10, heat: 65, preview: false, confirmed: true });
        assert.equal(result.after.stableName, 'The Group');
        assert.equal(result.after.members.length, 2);
    });
});

test('adds, removes, and dissolves stable membership safely', function () {
    withContext(function () {
        var api = stableApi();
        actions.createStable(api, { name: 'The Group', contractIds: [10, 20], preview: false, confirmed: true });
        actions.changeStableMember(api, { stableId: 8, contractId: 30, isLeader: false, preview: false, confirmed: true }, true);
        var removed = actions.changeStableMember(api, { stableId: 8, contractId: 30, preview: false, confirmed: true }, false);
        assert.equal(removed.after.members.length, 2);
        assert.throws(function () { actions.changeStableMember(api, { stableId: 8, contractId: 10 }, false); }, /at least two members/);
        var dissolved = actions.dissolveStable(api, { stableId: 8, preview: false, confirmed: true });
        assert.equal(dissolved.after, null);
    });
});

test('rejects a stable member addition when the requested leader flag is lost', function () {
    withContext(function () {
        var api = stableApi();
        actions.createStable(api, { name: 'The Group', contractIds: [10, 20], preview: false, confirmed: true });
        api.actions.addWorkerToStable = function (_stableId, contractId) {
            api._state.stable.members.push({ contractID: contractId, isLeader: 'false' });
            return { success: true };
        };
        assert.throws(function () {
            actions.changeStableMember(api, { stableId: 8, contractId: 30, isLeader: true, preview: false, confirmed: true }, true);
        }, /Post-action verification failed/);
    });
});

test('sets and verifies a contract gimmick through PWS actions', function () {
    withContext(function () {
        var api = stableApi();
        var result = actions.setContractGimmick(api, { contractId: 10, gimmick: 'Heel Manager', preview: false, confirmed: true });
        assert.equal(result.after.gimmick, 'Heel Manager');
        assert.throws(function () { actions.setContractGimmick(api, { contractId: 10, gimmick: 'Not In This Database' }); }, /Gimmick not found/);
    });
});

test('switches a contract persona without renaming the underlying worker', function () {
    withContext(function () {
        var api = stableApi();
        var preview = actions.setContractPersona(api, { contractId: 10, personaId: 77 });
        assert.equal(preview.proposed.name, 'The One');
        assert.equal(preview.proposed.gimmick, 'Heel Manager');
        assert.equal(preview.proposed.contractPicture, 'The%20One.png');
        assert.equal(preview.proposed.hasMask, 1);
        assert.equal(preview.proposed.nativeEligibility.promotionEligible, true);
        var result = actions.setContractPersona(api, { contractId: 10, personaId: 77, preview: false, confirmed: true });
        assert.equal(result.after.contractName, 'The One');
        assert.equal(result.after.gimmick, 'Heel Manager');
        assert.equal(result.after.contractPicture, 'The%20One.png');
        assert.equal(result.after.hasMask, 1);
        var restored = actions.setContractPersona(api, { contractId: 10, name: 'One', gimmick: 'None', picture: 'One.png', hasMask: false, preview: false, confirmed: true });
        assert.equal(restored.after.contractName, 'One');
        assert.equal(restored.after.gimmick, 'None');
        assert.equal(restored.after.contractPicture, 'One.png');
        assert.equal(restored.after.hasMask, 0);
        assert.throws(function () { actions.setContractPersona(api, { contractId: 10, personaId: 77, name: 'Conflict' }); }, /not both/);
    });
});

test('enforces persona promotion access and requires an explicit date override', function () {
    withContext(function () {
        var api = stableApi();
        var originalGet = api.database.get;
        api.database.get = function (sql, params) {
            if (sql.indexOf('FROM alteregos ae LEFT JOIN promotions') !== -1) return { personaId: 78, workerID: 1, name: 'Future One', preferredGimmick: 'Heel Manager', promotionExclusive: 2, exclusivePromotion: 'Player Promotion', minDate: '2000-01-01' };
            return originalGet(sql, params);
        };
        assert.throws(function () { actions.setContractPersona(api, { contractId: 10, personaId: 78 }); }, /allowDateOverride=true/);
        var preview = actions.setContractPersona(api, { contractId: 10, personaId: 78, allowDateOverride: true });
        assert.equal(preview.proposed.nativeEligibility.dateEligible, false);
        assert.equal(preview.proposed.nativeEligibility.dateOverride, true);
        assert.equal(preview.warnings.length, 1);

        api.database.get = function (sql, params) {
            if (sql.indexOf('FROM alteregos ae LEFT JOIN promotions') !== -1) return { personaId: 79, workerID: 1, name: 'Exclusive One', preferredGimmick: 'Heel Manager', promotionExclusive: 19, exclusivePromotion: 'Other Promotion' };
            return originalGet(sql, params);
        };
        assert.throws(function () { actions.setContractPersona(api, { contractId: 10, personaId: 79 }); }, /pws_set_persona_availability/);
    });
});

test('restores the contract when complete persona presentation verification fails', function () {
    withContext(function () {
        var api = stableApi();
        api.database.execute = function () { /* simulate PWS dropping the requested picture */ };
        assert.throws(function () {
            actions.setContractPersona(api, { contractId: 10, personaId: 77, preview: false, confirmed: true });
        }, /contract was restored/);
        assert.equal(api._state.contracts[10].contractName, 'One');
        assert.equal(api._state.contracts[10].gimmick, 'None');
        assert.equal(api._state.contracts[10].contractPicture, 'One.png');
        assert.equal(api._state.contracts[10].hasMask, 0);
    });
});

test('changes a promotion-exclusive persona to free use and verifies it', function () {
    withContext(function () {
        var persona = { personaId: 79, workerId: 781, workerName: 'Mark Calaway', name: 'The Undertaker', promotionExclusive: 19, exclusivePromotion: 'WWF' };
        var writes = [];
        var api = { database: {
            get: function (sql, params) {
                if (sql.indexOf('FROM alteregos ae') !== -1) return Object.assign({}, persona);
                if (sql.indexOf('SELECT promotionID,fullName FROM promotions') !== -1 && Number(params[0]) === 19) return { promotionID: 19, fullName: 'WWF' };
                return null;
            },
            execute: function (sql, params) { writes.push([sql, params]); persona.promotionExclusive = params[0]; persona.exclusivePromotion = Number(params[0]) === 19 ? 'WWF' : null; }
        } };
        var preview = actions.setPersonaAvailability(api, { personaId: 79, availability: 'free-use' });
        assert.equal(preview.proposed.promotionExclusive, 0);
        assert.equal(writes.length, 0);
        var applied = actions.setPersonaAvailability(api, { personaId: 79, availability: 'free-use', preview: false, confirmed: true });
        assert.equal(applied.after.promotionExclusive, 0);
        assert.match(writes[0][0], /UPDATE alteregos SET promotionExclusive/);
        var restored = actions.setPersonaAvailability(api, { personaId: 79, availability: 'specific-promotion', promotionId: 19, preview: false, confirmed: true });
        assert.equal(restored.after.promotionExclusive, 19);
        assert.equal(restored.after.exclusivePromotion, 'WWF');
    });
});

function promiseApi(dropEmailUpdate) {
    var state = {
        promise: { promiseId: 55, type: 'Title Match', agreed: 0, expired: 0, passed: 0, promotionID: 2, contractId: 10, workerId: 1, workerName: 'Worker' },
        email: { emailID: 99, workerInvolved1: 1, workerInvolved2: null, hasDecision: 1, decisionIsHandled: 0 },
        relationship: null,
        statements: []
    };
    var snapshot = null;
    function restore(value) {
        state.promise = value.promise; state.email = value.email; state.relationship = value.relationship;
    }
    return { _state: state, database: {
        get: function (sql) {
            if (sql.indexOf('FROM promises p') !== -1) return Object.assign({}, state.promise);
            if (sql.indexOf('FROM emails WHERE') !== -1) return Object.assign({}, state.email);
            if (sql.indexOf('FROM relationships WHERE') !== -1) return state.relationship && Object.assign({}, state.relationship);
            return null;
        },
        execute: function (sql, params) {
            state.statements.push(sql);
            if (sql === 'BEGIN IMMEDIATE') { snapshot = JSON.parse(JSON.stringify(state)); return {}; }
            if (sql === 'COMMIT') { snapshot = null; return {}; }
            if (sql === 'ROLLBACK') { restore(snapshot); snapshot = null; return {}; }
            if (sql.indexOf('UPDATE promises SET agreed') !== -1) state.promise.agreed = params[0];
            else if (sql.indexOf('UPDATE emails SET decisionIsHandled') !== -1 && !dropEmailUpdate) state.email.decisionIsHandled = 1;
            else if (sql.indexOf('UPDATE relationships SET relationship') !== -1) state.relationship.relationship = params[0];
            else if (sql.indexOf('INSERT INTO relationships') !== -1) state.relationship = { relationshipID: 500, worker1: params[0], worker2: -1, relationship: params[1] };
            return {};
        }
    } };
}

test('accepts and declines pending promises with native relationship consequences', function () {
    withContext(function () {
        var acceptedApi = promiseApi(false);
        var preview = actions.respondToPromise(acceptedApi, { promiseId: 55, decision: 'accept' });
        assert.equal(preview.proposed.status, 'active');
        assert.deepEqual(preview.proposed.relationshipEffect, { minimum: 5, maximum: 15 });
        var accepted = actions.respondToPromise(acceptedApi, { promiseId: 55, decision: 'accept', preview: false, confirmed: true });
        assert.equal(accepted.after.status, 'active');
        assert.equal(accepted.after.email.decisionIsHandled, 1);
        assert.ok(accepted.result.relationshipChange >= 5 && accepted.result.relationshipChange <= 15);
        assert.equal(acceptedApi._state.statements[0], 'BEGIN IMMEDIATE');
        assert.equal(acceptedApi._state.statements[acceptedApi._state.statements.length - 1], 'COMMIT');

        var declinedApi = promiseApi(false);
        var declined = actions.respondToPromise(declinedApi, { promiseId: 55, decision: 'decline', preview: false, confirmed: true });
        assert.equal(declined.after.status, 'declined');
        assert.ok(declined.result.relationshipChange >= -15 && declined.result.relationshipChange <= -5);
    });
});

test('rolls back an incomplete promise response', function () {
    withContext(function () {
        var api = promiseApi(true);
        assert.throws(function () {
            actions.respondToPromise(api, { promiseId: 55, decision: 'accept', preview: false, confirmed: true });
        }, /did not persist completely/);
        assert.equal(api._state.promise.agreed, 0);
        assert.equal(api._state.email.decisionIsHandled, 0);
        assert.equal(api._state.relationship, null);
        assert.equal(api._state.statements[api._state.statements.length - 1], 'ROLLBACK');
    });
});

test('creates an event, schedules a show, cancels it, and archives the series reversibly', function () {
    withContext(function () {
        var state = { event: null, show: null };
        var api = {
            database: {
                get: function (sql, params) {
                    if (sql.indexOf('SELECT eventID FROM events') !== -1) return state.event && { eventID: state.event.eventID };
                    if (sql.indexOf('FROM events WHERE eventID') !== -1) return state.event && Object.assign({}, state.event);
                    if (sql.indexOf('FROM venues') !== -1) return { venueID: 99 };
                    if (sql.indexOf('FROM eventinstance WHERE eventID') !== -1) return state.show && Object.assign({}, state.show);
                    if (sql.indexOf('JOIN events') !== -1) return state.show && Object.assign({ promotionID: 2 }, state.show);
                    if (sql.indexOf('FROM eventinstance WHERE instanceID') !== -1) return state.show && Object.assign({}, state.show);
                    return null;
                },
                query: function (sql) {
                    if (sql.indexOf('FROM eventinstance WHERE eventID') !== -1) return state.show ? [Object.assign({}, state.show)] : [];
                    return [];
                },
                execute: function (sql, params) {
                    if (sql.indexOf('UPDATE events SET importance=0') !== -1 && state.event) state.event.importance = 0;
                    if (sql.indexOf('UPDATE events SET inactive') !== -1 && state.event) state.event.inactive = params[0];
                }
            },
            actions: {
                createEvent: function (opts) { state.event = { eventID: 7, eventName: opts.name, promotionID: 2, prestige: opts.prestige, recurrenceType: opts.recurrenceType, eventLength: opts.eventLength, importance: 2, inactive: 0 }; return { success: true, eventId: 7 }; },
                scheduleShow: function (opts) { state.show = { showId: 50, instanceID: 50, eventID: opts.eventId, airDate: opts.airDate, location: opts.location, venueID: opts.venueId, complete: 0, isCancelled: 0 }; return { success: true, instanceId: 50 }; },
                cancelShow: function () { state.show.isCancelled = 1; return { success: true }; }
            }
        };
        var created = actions.createEvent(api, { name: 'Special', recurrenceType: 'OneOff', eventLength: 180, preview: false, confirmed: true });
        assert.equal(created.after.eventID, 7);
        assert.equal(created.after.importance, 'Normal');
        var houseShow = actions.createEvent(api, { name: 'House Special', recurrenceType: 'OneOff', importance: 'House Show', eventLength: 90, preview: false, confirmed: true });
        assert.equal(houseShow.after.importance, 'House Show');
        var scheduled = actions.scheduleShow(api, { eventId: 7, airDate: '1992-05-01', venueId: 99, preview: false, confirmed: true });
        assert.equal(scheduled.after.showId, 50);
        assert.throws(function () { actions.setEventActive(api, { eventId: 7, active: false }); }, /unfinished, non-cancelled/);
        var cancelled = actions.cancelShow(api, { showId: 50, preview: false, confirmed: true });
        assert.equal(cancelled.after.isCancelled, 1);
        var archived = actions.setEventActive(api, { eventId: 7, active: false, preview: false, confirmed: true });
        assert.equal(archived.after.active, false);
        assert.equal(archived.after.inactive, true);
        var restored = actions.setEventActive(api, { eventId: 7, active: true, preview: false, confirmed: true });
        assert.equal(restored.after.active, true);
    });
});
