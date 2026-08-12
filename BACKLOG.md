# Backlog

This is the version-controlled source of truth for open PWS MCP Server defects, safety work, and feature requests. `ROADMAP.md` describes release direction; this file tracks the concrete work still waiting.

Status last reconciled: **12 August 2026**  
Repository candidate: **0.4.0-beta.5**  
Latest fully live-validated build: **0.4.0-beta.5 hotfix**

Beta.5 changes the MCP transport and packaging layer and fixes B14 and B15. All 73 automated tests, 13 non-mutating live bridge checks, the Windows Claude Desktop Home-chat check, a live B14 dry-run, and the affected B15 CareerMode show-start path pass.

## Release recommendation

Keep the remaining 0.4.0 work focused on:

1. B12 and B13 correctness.
2. Targeted B10 and B11 safety hardening.
3. Final production package validation and smoke testing.

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

## Features waiting to be implemented

### F17 — Brand and championship management

Create, rename, archive/retire, and configure brands and championships. Title and brand image fields appear to store filenames whose actual image bytes are managed outside the save database, so image handling needs separate investigation.

### F18 — Promotion popularity consistency and management

Expose regional popularity alongside continental popularity, warn when the two systems materially disagree, and investigate safe popularity editing. A new CareerMode promotion had North American continental popularity 50 while every `promotionRegionalPopularity` row was zero, a state the established AI promotions did not exhibit and which can distort company size, attendance, and local-market analysis.

### F19 — Signing terms, perks, and negotiation-layer awareness

Correct and document the generic `sign_worker` contract: the current tool advertises `wages`, while PWS expects `wagePerMonth` and `wagePerAppearance`; `contractLength` is measured in days; and important contract perks are not exposed by the official action. Also decide how clearly the MCP should warn when direct signing bypasses a UI-only negotiation mod such as Dynamic Negotiations.

**Next work:** fix the misleading argument description or translate the compatibility alias, add exact term verification, document day units, and distinguish MCP/PWS API limitations from supported terms before promoting generic signing to a purpose-built tool.

### F20 — Brand and event commentary-team defaults

Add preview-first management of `announcer1` through `announcer4` on brands and event series. Segment-level announcers work, but they must currently be repeated on every segment and do not configure the promotion's intended default booth.

### F21 — Multi-person entrance and elimination order

Expose and validate PWS's `segments.entranceOrder` and `segments.eliminationOrder` for Rumbles and other ordered multi-person matches. The current booking tools can guarantee a winner but cannot specify an entrance number, elimination sequence, final two, or last eliminated worker.

**Next work:** establish the exact native JSON written by PWS, then add fields to show-plan validation, application, segment editing, reads, and post-save verification.

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

## Known workflow constraints

### Non-defendable prizes cannot be attached to matches

`The Immortal Crown - Women` is stored by PWS with `defendable = 0`. The match validator correctly refuses to attach a non-defendable championship or prize to a match, so the Crown cannot be won as a title association in the Women's Rumble.

**Current workflow:** book and validate the Rumble without the Crown in `titleIds`, run the match, then award the Crown to the winner through `award_title`. This is a native title-state constraint rather than a validator defect. A future purpose-built championship-award tool should make this post-match workflow preview-first, ownership-aware, and exactly verified.

## Recently closed

### B15 â€” MCP-created angles can prevent a show from starting

Fixed and live-validated in the in-place beta.5 hotfix. The public angle schema correctly allowed unused `group2` and `group3` fields to be omitted, but PWS's show runner calls `group2.forEach()` without checking that the array exists. New show plans and transactional angle edits now normalize all three beat groups before persistence. The original eight-segment CareerMode card was repaired without changing its workers, descriptions, order, or runtime and then started successfully.

### Claude Desktop Home compatibility

Resolved in beta.5. Beta.4's MCPB launched on Claude Desktop for Windows but regular Home chats cancelled initialization after 60 seconds. Beta.5 now uses the official MCP SDK transport and a dedicated entry point that starts when Claude's Node UtilityProcess wrapper loads it. A new Windows Home conversation exposed the PWS integration and returned the live VWE1 state.

### B14 — Occasional Wrestler match validation

Fixed and live-validated in beta.5. Both match-validation paths accept `Wrestler` and `Occasional Wrestler` while rejecting `Staff`, `Personality`, `Referee`, and `Announcer`. Automated tests cover new show plans and existing segment edits. A live dry-run validation accepted Wendi Richter against Debbie Combs on VWE1 without creating a segment.

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
