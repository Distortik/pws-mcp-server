# PWS MCP Server

PWS MCP Server connects an AI assistant to the save currently loaded in **Pro Wrestling Sim**.

Ask it to search your save, analyze your company, review contracts, recommend workers, plan storylines, or draft and apply complete show cards. Read-only questions do not change your save. Save-changing actions require confirmation and are validated by PWS.

## Table of contents

- [What you need](#what-you-need)
- [Claude Desktop compatibility](#claude-desktop-compatibility)
- [Claude Desktop and Claude Code are separate](#claude-desktop-and-claude-code-are-separate)
- [Install the PWS plugin](#install-the-pws-plugin)
- [Connect Claude Desktop](#connect-claude-desktop)
- [Connect Claude Code](#connect-claude-code)
- [Connect Codex](#connect-codex)
- [Connect another MCP client](#connect-another-mcp-client)
- [Test the connection](#test-the-connection)
- [Ideas to try](#ideas-to-try)
- [Optional community plugins](#optional-community-plugins)
- [Booking API notes](#booking-api-notes)
- [Safety](#safety)
- [Troubleshooting](#troubleshooting)
- [Current limitations](#current-limitations)
- [License](#license)

## What you need

- Windows and Pro Wrestling Sim
- The **PWS MCP Server** in-game plugin
- One supported local AI client
- An account or billing setup for that AI client

This plugin provides the connection to PWS, but it does not include an AI model or subscription. **Claude Desktop's Code tab and Claude Code require an eligible paid Claude plan, or pay-as-you-go Claude API billing. Codex requires a ChatGPT account; the Free plan is supported, while paid ChatGPT plans provide more Codex usage.** Usage limits from your chosen plan still apply.

Claude Desktop users do not need to install Node.js or edit a configuration file. The downloadable MCPB includes the Claude-side server and uses Claude Desktop's built-in Node runtime.

Node.js 18 or newer is still required for Codex, Claude Code, and other clients that run the Workshop copy of `mcp-server.js` directly.

## Claude Desktop compatibility

The `0.4.0-beta.4` MCPB installs, enables, and launches on Claude Desktop for Windows, but regular **Home** chats do not receive its tools. Claude sends the MCP `initialize` request, waits 60 seconds, and disconnects before tool registration completes. Direct Claude Code and Codex connections continue to work, confirming this is an MCPB/Claude Desktop compatibility issue rather than a PWS bridge or save-data failure.

This was fixed in `0.4.0-beta.5` and is included in `0.4.0`. The current server uses the official MCP SDK transport plus a dedicated entry point that starts correctly when Claude Desktop loads the extension through its Node UtilityProcess wrapper. A fresh Windows Home conversation exposed the PWS integration and returned the live VWE1 state. Claude Code, the Code tab, and Codex remain supported through the direct `mcp-server.js` path.

The release also includes the beta.5 booking hotfix: MCP-created and MCP-edited angle beats always persist all three PWS group arrays. This prevents single-person promos and other angles with unused groups from blocking show startup.

## Claude Desktop and Claude Code are separate

- **Claude Desktop** installs the downloaded `.mcpb` extension. Updating the MCPB does not change standalone Claude Code.
- **Claude Code** ignores the MCPB and runs the exact `mcp-server.js` path stored in its MCP configuration. Inspect that path with `claude mcp get pro-wrestling-sim`.
- Enabling a Workshop or TEST plugin inside PWS does not automatically repoint Claude Code at the matching server file.
- After installing an MCPB or changing Claude Code's MCP path, fully restart the corresponding Claude client so it reloads the tool list.
- Workshop and TEST installs use stable folder names, so Claude Code and Codex paths do not change between versions. Once configured correctly, replace/deploy the files in that folder and restart the client; beta servers also report an explicit error if their version does not match the running in-game plugin.

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

1. Open the matching [GitHub release](https://github.com/Distortik/pws-mcp-server/releases).
2. Download and extract `pws-mcp-server-plugin-vVERSION.zip`. For a beta playtest, use the separately named TEST plugin ZIP from that prerelease.
3. Copy the extracted plugin folder to `%APPDATA%\ProWrestlingSimulator\plugins` without changing its included folder name.
4. Restart PWS, enable only that plugin build, and load a save.

Use the packaged release asset, not GitHub's automatic repository source ZIP. The release asset contains the self-contained MCP server used by direct-path clients.

## Connect Claude Desktop

Claude Desktop uses the one-click MCPB release. Do not edit `claude_desktop_config.json`.

> **0.4.0 compatibility result:** its MCPB transport passed a regular Home-chat connection and live state read on Claude Desktop for Windows during the beta.5 release gate.

**Account requirement:** The Code tab uses Claude Code and requires an eligible paid Claude plan, or pay-as-you-go Claude API billing.

1. Open the [latest GitHub release](https://github.com/Distortik/pws-mcp-server/releases/latest).
2. Download `pws-mcp-server-vVERSION.mcpb` from **Assets**.
3. In Claude Desktop, open **Settings > Extensions > Advanced settings**.
4. Select **Install Extension** and choose the downloaded `.mcpb` file.
5. Start PWS, enable the plugin, and load a save.
6. Start a new **Home** conversation and confirm that **Pro Wrestling Sim** is enabled.

The MCPB is for regular **Home** conversations. The **Code** tab uses Claude Code's separate MCP configuration and remains the direct-path fallback.

The MCPB installs only the Claude-side connection. The in-game plugin must still be installed through Steam Workshop or manually.

When upgrading, update both halves: Steam updates the in-game plugin, but it cannot update Claude Desktop's installed extension. Download and install the matching new `.mcpb`, then restart Claude Desktop.

For a privately distributed update, install the newer `.mcpb` through **Install Extension** using the same extension identity; uninstalling the previous version first is not normally required. If Claude Desktop does not show the new version after a full restart, uninstall/reinstall is the fallback.

If your Claude organization blocks custom desktop extensions, an owner or administrator must allow them. See [Anthropic's local MCP server guide](https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

## Connect Claude Code

**Account requirement:** Claude Code requires an eligible paid Claude plan, or pay-as-you-go Claude API billing.

Install [Node.js 18 or newer](https://nodejs.org/en/download), then run this in PowerShell for a normal Workshop installation. You can paste the block into PowerShell yourself or ask Claude Code to run it for you:

For the easiest setup, paste this request into Claude Code or Claude Desktop's **Code** tab:

> Locate the installed PWS MCP Server `mcp-server.js` for the build I am actually using (Workshop, manual, or TEST). Configure the user-level Claude Code MCP server named `pro-wrestling-sim` to run it with Node, verify the saved entry with `claude mcp get pro-wrestling-sim`, and tell me the exact path you selected. Do not guess the Steam library or edit unrelated MCP entries.

Claude Code can run the commands itself. Restart the session afterward so it reloads the tool catalogue.

```powershell
$server = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\1157700\3780507815\plugins\pws-mcp-server\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
claude mcp get pro-wrestling-sim
```

If Steam is installed in another library, change the path. For a manual GitHub installation:

```powershell
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
claude mcp get pro-wrestling-sim
```

Check the connection with `claude mcp list`, `claude mcp get pro-wrestling-sim`, or `/mcp` inside Claude Code. The configured command must point at the build you intend to test. See the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for client details.

To test a prerelease without changing your Workshop setup, point Claude Code at the separately deployed TEST plugin:

```powershell
claude mcp remove --scope user pro-wrestling-sim
$server = Join-Path $env:APPDATA 'ProWrestlingSimulator\plugins\pws-mcp-server-TEST\mcp-server.js'
claude mcp add --scope user pro-wrestling-sim -- node $server
claude mcp get pro-wrestling-sim
```

Restart Claude Code after changing the path; MCP tools are loaded at session start and do not hot-reload. Installing the prerelease MCPB does not update Claude Code. The TEST folder name is stable across beta versions, so later TEST deployments do not require another path change. To return to the Workshop release, remove the server again and rerun the normal Workshop command above.

## Connect Codex

**Account requirement:** Codex requires a ChatGPT account. The ChatGPT Free plan supports Codex; paid plans provide higher usage limits.

Install [Node.js 18 or newer](https://nodejs.org/en/download). In Codex, open **Settings > Plugins > Add > Add MCP Server**, choose **STDIO**, and enter:

For the easiest setup, paste this request into Codex:

> Locate the installed PWS MCP Server `mcp-server.js` for the build I am actually using (Workshop, manual, or TEST). Configure the user-level Codex MCP server named `pro-wrestling-sim` to run it with Node, verify the saved MCP entry, and tell me the exact path you selected. Do not guess the Steam library or edit unrelated MCP entries.

Codex can inspect the installed paths and run its MCP configuration command for you; approve the user-configuration change when prompted, then restart the MCP server/client.

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

See the [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) for other installation methods.

The Workshop and TEST plugin folder names are stable across updates, so Codex only needs this path configured once. Restart the MCP server/client after deploying an update so it reloads the new tool catalogue.

## Connect another MCP client

The server uses standard input/output (stdio). Configure your client to run:

```text
node <complete path to mcp-server.js>
```

It is a local process, not a public HTTP service. Node.js 18 or newer is required outside the Claude Desktop MCPB.

## Test the connection

Keep PWS open with a save loaded, then ask:

> Connect to Pro Wrestling Sim and tell me the loaded save, current date, player promotion, company size, and cash balance.

Ask this from a regular Claude Desktop **Home** conversation. You can also run it from Claude Code/Code or Codex to verify the direct-path connection independently.

If the answer contains information from your save, setup is complete.

## Ideas to try

- "Assess my company and identify my three biggest roster needs."
- "Recommend five affordable hires who fit those needs."
- "Review all contracts expiring in the next year."
- "Show me my champions, active storylines, and neglected wrestlers."
- "Draft my next show, explain every choice, and wait for approval."

## Optional community plugins

PWS MCP Server can discover independently installed plugins that implement the dependency-free PWS Community Interop protocol. They are enhancements, never requirements: core tools behave exactly as before when no compatible community plugin is installed.

The first supported provider is **Inner Circle 2.1**. `pws_list_optional_integrations` reports compatible providers, and `pws_get_inner_circle` reads sanitized role assignments for the current save and player promotion. The provider remains the owner of its data. MCP does not inspect its private files, `api.storage`, or legacy `localStorage`, and snapshots exclude private notes, roster data, and history. A snapshot is rejected if its save, promotion, provider, capability, schema, size, structure, or revision cannot be validated.

## Booking API notes

Use `titleIds: number[]` to put championships on the line in a match. This is the only supported championship field; singular `titleId` and other unknown segment fields are rejected. Validation checks that each title is active, belongs to the player promotion, fits the show brand and match team size, and includes every reigning champion unless the title is vacant. Multiple titles are supported.

Match participants may have PWS worker type `Wrestler` or `Occasional Wrestler`. Angle-only types such as `Staff`, `Personality`, `Referee`, and `Announcer` remain ineligible for matches.

`pws_apply_show_plan` re-reads every created segment and verifies its participants, winner, runtime, title associations, and other requested booking fields. If verification fails, it reports failure and removes the new segments instead of returning a false success.

`pws_update_segment` previews by default. After reviewing `before` and `proposed`, call it again with the same changes, `preview: false`, and `confirmed: true`. The update uses a narrow field allowlist, one transaction, rollback, a post-save read, before/after output, and an audit entry. Applied results expose the persisted segment as `after` and retain `segment` as a compatibility alias. It does not expose general-purpose SQL writes.

Purpose-built tools are also available for removing a segment, setting an unfinished show's venue (with an optional recurring-event default), ending a storyline, adding or removing a storyline worker, releasing a worker, and vacating a championship. These operations preview by default, validate that the target belongs to the player company, require `preview: false` and `confirmed: true`, and re-read the save before reporting success. The advanced generic action tool no longer exposes these operations.

Large rosters can be read page-by-page with `offset` and `limit`; use `lean: true` for a compact booking-oriented response. Availability excludes workers in rehab as well as injured, suspended, and time-off workers. Show planning and segment edits compare return dates with the target show's air date, so someone who recovers by a future show can be booked while missing or later return dates remain unavailable. Storyline reads accept `storylineId` and `lean: true` for inexpensive heat/status checks.

Use `pws_get_venues` to find a suitable building by geography and capacity. `pws_get_show` includes the assigned venue, capacity, type, recurring-event default, structured participant groups, opponent details, ringside workers, and angle subjects. If storyline progress appears to be missing after simulation, `pws_diagnose_storyline_attribution` reports recent in-lifetime segments that contained two or more storyline members but have no entity-normalized matching history row.

Version 0.4.0 adds preview-first tools for stable creation and membership, contract gimmicks and personas, worker promises, event-series creation/archiving, show scheduling, and show cancellation. Use `pws_get_personas` to browse a worker's native PWS alter egos and inspect their preferred gimmick, picture, mask, promotion restriction, and valid dates. `pws_set_contract_persona` changes only the player-company contract identity, so selecting Mankind or setting a custom ring name does not rename Mick Foley globally; selecting a native persona also applies its available preferred gimmick, picture, and mask as one verified presentation change. Optional picture and mask overrides allow the complete before-state returned by a preview to be restored exactly. Promotion-ineligible personas must first be made available with `pws_set_persona_availability`. Date-ineligible personas are rejected by default and require `allowDateOverride=true` for explicit creative-sandbox use; neither operation changes `minDate` or `maxDate`. PWS still supports one active presentation per contract at a time; it does not currently expose simultaneous per-match persona selection. `pws_set_event_active` safely archives or restores an event series without deleting its show history and blocks archiving while unfinished non-cancelled shows remain. Gimmicks are database-specific: use `pws_get_gimmicks` before assignment. `pws_get_promises` lists requests and obligations by deadline, while `pws_respond_to_promise` previews and transactionally applies the native accept/decline result, handled-email flag, and worker relationship effect.

The advanced `sign_worker` action accepts `wagePerMonth`, `wagePerAppearance`, and a day-based `contractLength` (`-1` means indefinite). The older numeric `wages` alias remains compatible and maps to monthly pay for Written contracts or appearance pay otherwise. Successful signings are read back and every explicitly requested supported term is verified. This remains an advanced confirmed action because PWS's official action does not expose every negotiation perk; full offers, counters, renewals, and negotiation-layer awareness are planned after 0.4.0.

Use [PLAYTESTING.md](PLAYTESTING.md) for release-candidate and regression testing. Current defects, deferred safety work, and future features are tracked in [BACKLOG.md](BACKLOG.md); release direction and completed beta gates remain in [ROADMAP.md](ROADMAP.md).

## Safety

- The bridge listens only on the local computer and uses a random authentication token.
- Raw database access is read-only and result-limited.
- The plugin's internal database-write permission is used only by purpose-built, allowlisted transactional actions such as `pws_update_segment`; no raw SQL-write tool is exposed.
- Save-changing actions are validated and audited by PWS.
- A preview is not permission to apply a change. The assistant may set `confirmed: true` only after you explicitly approve that exact preview.
- General requests to inspect, test, or verify features do not authorize persistent or creative save changes.
- Show plans are drafts until you explicitly approve applying them.
- The assistant should never report a save change as successful unless PWS confirms it.

Back up important saves before using any plugin that can perform game actions. Never share `%APPDATA%\ProWrestlingSimulator\mcp\pws-mcp-runtime.json`; it contains a temporary local access token.

## Troubleshooting

### PWS bridge is offline

Start PWS, confirm the plugin is enabled, and load a save. If it was already open, restart PWS and then restart the AI client or extension.

### Claude Desktop is not connected or has outdated tools

Beta.4 timed out during initialization in regular Home chats on Claude Desktop for Windows; beta.5 and 0.4.0 include the compatibility fix. Install the matching newest package, fully restart Claude Desktop, start a new Home conversation, and confirm **Pro Wrestling Sim** is enabled. If the tools remain absent, verify the installed extension version and inspect Claude Desktop's per-extension log before reinstalling. Never share `%APPDATA%\ProWrestlingSimulator\mcp\pws-mcp-runtime.json`; it contains a temporary local access token.

### Claude Code is not connected or has outdated tools

Run `claude mcp get pro-wrestling-sim` and inspect the command shown. It must point to the intended Workshop, manual, or TEST `mcp-server.js`. Installing an MCPB has no effect on Claude Code. After correcting the path, fully restart Claude Code and check `/mcp` in the new session.

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
- Signing workers, creating storylines, and awarding titles still use the advanced confirmed-action interface until their complete PWS input contracts can be exposed as purpose-built preview tools. Signing validates and verifies the supported core terms, but PWS does not expose every negotiation perk through that action.
- Confirmed writes are not yet tied to a short-lived cryptographic preview receipt. Tools still default to preview, require explicit approval, revalidate the live target during apply, and verify the persisted result; receipt-based confirmation is deferred until after 0.4.0.
- Privately distributed MCPB updates must be downloaded and installed again from a newer GitHub Release.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
