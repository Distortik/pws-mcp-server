#!/usr/bin/env node
'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var workshop = require('./build-workshop');

var TEST_FOLDER = 'pws-mcp-server-TEST';

function isPwsRunning() {
    if (process.platform !== 'win32') return false;
    try {
        var output = childProcess.execFileSync('tasklist.exe', [
            '/FI', 'IMAGENAME eq ProWrestlingSim.exe', '/NH'
        ], { encoding: 'utf8', windowsHide: true });
        return /ProWrestlingSim\.exe/i.test(output);
    } catch (_) {
        return false;
    }
}

function pluginsDirectory() {
    if (!process.env.APPDATA) throw new Error('APPDATA is unavailable; cannot locate the PWS plugin directory');
    return path.resolve(process.env.APPDATA, 'ProWrestlingSimulator', 'plugins');
}

function targetDirectory() {
    return path.join(pluginsDirectory(), TEST_FOLDER);
}

function assertSafeTarget(target) {
    var root = pluginsDirectory();
    var resolved = path.resolve(target);
    if (path.dirname(resolved) !== root || path.basename(resolved) !== TEST_FOLDER) {
        throw new Error('Refusing to deploy to an unexpected test-plugin path: ' + resolved);
    }
}

function identifyAsTestBuild(target) {
    var manifestPath = path.join(target, 'plugin.json');
    var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.id = 'pws-mcp-server-test';
    manifest.name = 'PWS MCP Server TEST';
    manifest.description = 'TEST BUILD - secure local MCP bridge for Pro Wrestling Sim.';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

async function deploy() {
    var target = targetDirectory();
    assertSafeTarget(target);
    if (isPwsRunning()) throw new Error('Close Pro Wrestling Sim before deploying the TEST plugin.');

    await workshop.build();
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(workshop.outputDirectory, target, { recursive: true });
    identifyAsTestBuild(target);

    console.log('PWS MCP TEST plugin deployed to: ' + target);
    console.log('Disable the Workshop copy and enable "PWS MCP Server TEST" while testing.');
    return target;
}

if (require.main === module) deploy().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});

module.exports = {
    TEST_FOLDER: TEST_FOLDER,
    assertSafeTarget: assertSafeTarget,
    deploy: deploy,
    isPwsRunning: isPwsRunning,
    targetDirectory: targetDirectory
};
