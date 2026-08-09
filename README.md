# PWS MCP Server

PWS MCP Server connects MCP-compatible AI clients to a running **Pro Wrestling Sim** game. It lets an assistant search and analyze the loaded save, advise on company management, plan shows, and perform PWS's validated game actions.

Version 0.2 includes broad search and schema discovery, company management context, hiring and contract analysis, and a guarded end-to-end show-booking workflow.

## Features

- Search workers, promotions, shows, titles, storylines, teams, stables, venues, and news.
- Inspect the entire database schema and run capped, read-only SQL queries.
- Analyze company size, finances, payroll, roster balance, availability, and creative needs.
- Rank hiring targets using company resources, market, roster gaps, requested needs, risk, and estimated affordability.
- Review contracts using expiry, pay, performance, usage, momentum, morale, and company finances.
- Build, validate, and apply show cards through a review-and-confirm workflow.
- Manage bookings, storylines, contracts, titles, workers, news, and email through PWS's validated action API.
- Connect locally through Codex, Claude Desktop, Claude Code, and other stdio MCP clients.

## Requirements

- Pro Wrestling Sim with plugin support
- Windows
- Node.js 18 or newer
- An MCP-compatible client

No npm dependencies are required.

## Tutorial: first-time setup

### 1. Install the plugin

#### Steam Workshop

Subscribe to the Workshop item and restart PWS. Steam installs Workshop content below the game's app ID (`1157700`) and the item's numeric Workshop ID:

```text
C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\<WORKSHOP_ITEM_ID>\plugins\pws-mcp-server\
```

The server entry point is:

```text
C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\<WORKSHOP_ITEM_ID>\plugins\pws-mcp-server\mcp-server.js
```

Replace `<WORKSHOP_ITEM_ID>` with the number in the Workshop page URL. If Steam is installed in another library, use that library's `steamapps\workshop\content\1157700` directory.

#### GitHub or manual download

Open this directory in File Explorer:

```text
%APPDATA%\ProWrestlingSimulator\plugins
```

Copy or clone the project into a folder named `pws-mcp-server`. The resulting layout must be:

```text
%APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server\
├── index.js
├── mcp-server.js
├── plugin.json
└── src\
```

You can confirm the installation from PowerShell:

```powershell
$pluginDirectory = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server'
Test-Path (Join-Path $pluginDirectory 'plugin.json')
Test-Path (Join-Path $pluginDirectory 'mcp-server.js')
```

Both commands should return `True`. Do not paste the Markdown fence markers (the lines containing three backticks) into PowerShell.

The `%APPDATA%` location applies only to GitHub/manual installations. Workshop subscribers must use the Steam Workshop path above.

### 2. Verify Node.js

Run:

```powershell
node --version
```

The version must be 18 or newer. If PowerShell cannot find `node`, install Node.js and open a new terminal.

### 3. Enable the plugin in PWS

1. Start or restart Pro Wrestling Sim.
2. Find **PWS MCP Server** in the plugin list on the PWS splash screen.
3. Make sure the plugin is enabled.
4. Load a save.

The plugin runs in the background and does not currently add an in-game page. When activation succeeds, it creates this private runtime file:

```text
%APPDATA%\ProWrestlingSimulator\mcp\pws-mcp-runtime.json
```

Do not share that file. It contains the temporary local authentication token, is kept outside the Workshop-uploaded plugin directory, and is regenerated whenever the plugin starts.

### 4. Connect an MCP client

