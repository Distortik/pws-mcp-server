'use strict';

var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var test = require('node:test');
var Client = require('@modelcontextprotocol/sdk/client/index.js').Client;
var StdioClientTransport = require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport;
var workshop = require('../scripts/build-workshop');

var root = path.resolve(__dirname, '..');

async function verifyTransport(serverPath, cwd, loadThroughWrapper) {
    var stderr = '';
    var transport = new StdioClientTransport({
        command: process.execPath,
        args: loadThroughWrapper ? ['-e', 'require(' + JSON.stringify(serverPath) + ')'] : [serverPath],
        cwd: cwd,
        stderr: 'pipe'
    });
    if (transport.stderr) transport.stderr.on('data', function (chunk) { stderr += chunk.toString('utf8'); });
    var client = new Client({ name: 'pws-040-regression', version: '1.0.0' }, { capabilities: {} });

    try {
        await client.connect(transport);
        assert.equal(client.getServerVersion().name, 'pws-mcp-server');
        assert.equal(client.getServerVersion().version, '0.4.0');
        var tools = await client.listTools();
        assert.ok(tools.tools.length >= 19);
        assert.ok(tools.tools.some(function (tool) { return tool.name === 'pws_set_contract_persona'; }));
        var resources = await client.listResources();
        assert.deepEqual(resources.resources.map(function (resource) { return resource.uri; }), ['pws://state', 'pws://company', 'pws://shows/upcoming']);
        var prompts = await client.listPrompts();
        assert.deepEqual(prompts.prompts.map(function (prompt) { return prompt.name; }), ['pws_hiring_review', 'pws_book_next_show', 'pws_contract_review']);
    } catch (error) {
        error.message += stderr ? '\nServer stderr:\n' + stderr : '';
        throw error;
    } finally {
        await client.close();
    }
}

test('official MCP client completes initialization against the source server', async function () {
    await verifyTransport(path.join(root, 'mcp-server.js'), root);
});

test('standalone Workshop server completes initialization without node_modules', async function () {
    await workshop.build();
    var notices = fs.readFileSync(path.join(workshop.outputDirectory, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
    assert.match(notices, /@modelcontextprotocol\/sdk 1\.30\.0 \(MIT\)/);
    assert.match(notices, /fast-uri .* \(BSD-3-Clause\)/);
    var temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pws-mcp-040-'));
    var standalone = path.join(temporary, 'mcp-server.js');
    var entry = path.join(temporary, 'mcpb-entry.js');
    try {
        fs.copyFileSync(path.join(workshop.outputDirectory, 'mcp-server.js'), standalone);
        fs.copyFileSync(path.join(workshop.outputDirectory, 'mcpb-entry.js'), entry);
        await verifyTransport(standalone, temporary);
        await verifyTransport(entry, temporary, true);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
