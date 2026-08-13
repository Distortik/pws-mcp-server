'use strict';

var crypto = require('crypto');
var path = require('path');

var PROTOCOL = 'pws-community-interop';
var PROTOCOL_VERSION = 1;
var DESCRIBE_CHANNEL = 'pws-community:v1:describe';
var SNAPSHOT_CHANNEL = 'pws-community:v1:snapshot';
var INNER_CIRCLE_CAPABILITY = 'inner-circle.assignments';
var PROVIDER_IDS = ['inner-circle', 'inner-circle-test'];
var MAX_DESCRIPTION_BYTES = 16 * 1024;
var MAX_SNAPSHOT_BYTES = 64 * 1024;

function integer(value, label, minimum) {
    var parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(label + ' must be an integer of at least ' + minimum);
    return parsed;
}

function boundedText(value, label, maximum, allowEmpty) {
    var result = String(value == null ? '' : value).trim();
    if ((!allowEmpty && !result) || result.length > maximum) throw new Error(label + ' is invalid');
    return result;
}

function encoded(value, maximum, label) {
    var json;
    try { json = JSON.stringify(value); }
    catch (_) { throw new Error(label + ' is not valid JSON data'); }
    if (!json || Buffer.byteLength(json, 'utf8') > maximum) throw new Error(label + ' exceeds its size limit');
    return JSON.parse(json);
}

function pluginId(entry) {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object') return '';
    return String(entry.pluginId || entry.id || (entry.plugin && (entry.plugin.id || entry.plugin.pluginId)) || '').trim();
}

function listedPluginIds(value) {
    var entries = Array.isArray(value) ? value : (value && Array.isArray(value.plugins) ? value.plugins : []);
    if (!entries.length && value && typeof value === 'object' && !Array.isArray(value)) {
        entries = Object.keys(value).filter(function (key) { return key !== 'plugins'; }).map(function (key) {
            return value[key] && typeof value[key] === 'object' ? Object.assign({ id: key }, value[key]) : key;
        });
    }
    var seen = {};
    return entries.map(pluginId).filter(function (id) {
        if (!id || seen[id]) return false;
        seen[id] = true;
        return true;
    });
}

function statePromotionId(api, state) {
    var promotion = api.game && typeof api.game.getCurrentPromotion === 'function' ? api.game.getCurrentPromotion() : null;
    var value = state.promotionId == null ? state.promotionID : state.promotionId;
    if (value == null && promotion) value = promotion.promotionID == null ? promotion.promotionId : promotion.promotionID;
    if (value == null && api.database && typeof api.database.get === 'function') {
        var save = api.database.get('SELECT saveUserPromotion FROM saveinfo LIMIT 1');
        if (save) value = save.saveUserPromotion;
    }
    return integer(value, 'player promotion ID', 1);
}

function contextIdentity(api, activeDatabasePath) {
    var state = api.game && typeof api.game.getState === 'function' ? api.game.getState() : null;
    if (!state) throw new Error('Load a PWS save before reading optional plugin data');
    var promotionId = statePromotionId(api, state);
    var identitySource = activeDatabasePath || state.databasePath || state.dbPath || state.repository ||
        ['fallback', state.gameWorldName || 'unknown-world', state.promotionName || 'unknown-promotion'].join(':');
    return {
        saveHash: crypto.createHash('sha256').update(String(identitySource).toLowerCase()).digest('hex').slice(0, 24),
        promotionId: promotionId
    };
}

function normalizeCapability(value) {
    if (!value || typeof value !== 'object') throw new Error('Provider capability is invalid');
    return {
        id: boundedText(value.id, 'Provider capability ID', 100),
        version: integer(value.version, 'Provider capability version', 1),
        access: boundedText(value.access, 'Provider capability access', 20),
        context: boundedText(value.context, 'Provider capability context', 40)
    };
}

function normalizeDescription(targetId, value) {
    value = encoded(value, MAX_DESCRIPTION_BYTES, 'Provider description');
    if (!value || typeof value !== 'object' || value.protocol !== PROTOCOL || Number(value.protocolVersion) !== PROTOCOL_VERSION) {
        throw new Error('Provider uses an unsupported community interoperability protocol');
    }
    if (!value.provider || boundedText(value.provider.pluginId, 'Provider plugin ID', 100) !== targetId) {
        throw new Error('Provider identity does not match the addressed plugin');
    }
    if (!Array.isArray(value.capabilities) || value.capabilities.length > 32) throw new Error('Provider capability list is invalid');
    var capabilities = value.capabilities.map(normalizeCapability);
    return {
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        provider: {
            pluginId: targetId,
            pluginVersion: value.provider.pluginVersion == null ? null : boundedText(value.provider.pluginVersion, 'Provider plugin version', 40),
            schemaVersion: integer(value.provider.schemaVersion, 'Provider schema version', 1)
        },
        capabilities: capabilities
    };
}

