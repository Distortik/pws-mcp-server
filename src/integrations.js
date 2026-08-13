'use strict';

var crypto = require('crypto');
var path = require('path');

var PROTOCOL = 'pws-community-interop';
var PROTOCOL_VERSION = 1;
var DESCRIBE_CHANNEL = 'pws-community:v1:describe';
var SNAPSHOT_CHANNEL = 'pws-community:v1:snapshot';
var INNER_CIRCLE_CAPABILITY = 'inner-circle.assignments';
var INVESTMENTS_CAPABILITY = 'investments.portfolio';
var PROVIDER_IDS = ['inner-circle', 'inner-circle-test', 'investments', 'investments-test'];
var CAPABILITY_DEFINITIONS = [
    { id: INNER_CIRCLE_CAPABILITY, providers: ['inner-circle', 'inner-circle-test'], label: 'Inner Circle' },
    { id: INVESTMENTS_CAPABILITY, providers: ['investments', 'investments-test'], label: 'Investments' }
];
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

function supportsCapability(description, capabilityId) {
    return description.capabilities.some(function (capability) {
        return capability.id === capabilityId && capability.version === 1 && capability.access === 'read' && capability.context === 'save-promotion';
    });
}

function supportsRecognizedCapability(description) {
    return CAPABILITY_DEFINITIONS.some(function (definition) { return supportsCapability(description, definition.id); });
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

var INVESTMENT_NATIVE_TYPES = {
    companies: 'promotionID',
    networks: 'networkID',
    schools: 'schoolID',
    venues: 'venueID',
    titles: 'titleID',
    tapeLibraries: 'promotionID',
    legends: 'workerID'
};

function finiteAmount(value, label) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) throw new Error(label + ' is invalid');
    return parsed;
}

function nullableText(value, label, maximum) {
    return value == null ? null : boundedText(value, label, maximum, true);
}

function normalizeInvestmentLocation(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Investment asset location is invalid');
    return {
        continent: nullableText(value.continent, 'Investment asset continent', 80),
        countryId: optionalInteger(value.countryId, 'Investment asset country ID', 1),
        countryName: nullableText(value.countryName, 'Investment asset country', 120),
        regionId: optionalInteger(value.regionId, 'Investment asset region ID', 1),
        regionName: nullableText(value.regionName, 'Investment asset region', 120)
    };
}

function normalizeInvestmentNative(value, category) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Investment native identity is invalid');
    var expected = INVESTMENT_NATIVE_TYPES[category];
    var type = boundedText(value.type, 'Investment native identity type', 40);
    if (!expected || type !== expected) throw new Error('Investment native identity type does not match its category');
    return { type: type, id: integer(value.id, 'Investment native identity ID', 1) };
}

