'use strict';

var crypto = require('crypto');
var fs = require('fs');
var http = require('http');
var path = require('path');
var booking = require('./booking');
var audit = require('./audit');
var domain = require('./domain');
var integrations = require('./integrations');
var runtime = require('./runtime');
var segments = require('./segments');
var purposeBuiltActions = require('./actions');

var MAX_BODY_BYTES = 1024 * 1024;
var ACTIONS = {
    create_storyline: ['createStoryline', 'object'],
    sign_worker: ['signWorker', 'object'],
    award_title: ['awardTitle', 'object'],
    update_worker_attribute: ['updateWorkerAttribute', 'attribute'],
    create_news_item: ['createNewsItem', 'object'],
    create_email: ['createEmail', 'object']
};

function json(response, status, payload) {
    var body = JSON.stringify(payload);
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store'
    });
    response.end(body);
}

function readBody(request) {
    return new Promise(function (resolve, reject) {
        var chunks = [];
        var size = 0;
        request.on('data', function (chunk) {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Request body exceeds 1 MiB'));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', function () {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
            catch (error) { reject(new Error('Invalid JSON body')); }
        });
        request.on('error', reject);
    });
}

function assertReadOnlySql(sql) {
    var normalized = String(sql || '').trim();
    if (!/^(select|with|pragma\s+(table_info|table_list|foreign_key_list)\s*\()/i.test(normalized)) {
        throw new Error('Only SELECT, WITH, and safe schema PRAGMA queries are allowed');
    }
    var quote = null;
    var comment = null;
    for (var index = 0; index < normalized.length; index += 1) {
        var character = normalized[index];
        var next = normalized[index + 1];
        if (comment === 'line') { if (character === '\n' || character === '\r') comment = null; continue; }
        if (comment === 'block') { if (character === '*' && next === '/') { comment = null; index += 1; } continue; }
        if (quote) {
            if (character === quote) {
                if (next === quote) { index += 1; continue; }
                quote = null;
            }
            continue;
        }
        if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
        if (character === '[') { quote = ']'; continue; }
        if (character === '-' && next === '-') { comment = 'line'; index += 1; continue; }
        if (character === '/' && next === '*') { comment = 'block'; index += 1; continue; }
        if (character === ';' && normalized.slice(index + 1).trim()) throw new Error('Only one SQL statement is allowed');
    }
    return normalized;
}

function readOnlyQuery(api, params) {
    var sql = assertReadOnlySql(params.sql);
    var values = Array.isArray(params.parameters) ? params.parameters : [];
    var maxRows = domain.clamp(params.maxRows, 500, 1, 2000);
    if (/^pragma\s/i.test(sql)) return api.database.query(sql, values);
    sql = sql.replace(/;\s*$/, '');
    return api.database.query('SELECT * FROM (' + sql + ') AS pws_mcp_result LIMIT ?', values.concat([maxRows]));
}

function actionInteger(value, label, minimum) {
    var parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(label + ' must be an integer of at least ' + minimum);
    return parsed;
}

function actionMoney(value, label) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(label + ' must be a non-negative number');
    return parsed;
}

function normalizeSignWorkerArguments(api, input) {
    var args = Object.assign({}, input || {});
    args.workerId = actionInteger(args.workerId, 'workerId', 1);
    args.promotionId = actionInteger(args.promotionId, 'promotionId', 1);
    var contractTypes = { written: 'Written', handshake: 'Handshake', ppa: 'PPA' };
    var contractType = contractTypes[String(args.contractType || '').trim().toLowerCase()];
    if (!contractType) throw new Error('contractType must be Written, Handshake, or PPA');
    args.contractType = contractType;
    if (!String(args.role || '').trim()) throw new Error('role is required');
    args.role = String(args.role).trim();
    args.exclusive = args.exclusive === true;

    if (args.wages != null) {
        if (args.wagePerMonth != null || args.wagePerAppearance != null) throw new Error('Use wages or the canonical wagePerMonth/wagePerAppearance fields, not both');
        if (contractType === 'Written') args.wagePerMonth = actionMoney(args.wages, 'wages');
        else args.wagePerAppearance = actionMoney(args.wages, 'wages');
        delete args.wages;
    }
    if (args.wagePerMonth != null) args.wagePerMonth = actionMoney(args.wagePerMonth, 'wagePerMonth');
    if (args.wagePerAppearance != null) args.wagePerAppearance = actionMoney(args.wagePerAppearance, 'wagePerAppearance');
    if (args.contractLength != null) {
        args.contractLength = actionInteger(args.contractLength, 'contractLength', -1);
        if (args.contractLength === 0) throw new Error('contractLength is measured in days and must be -1 for indefinite or at least 1');
    }
    if (args.brand != null) args.brand = actionInteger(args.brand, 'brand', 1);
    if (args.gimmick != null) args.gimmick = purposeBuiltActions.validateGimmick(api, args.gimmick);
    return args;
}

function verifySignedContract(api, args, result) {
    if (!result || result.success !== true) return result;
    var contractId = Number(result.contractId);
    if (!Number.isInteger(contractId) || contractId < 1) return { success: false, error: 'PWS reported a successful signing without a valid contractId', actionResult: result };
    var row = domain.get(api, [
        'SELECT contractID,workerID,promotionID,contractType,exclusive,role,wagePerMonth,wagePerAppearance,',
        'contractLength,push,gimmick,contractName,brand,finalised,expired,contractStarted',
        'FROM contracts WHERE contractID=?'
    ].join(' '), [contractId]);
    if (!row) return { success: false, error: 'PWS reported a successful signing but the contract was not persisted', contractId: contractId };
    var expected = {
        workerID: args.workerId, promotionID: args.promotionId, contractType: args.contractType,
        exclusive: args.exclusive ? 1 : 0, role: args.role
    };
    ['wagePerMonth', 'wagePerAppearance', 'contractLength', 'push', 'gimmick', 'contractName', 'brand'].forEach(function (field) {
        if (args[field] != null) expected[field] = args[field];
    });
    var numericFields = { workerID: true, promotionID: true, exclusive: true, wagePerMonth: true, wagePerAppearance: true, contractLength: true, brand: true };
    var mismatches = Object.keys(expected).filter(function (field) {
        return numericFields[field] ? Number(row[field]) !== Number(expected[field]) : String(row[field] == null ? '' : row[field]) !== String(expected[field]);
    }).map(function (field) { return { field: field, requested: expected[field], persisted: row[field] }; });
    ['finalised', 'contractStarted'].forEach(function (field) {
        if (Number(row[field]) !== 1) mismatches.push({ field: field, requested: 1, persisted: row[field] });
    });
    if (Number(row.expired || 0) !== 0) mismatches.push({ field: 'expired', requested: 0, persisted: row.expired });
    var after = {
        contractId: Number(row.contractID), workerId: Number(row.workerID), promotionId: Number(row.promotionID),
        contractType: row.contractType, exclusive: Number(row.exclusive || 0) === 1, role: row.role,
        wagePerMonth: Number(row.wagePerMonth || 0), wagePerAppearance: Number(row.wagePerAppearance || 0),
        contractLengthDays: row.contractLength == null ? null : Number(row.contractLength), push: row.push,
        gimmick: row.gimmick, contractName: row.contractName, brand: row.brand == null || row.brand === '' ? null : Number(row.brand)
    };
    if (mismatches.length) return { success: false, error: 'The signed contract did not persist the requested terms', contractId: contractId, after: after, verification: { success: false, mismatches: mismatches } };
    return Object.assign({}, result, { after: after, verification: { success: true, checkedFields: Object.keys(expected).concat(['finalised', 'contractStarted', 'expired']) } });
}

function invokeAction(api, name, args) {
    var definition = ACTIONS[name];
    if (!definition) throw new Error('Unsupported action: ' + name);
    var fn = api.actions[definition[0]];
    if (typeof fn !== 'function') throw new Error('Action is unavailable in this PWS version: ' + name);
    args = args || {};
    if (name === 'sign_worker') args = normalizeSignWorkerArguments(api, args);
    switch (definition[1]) {
    case 'object':
        var result = fn.call(api.actions, args);
        return name === 'sign_worker' ? verifySignedContract(api, args, result) : result;
    case 'id': return fn.call(api.actions, Number(args.id));
    case 'pair': return fn.call(api.actions, Number(args.storylineId), Number(args.contractId));
    case 'vacate': return fn.call(api.actions, Number(args.titleId), args.reason);
    case 'attribute': return fn.call(api.actions, Number(args.workerId), args.attribute, args.value);
    default: throw new Error('Invalid action definition');
    }
}

function dispatch(api, request, services) {
    var params = request.params || {};
    services = services || {};
    switch (request.method) {
    case 'health':
        return { ok: true, game: 'Pro Wrestling Sim', state: domain.state(api), pluginVersion: api.plugin.version };
    case 'game.state':
        return domain.state(api);
    case 'game.worker':
        return domain.workerProfile(api, params);
    case 'game.contracts':
        return api.game.getWorkerContracts(Number(params.workerId));
    case 'game.shows':
        return api.game.getRecentShows(Number(params.promotionId), params.limit == null ? 10 : Number(params.limit));
    case 'game.storylines':
        return domain.storylines(api, params.promotionId == null ? domain.context(api).promotionId : Number(params.promotionId), params);
    case 'game.titles':
        return domain.titles(api, params.promotionId == null ? domain.context(api).promotionId : Number(params.promotionId));
    case 'database.catalog':
        return domain.catalog(api, params);
    case 'database.query':
        return readOnlyQuery(api, params);
    case 'search':
        return domain.search(api, params);
    case 'company.overview':
        return domain.overview(api);
    case 'roster.list':
        return domain.roster(api, params);
    case 'hiring.analyze':
        return domain.hiring(api, params);
    case 'contracts.advise':
        return domain.contractAdvice(api, params);
    case 'integrations.list':
        if (!services.integrations) return integrations.createManager(api).list();
        return services.integrations.list();
    case 'integrations.innerCircle':
        if (!services.integrations) return integrations.createManager(api).innerCircle(params);
        return services.integrations.innerCircle(params);
    case 'shows.upcoming':
        return domain.upcomingShows(api, params);
    case 'shows.get':
        return domain.show(api, params);
    case 'venues.list':
        return domain.venues(api, params);
    case 'shows.setVenue':
        return purposeBuiltActions.setShowVenue(api, params);
    case 'shows.schedule':
        return purposeBuiltActions.scheduleShow(api, params);
    case 'shows.cancel':
        return purposeBuiltActions.cancelShow(api, params);
    case 'events.create':
        return purposeBuiltActions.createEvent(api, params);
    case 'events.setActive':
        return purposeBuiltActions.setEventActive(api, params);
    case 'booking.context':
        return booking.bookingContext(api, params);
    case 'booking.plan':
        return booking.planShow(api, params);
    case 'booking.validate':
        return booking.validatePlan(api, params);
    case 'booking.apply':
        return booking.applyPlan(api, params);
    case 'booking.updateSegment':
        return segments.updateSegment(api, params);
    case 'booking.removeSegment':
        return purposeBuiltActions.removeSegment(api, params);
    case 'storylines.end':
        return purposeBuiltActions.endStoryline(api, params);
    case 'storylines.addWorker':
        return purposeBuiltActions.changeStorylineMember(api, params, true);
    case 'storylines.removeWorker':
        return purposeBuiltActions.changeStorylineMember(api, params, false);
    case 'storylines.diagnoseAttribution':
        return domain.storylineAttributionDiagnostics(api, params);
    case 'stables.list':
        return purposeBuiltActions.listStables(api, params);
    case 'gimmicks.list':
        return domain.gimmicks(api, params);
    case 'personas.list':
        return domain.personas(api, params);
    case 'promises.list':
        return domain.promises(api, params);
    case 'promises.respond':
        return purposeBuiltActions.respondToPromise(api, params);
    case 'stables.create':
        return purposeBuiltActions.createStable(api, params);
    case 'stables.dissolve':
        return purposeBuiltActions.dissolveStable(api, params);
    case 'stables.addWorker':
        return purposeBuiltActions.changeStableMember(api, params, true);
    case 'stables.removeWorker':
        return purposeBuiltActions.changeStableMember(api, params, false);
    case 'contracts.setGimmick':
        return purposeBuiltActions.setContractGimmick(api, params);
    case 'contracts.setPersona':
        return purposeBuiltActions.setContractPersona(api, params);
    case 'personas.setAvailability':
        return purposeBuiltActions.setPersonaAvailability(api, params);
    case 'contracts.release':
        return purposeBuiltActions.releaseWorker(api, params);
    case 'titles.vacate':
        return purposeBuiltActions.vacateTitle(api, params);
    case 'actions.execute':
        if (params.confirmed !== true) throw new Error('Refusing to change the save: confirmed=true is required');
        return invokeAction(api, params.action, params.arguments);
    case 'actions.audit':
        return (api.actions && typeof api.actions.getAuditLog === 'function' ? api.actions.getAuditLog() : []).concat(audit.get(api));
    default:
        throw new Error('Unknown bridge method: ' + request.method);
    }
}

function createBridge(api, options) {
    var server = null;
    var token = crypto.randomBytes(32).toString('hex');
    var runtimePath = runtime.resolveRuntimePath({ pluginDirectory: options.pluginDirectory });
    var integrationManager = integrations.createManager(api);

    return {
        start: function () {
            if (server) return Promise.reject(new Error('Bridge is already running'));
            integrationManager.start();
            server = http.createServer(function (request, response) {
                if (request.method !== 'POST' || request.url !== '/rpc') return json(response, 404, { error: 'Not found' });
                if (request.headers.authorization !== 'Bearer ' + token) return json(response, 401, { error: 'Unauthorized' });
                readBody(request).then(function (body) {
                    return Promise.resolve(dispatch(api, body, { integrations: integrationManager }));
                }).then(function (result) {
                    json(response, 200, { result: result });
                }).catch(function (error) {
                    json(response, 400, { error: error.message });
                });
            });
            return new Promise(function (resolve, reject) {
                server.once('error', reject);
                server.listen(options.port, '127.0.0.1', function () {
                    server.removeListener('error', reject);
                    var address = server.address();
                    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
                    fs.writeFileSync(runtimePath, JSON.stringify({
                        host: '127.0.0.1', port: address.port, token: token, pid: process.pid,
                        pluginVersion: api.plugin && api.plugin.version ? String(api.plugin.version) : null
                    }, null, 2), { encoding: 'utf8', mode: 384 });
                    resolve({ host: '127.0.0.1', port: address.port });
                });
            });
        },
        stop: function () {
            try { if (fs.existsSync(runtimePath)) fs.unlinkSync(runtimePath); } catch (_) { /* best effort */ }
            integrationManager.stop();
            if (!server) return Promise.resolve();
            return new Promise(function (resolve) {
                server.close(resolve);
                server = null;
            });
        }
    };
}

module.exports = { ACTIONS: ACTIONS, assertReadOnlySql: assertReadOnlySql, createBridge: createBridge, dispatch: dispatch, readOnlyQuery: readOnlyQuery };