function supportsInnerCircle(description) {
    return description.capabilities.some(function (capability) {
        return capability.id === INNER_CIRCLE_CAPABILITY && capability.version === 1 && capability.access === 'read' && capability.context === 'save-promotion';
    });
}

function optionalInteger(value, label, minimum) {
    return value == null ? null : integer(value, label, minimum);
}

function normalizeInnerCircleData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Inner Circle snapshot data is invalid');
    var summary = value.summary;
    if (!summary || typeof summary !== 'object') throw new Error('Inner Circle summary is invalid');
    var roles = Array.isArray(value.roles) ? value.roles : null;
    var assignments = Array.isArray(value.assignments) ? value.assignments : null;
    if (!roles || roles.length > 64 || !assignments || assignments.length > 256) throw new Error('Inner Circle snapshot collections are invalid');
    var normalized = {
        summary: {
            roles: integer(summary.roles, 'Inner Circle role count', 0),
            totalSlots: integer(summary.totalSlots, 'Inner Circle slot count', 0),
            assignedSlots: integer(summary.assignedSlots, 'Inner Circle assigned slot count', 0),
            assignedWorkers: integer(summary.assignedWorkers, 'Inner Circle assigned worker count', 0),
            unavailableAssignments: integer(summary.unavailableAssignments, 'Inner Circle unavailable assignment count', 0)
        },
        roles: roles.map(function (role) {
            if (!role || typeof role !== 'object') throw new Error('Inner Circle role is invalid');
            return {
                id: boundedText(role.id, 'Inner Circle role ID', 100),
                label: boundedText(role.label, 'Inner Circle role label', 150),
                category: boundedText(role.category, 'Inner Circle role category', 100),
                slots: integer(role.slots, 'Inner Circle role slots', 1)
            };
        }),
        assignments: assignments.map(function (assignment) {
            if (!assignment || typeof assignment !== 'object') throw new Error('Inner Circle assignment is invalid');
            var status = boundedText(assignment.status, 'Inner Circle assignment status', 20);
            if (status !== 'active' && status !== 'unavailable') throw new Error('Inner Circle assignment status is invalid');
            return {
                roleId: boundedText(assignment.roleId, 'Inner Circle assignment role ID', 100),
                slot: integer(assignment.slot, 'Inner Circle assignment slot', 1),
                workerId: integer(assignment.workerId, 'Inner Circle assignment worker ID', 1),
                contractId: optionalInteger(assignment.contractId, 'Inner Circle assignment contract ID', 1),
                name: boundedText(assignment.name, 'Inner Circle assignment name', 150),
                status: status,
                assignedDate: assignment.assignedDate == null ? null : boundedText(assignment.assignedDate, 'Inner Circle assignment date', 50, true)
            };
        })
    };
    var roleMap = {};
    var totalSlots = 0;
    normalized.roles.forEach(function (role) {
        if (roleMap[role.id]) throw new Error('Inner Circle role IDs must be unique');
        roleMap[role.id] = role;
        totalSlots += role.slots;
    });
    var occupied = {};
    var workers = {};
    var unavailable = 0;
    normalized.assignments.forEach(function (assignment) {
        var role = roleMap[assignment.roleId];
        if (!role || assignment.slot > role.slots) throw new Error('Inner Circle assignment references an unknown role slot');
        var slotKey = assignment.roleId + ':' + assignment.slot;
        if (occupied[slotKey]) throw new Error('Inner Circle role slots must be unique');
        if (workers[assignment.workerId]) throw new Error('Inner Circle workers must not have duplicate assignments');
        if (assignment.status === 'active' && assignment.contractId == null) throw new Error('Active Inner Circle assignments require a contract ID');
        occupied[slotKey] = true;
        workers[assignment.workerId] = true;
        if (assignment.status === 'unavailable') unavailable += 1;
    });
    if (normalized.summary.roles !== normalized.roles.length || normalized.summary.totalSlots !== totalSlots ||
        normalized.summary.assignedSlots !== normalized.assignments.length || normalized.summary.assignedWorkers !== Object.keys(workers).length ||
        normalized.summary.unavailableAssignments !== unavailable) {
        throw new Error('Inner Circle summary does not match its assignments');
    }
    return normalized;
}

