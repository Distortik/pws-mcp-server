'use strict';

var path = require('path');
var test = require('node:test');
var assert = require('node:assert/strict');
var runtime = require('../src/runtime');

test('stores runtime credentials outside the uploadable plugin folder', function () {
    var plugin = path.join('C:', 'Users', 'Example', 'AppData', 'Roaming', 'ProWrestlingSimulator', 'plugins', 'pws-mcp-server');
    var resolved = runtime.resolveRuntimePath({ appData: path.join('C:', 'Users', 'Example', 'AppData', 'Roaming'), pluginDirectory: plugin });
    assert.equal(resolved, path.join('C:', 'Users', 'Example', 'AppData', 'Roaming', 'ProWrestlingSimulator', 'mcp', 'pws-mcp-runtime.json'));
    assert.equal(path.relative(plugin, resolved).startsWith('..'), true);
});

test('supports an explicit runtime path override', function () {
    var resolved = runtime.resolveRuntimePath({ override: path.join('C:', 'Temp', 'pws-runtime.json') });
    assert.equal(resolved, path.resolve(path.join('C:', 'Temp', 'pws-runtime.json')));
});
