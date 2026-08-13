# Backlog

This is the version-controlled source of truth for open PWS MCP Server defects, safety work, and feature requests. `ROADMAP.md` describes release direction; this file tracks the concrete work still waiting.

Status last reconciled: **13 August 2026**
Repository candidate: **0.4.0 release-ready**
Latest fully live-validated build: **0.4.0**

Version 0.4.0 fixes B10, B12, B13, and the generic-signing portion of F19. All 79 automated tests and all 13 live read-only bridge checks pass. VWE1 confirmed the corrected Regional company size, real injury/rehab date boundaries, current-show rejection details, stable-leader persistence, and exact stable cleanup. The installed production MCPB also passed a fresh Claude Desktop Home-chat connection and live state read.

## Release recommendation

The 0.4.0 release gate is complete. Remaining release work is publication only:

1. Commit and push the release-ready source and documentation.
2. Publish the production ZIP/MCPB in the GitHub 0.4.0 release.
3. Publish the matching Steam Workshop update and description/roadmap text.

The larger management features should follow 0.4.0 rather than reopening the release scope.

## Release-candidate fixes validated for release

### B12 — Company-size tier differs from the game — fixed and live-validated

The mismatch came from mode detection, not the tier thresholds. VWE1 stores `advancedPopularityMode = 1` in `gameworld`, while the runtime state helper omitted that flag. The MCP therefore used continental popularity and returned Local even though a regional-popularity row had reached 20 and PWS correctly displayed Regional.

**Validated fix:** fall back to `gameworld.advancedPopularityMode`, use PWS's regional aggregation rules in advanced mode, and retain boundary tests for both popularity systems. The deployed candidate now reports VWE1 as Regional with `sizeMethod = regional popularity`, matching its advanced-mode flag and maximum regional value of 20.

### B13 — Future-show availability uses the current date — fixed and validated

Show planning and segment edits now evaluate injury, rehab, worker suspension, contract suspension, and time off against the target show's `airDate`. A return date on or before the show date makes the worker eligible, matching PWS's date-transition clearing rules; a missing or invalid return date remains unavailable conservatively.

**Validation:** automated coverage passes for new show plans and edits to existing segments. Live VWE1 checks confirmed all expected date columns, returned Megumi Kudo's 28 May injury date in a current-show rejection, and evaluated both Kudo and Terry Gordy as unavailable the day before return and available on the return date.

### B10 — Stable leader persistence is only partially normalized — fixed and live-validated

Public stable reads continue to normalize native `"1"`, `"0"`, `"true"`, and `"false"` values to JSON booleans. Add-member verification now also requires the persisted normalized leader flag to match the requested value; membership alone can no longer produce a false success.

PWS's official action may still store a mixed native representation, but that is harmless to the public result and is treated as an upstream storage detail rather than a release blocker. Live testing added Randy Savage to The Superstar Agency as a leader, verified the normalized persisted `true` value, removed him, and confirmed the original four-member state was restored.

## Deferred safety work

### B11 — Confirmation is not tied to an exact preview — deferred after 0.4.0

Server instructions, schemas, and tools require preview-first changes and explicit user approval. A client can nevertheless submit a bare `confirmed: true`; the server cannot prove that the user approved the exact preview being applied.

Adding short-lived preview receipts would change every purpose-built write schema, clients' two-step workflow, and the live regression runner. That cross-cutting protocol change is intentionally deferred until after 0.4.0 rather than introduced after the completed beta save-safety gate. Current tools still default to preview, require explicit confirmation, revalidate current ownership/state during apply, and verify persistence before success.

## Features waiting to be implemented

### F17 — Brand and championship management

Create, rename, archive/retire, and configure brands and championships. Title and brand image fields appear to store filenames whose actual image bytes are managed outside the save database, so image handling needs separate investigation.

### F18 — Promotion popularity consistency and management

Expose regional popularity alongside continental popularity, warn when the two systems materially disagree, and investigate safe popularity editing. A new CareerMode promotion had North American continental popularity 50 while every `promotionRegionalPopularity` row was zero, a state the established AI promotions did not exhibit and which can distort company size, attendance, and local-market analysis.

### F19 — Signing terms, perks, and negotiation-layer awareness — generic path corrected

Correct and document the generic `sign_worker` contract: the current tool advertises `wages`, while PWS expects `wagePerMonth` and `wagePerAppearance`; `contractLength` is measured in days; and important contract perks are not exposed by the official action. Also decide how clearly the MCP should warn when direct signing bypasses a UI-only negotiation mod such as Dynamic Negotiations.

**0.4.0 candidate:** the generic action now accepts the canonical wage fields, translates the deprecated numeric `wages` alias according to contract type, validates day-based length values, canonicalizes the contract type and gimmick, and reads the new contract back to verify every explicitly requested supported term plus its active state. A purpose-built preview-first signing/negotiation tool and unsupported perks remain future work.

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

### F22 — Optional community plugin interoperability — first provider implemented

Add opt-in interoperability with separately installed maintained forks of Investments Manager, Plugin Features, Booker Career Mode, Hire Local Worker, Inner Circle, Dynamic Negotiations, Network Approval Hub, and Tag Team and Stables Overhaul. These plugins must not become MCP dependencies or be bundled into the MCP package.

**Foundation:** the five installed upstream versions were imported unchanged into a separate local `pws-community-plugins` repository, with exact source hashes, manifest metadata, the owner's relayed permission, baseline syntax checks, and an initial integration protocol. Plugin Features is the planned common launcher/settings hub.

**Approved next imports:** Dynamic Negotiations 8.0.0 (Workshop 3677428750), Network Approval Hub 5.0.0 (Workshop 3682099011), and Tag Team and Stables Overhaul 1.0.0 (Workshop 3700914929). Preserve their installed sources, manifest identities, and hashes before making changes.

**Known compatibility gap:** Investments Manager creates native network and availability rows but keeps investment ownership in private save-scoped storage and intentionally creates no automatic deal. Network Hub reads the native network/deal tables but keeps takeover ownership in its own `ownedNetworks` state. Reconcile both directions by native `networkID` and `promotionID`; do not scrape either private store.

**First fork fixes implemented, awaiting copied-save live validation:** Investments Manager 8.0.1 stops recreating revoked `General / All Shows` deals, keeps new network show access explicit, verifies manual deal persistence, requires real country/region IDs for new owned venues, prevents duplicate active venue names, hydrates existing tracked venue labels, and scopes transactional spending to the active promotion instead of rounding every promotion's balance.

**First provider:** Inner Circle 2.1 publishes the neutral read-only `inner-circle.assignments` capability. The MCP consumer discovers it at request time and validates protocol/provider/schema/capability metadata, payload size, native IDs, complete assignment consistency, save hash, player-promotion ID, and monotonic revision before exposing it through two static read-only tools. Missing plugins are a normal unavailable result. Private notes, roster data, history, storage, dynamic tools, and generic interop writes are excluded.

**Live validation:** the installed Inner Circle TEST 2.1.0 and MCP TEST 0.5.0-beta.1 pair negotiated Community Interop v1 on VWE1/promotion 229. The consumer accepted revision 1 with 14 roles, 25 unique assignments, and nine unavailable historical assignments; an unchanged second read was identical, and privacy checks found no notes, roster data, or history.

**Next work:** add sanitized providers for investments, booker progress, local hiring, negotiation context, network/deal state, and team/stable history as their forks become ready. Optional writes come later and must remain plugin-owned, preview-bound, allowlisted, revalidated, and read back after persistence. Do not scrape another plugin's private `localStorage` or expose arbitrary callbacks, JavaScript, or SQL.

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