Configure one of the clients in [Client configuration](#client-configuration). After saving the configuration, restart the client so it refreshes the server's tools.

### 5. Test the connection

Ask the client:

> Connect to Pro Wrestling Sim and tell me the loaded save, current date, player promotion, company size, and cash balance.

A successful response should identify the player promotion rather than only the in-game date.

### 6. Try the management workflows

Start with read-only requests:

- "Assess my company and identify my three biggest roster needs."
- "Recommend five affordable hires for those needs."
- "Review my contracts for the next 365 days."
- "Show me my titles, champions, and active storylines."

For booking, first make sure PWS has an unfinished upcoming show, then ask:

> Draft a complete card for my next show, explain the choices, and wait for my approval before applying it.

The assistant can generate and validate the card without changing the save. Applying it is a separate confirmed operation.

## Client configuration

The server entry point depends on how the plugin was installed:

```text
Workshop:     C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\<WORKSHOP_ITEM_ID>\plugins\pws-mcp-server\mcp-server.js
GitHub/manual: %APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js
```

Replace `<WORKSHOP_ITEM_ID>` with the number in the Workshop URL. Environment variables such as `%APPDATA%` are expanded by Windows shells, but many MCP clients do not expand them inside a plain `command` or `args` value.

### Codex app or IDE extension

Open **Settings > MCP servers > Add server**, choose **STDIO**, and enter:

- Name: `pro-wrestling-sim`
- Command: `powershell.exe`
- Arguments, in order:
  1. `-NoProfile`
  2. `-Command`
  3. `& (Get-Command node).Source (Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js')`

Save the server and restart Codex.

For a Workshop installation, use `C:\Program Files\nodejs\node.exe` as the command and the full Workshop `mcp-server.js` path as its only argument.

You can instead add the server directly to `%USERPROFILE%\.codex\config.toml`.

For a Workshop installation:

```toml
[mcp_servers.pro-wrestling-sim]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\1157700\\<WORKSHOP_ITEM_ID>\\plugins\\pws-mcp-server\\mcp-server.js"]
enabled = true
```

Replace `<WORKSHOP_ITEM_ID>`, save the file, and restart Codex. Keep Pro Wrestling Sim running with the plugin enabled and a save loaded.

For a GitHub/manual installation, use the portable PowerShell configuration:

```toml
[mcp_servers.pro-wrestling-sim]
command = "powershell.exe"
args = [
  "-NoProfile",
  "-Command",
  "& (Get-Command node).Source (Join-Path $env:APPDATA 'ProWrestlingSimulator\\plugins\\pws-mcp-server\\mcp-server.js')"
]
enabled = true
default_tools_approval_mode = "writes"
```

If the Codex CLI is installed, run this in PowerShell:

```powershell
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
codex mcp add pro-wrestling-sim -- node $server
```

For a Workshop installation, assign `$server` to the full Workshop path instead:

```powershell
$server = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\<WORKSHOP_ITEM_ID>\plugins\pws-mcp-server\mcp-server.js'
codex mcp add pro-wrestling-sim -- node $server
```

The Codex app and IDE extension do not require the Codex CLI.

### Claude Desktop

Add this server to `claude_desktop_config.json`:

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

Save the file and restart Claude Desktop.

The example above is for GitHub/manual installations. For Workshop installations, replace the final PowerShell expression with the full Workshop path:

```text
& (Get-Command node).Source 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\<WORKSHOP_ITEM_ID>\plugins\pws-mcp-server\mcp-server.js'
```

### Claude Code

Run this in PowerShell:

```powershell
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
claude mcp add pro-wrestling-sim -- node $server
```

For Workshop installations, assign `$server` to the full Workshop path shown above.

### Other stdio MCP clients

Use `node` as the executable and the resolved absolute path to `mcp-server.js` as its only argument. For a GitHub/manual installation, print that path in PowerShell with:

```powershell
Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
```

For a Workshop installation, use the full `steamapps\workshop\content\1157700\<WORKSHOP_ITEM_ID>\plugins\pws-mcp-server\mcp-server.js` path.

### ChatGPT web

ChatGPT web does not read local stdio configuration. This release deliberately exposes only local stdio and loopback transports. A future release may add an authenticated Streamable HTTP option for remote clients without exposing the game database directly.

## Available MCP capabilities

### Search and discovery

| Tool | Purpose |
|---|---|
| `pws_search` | Search workers, promotions, shows, titles, storylines, teams, stables, venues, and news. |
| `pws_database_catalog` | List every table/view or inspect the columns of one database object. |
| `pws_query` | Run parameterized, read-only custom SQL with a configurable result cap. |
| `pws_get_state` | Resolve the save, date, player promotion, company size, money, style, and home market. |

### Company and talent management

| Tool | Purpose |
|---|---|
| `pws_company_overview` | Finance history, cash, roster/payroll balance, availability, shows, titles, stories, and alerts. |
| `pws_get_roster` | Filterable roster with skills, popularity, wages, alignment, push, momentum, morale, availability, and usage. |
| `pws_get_worker` | Full worker attributes, contracts, relationships, chemistry, storylines, and recent history. |
| `pws_analyze_hiring` | Rank targets using company size, cash pressure, payroll, market, roster gaps, needs, risk, availability, and wage fit. |
| `pws_contract_advice` | Provide renewal, retention, restructure, or release advice based on finances, expiry, pay, performance, usage, morale, and availability. |
| `pws_get_titles` / `pws_get_storylines` | Return active championship and creative-continuity context. |

Hiring and renewal wage ranges are planning estimates. PWS may value an actual offer differently.

### Show planning and auto-booking

| Tool | Purpose |
|---|---|
| `pws_get_upcoming_shows` | Find unfinished shows and their booking progress. |
| `pws_get_show` | Inspect a complete show card or historical result. |
| `pws_get_booking_context` | Return the eligible roster, existing card, runtime, titles, storylines, recent matches, and product preferences. |
| `pws_plan_show` | Generate a dry-run card using availability, brand, alignment, stories, ranking, usage, and runtime. |
| `pws_validate_show_plan` | Check a proposed card without changing the save. |
| `pws_apply_show_plan` | Add an approved card and attempt to roll back newly added segments if a later segment fails. |

Automatic cards are drafts. Review winners, finishes, title stakes, segment purposes, worker repetition, and storyline continuity before applying one.

### Save-changing actions

`pws_execute_action` exposes PWS's validated booking, storyline, contract, title, sandbox-worker, news, and email actions. Both it and `pws_apply_show_plan` reject calls unless `confirmed: true` is supplied after review. Successful actions are available through `pws_get_audit_log`.

PWS currently exposes signing and releasing actions, but not a dedicated contract-renewal action. Contract advice therefore recommends renewal terms without silently rewriting contract rows.

### Resources and prompts

- Resources: `pws://state`, `pws://company`, and `pws://shows/upcoming`
- Prompts: `pws_hiring_review`, `pws_book_next_show`, and `pws_contract_review`

## Example requests

- "Search for every worker, team, title, and storyline containing Hart."
- "Assess my company and tell me the three roster gaps that matter most."
- "Find affordable young technical babyfaces who could grow with my company."
- "Compare two hiring candidates with my current upper midcard."
- "Review every contract expiring in the next year and group them by priority."
- "Build the next show around my hottest storyline, but do not use anyone twice in a match."
- "Draft a 90-minute card, explain every decision, and wait for my approval."

## Architecture

The project has two local processes:

1. `index.js` runs inside PWS and owns access to the official plugin API.
2. `mcp-server.js` is launched by the MCP client over stdio and forwards requests to PWS through a protected loopback bridge.

The bridge binds only to `127.0.0.1`. It is not reachable from other computers unless the user deliberately adds separate networking infrastructure.

## Safety model

- The loopback bridge requires a random 256-bit bearer token.
- The runtime credential is stored outside the uploadable plugin directory, regenerated on activation, and deleted on clean shutdown.
- Raw database access rejects writes and stacked statements and caps result counts.
- Purpose-built game actions use PWS validation and its action audit log.
- Every generic save-changing action requires `confirmed: true`.
- Auto-booking separates planning, validation, and confirmed application.
- A failed multi-segment booking attempts to roll back segments added by that operation.

Do not commit or share `pws-mcp-runtime.json`; it is a live local credential.

## Development and testing

Keep the development repository outside `%APPDATA%`. A typical development location is:

```text
%USERPROFILE%\source\repos\pws-mcp-server
```

This separation matters because PWS recursively copies the selected plugin folder when preparing a Workshop upload. `.gitignore` controls Git only; it does not filter Steam Workshop files.

From the development repository in PowerShell:

```powershell
npm.cmd test
npm.cmd run check
```

Optionally run the read-only integration suite against a disposable or backed-up save:

```powershell
$save = Join-Path $env:APPDATA 'ProWrestlingSimulator\saves\YourSave.db'
npm.cmd run test:save -- $save
```

The save integration command opens the database read-only. Booking application tests should only be performed against a disposable save.

### Build and deploy the clean plugin

Create and verify an allowlisted package containing only the eight runtime files:

```powershell
npm.cmd run build:workshop
npm.cmd run verify:workshop
```

The build is written to `dist\pws-mcp-server`. It excludes `.git`, tests, development scripts, documentation sources, logs, local configuration, and runtime credentials.

Close PWS, then deploy that clean build to the game's plugin directory:

```powershell
npm.cmd run deploy:plugin
```

The deploy command deliberately refuses to run if the repository itself is still in the PWS plugins directory or if Pro Wrestling Sim is running. It replaces only this exact target:

```text
%APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server
```

### Publish to Steam Workshop

1. Test the source repository with `npm.cmd test` and `npm.cmd run check`.
2. Close PWS and run `npm.cmd run deploy:plugin` from the source repository.
3. Restart PWS and open its Workshop upload screen.
4. Choose **PWS MCP Server** in the **Plugin** list. Do not select a development checkout.
5. Add the title, description, preview image, and visibility, then upload the item.
6. For an update, repeat the clean deployment first and use **Upload New Version** on the existing item.

PWS stages the complete deployed plugin folder. With this layout, that folder contains only the files listed by `npm.cmd run verify:workshop`.

## Troubleshooting

- **PWS bridge is offline:** Start PWS, enable the plugin, and load a save.
- **The player promotion is missing:** Update to version 0.2 or newer, reload the PWS plugin, and restart the MCP client.
- **Port 17890 is already in use:** Close the other PWS instance or set `PWS_MCP_PORT` before starting PWS.
- **New tools do not appear:** Reload or restart PWS, then restart the MCP client so it refreshes the tool list.
- **No show can be planned:** Schedule an unfinished event in PWS first.
- **An action is rejected:** PWS validates action inputs. Inspect the returned error and `pws_get_audit_log`.
- **`codex` is not recognized:** Configure the Codex app directly or install the Codex CLI; the app does not require the CLI.
- **`node` is not recognized:** Install Node.js 18 or newer and restart the terminal and MCP client.

## Development roadmap

- Event subscriptions and change notifications
- Optional enforced read-only mode and configurable action policy
- Smarter booking constraints for title divisions, tag teams, rematch fatigue, chemistry, and required event matches
- Contract-offer and negotiation support when PWS exposes a validated renewal API
- Authenticated Streamable HTTP transport for remote clients
- End-to-end write tests against a disposable PWS save

## Steam Workshop

A ready-to-paste Steam Workshop listing, including features and a public installation tutorial, is available in [`STEAM_WORKSHOP_DESCRIPTION.txt`](STEAM_WORKSHOP_DESCRIPTION.txt).

## License

No license has been selected yet. All rights are reserved until the project owner chooses one.
