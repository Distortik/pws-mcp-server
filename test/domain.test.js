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
