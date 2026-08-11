#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

var projectRoot = path.resolve(__dirname, '..');
var outputDirectory = path.join(projectRoot, 'dist', 'pws-mcp-server');
var runtimeFiles = [
    'LICENSE',
    'NOTICE',
    'index.js',
    'mcp-server.js',
    'plugin.json',
    'src/audit.js',
    'src/actions.js',
    'src/booking.js',
    'src/bridge.js',
    'src/domain.js',
    'src/runtime.js',
    'src/segments.js',
    'src/tools.js'
];

function normalizedRelative(file) {
    return path.relative(outputDirectory, file).split(path.sep).join('/');
}

function listFiles(directory) {
    var files = [];
    if (!fs.existsSync(directory)) return files;
    fs.readdirSync(directory, { withFileTypes: true }).forEach(function (entry) {
        var absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files = files.concat(listFiles(absolute));
        else if (entry.isFile()) files.push(absolute);
        else throw new Error('Unexpected non-file entry in Workshop build: ' + absolute);
    });
    return files;
}

function assertSafeOutput() {
    var expected = path.resolve(projectRoot, 'dist', 'pws-mcp-server');
    if (path.resolve(outputDirectory) !== expected || path.dirname(path.dirname(expected)) !== projectRoot) {
        throw new Error('Refusing to clean an unexpected Workshop output path');
    }
}

function verify() {
    var expected = runtimeFiles.slice().sort();
    var actual = listFiles(outputDirectory).map(normalizedRelative).sort();
    var missing = expected.filter(function (file) { return actual.indexOf(file) === -1; });
    var unexpected = actual.filter(function (file) { return expected.indexOf(file) === -1; });

    if (missing.length || unexpected.length) {
        throw new Error('Invalid Workshop build. Missing: ' + (missing.join(', ') || 'none') +
            '. Unexpected: ' + (unexpected.join(', ') || 'none'));
    }

    JSON.parse(fs.readFileSync(path.join(outputDirectory, 'plugin.json'), 'utf8'));
    return actual;
}

function build() {
    assertSafeOutput();
    fs.rmSync(outputDirectory, { recursive: true, force: true });

    runtimeFiles.forEach(function (relative) {
        var source = path.join(projectRoot, relative);
        var destination = path.join(outputDirectory, relative);
        if (!fs.existsSync(source)) throw new Error('Required runtime file is missing: ' + relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
    });

    return verify();
}

if (require.main === module) {
    var files = process.argv.indexOf('--verify') !== -1 ? verify() : build();
    console.log('Workshop package verified: ' + outputDirectory);
    files.forEach(function (file) { console.log('  ' + file); });
}

module.exports = {
    build: build,
    outputDirectory: outputDirectory,
    runtimeFiles: runtimeFiles.slice(),
    verify: verify
};
