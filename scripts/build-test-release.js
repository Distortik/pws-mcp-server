'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var workshop = require('./build-workshop');

var root = path.resolve(__dirname, '..');
var outputDirectory = path.join(root, 'dist');
var testDirectory = path.join(outputDirectory, 'pws-mcp-server-TEST');
var packageJson = require(path.join(root, 'package.json'));
var plugin = require(path.join(root, 'plugin.json'));
var manifest = require(path.join(root, 'manifest.json'));
var version = packageJson.version;

function run(command, args) {
    var result = childProcess.spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

function quotePowerShell(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

function assertVersions() {
    if (version.indexOf('-') === -1) {
        throw new Error('Test releases must use a SemVer prerelease version such as 0.3.0-beta.1');
    }
    if (plugin.version !== version) throw new Error('plugin.json version does not match package.json');
    if (manifest.version !== version) throw new Error('manifest.json version does not match package.json');

    var server = fs.readFileSync(path.join(root, 'mcp-server.js'), 'utf8');
    var match = server.match(/var SERVER = \{ name: 'pws-mcp-server', version: '([^']+)' \}/);
    if (!match || match[1] !== version) throw new Error('mcp-server.js version does not match package.json');
}

function prepareTestPlugin() {
    workshop.build();
    workshop.verify();

    fs.rmSync(testDirectory, { recursive: true, force: true });
    fs.cpSync(workshop.outputDirectory, testDirectory, { recursive: true });

    var pluginPath = path.join(testDirectory, 'plugin.json');
    var testPlugin = JSON.parse(fs.readFileSync(pluginPath, 'utf8'));
    testPlugin.id = 'pws-mcp-server-test';
    testPlugin.name = 'PWS MCP Server TEST';
    testPlugin.description = 'TEST BUILD ' + version + ' - secure local MCP bridge for Pro Wrestling Sim.';
    fs.writeFileSync(pluginPath, JSON.stringify(testPlugin, null, 2) + '\n', 'utf8');
}

function buildPluginZip() {
    if (process.platform !== 'win32') {
        throw new Error('The test release ZIP builder currently requires Windows PowerShell.');
    }

    var zipPath = path.join(outputDirectory, 'pws-mcp-server-TEST-plugin-v' + version + '.zip');
    fs.rmSync(zipPath, { force: true });
    run('powershell.exe', [
        '-NoProfile',
        '-Command',
        'Compress-Archive -LiteralPath ' + quotePowerShell(testDirectory) +
            ' -DestinationPath ' + quotePowerShell(zipPath) + ' -CompressionLevel Optimal'
    ]);
    return zipPath;
}

assertVersions();
prepareTestPlugin();
var pluginZip = buildPluginZip();
run(process.execPath, [path.join(root, 'scripts', 'build-mcpb.js')]);

var mcpb = path.join(outputDirectory, 'pws-mcp-server-v' + version + '.mcpb');
if (!fs.existsSync(mcpb)) throw new Error('MCPB output is missing: ' + mcpb);

console.log('\nGitHub prerelease v' + version + ' is ready:');
console.log('  TEST PWS plugin: ' + pluginZip);
console.log('  Claude Desktop:  ' + mcpb);
console.log('Do not upload dist/pws-mcp-server to Steam Workshop for this prerelease.');
