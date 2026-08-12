'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var workshop = require('./build-workshop');

var root = path.resolve(__dirname, '..');
var packageJson = require(path.join(root, 'package.json'));
var manifestPath = path.join(root, 'manifest.json');
var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
var outputDirectory = path.join(root, 'dist');
var stageDirectory = path.join(outputDirectory, 'mcpb-package');
var outputPath = path.join(outputDirectory, 'pws-mcp-server-v' + packageJson.version + '.mcpb');
var documentationFiles = ['CHANGELOG.md', 'LICENSE', 'NOTICE', 'README.md', 'ROADMAP.md'];

function assertVersions() {
    if (manifest.version !== packageJson.version) {
        throw new Error('manifest.json version ' + manifest.version + ' does not match package.json version ' + packageJson.version);
    }
}

function assertSafeStage() {
    var expected = path.resolve(root, 'dist', 'mcpb-package');
    if (path.resolve(stageDirectory) !== expected || path.dirname(path.dirname(expected)) !== root) {
        throw new Error('Refusing to clean an unexpected MCPB staging path');
    }
}

function copyRequired(source, destination) {
    if (!fs.existsSync(source)) throw new Error('Required MCPB file is missing: ' + source);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
}

async function prepareStage() {
    assertSafeStage();
    await workshop.build();
    workshop.verify();

    fs.rmSync(stageDirectory, { recursive: true, force: true });
    fs.mkdirSync(stageDirectory, { recursive: true });
    copyRequired(manifestPath, path.join(stageDirectory, 'manifest.json'));
    copyRequired(path.join(workshop.outputDirectory, 'mcpb-entry.js'), path.join(stageDirectory, 'mcpb-entry.js'));
    copyRequired(path.join(workshop.outputDirectory, 'mcp-server.js'), path.join(stageDirectory, 'mcp-server.js'));
    copyRequired(path.join(workshop.outputDirectory, 'THIRD_PARTY_NOTICES.txt'), path.join(stageDirectory, 'THIRD_PARTY_NOTICES.txt'));
    documentationFiles.forEach(function (relative) {
        copyRequired(path.join(root, relative), path.join(stageDirectory, relative));
    });

    var runtimePackage = {
        name: packageJson.name,
        version: packageJson.version,
        private: true,
        license: packageJson.license,
        type: 'commonjs',
        engines: packageJson.engines
    };
    fs.writeFileSync(path.join(stageDirectory, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n', 'utf8');
}

async function build() {
    assertVersions();
    await prepareStage();
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.rmSync(outputPath, { force: true });

    var cliPath = path.join(root, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
    var result = childProcess.spawnSync(process.execPath, [cliPath, 'pack', stageDirectory, outputPath], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'inherit'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('MCPB pack failed with exit code ' + (result.status || 1));
    console.log('Created ' + outputPath);
    return outputPath;
}

if (require.main === module) build().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});

module.exports = {
    build: build,
    outputPath: outputPath,
    prepareStage: prepareStage,
    stageDirectory: stageDirectory
};
