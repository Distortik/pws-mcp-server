'use strict';

var bridge = require('./src/bridge');
var activeBridge = null;

module.exports = {
    activate: function (api) {
        activeBridge = bridge.createBridge(api, {
            pluginDirectory: __dirname,
            port: Number(process.env.PWS_MCP_PORT || 17890)
        });
        return activeBridge.start().then(function (address) {
            api.console.log('[PWS MCP] Listening securely at http://' + address.host + ':' + address.port);
        }).catch(function (error) {
            activeBridge = null;
            api.console.error('[PWS MCP] Failed to start:', error.message);
            throw error;
        });
    },

    deactivate: function () {
        if (!activeBridge) return;
        var pending = activeBridge.stop();
        activeBridge = null;
        return pending;
    }
};

