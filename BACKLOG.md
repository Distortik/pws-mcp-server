# Backlog

This is the version-controlled source of truth for open PWS MCP Server defects, safety work, and feature requests. `ROADMAP.md` describes release direction; this file tracks the concrete work still waiting.

Status last reconciled: **12 August 2026**  
Repository candidate: **0.4.0-beta.5**  
Latest fully live-validated save-operation build: **0.4.0-beta.4**

Beta.5 changes the MCP transport and packaging layer and fixes B14. All 71 automated tests pass. Regular Claude Desktop Home-chat testing and the matching beta.5 MCPB/TEST-plugin live version-pair check are still pending.

## Release recommendation

Unless beta.5 live testing exposes a blocker, keep 0.4.0 focused on:

1. Claude Desktop Home compatibility and final package validation.
2. B12 and B13 correctness.
3. Targeted B10 and B11 safety hardening.

The larger management features should follow 0.4.0 rather than reopening the release scope.

## Open correctness and safety work

### B12 — Company-size tier differs from the game

`pws_get_state` correctly derives size from continental popularity instead of prestige, but its thresholds still disagree with the in-game tier at a known calibration point: the game reported Regional when the promotion's maximum continental popularity was 11.

**Next work:** establish the game's actual Local/Regional/Cult/National/Continental calculation and add boundary tests before changing the public result.

### B13 — Future-show availability uses the current date

Show-plan validation currently relies on a worker's present unavailable flags. A worker injured today can be rejected even when their heal date is before the show's air date.

**Next work:** validate injuries, rehab, suspensions, and time off against the target show's `airDate`, while preserving conservative handling when PWS exposes no reliable return date.

### B10 — Stable leader persistence is only partially normalized

Public stable reads normalize native `"1"`, `"0"`, `"true"`, and `"false"` values to JSON booleans. PWS's official stable actions can still leave mixed string representations in `stableworkers.isLeader`, and add-member verification currently proves membership but not every requested leader-state transition.

**Next work:** strengthen post-action verification and determine whether numeric persistence can be requested through the official PWS action contract. Treat the mixed stored form as an upstream limitation if it cannot.

### B11 — Confirmation is not tied to an exact preview

Server instructions, schemas, and tools require preview-first changes and explicit user approval. A client can nevertheless submit a bare `confirmed: true`; the server cannot prove that the user approved the exact preview being applied.

**Next work:** evaluate short-lived preview receipts containing the operation and target-state digest, then require the matching receipt during apply without making normal use cumbersome.

### Claude Desktop Home compatibility — live acceptance pending

Beta.4's MCPB launched in Claude Desktop for Windows but regular Home chats cancelled initialization after 60 seconds. Beta.5 replaces the manual stdio loop with the official MCP SDK transport, ships a self-contained server, and passes official-client initialization and catalogue tests outside the repository.

**Acceptance gate:** install the beta.5 MCPB in Claude Desktop on Windows, fully restart the app, start a regular Home conversation, and confirm it receives the complete PWS tool catalogue.

### B14 — Fixed in beta.5; live version-pair check pending

Both match-validation paths now accept `Wrestler` and `Occasional Wrestler` while rejecting `Staff`, `Personality`, `Referee`, and `Announcer`. Automated coverage passes for both new show plans and existing segment edits.

**Remaining gate:** repeat the read-only live bridge/version-pair checks with the matching beta.5 TEST plugin and MCPB. A natural or disposable show with both worker types can provide an additional live validation when available.

## Features waiting to be implemented

### F17 — Brand and championship management

Create, rename, archive/retire, and configure brands and championships. Title and brand image fields appear to store filenames whose actual image bytes are managed outside the save database, so image handling needs separate investigation.

### F13 — Tag-team management

Create, rename, disband, and edit promotion tag teams and their members, with ownership checks and exact post-save verification.

### F14 — Worker-type visibility and default filters

Lean roster rows expose worker type, and B14 makes Occasional Wrestlers match-eligible. Default roster counts and hiring queries still use exact `type='Wrestler'` filters, and hiring results do not consistently expose type.

**Wanted:** include Occasional Wrestlers in relevant roster/hiring views, return the type explicitly, and continue to flag genuinely angle-only roles.

### F16 — Cash-aware hiring budgets

`pws_analyze_hiring` estimates wage limits from company size, payroll pressure, and roster medians. The result can label every candidate unaffordable even when the company has ample cash and already pays much higher wages.

**Wanted:** make actual cash and existing top-end contracts materially influence affordability, and clearly distinguish a recommended wage band from a hard affordability constraint.

### F12 — Model-callable server information

The MCP handshake and manifests expose the version, but models do not always receive it as callable data.

**Wanted:** a lightweight `pws_get_server_info` or `pws_version` tool that works without a loaded save and reports the client server version, expected in-game plugin version, transport, and connection/version-pair state.

### F10 — Network and TV-deal management

Read available networks, regional reach, current deals, and show assignments; preview and safely offer, accept, end, or change a deal where PWS exposes validated actions.

### F11 — Incoming rival contract offers

Expose the terms behind rival promotion offers and support the safe response paths PWS provides, such as matching, countering, or declining. This should be designed alongside F6.

### F6 — Complete contract negotiations

Add preview-first renewals, offers, counter-offers, and contract terms. Existing signing, gimmick/persona modification, promise handling, and release tools do not cover negotiation.

### F4 — Tournament management

Create tournaments, rounds, matches, and participants, and connect booked show segments to tournament records.

### F14b — Moveset editing

Expose validated editing for the worker `moveset` JSON structure and its supported move categories, with preview and exact restoration.

### Purpose-built replacements for generic actions

Replace the remaining advanced generic writes with preview-first, ownership-aware, verified tools once their complete PWS action contracts are known:

- storyline creation;
- worker signing;
- championship awards;
- news creation;
- email creation.

## Recently closed

### F15 — Personas and contract ring names

Shipped in beta.3 and live-verified through beta.4. The tools browse native alter egos, set a contract-scoped persona or custom ring name, change promotion availability, enforce native dates by default, support an explicit creative-sandbox date override, and restore the exact prior presentation. Testing covered Undertaker, biker Undertaker, Mankind, Dude Love, custom names, free-use changes, visual confirmation, and restart persistence.

### F9 — Worker promise responses

Shipped in beta.3 and live-verified through beta.4. Promise reads and preview-first accept/decline responses apply the native decision email and relationship consequence in one verified transaction. Separate copied saves verified both outcomes after full restarts.

### B8 — Storyline diagnostic false positives

Fixed and validated. Entity escaping and storyline lifetime boundaries no longer create the known false positives. The remaining historical storyline-attribution outage was traced to Concert Bands Pro replacing PWS's show-summary function, not to MCP booking.

## Reporting a new issue

Capture the following at the time the issue occurs:

```text
- Client and client version:
- Model:
- MCP server/MCPB version:
- In-game plugin version:
- Save and in-game date:
- Tool:
- Exact arguments:
- Raw result or error:
- Expected result:
- Whether PWS or the MCP client had been restarted after updating:
```

Never include `%APPDATA%\ProWrestlingSimulator\mcp\pws-mcp-runtime.json`; it contains a temporary local access token. Use copied or backed-up saves for mutation testing and record whether a result survived a full PWS restart.