function normalizeSnapshot(targetId, description, value, currentContext) {
    value = encoded(value, MAX_SNAPSHOT_BYTES, 'Provider snapshot');
    if (!value || typeof value !== 'object' || value.protocol !== PROTOCOL || Number(value.protocolVersion) !== PROTOCOL_VERSION) {
        throw new Error('Provider snapshot uses an unsupported community interoperability protocol');
    }
    if (!value.capability || value.capability.id !== INNER_CIRCLE_CAPABILITY || Number(value.capability.version) !== 1) {
        throw new Error('Provider returned the wrong capability snapshot');
    }
    if (!value.provider || value.provider.pluginId !== targetId || Number(value.provider.schemaVersion) !== description.provider.schemaVersion ||
        String(value.provider.pluginVersion == null ? '' : value.provider.pluginVersion) !== String(description.provider.pluginVersion == null ? '' : description.provider.pluginVersion)) {
        throw new Error('Provider snapshot identity does not match its description');
    }
    if (!value.context || !/^[a-f0-9]{24}$/.test(String(value.context.saveHash || ''))) throw new Error('Provider snapshot save context is invalid');
    var promotionId = integer(value.context.promotionId, 'Provider snapshot promotion ID', 1);
    var revision = integer(value.context.revision, 'Provider snapshot revision', 0);
    if (value.context.saveHash !== currentContext.saveHash || promotionId !== currentContext.promotionId) {
        throw new Error('Optional plugin data belongs to a different save or player promotion');
    }
    return {
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        capability: { id: INNER_CIRCLE_CAPABILITY, version: 1 },
        provider: {
            pluginId: targetId,
            pluginVersion: value.provider.pluginVersion == null ? null : boundedText(value.provider.pluginVersion, 'Provider plugin version', 40),
            schemaVersion: description.provider.schemaVersion
        },
        context: {
            saveHash: value.context.saveHash,
            promotionId: promotionId,
            revision: revision,
            currentDate: value.context.currentDate == null ? null : boundedText(value.context.currentDate, 'Provider snapshot date', 50, true)
        },
        data: normalizeInnerCircleData(value.data)
    };
}

function errorText(error) {
    var message = String(error && error.message ? error.message : error || 'Unknown provider error').replace(/[\r\n]+/g, ' ').trim();
    return message.slice(0, 300);
}

