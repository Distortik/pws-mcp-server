'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var workshop = require('./build-workshop');

var root = path.resolve(__dirname, '..');
var outputDirectory = path.join(root, 'dist');
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

function assertVersions() {
    if (plugin.version !== version) throw new Error('plugin.json version does not match package.json');
    if (manifest.version !== version) throw new Error('manifest.json version does not match package.json');

    var server = fs.readFileSync(path.join(root, 'mcp-server.js'), 'utf8');
    var match = server.match(/var SERVER = \{ name: 'pws-mcp-server', version: '([^']+)' \}/);
    if (!match || match[1] !== version) throw new Error('mcp-server.js version does not match package.json');
}

function buildPluginZip() {
    var zipPath = path.join(outputDirectory, 'pws-mcp-server-plugin-v' + version + '.zip');
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });

    if (process.platform !== 'win32') {
        throw new Error('The release ZIP builder currently requires Windows PowerShell.');
    }

    run('powershell.exe', [
        '-NoProfile',
        '-Command',
        'Compress-Archive -LiteralPath ' + quotePowerShell(workshop.outputDirectory) +
            ' -DestinationPath ' + quotePowerShell(zipPath) + ' -CompressionLevel Optimal'
    ]);
    return zipPath;
}

function quotePowerShell(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

async function main() {
    assertVersions();
    await workshop.build();
    workshop.verify();
    var pluginZip = buildPluginZip();
    run(process.execPath, [path.join(root, 'scripts', 'build-mcpb.js')]);

    var mcpb = path.join(outputDirectory, 'pws-mcp-server-v' + version + '.mcpb');
    if (!fs.existsSync(mcpb)) throw new Error('MCPB output is missing: ' + mcpb);

    console.log('\nGitHub Release v' + version + ' is ready:');
    console.log('  Manual PWS plugin: ' + pluginZip);
    console.log('  Claude Desktop:    ' + mcpb);
}

main().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
