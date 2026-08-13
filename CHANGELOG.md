# Changelog

## 0.5.0-beta.2 — Unreleased

- Added the static read-only `pws_get_investments` tool for the neutral `investments.portfolio` capability while keeping Investments Manager entirely optional.
- Validate category and asset totals, bounded financial values, native identity types, save/promotion context, revision monotonicity, and a 64 KiB maximum before accepting an Investments snapshot.
- Expose only the provider's sanitized asset mirror; private notes, histories, renderer storage, preferences, treatment records, agency-client details, callbacks, and write operations are not accepted or returned.
- Discover Inner Circle and Investments providers independently, including side-by-side TEST IDs, without treating either provider as a dependency of the other or of core MCP tools.
- Live-validate both providers together on VWE1/promotion 229: Investments TEST 8.1.0 published four of four assets at revision 1 with zero truncation, Inner Circle TEST 2.1.0 retained all 25 assignments and nine unavailable records, both matched the same save context, and repeated reads were stable.

## 0.5.0-beta.1 — 2026-08-13

- Added optional PWS Community Interop v1 discovery through PWS's built-in inter-plugin messaging. Community plugins remain independently installable and core MCP behavior is unchanged when none are present.
- Added the static read-only `pws_list_optional_integrations` and `pws_get_inner_circle` tools. Compatible Inner Circle 2.1 providers expose role definitions and assignment facts without private notes, roster data, history, storage access, or dynamic tool injection.
- Bound accepted snapshots to the currently loaded save hash and native player-promotion ID, reject older revisions and same-revision content changes, and invalidate cached revision evidence whenever PWS opens a database.
- Added bounded protocol/provider/schema/capability validation, a 64 KiB snapshot limit, native ID validation, assignment/summary consistency checks, deterministic production/TEST provider selection, and harmless unavailable results for missing or incompatible providers.
- Added automated coverage for discovery, bridge routing, side-by-side TEST selection, absent providers, sanitized output, wrong-save rejection, stale/tampered revisions, malformed data, oversized payloads, and database-switch invalidation.
- Report a loaded provider that has no registered inter-plugin handler distinctly from malformed or oversized responses, aiding diagnosis of PWS plugin-lifecycle failures without relaxing payload validation.
- Live-validated the installed TEST pair on VWE1: Community Interop v1 discovered Inner Circle TEST 2.1.0, accepted all 14 roles and 25 assignments for promotion 229 at revision 1, retained nine unavailable assignments, accepted an identical repeated revision, and exposed no notes, roster data, or history.

## 0.4.0 - 2026-08-13

> Release gate passed. The TEST deployment, live read-only suite, focused B10/B12/B13 checks, production package inspection, and installed Claude Desktop Home-chat smoke test all pass.

- Added preview-first, ownership-aware, persisted-result-verified management for stables, stable membership, contract gimmicks and personas, persona availability, worker promises, event series, scheduled shows, venues, storylines, releases, title vacations, and transactional segment edits.
- Added contract-scoped wrestler personas and custom ring names without changing the worker's global identity, including native gimmick/picture/mask selection, date-policy safeguards, promotion-specific/free-use availability changes, and exact restoration.
- Added complete show planning and validation with structured participants, multiple championships, ringside workers, announcers, referees, agents, angle subjects, safe rollbacks, and the beta.5 angle-group show-start hotfix.
- Added management dashboards, roster/hiring/contract analysis, gimmick discovery, promise reads/responses, stable reads, venue discovery, show reads, and storyline-attribution diagnostics.
- Added the official MCP SDK stdio transport and a self-contained MCPB entry point verified in a regular Claude Desktop Home conversation on Windows; Claude Code and Codex continue to use the stable direct server path.
- Fixed advanced-popularity company sizing when PWS omits the mode from its runtime state by reading `gameworld.advancedPopularityMode`; live VWE1 data confirms the corrected Regional calibration point.
- Fixed future-show availability for new plans and existing-segment edits by evaluating injury, rehab, worker suspension, contract suspension, and time-off return dates against the show's air date.
- Strengthened stable-member verification so a requested leader flag must persist, not merely the membership row.
- Corrected generic `sign_worker` terms: canonical monthly/appearance wages, compatible `wages` translation, day-based contract lengths, normalized types/gimmicks, and exact readback verification of requested supported terms.
- Passed syntax validation, all 79 automated tests, all 13 live read-only bridge checks, corrected Regional sizing, live injury/rehab date-boundary checks, reversible stable-leader persistence/cleanup, and an installed 0.4.0 MCPB connection/state read in a fresh Claude Desktop Home conversation. B11 preview receipts are explicitly deferred as a broader post-0.4.0 protocol change; current writes still default to preview, require explicit confirmation, revalidate at apply time, and verify persistence.

## 0.4.0-beta.5 - 2026-08-12

