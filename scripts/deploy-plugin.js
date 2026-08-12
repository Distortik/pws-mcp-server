#!/usr/bin/env node
'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var workshop = require('./build-workshop');

var projectRoot = path.resolve(__dirname, '..');

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

function targetDirectory() {
    var appData = process.env.APPDATA;
    if (!appData) throw new Error('APPDATA is unavailable; cannot locate the PWS plugin directory');
    return path.join(appData, 'ProWrestlingSimulator', 'plugins', 'pws-mcp-server');
}

function assertSafeTarget(target) {
    var expected = targetDirectory();
    if (path.resolve(target) !== path.resolve(expected)) {
        throw new Error('Refusing to deploy to an unexpected path: ' + target);
    }
    if (path.resolve(target) === projectRoot) {
        throw new Error('The development repository is still in the PWS plugins directory. Move it outside %APPDATA% before deploying.');
    }
}

function replaceDirectoryContents(source, target) {
    fs.mkdirSync(target, { recursive: true });
    fs.readdirSync(target, { withFileTypes: true }).forEach(function (entry) {
        fs.rmSync(path.join(target, entry.name), { recursive: true, force: true });
    });
    fs.readdirSync(source, { withFileTypes: true }).forEach(function (entry) {
        fs.cpSync(path.join(source, entry.name), path.join(target, entry.name), { recursive: true });
    });
}

async function deploy() {
    var target = targetDirectory();
    assertSafeTarget(target);
    if (isPwsRunning()) throw new Error('Close Pro Wrestling Sim before deploying the plugin.');

    await workshop.build();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    replaceDirectoryContents(workshop.outputDirectory, target);
    console.log('Clean plugin deployed to: ' + target);
}

if (require.main === module) deploy().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});

module.exports = {
    deploy: deploy,
    isPwsRunning: isPwsRunning,
    replaceDirectoryContents: replaceDirectoryContents,
    targetDirectory: targetDirectory
};
