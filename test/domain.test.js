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

test('state resolves the player promotion when the PWS state helper omits it', function () {
    var api = {
        game: { getState: function () { return { currentDate: '1992-01-11' }; } },
        database: {
            get: function (sql) {
                if (sql.indexOf('FROM saveinfo') !== -1) return { saveName: 'VWE1', saveCurrentDate: '1992-01-11', saveUserPromotion: 229 };
                if (sql.indexOf('FROM promotions') !== -1) return { promotionID: 229, fullName: 'Vanguard Wrestling Entertainment', shortName: 'VWE', prestige: 100, money: 50000000, basedIn: 'North America', basedInCountry: 'United States', basedInRegion: 'Tennessee', style: 'Sports Entertainment' };
                return null;
            }
        }
    };
    var result = domain.state(api);
    assert.equal(result.promotionId, 229);
    assert.equal(result.promotionName, 'Vanguard Wrestling Entertainment');
    assert.equal(result.currentDate, '1992-01-11');
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
