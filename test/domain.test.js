'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var domain = require('../src/domain');

test('ageAt uses the in-game date', function () {
    assert.equal(domain.ageAt('2000-08-10', '2026-08-09'), 25);
    assert.equal(domain.ageAt('2000-08-09', '2026-08-09'), 26);
    assert.equal(domain.ageAt('', '2026-08-09'), null);
});

test('catalog rejects injected table names', function () {
    assert.throws(function () { domain.catalog({}, { table: 'workers; DROP TABLE workers' }); }, /Invalid table/);
});

test('clamp applies defaults and bounds', function () {
    assert.equal(domain.clamp(undefined, 10, 1, 20), 10);
    assert.equal(domain.clamp(99, 10, 1, 20), 20);
    assert.equal(domain.clamp(-2, 10, 1, 20), 1);
});

test('boolean normalizes native numeric and string flags', function () {
    assert.equal(domain.boolean(1), true);
    assert.equal(domain.boolean('true'), true);
    assert.equal(domain.boolean(0), false);
    assert.equal(domain.boolean('false'), false);
    assert.equal(domain.boolean(null), false);
});

test('default roster reads include occasional wrestlers and expose match eligibility', function () {
    var sqlSeen = [];
    var api = {
        game: { getState: function () { return { promotionId: 2, currentDate: '1992-01-01' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'Test', saveCurrentDate: '1992-01-01', saveUserPromotion: 2 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'VWE', basedIn: 'North America', money: 100000 };
                if (sql.indexOf('COUNT(*)') !== -1) { sqlSeen.push(sql); return { total: 1 }; }
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('WITH usage AS') !== -1) {
                    sqlSeen.push(sql);
                    return [{ contractID: 10, workerID: 20, name: 'Occasional', type: 'Occasional Wrestler', appearances: 0, matches: 0, angles: 0 }];
                }
                return [];
            }
        }
    };
    var result = domain.roster(api, {});
    assert.equal(result.roster[0].type, 'Occasional Wrestler');
    assert.equal(result.roster[0].matchEligible, true);
    assert.equal(sqlSeen.every(function (sql) { return sql.indexOf("'Occasional Wrestler'") !== -1; }), true);
});

test('automatic hiring bands account for cash and top-end contracts and remain advisory', function () {
    var api = {
        game: { getState: function () { return { promotionId: 2, currentDate: '1992-01-01' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'Test', saveCurrentDate: '1992-01-01', saveUserPromotion: 2 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'VWE', basedIn: 'North America', money: 12000000, prestige: 60 };
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('WITH usage AS') !== -1) return [{ contractID: 10, workerID: 20, name: 'Top Star', type: 'Wrestler', wagePerMonth: 80000, wagePerAppearance: 8000 }];
                if (sql.indexOf('FROM workers w LEFT JOIN contracts') !== -1) return [{ workerID: 30, name: 'Candidate', type: 'Occasional Wrestler', wrestlingSkill: 60, entertainment: 60, starPower: 60, marketPopularity: 40, stamina: 60, currentMonthlyWage: 90000, currentAppearanceWage: 9000 }];
                return [];
            }
        }
    };
    var result = domain.hiring(api, { limit: 1 });
    assert.equal(result.budgetModel.advisory, true);
    assert.ok(result.budgetModel.maxMonthlyWage >= 60000);
    assert.ok(result.budgetModel.maxAppearanceWage >= 6000);
    assert.equal(result.candidates[0].type, 'Occasional Wrestler');
    assert.notEqual(result.candidates[0].affordability, 'above user limit');
});

test('promotion size matches PWS continental popularity tiers', function () {
    assert.equal(domain.promotionSize({ northAmericaPop: 11, europePop: 10, asiaPop: 10 }), 'Local');
    assert.equal(domain.promotionSize({ northAmericaPop: 20 }), 'Regional');
    assert.equal(domain.promotionSize({ northAmericaPop: 40 }), 'Cult');
    assert.equal(domain.promotionSize({ northAmericaPop: 60 }), 'National');
    assert.equal(domain.promotionSize({ northAmericaPop: 80 }), 'Continental');
    assert.equal(domain.promotionSize({ northAmericaPop: 60, europePop: 60 }), 'Intercontinental');
    assert.equal(domain.promotionSize({ northAmericaPop: 60, europePop: 60, asiaPop: 60 }), 'Global');
});

