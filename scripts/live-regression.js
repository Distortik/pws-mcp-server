#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var server = require('../mcp-server');
var packageJson = require('../package.json');

var root = path.resolve(__dirname, '..');

function parseArgs(argv) {
    var options = { personaId: null, eventId: null, output: null };
    for (var index = 0; index < argv.length; index += 1) {
        var key = argv[index];
        if (key === '--persona-id' || key === '--event-id' || key === '--output') {
            if (index + 1 >= argv.length) throw new Error(key + ' requires a value');
            var value = argv[index += 1];
            if (key === '--output') options.output = value;
            else {
                var id = Number(value);
                if (!Number.isInteger(id) || id < 1) throw new Error(key + ' must be a positive integer');
                if (key === '--persona-id') options.personaId = id;
                else options.eventId = id;
            }
        } else if (key === '--help' || key === '-h') {
            options.help = true;
        } else {
            throw new Error('Unknown argument: ' + key);
        }
    }
    return options;
}

function usage() {
    return [
        'Usage: node scripts/live-regression.js [options]',
        '',
        'Runs live read-only bridge checks against the loaded PWS save.',
        'Optional IDs enable reversible mutation checks restored in a finally block:',
        '  --persona-id <id>  Toggle persona availability, then restore it exactly',
        '  --event-id <id>    Toggle an archive-safe event series, then restore it exactly',
        '  --output <path>    Choose the JSON report path (default: dist/live-regression-*.json)'
    ].join('\n');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function compact(value) {
    if (value == null) return null;
    if (Array.isArray(value)) return { count: value.length };
    if (typeof value !== 'object') return value;
    if (value.game && value.game.saveName) return { saveName: value.game.saveName, keys: Object.keys(value).sort() };
    if (value.saveName) return { saveName: value.saveName, promotion: value.promotionName || null, date: value.currentDate || null };
    return { keys: Object.keys(value).sort() };
}

async function run(options) {
    options = options || {};
    var startedAt = new Date().toISOString();
    var results = [];
    var cleanup = [];

    async function check(name, callback) {
        try {
            var value = await callback();
            results.push({ name: name, status: 'pass', detail: compact(value) });
            process.stdout.write('PASS ' + name + '\n');
            return value;
        } catch (error) {
            results.push({ name: name, status: 'fail', error: error.message });
            process.stdout.write('FAIL ' + name + ' - ' + error.message + '\n');
            return null;
        }
    }

    var health;
    var state;
    try {
        health = await check('bridge health', function () { return server.rpc('health'); });
        assert(health, 'bridge health failed');
        assert(health.pluginVersion === packageJson.version, 'version mismatch: runner is ' + packageJson.version + ' but the in-game plugin is ' + (health.pluginVersion || 'unknown'));
        state = await check('game state', function () { return server.rpc('game.state'); });
        assert(state, 'game state failed');
        await check('company overview', function () { return server.rpc('company.overview'); });
        await check('roster', function () { return server.rpc('roster.list', { limit: 5 }); });
        await check('database catalog', function () { return server.rpc('database.catalog', { table: 'workers' }); });
        await check('venues', function () { return server.rpc('venues.list', { limit: 5 }); });
        await check('stables', function () { return server.rpc('stables.list'); });
        await check('personas and boolean flags', async function () {
            var value = await server.rpc('personas.list', { limit: 5 });
            value.personas.forEach(function (persona) {
                assert(typeof persona.promotionEligible === 'boolean', 'promotionEligible is not boolean');
                assert(typeof persona.dateEligible === 'boolean', 'dateEligible is not boolean');
                assert(typeof persona.hasMask === 'boolean', 'hasMask is not boolean');
            });
            return value;
        });
        await check('promises and boolean flags', async function () {
            var value = await server.rpc('promises.list', { includeResolved: true, limit: 10 });
            value.promises.forEach(function (promise) {
                assert(typeof promise.actionable === 'boolean', 'actionable is not boolean');
                assert(typeof promise.overdue === 'boolean', 'overdue is not boolean');
                assert(typeof promise.expired === 'boolean', 'expired is not boolean');
                assert(typeof promise.passed === 'boolean', 'passed is not boolean');
            });
            return value;
        });
        await check('storyline attribution diagnostics', function () { return server.rpc('storylines.diagnoseAttribution', { limit: 10 }); });
        var upcoming = await check('upcoming shows', function () { return server.rpc('shows.upcoming', { limit: 10 }); });
        if (upcoming && upcoming.shows && upcoming.shows.length) {
            await check('show readiness audit', function () { return server.rpc('shows.audit', { showId: Number(upcoming.shows[0].showId) }); });
            await check('structured show participants', async function () {
                var value = await server.rpc('shows.get', { showId: Number(upcoming.shows[0].showId) });
                value.segments.forEach(function (segment) {
                    assert(Array.isArray(segment.participants), 'segment ' + segment.segmentId + ' participants are not structured groups');
                    assert(Array.isArray(segment.opponentDetails), 'segment ' + segment.segmentId + ' has no opponentDetails array');
                });
                return value;
            });
        }
        await check('worker usage analysis', function () { return server.rpc('roster.usage', { days: 90 }); });
        await check('tag teams', function () { return server.rpc('tagTeams.list'); });
        await check('brands', function () { return server.rpc('brands.list'); });
        await check('championship management', function () { return server.rpc('championships.list'); });
        await check('network options', function () { return server.rpc('networks.list'); });
        await check('event series', function () { return server.rpc('events.list'); });
        await check('read-only SQL rejection', async function () {
            var rejected = false;
            try { await server.rpc('database.query', { sql: 'UPDATE workers SET name=name' }); }
            catch (error) { rejected = /Only SELECT|safe schema PRAGMA/i.test(error.message); }
            assert(rejected, 'write query was not rejected by the bridge');
            return { rejected: true };
        });

        if (options.personaId) {
            await check('reversible persona availability', async function () {
                var rows = await server.rpc('database.query', {
                    sql: 'SELECT egoID AS personaId,COALESCE(promotionExclusive,0) AS promotionExclusive FROM alteregos WHERE egoID=?',
                    parameters: [options.personaId], maxRows: 1
                });
                var before = rows[0];
                assert(before, 'persona not found: ' + options.personaId);
                var originalPromotion = Number(before.promotionExclusive || 0);
                var target = originalPromotion === 0 ? { availability: 'player-promotion' } : { availability: 'free-use' };
                await server.rpc('personas.setAvailability', Object.assign({ personaId: options.personaId, preview: false, confirmed: true }, target));
                cleanup.push(function () {
                    var restore = originalPromotion === 0 ? { availability: 'free-use' } : { availability: 'specific-promotion', promotionId: originalPromotion };
                    return server.rpc('personas.setAvailability', Object.assign({ personaId: options.personaId, preview: false, confirmed: true }, restore));
                });
                return { personaId: options.personaId, originalPromotion: originalPromotion, temporaryAvailability: target.availability };
            });
        }

        if (options.eventId) {
            await check('reversible event active state', async function () {
                var rows = await server.rpc('database.query', {
                    sql: 'SELECT eventID AS eventId,COALESCE(inactive,0) AS inactive FROM events WHERE eventID=?',
                    parameters: [options.eventId], maxRows: 1
                });
                var before = rows[0];
                assert(before, 'event not found: ' + options.eventId);
                var originallyActive = Number(before.inactive || 0) === 0;
                await server.rpc('events.setActive', { eventId: options.eventId, active: !originallyActive, preview: false, confirmed: true });
                cleanup.push(function () {
                    return server.rpc('events.setActive', { eventId: options.eventId, active: originallyActive, preview: false, confirmed: true });
                });
                return { eventId: options.eventId, originallyActive: originallyActive, temporaryActive: !originallyActive };
            });
        }
    } finally {
        while (cleanup.length) {
            var restore = cleanup.pop();
            await check('cleanup #' + (cleanup.length + 1), restore);
        }
    }

    if (health && state) results.unshift({ name: 'runtime', status: 'info', detail: { pluginVersion: health.pluginVersion || null, saveName: state.saveName || null, promotion: state.promotionName || null, gameDate: state.currentDate || null } });
    var report = {
        startedAt: startedAt,
        finishedAt: new Date().toISOString(),
        passed: results.filter(function (item) { return item.status === 'pass'; }).length,
        failed: results.filter(function (item) { return item.status === 'fail'; }).length,
        results: results
    };
    var output = options.output ? path.resolve(options.output) : path.join(root, 'dist', 'live-regression-' + startedAt.replace(/[:.]/g, '-') + '.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
    process.stdout.write('REPORT ' + output + '\n');
    return { report: report, output: output };
}

if (require.main === module) {
    var options;
    try { options = parseArgs(process.argv.slice(2)); }
    catch (error) { process.stderr.write(error.message + '\n\n' + usage() + '\n'); process.exit(2); }
    if (options.help) process.stdout.write(usage() + '\n');
    else run(options).then(function (result) { if (result.report.failed) process.exitCode = 1; }).catch(function (error) {
        process.stderr.write('Live regression aborted: ' + error.message + '\n');
        process.exitCode = 1;
    });
}

module.exports = { parseArgs: parseArgs, run: run, usage: usage };
