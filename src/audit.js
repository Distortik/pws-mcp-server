'use strict';

var logs = new WeakMap();

function record(api, action, details) {
    var entries = logs.get(api);
    if (!entries) {
        entries = [];
        logs.set(api, entries);
    }
    var entry = {
        timestamp: new Date().toISOString(),
        action: action,
        source: 'pws-mcp-server',
        success: true,
        details: details || {}
    };
    entries.push(entry);
    if (entries.length > 200) entries.splice(0, entries.length - 200);
    return entry;
}

function get(api) {
    return (logs.get(api) || []).slice();
}

module.exports = { get: get, record: record };