test('advanced promotion size matches PWS regional aggregation rules', function () {
    assert.equal(domain.advancedPromotionSize([]), 'Local');
    assert.equal(domain.advancedPromotionSize([{ popularity: 25, countryName: 'US', continent: 'North America' }]), 'Regional');
    assert.equal(domain.advancedPromotionSize([
        { popularity: 45, countryName: 'US', continent: 'North America' },
        { popularity: 40, countryName: 'US', continent: 'North America' }
    ]), 'Cult');
    assert.equal(domain.advancedPromotionSize([{ popularity: 60, countryName: 'US', continent: 'North America' }]), 'Continental');
});

test('state falls back to gameworld when the game state omits advanced popularity mode', function () {
    var api = {
        game: { getState: function () { return { promotionId: 2, currentDate: '1992-01-01' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'Advanced', saveCurrentDate: '1992-01-01', saveUserPromotion: 2 };
                if (sql.indexOf('FROM gameworld') !== -1) return { advancedPopularityMode: 1 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'VWE', basedIn: 'North America', northAmericaPop: 11 };
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('promotionRegionalPopularity') !== -1) return [{ popularity: 25, countryName: 'United States', continent: 'North America' }];
                return [];
            }
        }
    };
    var result = domain.state(api);
    assert.equal(result.size, 'Regional');
    assert.equal(result.sizeMethod, 'regional popularity');
});

test('future availability follows PWS return-date clearing rules', function () {
    var recovered = { injuryType: 'Sprain', injuryHealDate: '1992-01-31', isInRehab: 1, rehabReturnDate: '1992-02-01' };
    assert.equal(domain.isAvailableOn(recovered, '1992-02-01'), true);
    var suspended = { suspended: 1, suspensionEndDate: '1992-02-02' };
    assert.equal(domain.isAvailableOn(suspended, '1992-02-01'), false);
    assert.equal(domain.unavailabilityAt(suspended, '1992-02-01')[0].reason, 'contractSuspension');
    assert.equal(domain.isAvailableOn(suspended, '1992-02-02'), true);
    assert.equal(domain.isAvailableOn({ onTimeOff: 1, timeOffEndDate: '' }, '1992-12-31'), false);
});

test('state resolves the player promotion when the PWS state helper omits it', function () {
    var api = {
        game: { getState: function () { return { currentDate: '1992-01-11' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'VWE1', saveCurrentDate: '1992-01-11', saveUserPromotion: 229 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 229, fullName: 'Vanguard Wrestling Entertainment', shortName: 'VWE', prestige: 100, money: 50000000, basedIn: 'North America', basedInCountry: 'United States', basedInRegion: 'Tennessee', style: 'Sports Entertainment', northAmericaPop: 11, southAmericaPop: 0, europePop: 10, asiaPop: 10, oceaniaPop: 0, africaPop: 0 };
                return null;
            }
        }
    };
    var result = domain.state(api);
    assert.equal(result.promotionId, 229);
    assert.equal(result.promotionName, 'Vanguard Wrestling Entertainment');
    assert.equal(result.currentDate, '1992-01-11');
    assert.equal(result.size, 'Local');
    assert.equal(result.sizeMethod, 'continental popularity');
    assert.deepEqual(result.popularity, { northAmerica: 11, southAmerica: 0, europe: 10, asia: 10, oceania: 0, africa: 0 });
});

test('storyline attribution diagnostics normalize entities and enforce storyline dates', function () {
    var candidateSql = '';
    var api = {
        game: { getState: function () { return { promotionId: 229, currentDate: '1992-04-07' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'VWE1', saveCurrentDate: '1992-04-07', saveUserPromotion: 229 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 229, fullName: 'VWE', basedIn: 'North America', northAmericaPop: 11, europePop: 10, asiaPop: 10 };
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('FROM segments') !== -1) {
                    candidateSql = sql;
                    return [{ segmentID: 1602, matchingHistoryRows: 1 }];
                }
                return [];
            }
        }
    };
    var result = domain.storylineAttributionDiagnostics(api, { limit: 50 });
    assert.equal(result.missingCount, 0);
    assert.match(candidateSql, /&amp;/);
    assert.match(candidateSql, /&#39;/);
    assert.match(candidateSql, /&quot;/);
    assert.match(candidateSql, /date\(ei\.airDate\)>=date\(st\.startDate\)/);
    assert.match(candidateSql, /date\(ei\.airDate\)<=date\(st\.endDate\)/);
});

