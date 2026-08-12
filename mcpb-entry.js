#!/usr/bin/env node
'use strict';

// Claude Desktop may load a Node MCPB entry point through its UtilityProcess
// wrapper instead of executing it as require.main. Keep the reusable server
// module import-safe and start unconditionally from this dedicated entry.
require('./mcp-server').start().catch(function (error) {
    console.error('PWS MCP server failed to start: ' + error.message);
    process.exitCode = 1;
});
