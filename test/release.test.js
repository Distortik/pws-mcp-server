'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var workshop = require('../scripts/build-workshop');

test('release metadata agrees on the production version', function () {
    var root = path.resolve(__dirname, '..');
    var packageJson = require('../package.json');
    var plugin = require('../plugin.json');
    var manifest = require('../manifest.json');
    var server = fs.readFileSync(path.join(root, 'mcp-server.js'), 'utf8');
    assert.equal(packageJson.version, '0.3.0');
    assert.equal(plugin.version, packageJson.version);
    assert.equal(manifest.version, packageJson.version);
    assert.match(server, /version: '0\.3\.0'/);
    assert.equal(packageJson.version.indexOf('-'), -1);
});

test('Workshop runtime manifest includes every required module', function () {
    ['index.js', 'mcp-server.js', 'plugin.json', 'src/actions.js', 'src/audit.js', 'src/booking.js', 'src/bridge.js', 'src/domain.js', 'src/runtime.js', 'src/segments.js', 'src/tools.js'].forEach(function (file) {
        assert.ok(workshop.runtimeFiles.indexOf(file) !== -1, file + ' must be packaged');
        assert.ok(fs.existsSync(path.resolve(__dirname, '..', file)), file + ' must exist');
    });
});