function normalizeInvestmentsData(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.ready !== 'boolean') {
        throw new Error('Investments snapshot data is invalid');
    }
    if (!value.summary || typeof value.summary !== 'object') throw new Error('Investments summary is invalid');
    if (!Array.isArray(value.categories) || value.categories.length > 32 || !Array.isArray(value.assets) || value.assets.length > 1000) {
        throw new Error('Investments snapshot collections are invalid');
    }
    var normalized = {
        ready: value.ready,
        summary: {
            totalAssets: integer(value.summary.totalAssets, 'Investments total asset count', 0),
            publishedAssets: integer(value.summary.publishedAssets, 'Investments published asset count', 0),
            truncatedAssets: integer(value.summary.truncatedAssets, 'Investments truncated asset count', 0),
            totalInvested: finiteAmount(value.summary.totalInvested, 'Investments total invested'),
            monthlyMaintenance: finiteAmount(value.summary.monthlyMaintenance, 'Investments monthly maintenance'),
            monthlyIncome: finiteAmount(value.summary.monthlyIncome, 'Investments monthly income')
        },
        categories: value.categories.map(function (category) {
            if (!category || typeof category !== 'object') throw new Error('Investment category is invalid');
            return {
                id: boundedText(category.id, 'Investment category ID', 100),
                label: boundedText(category.label, 'Investment category label', 150),
                count: integer(category.count, 'Investment category count', 0),
                published: integer(category.published, 'Investment category published count', 0),
                totalInvested: finiteAmount(category.totalInvested, 'Investment category invested total'),
                monthlyMaintenance: finiteAmount(category.monthlyMaintenance, 'Investment category maintenance'),
                monthlyIncome: finiteAmount(category.monthlyIncome, 'Investment category income')
            };
        }),
        assets: value.assets.map(function (asset) {
            if (!asset || typeof asset !== 'object') throw new Error('Investment asset is invalid');
            if (!Array.isArray(asset.markets) || asset.markets.length > 12) throw new Error('Investment asset markets are invalid');
            var category = boundedText(asset.category, 'Investment asset category', 100);
            var seenMarkets = {};
            var markets = asset.markets.map(function (market) { return boundedText(market, 'Investment asset market', 80); }).filter(function (market) {
                if (seenMarkets[market]) return false;
                seenMarkets[market] = true;
                return true;
            });
            return {
                assetId: boundedText(asset.assetId, 'Investment asset ID', 140),
                category: category,
                name: boundedText(asset.name, 'Investment asset name', 200),
                tier: optionalInteger(asset.tier, 'Investment asset tier', 1),
                tierName: nullableText(asset.tierName, 'Investment asset tier name', 120),
                cost: finiteAmount(asset.cost, 'Investment asset cost'),
                monthlyMaintenance: finiteAmount(asset.monthlyMaintenance, 'Investment asset maintenance'),
                monthlyIncome: finiteAmount(asset.monthlyIncome, 'Investment asset income'),
                acquiredDate: nullableText(asset.acquiredDate, 'Investment asset acquisition date', 50),
                activeUntil: nullableText(asset.activeUntil, 'Investment asset active-until date', 50),
                native: normalizeInvestmentNative(asset.native, category),
                location: normalizeInvestmentLocation(asset.location),
                markets: markets
            };
        })
    };
    var categories = {};
    var categoryTotals = { count: 0, published: 0, invested: 0, maintenance: 0, income: 0 };
    normalized.categories.forEach(function (category) {
        if (categories[category.id]) throw new Error('Investment category IDs must be unique');
        if (category.published > category.count) throw new Error('Investment category published count is invalid');
        categories[category.id] = { value: category, assets: 0, assetIds: {} };
        categoryTotals.count += category.count;
        categoryTotals.published += category.published;
        categoryTotals.invested += category.totalInvested;
        categoryTotals.maintenance += category.monthlyMaintenance;
        categoryTotals.income += category.monthlyIncome;
    });
    normalized.assets.forEach(function (asset) {
        var category = categories[asset.category];
        if (!category) throw new Error('Investment asset references an unknown category');
        if (category.assetIds[asset.assetId]) throw new Error('Investment asset IDs must be unique within a category');
        category.assetIds[asset.assetId] = true;
        category.assets += 1;
    });
    Object.keys(categories).forEach(function (id) {
        if (categories[id].assets !== categories[id].value.published) throw new Error('Investment category published count does not match its assets');
    });
    if (normalized.summary.totalAssets !== categoryTotals.count || normalized.summary.publishedAssets !== normalized.assets.length ||
        normalized.summary.publishedAssets !== categoryTotals.published || normalized.summary.truncatedAssets !== normalized.summary.totalAssets - normalized.summary.publishedAssets ||
        normalized.summary.totalInvested !== categoryTotals.invested || normalized.summary.monthlyMaintenance !== categoryTotals.maintenance ||
        normalized.summary.monthlyIncome !== categoryTotals.income) {
        throw new Error('Investments summary does not match its categories and assets');
    }
    if (!normalized.ready && normalized.summary.totalAssets !== 0) throw new Error('Investments snapshot is not ready but contains assets');
    return normalized;
}