- Hotfix: normalized every MCP-created or MCP-edited angle beat to persist `group1`, `group2`, and `group3` arrays, including empty unused groups. This prevents PWS show startup from crashing when a promo omits `group2`.
- Added regression coverage for a single-person promo and for later angle-beat edits; the affected CareerMode show was repaired without changing its card and then started successfully in PWS.
- Replaced the hand-written JSON-lines stdin loop with the official MCP SDK server and stdio transport while preserving the existing tools, resources, prompts, and PWS version-pair checks.
- Added a dedicated MCPB entry point that starts unconditionally when Claude Desktop loads it through its Node UtilityProcess wrapper; the reusable direct-path server remains import-safe for Claude Code, Codex, and tests.
- Added real-client regression coverage that completes MCP initialization and lists the tool, resource, and prompt catalogues through the official SDK client transport.
- Bundled the MCP server and SDK into a self-contained Node.js file for Workshop, manual, TEST, Claude Code, Codex, and MCPB use without shipping `node_modules`.
- Rebuilt MCPB packaging around a minimal validated staging directory so the installed extension contains the exact same standalone server that passed transport tests.
- Generated and shipped third-party license notices for every dependency included in the standalone bundle.
- Fixed B14 by allowing both `Wrestler` and `Occasional Wrestler` in match-plan validation and transactional segment edits while continuing to reject angle-only worker types.
- Kept the beta narrow: game-facing changes are limited to B14 match eligibility and safe normalization of omitted angle-beat groups.
- Passed the Windows Claude Desktop Home-chat acceptance test: the corrected MCPB initialized, exposed the PWS integration, called the live beta.5 bridge, and returned the loaded VWE1 state.
- Passed all 13 non-mutating live bridge checks with the matching beta.5 TEST plugin, then live-validated B14 by successfully dry-running Wendi Richter (`Occasional Wrestler`) against a normal wrestler without creating a segment.

## 0.4.0-beta.4 - 2026-08-12

> **Known issue discovered after publication:** on Claude Desktop for Windows, the beta.4 MCPB installs and launches but regular Home chat cancels its MCP initialization after 60 seconds. Claude Code and Codex direct-path connections remain functional. A focused beta.5 compatibility fix is required before the final 0.4.0 release.

- Added preview-first `pws_set_event_active` for reversible event-series archiving/restoration; archiving is blocked while unfinished non-cancelled shows remain and retains completed/cancelled history.
- Added explicit persona date policy: native personas outside `minDate`/`maxDate` are rejected by default and require `allowDateOverride=true` for creative-sandbox use; promotion-ineligible personas must first be made available explicitly.
- Added structured participant groups, opponent details, ringside workers, and angle subjects to `pws_get_show` while retaining the compact participant summary.
- Standardized `pws_update_segment` applied results with an `after` field while retaining `segment` as a compatibility alias.
- Normalized persona, promise, show, stable-member, and event flags to JSON booleans in public read/result shapes.
- Added a first-party live bridge regression runner with compact JSON reports and `finally`-based restoration for opt-in reversible persona/event checks.
- Added a copy-only promise fixture preparation workflow for live accept/decline testing when the active save has no pending decision request.
- Added automatic client/plugin version-pair validation with an actionable mismatch error, including compatibility checks against older plugins that do not publish their version in the runtime file.
- Expanded beta.4 regression coverage for event archiving, persona restrictions and date overrides, show participants, mutation envelopes, boolean normalization, and testing utilities.
- Live-validated all 17 automated bridge checks, reversible persona/event cleanup, date-overridden persona selection and exact restoration, archived-event persistence with retained history, and both promise-response paths across full PWS restarts.

## 0.4.0-beta.3 - 2026-08-12

- Added `pws_get_promises` for outstanding, declined, fulfilled, and expired worker promises with related workers, contracts, titles, and deadlines.
- Added preview-first `pws_respond_to_promise` for accepting or declining pending requests transactionally with PWS's decision-email and relationship consequences.
- Added `pws_get_personas` for browsing native PWS alter egos, including preferred presentation data and promotion/date eligibility.
- Added preview-first `pws_set_contract_persona` for selecting an alter ego or custom ring name without renaming the underlying global worker; native personas apply their preferred gimmick, picture, and mask with verification and rollback, while explicit presentation overrides allow exact restoration.
- Added preview-first `pws_set_persona_availability` for changing an alter ego definition between free use, the player promotion, or a specified promotion for exact restoration within the loaded save.
- Fixed contract-scoped persona reads to filter by the contract worker before pagination.
- Normalized native numeric event importance and show segment types in read results, preserved House Show importance despite PWS's native zero-value fallback, and expanded event-creation verification.

## 0.4.0-beta.2 - 2026-08-11

- Fixed storyline-attribution diagnostics to normalize escaped ampersands, apostrophes, quotes, and angle brackets before matching history rows.
- Restricted storyline-attribution candidates to segments aired during each storyline's actual lifetime.
- Replaced the invented prestige-based company-size label with PWS-compatible popularity sizing and added all six continental popularity values to `pws_get_state`.
- Added `pws_get_gimmicks` for browsing the loaded database's gimmick requirements and disposition preferences.
- Validated assigned and newly signed workers' gimmick names against the loaded database, while preserving the special `None` value.
- Documented the optional `gimmick` accepted by `sign_worker` and added explicit Claude Code TEST-server setup guidance.

## 0.4.0-beta.1 - 2026-08-11

- Added preview-first stable creation, dissolution, membership management, leader assignment, and stable reads through PWS's validated stable actions.
- Added preview-first contract gimmick assignment through PWS contract modification.
- Added preview-first event-series creation, show scheduling with optional venue assignment, and unfinished-show cancellation.
- Added post-action verification and ownership checks for every new beta mutation.

## 0.3.0 - 2026-08-11

> **Claude Desktop upgrade required:** Steam Workshop updates only the in-game PWS plugin. Claude Desktop users must also download and install `pws-mcp-server-v0.3.0.mcpb` from the matching GitHub release, then restart Claude Desktop.

- Added complete show-plan validation, transactional segment editing, multiple-title support, ringside workers, referees, agents, and announcers.
- Added preview-first verified tools for venue assignment, segment removal, storyline changes, releases, and title vacations.
- Added recurring-event venue defaults, venue browsing, compact paginated rosters, explicit availability reasons, lean storyline reads, and storyline-attribution diagnostics.
- Fixed unfinished-show discovery, rehab eligibility, SQL semicolon parsing, misleading action errors, and third-group angle beats.
- Added post-write verification, rollback behavior, local audit records, runtime credential hardening, release validation, and Workshop packaging.
