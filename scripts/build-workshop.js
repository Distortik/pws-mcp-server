#!/usr/bin/env node
'use strict';

var fs = require('fs');
var Module = require('module');
var path = require('path');
var esbuild = require('esbuild');

var projectRoot = path.resolve(__dirname, '..');
var outputDirectory = path.join(projectRoot, 'dist', 'pws-mcp-server');
var runtimeFiles = [
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.txt',
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

function strictWorkspaceResolver() {
    return {
        name: 'strict-workspace-resolution',
        setup: function (build) {
            build.onResolve({ filter: /.*/ }, function (args) {
                if (args.path.indexOf('node:') === 0 || Module.builtinModules.indexOf(args.path) !== -1) {
                    return { path: args.path, external: true };
                }
                var base = args.resolveDir || projectRoot;
                try {
                    return { path: require.resolve(args.path, { paths: [base, projectRoot] }) };
                } catch (error) {
                    return { errors: [{ text: 'Cannot resolve ' + args.path + ' from ' + base + ': ' + error.message }] };
                }
            });
        }
    };
}

function packageRootForInput(input) {
    var normalized = String(input).split(path.sep).join('/');
    var marker = 'node_modules/';
    var position = normalized.lastIndexOf(marker);
    if (position === -1) return null;
    var prefix = normalized.slice(0, position + marker.length);
    var parts = normalized.slice(position + marker.length).split('/');
    var packageName = parts[0].indexOf('@') === 0 ? parts.slice(0, 2).join('/') : parts[0];
    return path.resolve(projectRoot, prefix + packageName);
}

function writeThirdPartyNotices(metafile) {
    var roots = {};
    Object.keys(metafile.inputs).forEach(function (input) {
        var packageRoot = packageRootForInput(input);
        if (packageRoot) roots[packageRoot] = true;
    });

    var entries = Object.keys(roots).map(function (packageRoot) {
        var metadataPath = path.join(packageRoot, 'package.json');
        var metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        var licenseFiles = fs.readdirSync(packageRoot).filter(function (name) {
            return /^(licen[cs]e|copying|notice)(\.|$)/i.test(name) && fs.statSync(path.join(packageRoot, name)).isFile();
        }).sort();
        if (!licenseFiles.length) throw new Error('Bundled dependency has no license file: ' + metadata.name);
        return { metadata: metadata, packageRoot: packageRoot, licenseFiles: licenseFiles };
    }).sort(function (left, right) {
        return left.metadata.name.localeCompare(right.metadata.name);
    });

    var sections = [
        'PWS MCP Server bundles the following third-party software in its standalone MCP server.',
        'The original license texts are reproduced below.',
        ''
    ];
    entries.forEach(function (entry) {
        sections.push('='.repeat(78));
        sections.push(entry.metadata.name + ' ' + entry.metadata.version + ' (' + entry.metadata.license + ')');
        sections.push('='.repeat(78));
        entry.licenseFiles.forEach(function (name) {
            sections.push('[' + name + ']');
            sections.push(fs.readFileSync(path.join(entry.packageRoot, name), 'utf8').trim());
        });
        sections.push('');
    });
    fs.writeFileSync(path.join(outputDirectory, 'THIRD_PARTY_NOTICES.txt'), sections.join('\n') + '\n', 'utf8');
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

async function build() {
    assertSafeOutput();
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    var bundleResult;

    for (var index = 0; index < runtimeFiles.length; index += 1) {
        var relative = runtimeFiles[index];
        if (relative === 'THIRD_PARTY_NOTICES.txt') continue;
        var source = path.join(projectRoot, relative);
        var destination = path.join(outputDirectory, relative);
        if (!fs.existsSync(source)) throw new Error('Required runtime file is missing: ' + relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (relative === 'mcp-server.js') {
            bundleResult = await esbuild.build({
                stdin: {
                    contents: fs.readFileSync(source, 'utf8'),
                    resolveDir: projectRoot,
                    sourcefile: relative
                },
                plugins: [strictWorkspaceResolver()],
                bundle: true,
                platform: 'node',
                format: 'cjs',
                target: 'node18',
                outfile: destination,
                legalComments: 'none',
                logLevel: 'silent',
                metafile: true
            });
        } else {
            fs.copyFileSync(source, destination);
        }
    }

    if (!bundleResult) throw new Error('MCP server bundle was not created');
    writeThirdPartyNotices(bundleResult.metafile);

    return verify();
}

if (require.main === module) {
    Promise.resolve(process.argv.indexOf('--verify') !== -1 ? verify() : build()).then(function (files) {
        console.log('Workshop package verified: ' + outputDirectory);
        files.forEach(function (file) { console.log('  ' + file); });
    }).catch(function (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    build: build,
    outputDirectory: outputDirectory,
    runtimeFiles: runtimeFiles.slice(),
    verify: verify
};
