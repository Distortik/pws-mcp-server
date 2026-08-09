'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var packageJson = require(path.join(root, 'package.json'));
var manifestPath = path.join(root, 'manifest.json');
var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.version !== packageJson.version) {
    throw new Error('manifest.json version ' + manifest.version + ' does not match package.json version ' + packageJson.version);
}

var outputDirectory = path.join(root, 'dist');
var outputPath = path.join(outputDirectory, 'pws-mcp-server-v' + packageJson.version + '.mcpb');
fs.mkdirSync(outputDirectory, { recursive: true });

var cliPath = path.join(root, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
var result = childProcess.spawnSync(process.execPath, [cliPath, 'pack', root, outputPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log('Created ' + outputPath);
