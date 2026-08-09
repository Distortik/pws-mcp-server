#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var DatabaseSync = require('node:sqlite').DatabaseSync;
var booking = require('../src/booking');
var domain = require('../src/domain');

var savePath = process.argv[2] || process.env.PWS_TEST_SAVE;
if (!savePath) {
    process.stderr.write('Usage: node scripts/verify-save.js <path-to-save.db>\n');
    process.exit(2);
}
savePath = path.resolve(savePath);
if (!fs.existsSync(savePath)) {
    process.stderr.write('Save file not found: ' + savePath + '\n');
    process.exit(2);
}

var database = new DatabaseSync(savePath, { readOnly: true });
var api = {
    database: {
        query: function (sql, params) { var statement = database.prepare(sql); return statement.all.apply(statement, params || []); },
        get: function (sql, params) { var statement = database.prepare(sql); return statement.get.apply(statement, params || []); }
    },
    game: {
        getState: function () {
            var save = database.prepare('SELECT saveName,saveCurrentDate,saveUserPromotion FROM saveinfo LIMIT 1').get();
            return { saveName: save.saveName, currentDate: save.saveCurrentDate, promotionId: save.saveUserPromotion };
        }
    }
};

function check(name, callback) {
    var value = callback();
    process.stdout.write('PASS ' + name + (value == null ? '' : ' — ' + value) + '\n');
}

try {
    check('game state', function () { return domain.state(api).promotionName; });
    check('database catalog', function () { return domain.catalog(api, { table: 'workers' }).columns.length + ' worker columns'; });
    check('cross-category search', function () { return domain.search(api, { query: 'Hart', categories: ['all'], limit: 2 }).categories.length + ' categories'; });
    check('company overview', function () { return domain.overview(api).roster.wrestlers + ' wrestlers'; });
    check('roster', function () { return domain.roster(api, { limit: 5 }).roster.length + ' rows'; });
    check('hiring analysis', function () { return domain.hiring(api, { needs: 'young technical babyface and tag team depth', limit: 5 }).candidates.length + ' candidates'; });
    check('contract advice', function () { return domain.contractAdvice(api, { horizonDays: 365, limit: 5 }).contracts.length + ' contracts'; });
    var worker = database.prepare("SELECT workerID FROM workers WHERE type='Wrestler' ORDER BY workerID LIMIT 1").get();
    check('worker profile', function () { return domain.workerProfile(api, { workerId: worker.workerID }).worker.name; });
    var shows = domain.upcomingShows(api, { limit: 1 }).shows;
    if (shows.length) {
        var plan = booking.planShow(api, { showId: shows[0].showId, matchCount: 2, angleCount: 1 });
        check('dry-run booking plan', function () { return plan.segments.length + ' segments'; });
        check('booking validation', function () { return booking.validatePlan(api, { showId: shows[0].showId, segments: plan.segments }).addedMinutes + ' minutes'; });
    } else {
        process.stdout.write('SKIP dry-run booking — save has no unfinished show\n');
    }
} finally {
    database.close();
}