function createManager(api) {
    var activeDatabasePath = null;
    var cache = {};
    var started = false;
    var unsubscribe = null;
    var databaseHandler = null;

    function clearCache() { cache = {}; }

    function send(targetId, channel, data) {
        if (!api.interPlugin || typeof api.interPlugin.send !== 'function') return Promise.reject(new Error('PWS inter-plugin messaging is unavailable'));
        try { return Promise.resolve(api.interPlugin.send(targetId, channel, data)); }
        catch (error) { return Promise.reject(error); }
    }

    function candidateIds() {
        if (!api.interPlugin || typeof api.interPlugin.list !== 'function') return Promise.resolve([]);
        var result;
        try { result = api.interPlugin.list(); }
        catch (error) { return Promise.reject(error); }
        return Promise.resolve(result).then(function (listed) {
            var ids = listedPluginIds(listed);
            return PROVIDER_IDS.filter(function (id) { return ids.indexOf(id) !== -1; });
        });
    }

    function inspectProviders() {
        return candidateIds().then(function (ids) {
            return Promise.all(ids.map(function (id) {
                return send(id, DESCRIBE_CHANNEL, { protocolVersion: PROTOCOL_VERSION }).then(function (description) {
                    var normalized = normalizeDescription(id, description);
                    return {
                        pluginId: id,
                        compatible: supportsInnerCircle(normalized),
                        pluginVersion: normalized.provider.pluginVersion,
                        schemaVersion: normalized.provider.schemaVersion,
                        capabilities: normalized.capabilities,
                        description: normalized
                    };
                }).catch(function (error) {
                    return { pluginId: id, compatible: false, error: errorText(error), capabilities: [] };
                });
            }));
        });
    }

    function list() {
        return inspectProviders().then(function (providers) {
            var compatible = providers.filter(function (provider) { return provider.compatible; });
            return {
                protocol: PROTOCOL,
                protocolVersion: PROTOCOL_VERSION,
                optional: true,
                providers: providers.map(function (provider) {
                    return {
                        pluginId: provider.pluginId,
                        pluginVersion: provider.pluginVersion || null,
                        schemaVersion: provider.schemaVersion || null,
                        compatible: provider.compatible,
                        capabilities: provider.capabilities,
                        error: provider.error || null
                    };
                }),
                capabilities: [{
                    id: INNER_CIRCLE_CAPABILITY,
                    version: 1,
                    access: 'read',
                    available: compatible.length > 0,
                    providers: compatible.map(function (provider) { return provider.pluginId; })
                }]
            };
        }).catch(function (error) {
            return {
                protocol: PROTOCOL,
                protocolVersion: PROTOCOL_VERSION,
                optional: true,
                providers: [],
                capabilities: [{ id: INNER_CIRCLE_CAPABILITY, version: 1, access: 'read', available: false, providers: [] }],
                error: errorText(error)
            };
        });
    }

    function innerCircle(options) {
        options = options || {};
        var requestedProvider = options.providerId == null ? null : boundedText(options.providerId, 'providerId', 100);
        if (requestedProvider && PROVIDER_IDS.indexOf(requestedProvider) === -1) throw new Error('Unsupported Inner Circle provider: ' + requestedProvider);
        return inspectProviders().then(function (providers) {
            var compatible = providers.filter(function (provider) {
                return provider.compatible && (!requestedProvider || provider.pluginId === requestedProvider);
            });
            if (!compatible.length) {
                return {
                    available: false,
                    capability: INNER_CIRCLE_CAPABILITY,
                    reason: requestedProvider ? 'requested-provider-unavailable' : 'provider-not-installed-or-incompatible',
                    providers: providers.map(function (provider) {
                        return { pluginId: provider.pluginId, compatible: provider.compatible, error: provider.error || null };
                    })
                };
            }
            var provider = compatible[0];
            var current = contextIdentity(api, activeDatabasePath);
            return send(provider.pluginId, SNAPSHOT_CHANNEL, {
                protocolVersion: PROTOCOL_VERSION,
                capability: INNER_CIRCLE_CAPABILITY
            }).then(function (snapshot) {
                var normalized = normalizeSnapshot(provider.pluginId, provider.description, snapshot, current);
                var key = [provider.pluginId, INNER_CIRCLE_CAPABILITY, current.saveHash, current.promotionId].join(':');
                var digest = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
                var previous = cache[key];
                if (previous && normalized.context.revision < previous.revision) throw new Error('Provider returned an older Inner Circle revision');
                if (previous && normalized.context.revision === previous.revision && digest !== previous.digest) {
                    throw new Error('Provider changed Inner Circle data without advancing its revision');
                }
                cache[key] = { revision: normalized.context.revision, digest: digest };
                return Object.assign({ available: true }, normalized);
            });
        });
    }

    function start() {
        if (started) return;
        started = true;
        if (!api.events || typeof api.events.on !== 'function') return;
        databaseHandler = function (event) {
            var data = event && event.data ? event.data : event || {};
            var databasePath = data.dbPath || data.databasePath || data.repository || null;
            activeDatabasePath = databasePath ? path.resolve(String(databasePath)) : null;
            clearCache();
        };
        var result = api.events.on('database:opened', databaseHandler);
        if (typeof result === 'function') unsubscribe = result;
    }

    function stop() {
        if (unsubscribe) {
            try { unsubscribe(); } catch (_) { /* best effort */ }
        } else if (databaseHandler && api.events && typeof api.events.off === 'function') {
            try { api.events.off('database:opened', databaseHandler); } catch (_) { /* best effort */ }
        }
        unsubscribe = null;
        databaseHandler = null;
        activeDatabasePath = null;
        started = false;
        clearCache();
    }

    return { innerCircle: innerCircle, list: list, start: start, stop: stop };
}

module.exports = {
    DESCRIBE_CHANNEL: DESCRIBE_CHANNEL,
    INNER_CIRCLE_CAPABILITY: INNER_CIRCLE_CAPABILITY,
    MAX_SNAPSHOT_BYTES: MAX_SNAPSHOT_BYTES,
    PROTOCOL: PROTOCOL,
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    SNAPSHOT_CHANNEL: SNAPSHOT_CHANNEL,
    contextIdentity: contextIdentity,
    createManager: createManager,
    listedPluginIds: listedPluginIds,
    normalizeDescription: normalizeDescription,
    normalizeSnapshot: normalizeSnapshot
};
