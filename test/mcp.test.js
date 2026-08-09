'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var mcp = require('../mcp-server');

test('negotiates a compatible MCP version and publishes guidance', async function () {
    var result = await mcp.handle({ method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    assert.equal(result.protocolVersion, '2024-11-05');
    assert.match(result.instructions, /explicit user approval/);
    assert.ok(result.capabilities.prompts);
});

test('publishes a broad unique tool catalogue with safety annotations', async function () {
    var result = await mcp.handle({ method: 'tools/list', params: {} });
    assert.ok(result.tools.length >= 19);
    assert.equal(new Set(result.tools.map(function (tool) { return tool.name; })).size, result.tools.length);
    var apply = result.tools.find(function (tool) { return tool.name === 'pws_apply_show_plan'; });
    assert.equal(apply.annotations.destructiveHint, true);
    assert.deepEqual(apply.inputSchema.required, ['showId', 'segments', 'confirmed']);
});

test('publishes management workflow prompts', async function () {
    var result = await mcp.handle({ method: 'prompts/list', params: {} });
    assert.deepEqual(result.prompts.map(function (prompt) { return prompt.name; }), ['pws_hiring_review', 'pws_book_next_show', 'pws_contract_review']);
});
