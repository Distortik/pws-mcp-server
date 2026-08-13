'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var workshop = require('../scripts/build-workshop');

test('release metadata agrees on the current candidate version', function () {
    var root = path.resolve(__dirname, '..');
    var packageJson = require('../package.json');
    var plugin = require('../plugin.json');
    var manifest = require('../manifest.json');
    var server = fs.readFileSync(path.join(root, 'mcp-server.js'), 'utf8');
    assert.equal(packageJson.version, '0.5.0-beta.2');
    assert.equal(plugin.version, packageJson.version);
    assert.equal(manifest.version, packageJson.version);
    assert.equal(manifest.server.entry_point, 'mcpb-entry.js');
    assert.deepEqual(manifest.server.mcp_config.args, ['${__dirname}/mcpb-entry.js']);
    assert.match(server, /version: '0\.5\.0-beta\.2'/);
    assert.notEqual(packageJson.version.indexOf('-'), -1);
});

test('Workshop runtime manifest includes every required module', function () {
    ['index.js', 'mcpb-entry.js', 'mcp-server.js', 'plugin.json', 'THIRD_PARTY_NOTICES.txt', 'src/actions.js', 'src/audit.js', 'src/booking.js', 'src/bridge.js', 'src/domain.js', 'src/integrations.js', 'src/runtime.js', 'src/segments.js', 'src/tools.js'].forEach(function (file) {
        assert.ok(workshop.runtimeFiles.indexOf(file) !== -1, file + ' must be packaged');
        if (file !== 'THIRD_PARTY_NOTICES.txt') assert.ok(fs.existsSync(path.resolve(__dirname, '..', file)), file + ' must exist');
    });
});
