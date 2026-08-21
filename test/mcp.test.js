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

test('rejects a mismatched in-game plugin before exposing stale tool behavior', function () {
    assert.doesNotThrow(function () { mcp.assertRuntimeVersion({ pluginVersion: '0.5.0' }); });
    assert.doesNotThrow(function () { mcp.assertRuntimeVersion({}); });
    assert.throws(function () { mcp.assertRuntimeVersion({ pluginVersion: '0.4.0' }); }, /version mismatch.*matching pair/i);
});

test('publishes a broad unique tool catalogue with safety annotations', async function () {
    var result = await mcp.handle({ method: 'tools/list', params: {} });
    assert.ok(result.tools.length >= 19);
    assert.equal(new Set(result.tools.map(function (tool) { return tool.name; })).size, result.tools.length);
    var apply = result.tools.find(function (tool) { return tool.name === 'pws_apply_show_plan'; });
    assert.equal(apply.annotations.destructiveHint, true);
    assert.deepEqual(apply.inputSchema.required, ['showId', 'segments', 'confirmed']);
    var matchSchema = apply.inputSchema.properties.segments.items.oneOf[0];
    assert.equal(matchSchema.additionalProperties, false);
    assert.ok(matchSchema.properties.titleIds);
    assert.equal(matchSchema.properties.titleId, undefined);
    var update = result.tools.find(function (tool) { return tool.name === 'pws_update_segment'; });
    assert.ok(update);
    assert.equal(update.inputSchema.properties.changes.additionalProperties, false);
    assert.equal(update.annotations.destructiveHint, true);
    ['pws_remove_segment', 'pws_set_show_venue', 'pws_end_storyline', 'pws_add_storyline_worker', 'pws_remove_storyline_worker', 'pws_release_worker', 'pws_vacate_title'].forEach(function (name) {
        var tool = result.tools.find(function (item) { return item.name === name; });
        assert.ok(tool, name + ' should be published');
        assert.equal(tool.inputSchema.properties.preview.default, true);
        assert.equal(tool.annotations.destructiveHint, true);
    });
    ['pws_get_server_info', 'pws_get_venues', 'pws_get_gimmicks', 'pws_get_personas', 'pws_get_promises', 'pws_diagnose_storyline_attribution'].forEach(function (name) {
        var tool = result.tools.find(function (item) { return item.name === name; });
        assert.ok(tool, name + ' should be published');
        assert.equal(tool.annotations.readOnlyHint, true);
        assert.equal(tool.annotations.destructiveHint, false);
    });
    ['pws_list_optional_integrations', 'pws_get_inner_circle', 'pws_get_investments'].forEach(function (name) {
        assert.equal(result.tools.find(function (item) { return item.name === name; }), undefined, name + ' should not be published in the base-game release');
    });
    ['pws_create_stable', 'pws_dissolve_stable', 'pws_add_stable_worker', 'pws_remove_stable_worker', 'pws_set_contract_gimmick', 'pws_set_contract_persona', 'pws_set_persona_availability', 'pws_respond_to_promise', 'pws_create_event', 'pws_set_event_active', 'pws_schedule_show', 'pws_cancel_show', 'pws_register_tag_team', 'pws_update_contract', 'pws_sign_worker', 'pws_create_storyline', 'pws_update_storyline', 'pws_award_championship', 'pws_update_event', 'pws_reschedule_show'].forEach(function (name) {
        var tool = result.tools.find(function (item) { return item.name === name; });
        assert.ok(tool, name + ' should be published');
        assert.equal(tool.inputSchema.properties.preview.default, true);
        assert.equal(tool.annotations.destructiveHint, true);
    });
    var generic = result.tools.find(function (tool) { return tool.name === 'pws_execute_action'; });
    assert.equal(generic.inputSchema.properties.action.enum.indexOf('release_worker'), -1);
    assert.equal(generic.inputSchema.properties.action.enum.indexOf('vacate_title'), -1);
});

test('publishes management workflow prompts', async function () {
    var result = await mcp.handle({ method: 'prompts/list', params: {} });
    assert.deepEqual(result.prompts.map(function (prompt) { return prompt.name; }), ['pws_hiring_review', 'pws_book_next_show', 'pws_contract_review']);
});
