#!/usr/bin/env node
'use strict';

var fs = require('fs');
var http = require('http');
var Server = require('@modelcontextprotocol/sdk/server/index.js').Server;
var StdioServerTransport = require('@modelcontextprotocol/sdk/server/stdio.js').StdioServerTransport;
var mcpTypes = require('@modelcontextprotocol/sdk/types.js');
var definitions = require('./src/tools');
var runtime = require('./src/runtime');

var SERVER = { name: 'pws-mcp-server', version: '0.5.0' };
var PROTOCOLS = mcpTypes.SUPPORTED_PROTOCOL_VERSIONS.slice();
var INSTRUCTIONS = 'Use PWS search tools to resolve names to IDs before acting. Read company and booking context before giving management advice. Show plans are drafts: explain major choices and obtain explicit user approval before applying a plan or calling any save-changing action. Prefer purpose-built tools over raw SQL. Never claim a save change succeeded unless the tool result says success=true.';

function runtimeConfig() {
    var file = runtime.resolveRuntimePath({ pluginDirectory: __dirname });
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { throw new Error('PWS bridge is offline. Start Pro Wrestling Sim and enable the PWS MCP Server plugin.'); }
}

function assertRuntimeVersion(config) {
    if (!config || !config.pluginVersion || config.pluginVersion === SERVER.version) return config;
    throw new Error('PWS MCP version mismatch: this client is ' + SERVER.version + ' but the in-game plugin is ' + config.pluginVersion + '. Install or select the matching pair, restart PWS, and restart this MCP client.');
}

function ensureRuntimeVersion() {
    var config;
    try { config = assertRuntimeVersion(runtimeConfig()); }
    catch (error) { return Promise.reject(error); }
    if (config.pluginVersion) return Promise.resolve(config);
    return rpc('health', {}).then(function (health) {
        assertRuntimeVersion({ pluginVersion: health && health.pluginVersion });
        return config;
    });
}

function rpc(method, params) {
    return new Promise(function (resolve, reject) {
        var config;
        try { config = runtimeConfig(); } catch (error) { reject(error); return; }
        var body = JSON.stringify({ method: method, params: params || {} });
        var request = http.request({
            hostname: config.host, port: config.port, path: '/rpc', method: 'POST',
            headers: { authorization: 'Bearer ' + config.token, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
        }, function (response) {
            var chunks = [];
            response.on('data', function (chunk) { chunks.push(chunk); });
            response.on('end', function () {
                try {
                    var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (response.statusCode !== 200 || parsed.error) reject(new Error(parsed.error || 'Bridge request failed'));
                    else resolve(parsed.result);
                } catch (error) { reject(error); }
            });
        });
        request.on('error', function () { reject(new Error('Cannot reach PWS. Make sure the game is running and the plugin is enabled.')); });
        request.setTimeout(120000, function () { request.destroy(new Error('PWS bridge request timed out')); });
        request.end(body);
    });
}

function toolCall(name, args) {
    var route = definitions.ROUTES[name];
    if (!route) return Promise.reject(new Error('Unknown tool: ' + name));
    return ensureRuntimeVersion().then(function () { return rpc(route, args || {}); }).then(function (result) {
        if (name !== 'pws_get_server_info') return result;
        return Object.assign({}, result, { clientVersion: SERVER.version, versionMatch: result && result.pluginVersion === SERVER.version });
    });
}

function resourceRead(uri) {
    var method;
    var params = {};
    if (uri === 'pws://state') method = 'game.state';
    else if (uri === 'pws://company') method = 'company.overview';
    else if (uri === 'pws://shows/upcoming') { method = 'shows.upcoming'; params = { limit: 20 }; }
    else return Promise.reject(Object.assign(new Error('Resource not found: ' + uri), { code: -32002 }));
    return ensureRuntimeVersion().then(function () { return rpc(method, params); });
}

async function handle(message) {
    if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return null;
    if (message.method === 'initialize') {
        var requested = message.params && message.params.protocolVersion;
        return {
            protocolVersion: PROTOCOLS.indexOf(requested) !== -1 ? requested : PROTOCOLS[0],
            capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
            serverInfo: SERVER,
            instructions: INSTRUCTIONS
        };
    }
    if (message.method === 'ping') return {};
    if (message.method === 'tools/list') return { tools: definitions.TOOLS };
    if (message.method === 'tools/call') {
        try {
            var value = await toolCall(message.params.name, message.params.arguments || {});
            return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: { result: value } };
        } catch (error) {
            return { content: [{ type: 'text', text: error.message }], isError: true };
        }
    }
    if (message.method === 'resources/list') return { resources: [
        { uri: 'pws://state', name: 'Current PWS game state', description: 'Save, date, player promotion, company size, and cash.', mimeType: 'application/json' },
        { uri: 'pws://company', name: 'Player company overview', description: 'Management dashboard including finance, roster, shows, titles, stories, and alerts.', mimeType: 'application/json' },
        { uri: 'pws://shows/upcoming', name: 'Upcoming PWS shows', description: 'Unfinished shows and current booking progress.', mimeType: 'application/json' }
    ] };
    if (message.method === 'resources/read') {
        var resource = await resourceRead(message.params.uri);
        return { contents: [{ uri: message.params.uri, mimeType: 'application/json', text: JSON.stringify(resource, null, 2) }] };
    }
    if (message.method === 'prompts/list') return { prompts: definitions.PROMPTS };
    if (message.method === 'prompts/get') {
        return { description: definitions.PROMPTS.find(function (item) { return item.name === message.params.name; }).description, messages: [{ role: 'user', content: { type: 'text', text: definitions.prompt(message.params.name, message.params.arguments) } }] };
    }
    throw Object.assign(new Error('Method not found: ' + message.method), { code: -32601 });
}

function createMcpServer() {
    var server = new Server(SERVER, {
        capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
        },
        instructions: INSTRUCTIONS
    });

    [
        mcpTypes.ListToolsRequestSchema,
        mcpTypes.CallToolRequestSchema,
        mcpTypes.ListResourcesRequestSchema,
        mcpTypes.ReadResourceRequestSchema,
        mcpTypes.ListPromptsRequestSchema,
        mcpTypes.GetPromptRequestSchema
    ].forEach(function (schema) {
        server.setRequestHandler(schema, handle);
    });

    return server;
}

async function start() {
    var server = createMcpServer();
    var transport = new StdioServerTransport();
    await server.connect(transport);
    return { server: server, transport: transport };
}

if (require.main === module) {
    start().catch(function (error) {
        console.error('PWS MCP server failed to start: ' + error.message);
        process.exitCode = 1;
    });
}

module.exports = { assertRuntimeVersion: assertRuntimeVersion, createMcpServer: createMcpServer, ensureRuntimeVersion: ensureRuntimeVersion, handle: handle, resourceRead: resourceRead, rpc: rpc, start: start, toolCall: toolCall, TOOLS: definitions.TOOLS };
