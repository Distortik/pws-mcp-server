# PWS MCP Server

PWS MCP Server connects an AI assistant to the save currently loaded in **Pro Wrestling Sim**.

Once connected, you can ask normal questions such as:

- “Which contracts expire in the next year?”
- “Who are five affordable wrestlers I should hire?”
- “What are the biggest problems with my roster?”
- “Draft a complete card for my next show, but do not apply it yet.”

The server works with local AI clients that support MCP, including Codex, Claude Desktop, and Claude Code.

## What it can do

- Search workers, promotions, shows, titles, storylines, teams, stables, venues, and news.
- Analyze your company’s money, payroll, roster, availability, championships, and storylines.
- Recommend suitable and affordable hiring targets.
- Review expiring contracts and suggest priorities.
- Show detailed worker profiles, attributes, relationships, chemistry, and history.
- Read upcoming shows and help build complete show cards.
- Validate a proposed card before changing the save.
- Book matches and angles, manage storylines, sign or release workers, and manage titles.
- Answer unusual questions using limited, read-only database queries.

Read-only questions do not change your save. Actions that change your save require confirmation and are validated by PWS.

## What you need

- A Windows PC
- Pro Wrestling Sim with plugin support
- [Node.js 18 or newer](https://nodejs.org/en/download) — choose the **LTS** download
- At least one supported AI client

You do **not** need to install any npm packages.

## Before you begin

You may configure several AI clients on the same computer. For example, you can set up Codex and Claude, then switch if one reaches its usage limit.

All clients use the same PWS plugin and server file. Use only one client at a time for actions that change your save so that two assistants do not create conflicting plans.

## Installation

### Step 1: Install the PWS plugin

#### Steam Workshop installation

1. Subscribe to **PWS MCP Server** in the Steam Workshop.
2. Wait for Steam to finish downloading it.
3. Close Pro Wrestling Sim if it is open.
4. Start PWS again.
5. Find **PWS MCP Server** in the plugin list on the splash screen.
6. Make sure the plugin is enabled.
7. Load the save you want the AI to use.

The plugin works quietly in the background. It does not add a new page inside your save.

The normal Workshop server path is:

```text
C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js
```

If Steam is installed in another library, use that library’s `steamapps` folder instead.

#### Manual GitHub installation

Use this method only if you are not installing through Steam Workshop.

1. Open the [PWS MCP Server GitHub page](https://github.com/Distortik/pws-mcp-server).
2. Select **Code > Download ZIP**.
3. Extract the ZIP.
4. Rename the extracted folder to `pws-mcp-server`.
5. Press `Windows key + R`.
6. Paste `%APPDATA%\ProWrestlingSimulator\plugins` and press Enter.
7. Copy the `pws-mcp-server` folder into that directory.
8. Restart PWS, enable the plugin, and load a save.

The manual-install server path is:

```text
%APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js
```

The files should look like this:

```text
pws-mcp-server
├── index.js
├── mcp-server.js
├── plugin.json
└── src
```

### Step 2: Check Node.js

1. Open the Windows Start menu.
2. Type `PowerShell` and open it.
3. Run:

```powershell
node --version
```

You should see a version such as `v20.19.0`. The first number must be **18 or higher**.

Next, find the exact Node.js program path:

```powershell
(Get-Command node).Source
```

The normal result is:

```text
C:\Program Files\nodejs\node.exe
```

If PowerShell says that `node` is not recognized, install Node.js LTS and restart Windows.

### Step 3: Check the MCP server file

For a normal Steam Workshop installation, run:

```powershell
Test-Path 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js'
```

For a manual GitHub installation, run:

```powershell
Test-Path (Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js')
```

PowerShell should answer `True`. If it answers `False`, see [Server file not found](#server-file-not-found).

### Step 4: Connect an AI client

Set up any combination of the clients below. You only need one, but you may configure several.

## Connect Codex

Official reference: [Codex MCP documentation](https://developers.openai.com/codex/mcp)

### Codex desktop app or IDE extension

1. Open **Settings**.
2. Open **MCP servers**.
3. Select **Add server**.
4. Enter the name `pro-wrestling-sim`.
5. Choose **STDIO**.
6. For the command, enter the Node.js path shown by `(Get-Command node).Source`.
7. For the argument, enter your complete `mcp-server.js` path.
8. Save the server.
9. Select **Restart** or **Restart extension**.

For a normal Workshop installation, the values are:

```text
Name:     pro-wrestling-sim
Command:  C:\Program Files\nodejs\node.exe
Argument: C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js
```

Type `/mcp` in Codex to see the connected server.

### Codex configuration-file method

You may configure Codex by editing `%USERPROFILE%\.codex\config.toml` instead.

Add this for a normal Workshop installation:

```toml
[mcp_servers.pro-wrestling-sim]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\1157700\\3780507815\\plugins\\pws-mcp-server\\mcp-server.js"]
enabled = true
default_tools_approval_mode = "writes"
```

Save the file and restart Codex.

If you installed the plugin manually, replace the `args` path with the complete manual-install path. Do not put `%APPDATA%` directly in the TOML argument because Codex may not expand it. You can find the complete path in PowerShell with:

```powershell
(Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js')
```

### Codex CLI method

For a Workshop installation, run:

```powershell
$server = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js'
codex mcp add pro-wrestling-sim -- node $server
```

For a manual installation, run:

```powershell
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
codex mcp add pro-wrestling-sim -- node $server
```

Check the result with:

```powershell
codex mcp list
```

The Codex CLI is optional. You do not need it when using the desktop app or IDE settings.

## Connect Claude Desktop

Official reference: [Claude Desktop local MCP documentation](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers)

1. Install or update [Claude Desktop](https://claude.ai/download).
2. Open **Settings > Developer**.
3. Select **Edit Config**.
4. This opens `%APPDATA%\Claude\claude_desktop_config.json`.
5. If the file is empty, paste the configuration below.
6. Save the file.
7. Fully quit Claude Desktop, then open it again.

Workshop configuration:

```json
{
  "mcpServers": {
    "pro-wrestling-sim": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\1157700\\3780507815\\plugins\\pws-mcp-server\\mcp-server.js"
      ]
    }
  }
}
```

Manual-install configuration:

```json
{
  "mcpServers": {
    "pro-wrestling-sim": {
      "command": "powershell.exe",
      "args": [
        "-NoProfile",
        "-Command",
        "& (Get-Command node).Source (Join-Path $env:APPDATA 'ProWrestlingSimulator\\plugins\\pws-mcp-server\\mcp-server.js')"
      ]
    }
  }
}
```

The doubled backslashes in JSON are correct.

If your file already contains other MCP servers, add `pro-wrestling-sim` inside the existing `mcpServers` object instead of deleting the other entries. Remember to put a comma between entries.

After restarting Claude Desktop, open **Add files, connectors, and more > Connectors > Manage connectors** and look for `pro-wrestling-sim`.

## Connect Claude Code

Official references: [Claude Code setup](https://code.claude.com/docs/en/setup) and [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

For a Workshop installation, run this in PowerShell:

```powershell
$server = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
```

For a manual installation, run:

```powershell
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
```

The user scope makes the server available in every Claude Code project.

Check the connection with:

```powershell
claude mcp list
```

You can also type `/mcp` inside Claude Code.

## Connect another MCP client

For another local client that supports stdio MCP servers, use:

- **Name:** `pro-wrestling-sim`
- **Command:** the full path to `node.exe`
- **Argument:** the full path to `mcp-server.js`

The server uses standard input/output (stdio). It is not a public website or remote HTTP service.

## Test the connection

Before testing, make sure:

- PWS is running.
- PWS MCP Server is enabled.
- A save is loaded.
- Your AI client was restarted after configuration.

Ask your AI assistant:

> Connect to Pro Wrestling Sim and tell me the loaded save, current date, player promotion, company size, and cash balance.

If the answer contains information from your save, setup is complete.

## Good first questions

Start with questions that do not change the save:

- “Assess my company and identify my three biggest roster needs.”
- “Recommend five affordable hires who fit those needs.”
- “Review every contract expiring in the next 365 days.”
- “Show me my champions, active storylines, and neglected wrestlers.”
- “Search for every worker, team, title, and storyline containing Hart.”

For show booking, first make sure an unfinished upcoming event exists in PWS. Then ask:

> Draft a complete card for my next show. Explain every choice and wait for my approval before applying it.

The assistant can plan and validate the card without changing your save. Applying it is a separate confirmed action.

## Safety

- The connection stays on your computer and listens only on `127.0.0.1`.
- The local connection uses a randomly generated private token.
- Database exploration is read-only and limited in size.
- Save-changing actions are checked by PWS and require confirmation.
- Show booking is split into planning, validation, and confirmed application.
- Successful game actions appear in the PWS plugin audit log.
- If a multi-part booking fails, the plugin attempts to remove segments created earlier in that operation.

Back up important saves before using any plugin that can perform game actions.

Never share this file:

```text
%APPDATA%\ProWrestlingSimulator\mcp\pws-mcp-runtime.json
```

It contains the temporary local authentication token and is regenerated when the plugin starts.

## Troubleshooting

### Bridge is offline

1. Start PWS.
2. Confirm that PWS MCP Server is enabled.
3. Load a save.
4. Restart your AI client.

### Server file not found

For Steam Workshop installations:

1. Open Steam.
2. Open **Steam > Settings > Storage** and check which drive contains PWS.
3. Open that Steam library in File Explorer.
4. Browse to:

```text
steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server
```

5. Confirm that `mcp-server.js` exists.

For manual installations, confirm that the folder is named exactly `pws-mcp-server`. Make sure the ZIP did not create an extra nested folder such as `pws-mcp-server\pws-mcp-server-main`.

### Node is not recognized

1. Install the LTS version from [nodejs.org](https://nodejs.org/en/download).
2. Restart Windows.
3. Run `node --version` again.

### MCP server does not appear

- Restart the AI client completely.
- Confirm that both the Node.js path and server path are absolute and correct.
- Check that the configuration contains valid TOML or JSON.
- In Claude Desktop, look in `%APPDATA%\Claude\logs` for connection errors.
- In Codex or Claude Code, use `/mcp` to check the server status.

### New tools do not appear

Restart PWS first, then restart the AI client so it reloads the tool list.

### Player promotion is missing

Update the Workshop item, restart PWS, reload the plugin, and restart the AI client.

### No show can be planned

Schedule an unfinished upcoming event in PWS first.

### An action is rejected

PWS validates game actions. Ask the assistant to explain the returned error and inspect the MCP action audit log.

### Codex or Claude command is not recognized

The command-line clients are separate programs. Install the relevant CLI using its official setup guide, or configure the desktop app/IDE directly instead.

## Current limitations

- The server works with local clients only; remote HTTP access is not included.
- ChatGPT on the web does not read local stdio MCP configuration.
- PWS does not currently provide a dedicated validated contract-renewal action, so renewal recommendations are advisory.
- Automatically generated show cards are drafts. Review winners, finishes, title stakes, and storyline continuity before applying them.

## License

Copyright 2026 Distortik.

Licensed under the [Apache License 2.0](LICENSE). You may use, modify, and distribute this project under the license terms. The software is provided without warranties or conditions of any kind; see the license for the complete terms and limitations.
