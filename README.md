# PWS MCP Server

PWS MCP Server connects an AI assistant to the save currently loaded in **Pro Wrestling Sim**.

Ask it to search your save, analyze your company, review contracts, recommend workers, plan storylines, or draft and apply complete show cards. Read-only questions do not change your save. Save-changing actions require confirmation and are validated by PWS.

## Table of contents

- [What you need](#what-you-need)
- [Install the PWS plugin](#install-the-pws-plugin)
- [Connect Claude Desktop](#connect-claude-desktop)
- [Connect Claude Code](#connect-claude-code)
- [Connect Codex](#connect-codex)
- [Connect another MCP client](#connect-another-mcp-client)
- [Test the connection](#test-the-connection)
- [Ideas to try](#ideas-to-try)
- [Safety](#safety)
- [Troubleshooting](#troubleshooting)
- [Current limitations](#current-limitations)
- [License](#license)

## What you need

- Windows and Pro Wrestling Sim
- The **PWS MCP Server** in-game plugin
- One supported local AI client

Claude Desktop users do not need to install Node.js or edit a configuration file. The downloadable MCPB includes the Claude-side server and uses Claude Desktop's built-in Node runtime.

Node.js 18 or newer is still required for Codex, Claude Code, and other clients that run the Workshop copy of `mcp-server.js` directly.

## Install the PWS plugin

### Steam Workshop (recommended)

1. Subscribe to **PWS MCP Server** in the Steam Workshop.
2. Wait for Steam to finish downloading it.
3. Restart Pro Wrestling Sim.
4. Enable **PWS MCP Server** in the plugin list on the splash screen.
5. Load the save you want the AI to use.

The plugin works in the background and does not add an in-game page.

### Manual GitHub installation

Use this only when you are not installing through Steam Workshop.

1. Download the repository ZIP from GitHub and extract it.
2. Rename the extracted folder to `pws-mcp-server`.
3. Copy it to `%APPDATA%\ProWrestlingSimulator\plugins`.
4. Restart PWS, enable the plugin, and load a save.

## Connect Claude Desktop

Claude Desktop uses the one-click MCPB release. Do not edit `claude_desktop_config.json`.

1. Open the [latest GitHub release](https://github.com/Distortik/pws-mcp-server/releases/latest).
2. Download `pws-mcp-server-vVERSION.mcpb` from **Assets**.
3. In Claude Desktop, open **Settings > Extensions > Advanced settings**.
4. Select **Install Extension** and choose the downloaded `.mcpb` file.
5. Start PWS, enable the plugin, and load a save.
6. Open the **Code** tab in Claude Desktop, start a new conversation, and confirm that **Pro Wrestling Sim** is enabled.

Use the **Code** tab, not the **Home** tab. Home conversations do not use MCP servers configured in Claude Code.

The MCPB installs only the Claude-side connection. The in-game plugin must still be installed through Steam Workshop or manually.

If your Claude organization blocks custom desktop extensions, an owner or administrator must allow them. See [Anthropic's local MCP server guide](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

## Connect Claude Code

Install [Node.js 18 or newer](https://nodejs.org/en/download), then run this in PowerShell for a normal Workshop installation:

```powershell
$server = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
```

If Steam is installed in another library, change the path. For a manual GitHub installation:

```powershell
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
```

Check the connection with `claude mcp list` or `/mcp` inside Claude Code. See the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for client details.

## Connect Codex

Install [Node.js 18 or newer](https://nodejs.org/en/download). In Codex, open **Settings > Plugins > Add > Add MCP Server**, choose **STDIO**, and enter:

```text
Name:     pro-wrestling-sim
Command:  C:\Program Files\nodejs\node.exe
Argument: C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js
```

If Steam uses another library, change the argument path. Restart the MCP server after saving. You can also configure it from PowerShell:

```powershell
$server = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js'
codex mcp add pro-wrestling-sim -- node $server
```

See the [Codex MCP documentation](https://developers.openai.com/codex/mcp) for other installation methods.

## Connect another MCP client

The server uses standard input/output (stdio). Configure your client to run:

```text
node <complete path to mcp-server.js>
```

It is a local process, not a public HTTP service. Node.js 18 or newer is required outside the Claude Desktop MCPB.

## Test the connection

Keep PWS open with a save loaded, then ask:

> Connect to Pro Wrestling Sim and tell me the loaded save, current date, player promotion, company size, and cash balance.

If you are using Claude Desktop, ask this from the **Code** tab, not the **Home** tab.

If the answer contains information from your save, setup is complete.

## Ideas to try

- "Assess my company and identify my three biggest roster needs."
- "Recommend five affordable hires who fit those needs."
- "Review all contracts expiring in the next year."
- "Show me my champions, active storylines, and neglected wrestlers."
- "Draft my next show, explain every choice, and wait for approval."

## Safety

- The bridge listens only on the local computer and uses a random authentication token.
- Raw database access is read-only and result-limited.
- Save-changing actions are validated and audited by PWS.
- Show plans are drafts until you explicitly approve applying them.
- The assistant should never report a save change as successful unless PWS confirms it.

Back up important saves before using any plugin that can perform game actions. Never share `%APPDATA%\ProWrestlingSimulator\mcp\pws-mcp-runtime.json`; it contains a temporary local access token.

## Troubleshooting

### PWS bridge is offline

Start PWS, confirm the plugin is enabled, and load a save. If it was already open, restart PWS and then restart the AI client or extension.

### Not connected in Claude

Open the **Code** tab and start the conversation there. **Home** conversations do not use MCP servers configured in Claude Code. Confirm **Pro Wrestling Sim** is enabled for the conversation. If the tools are still missing, restart Claude Desktop after installing or updating the MCPB, or reinstall the newest MCPB from GitHub Releases.

### Workshop server file is missing

The default path is:

```text
C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js
```

If Steam uses another drive, locate its `steamapps\workshop\content` directory. This path check is not needed for Claude Desktop MCPB users.

### Node is not recognized

This applies to Codex, Claude Code, and other direct stdio clients. Install Node.js LTS, restart Windows, and run `node --version`. Claude Desktop MCPB users do not need a separate Node installation.

### An action is rejected

PWS validates game actions. Ask the assistant to explain the returned error and revise the request. Automatic show cards remain drafts until they pass validation and you approve them.

## Current limitations

- Pro Wrestling Sim and its plugin API are Windows-only.
- Contract renewals remain advisory until PWS exposes a validated renewal action.
- Privately distributed MCPB updates must be downloaded and installed again from a newer GitHub Release.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