test('storyline reads support one-story and lean heat responses', function () {
    var api = { game: { getActiveStorylines: function () { return [
        { storylineID: 4, storylineName: 'Other', heat: 30, overview: 'long' },
        { storylineID: 5, storylineName: 'Main', heat: 77.25, segmentCount: 8, overview: 'longer' }
    ]; } } };
    assert.deepEqual(domain.storylines(api, 2, { storylineId: 5, lean: true }), [
        { storylineId: 5, name: 'Main', heat: 77.3, segmentCount: 8, startDate: null }
    ]);
});

test('gimmick reads support search and disposition filters', function () {
    var captured;
    var api = { database: { query: function (sql, params) { captured = { sql: sql, params: params }; return [{ gimmickId: 35, name: 'Arrogant' }]; } } };
    var result = domain.gimmicks(api, { search: 'entertainment', disposition: 'Heel', limit: 20 });
    assert.equal(result.gimmicks[0].name, 'Arrogant');
    assert.match(captured.sql, /modifiers LIKE/);
    assert.match(captured.sql, /dispositionPreference=\?/);
    assert.equal(captured.params[captured.params.length - 1], 20);
});

function managementReadApi(rowsByTable, contract) {
    return {
        game: { getState: function () { return { promotionId: 2, currentDate: '1992-04-20' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'Test', saveCurrentDate: '1992-04-20', saveUserPromotion: 2 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'VWE', shortName: 'VWE', basedIn: 'North America', northAmericaPop: 20 };
                if (sql.indexOf('FROM contracts c JOIN workers') !== -1) return contract || null;
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('FROM alteregos') !== -1) return rowsByTable.personas || [];
                if (sql.indexOf('FROM promises') !== -1) return rowsByTable.promises || [];
                return [];
            }
        }
    };
}

test('persona reads return native alter egos, booleans, and the active contract identity', function () {
    var captured;
    var api = managementReadApi({ personas: [{ personaId: 77, workerId: 781, name: 'Mankind', dateEligible: 1 }] }, { contractId: 10, workerId: 781, workerName: 'Mick Foley', activeName: 'Cactus Jack', promotionID: 2 });
    api.database.query = function (sql, params) {
        if (sql.indexOf('FROM alteregos') !== -1) {
            captured = { sql: sql, params: params };
            return [{ personaId: 77, workerId: 781, name: 'Mankind', promotionEligible: 1, dateEligible: 1, hasMask: 0 }];
        }
        return [];
    };
    var result = domain.personas(api, { contractId: 10 });
    assert.equal(result.contract.activeName, 'Cactus Jack');
    assert.equal(result.personas[0].name, 'Mankind');
    assert.equal(result.personas[0].promotionEligible, true);
    assert.equal(result.personas[0].dateEligible, true);
    assert.equal(result.personas[0].hasMask, false);
    assert.match(captured.sql, /ae\.workerID=\?/);
    assert.equal(captured.params[3], 781);
    assert.match(result.note, /global worker name is preserved/);
});

test('promise reads classify pending and accepted obligations', function () {
    var api = managementReadApi({ promises: [
        { promiseId: 1, agreed: 0, expired: 0, passed: 0, type: 'Title Win', decisionEmailId: 9, decisionIsHandled: 0 },
        { promiseId: 2, agreed: 1, expired: 0, passed: 0, type: 'Match' },
        { promiseId: 3, agreed: -1, expired: 0, passed: 0, type: 'Push' }
    ] });
    var result = domain.promises(api, { includeResolved: true });
    assert.deepEqual(result.promises.map(function (row) { return row.status; }), ['pending', 'active', 'declined']);
    assert.deepEqual(result.counts, { pending: 1, active: 1, declined: 1 });
    assert.equal(result.promises[0].actionable, true);
    assert.equal(result.promises[0].expired, false);
    assert.equal(result.promises[0].passed, false);
    assert.equal(result.promises[0].decisionIsHandled, false);
});