function normalizeSnapshot(targetId, description, value, currentContext, capabilityId) {
    capabilityId = capabilityId || INNER_CIRCLE_CAPABILITY;
    value = encoded(value, MAX_SNAPSHOT_BYTES, 'Provider snapshot');
    if (!value || typeof value !== 'object' || value.protocol !== PROTOCOL || Number(value.protocolVersion) !== PROTOCOL_VERSION) {
        throw new Error('Provider snapshot uses an unsupported community interoperability protocol');
    }
    if (!value.capability || value.capability.id !== capabilityId || Number(value.capability.version) !== 1) {
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
        capability: { id: capabilityId, version: 1 },
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
        data: capabilityId === INVESTMENTS_CAPABILITY ? normalizeInvestmentsData(value.data) : normalizeInnerCircleData(value.data)
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
        try {
            return Promise.resolve(api.interPlugin.send(targetId, channel, data)).then(function (value) {
                if (value === undefined) throw new Error('Provider did not respond on ' + channel);
                return value;
            });
        }
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
                        compatible: supportsRecognizedCapability(normalized),
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
                capabilities: CAPABILITY_DEFINITIONS.map(function (definition) {
                    var compatible = providers.filter(function (provider) {
                        return provider.description && supportsCapability(provider.description, definition.id);
                    });
                    return {
                        id: definition.id,
                        version: 1,
                        access: 'read',
                        available: compatible.length > 0,
                        providers: compatible.map(function (provider) { return provider.pluginId; })
                    };
                })
            };
        }).catch(function (error) {
            return {
                protocol: PROTOCOL,
                protocolVersion: PROTOCOL_VERSION,
                optional: true,
                providers: [],
                capabilities: CAPABILITY_DEFINITIONS.map(function (definition) {
                    return { id: definition.id, version: 1, access: 'read', available: false, providers: [] };
                }),
                error: errorText(error)
            };
        });
    }

    function readCapability(options, definition) {
        options = options || {};
        var requestedProvider = options.providerId == null ? null : boundedText(options.providerId, 'providerId', 100);
        if (requestedProvider && definition.providers.indexOf(requestedProvider) === -1) throw new Error('Unsupported ' + definition.label + ' provider: ' + requestedProvider);
        return inspectProviders().then(function (providers) {
            var compatible = providers.filter(function (provider) {
                return provider.description && supportsCapability(provider.description, definition.id) && (!requestedProvider || provider.pluginId === requestedProvider);
            });
            if (!compatible.length) {
                return {
                    available: false,
                    capability: definition.id,
                    reason: requestedProvider ? 'requested-provider-unavailable' : 'provider-not-installed-or-incompatible',
                    providers: providers.map(function (provider) {
                        return {
                            pluginId: provider.pluginId,
                            compatible: !!(provider.description && supportsCapability(provider.description, definition.id)),
                            error: provider.error || null
                        };
                    })
                };
            }
            var provider = compatible[0];
            var current = contextIdentity(api, activeDatabasePath);
            return send(provider.pluginId, SNAPSHOT_CHANNEL, {
                protocolVersion: PROTOCOL_VERSION,
                capability: definition.id
            }).then(function (snapshot) {
                var normalized = normalizeSnapshot(provider.pluginId, provider.description, snapshot, current, definition.id);
                var key = [provider.pluginId, definition.id, current.saveHash, current.promotionId].join(':');
                var digest = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
                var previous = cache[key];
                if (previous && normalized.context.revision < previous.revision) throw new Error('Provider returned an older ' + definition.label + ' revision');
                if (previous && normalized.context.revision === previous.revision && digest !== previous.digest) {
                    throw new Error('Provider changed ' + definition.label + ' data without advancing its revision');
                }
                cache[key] = { revision: normalized.context.revision, digest: digest };
                return Object.assign({ available: true }, normalized);
            });
        });
    }

    function innerCircle(options) {
        return readCapability(options, CAPABILITY_DEFINITIONS[0]);
    }

    function investments(options) {
        return readCapability(options, CAPABILITY_DEFINITIONS[1]);
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

    return { innerCircle: innerCircle, investments: investments, list: list, start: start, stop: stop };
}

module.exports = {
    DESCRIBE_CHANNEL: DESCRIBE_CHANNEL,
    INNER_CIRCLE_CAPABILITY: INNER_CIRCLE_CAPABILITY,
    INVESTMENTS_CAPABILITY: INVESTMENTS_CAPABILITY,
    MAX_SNAPSHOT_BYTES: MAX_SNAPSHOT_BYTES,
    PROTOCOL: PROTOCOL,
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    SNAPSHOT_CHANNEL: SNAPSHOT_CHANNEL,
    contextIdentity: contextIdentity,
    createManager: createManager,
    listedPluginIds: listedPluginIds,
    normalizeDescription: normalizeDescription,
    normalizeInvestmentsData: normalizeInvestmentsData,
    normalizeSnapshot: normalizeSnapshot
};
