'use strict';

var path = require('path');

var RUNTIME_FILE = 'pws-mcp-runtime.json';

function resolveRuntimePath(options) {
    options = options || {};

    var override = options.override || process.env.PWS_MCP_RUNTIME;
    if (override) return path.resolve(override);

    var appData = options.appData || process.env.APPDATA;
    if (appData) {
        return path.join(appData, 'ProWrestlingSimulator', 'mcp', RUNTIME_FILE);
    }

    if (options.pluginDirectory) {
        return path.resolve(options.pluginDirectory, '..', '..', 'mcp', RUNTIME_FILE);
    }

    throw new Error('Cannot locate the PWS runtime directory. Set PWS_MCP_RUNTIME explicitly.');
}

module.exports = { RUNTIME_FILE: RUNTIME_FILE, resolveRuntimePath: resolveRuntimePath };