test('upcoming shows fall back to vw_eventinstance when the event join misses a live show', function () {
    var api = {
        game: { getState: function () { return { promotionId: 2, currentDate: '1992-03-23' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveUserPromotion: 2, saveCurrentDate: '1992-03-23' };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'VWE', basedIn: 'North America' };
                if (sql.indexOf('FROM segments WHERE') !== -1) return { bookedMinutes: 42, segmentCount: 4 };
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('FROM eventinstance ei JOIN events') !== -1) return [];
                if (sql.indexOf('FROM vw_eventinstance') !== -1) return [{ instanceID: 347, airDate: '1992-03-23', eventName: 'Dominion', eventLength: 120, promotionID: 2, complete: 0 }];
                return [];
            }
        }
    };
    var result = domain.upcomingShows(api, { limit: 20 });
    assert.equal(result.shows[0].showId, 347);
    assert.equal(result.shows[0].bookedMinutes, 42);
});

test('upcoming shows merge view-only shows when the event join is partially successful', function () {
    var api = {
        game: { getState: function () { return { promotionId: 2, currentDate: '1992-03-23' }; } },
        database: {
            get: function (sql, params) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveUserPromotion: 2, saveCurrentDate: '1992-03-23' };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 2, fullName: 'VWE', basedIn: 'North America' };
                if (sql.indexOf('FROM segments WHERE') !== -1) return { bookedMinutes: params[0] === 348 ? 12 : 0, segmentCount: params[0] === 348 ? 1 : 0 };
                return null;
            },
            query: function (sql) {
                if (sql.indexOf('FROM eventinstance ei JOIN events') !== -1) return [{ showId: 347, date: '1992-03-23', name: 'Dominion', length: 120, bookedMinutes: 42, segmentCount: 4 }];
                if (sql.indexOf('FROM vw_eventinstance') !== -1) return [
                    { instanceID: 347, airDate: '1992-03-23', eventName: 'Dominion', eventLength: 120, promotionID: 2, complete: 0 },
                    { instanceID: 348, airDate: '1992-03-24', eventName: 'Tour Show', eventLength: 90, promotionID: 2, complete: 0 }
                ];
                return [];
            }
        }
    };
    var result = domain.upcomingShows(api, { limit: 20 });
    assert.deepEqual(result.shows.map(function (show) { return show.showId; }), [347, 348]);
    assert.equal(result.shows[1].bookedMinutes, 12);
});

test('show reads normalize flags and return structured participant groups', function () {
    var api = { database: {
        get: function () { return { showId: 50, importance: 1, promotionID: 2, length: 60, complete: 0, isCancelled: 'false' }; },
        query: function (sql) {
            if (sql.indexOf('FROM segments') !== -1) return [{ segmentId: 7, type: 'Match', length: 10, isPreshow: 0, isMainshow: 1, isPostshow: 0, participantSummary: '0:10:One | 1:20:Two' }];
            if (sql.indexOf('FROM opponents o JOIN segments') !== -1) return [
                { segmentID: 7, opponentID: 1, opponentSet: 0, contractID: 10, workerID: 1, isRingside: 0, isSubject: 0, name: 'One' },
                { segmentID: 7, opponentID: 2, opponentSet: 1, contractID: 20, workerID: 2, isRingside: 0, isSubject: 0, name: 'Two' },
                { segmentID: 7, opponentID: 3, opponentSet: -1, contractID: 30, workerID: 3, isRingside: 1, isSubject: 0, name: 'Manager' }
            ];
            return [];
        }
    } };
    var result = domain.show(api, { showId: 50 });
    assert.equal(result.show.importance, 'Unimportant');
    assert.equal(result.show.complete, false);
    assert.equal(result.show.isCancelled, false);
    assert.equal(result.segments[0].type, 'match');
    assert.equal(result.segments[0].isMainshow, true);
    assert.deepEqual(result.segments[0].participants, [[10], [20]]);
    assert.deepEqual(result.segments[0].ringsideWorkers, [30]);
    assert.equal(result.segments[0].opponentDetails[0].subject, false);
});
