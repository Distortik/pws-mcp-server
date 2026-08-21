# Changelog

## 0.5.0 — 2026-08-21

- Fixed upcoming-show discovery so valid scheduled shows exposed only by PWS's native event-instance view are merged with normally joined events. One joinable show can no longer hide other unfinished shows, preventing clients from incorrectly reporting an empty or incomplete schedule.
- Added real-save verification output for the number of unfinished shows, making schedule-discovery regressions explicit in the release gate.
- Added `pws_get_server_info` for model-callable connection, transport, version-pair, and loaded-save diagnostics. It remains useful when PWS is running without a save loaded.
- Included Occasional Wrestlers consistently in default roster reads, company counts, roster-balance analysis, and hiring candidates while exposing worker type and match eligibility explicitly.
- Reworked automatic hiring bands to account materially for cash runway and existing top-end contracts. Automatic bands are advisory, and candidates above them are labeled as stretch targets rather than categorically unaffordable; explicit user limits remain hard constraints.
- Added `pws_audit_show`, a one-call readiness report for empty cards, invalid winners, risky automatic title-match outcomes, repeated match usage, and runtime under/overruns.
- Added roster rotation analysis with appearances, matches, angles, last-booked dates, and clear unused/heavy-use flags.
- Added ordered multi-person match support: entrances include every participant, while elimination order includes every participant except an explicitly selected winner. Both are stored in PWS's native format and verified after saving.
- Added preview-first tag-team creation, member/name/experience/status editing, and dissolution with player-company ownership checks and persisted-result verification.
- Added established-team discovery and preview-first company registration. When both members are contracted, the MCP can now find a global team that has never been registered with the player company, preserve its accumulated experience, and reuse its established name or apply a company-specific name.
- Added preview-first brand creation/editing/deletion, worker assignment, and event/brand default commentary teams. Brand deletion previews its impact and applies PWS's native contract/event cleanup behavior transactionally.
- Added preview-first championship creation/editing and reversible retirement/reinstatement, complementing the existing award and vacation actions.
- Added purpose-built preview-first championship awarding for singles, tag, and trios titles through PWS's native title-history action.
- Added preview-first contract modification for supported terms and management settings, plus a purpose-built immediate-signing workflow driven by hiring analysis.
- Added purpose-built preview-first storyline creation and metadata editing, complementing membership changes and storyline ending.
- Added event-series discovery and preview-first event editing and show rescheduling, including recurrence, prestige, brand, runtime, importance, preferred venue, and post-move audit guidance.
- Added network and television discovery with availability and current-deal context, plus preview-first cancellation using PWS's native status and news behavior. New offers and renegotiations remain in the game's negotiation UI so PWS—not the MCP server—calculates hidden terms.
- Passed the final installed TEST-plugin gate with all 20 read-only live checks and all 33 destructive live checks. The write suite covered contract restoration, immediate signing/release, existing-team registration, full tag-team/brand/storyline/title/event lifecycles, commentary defaults, show rescheduling, ordered four-person booking, post-write auditing, and native network-deal cancellation.

## 0.4.0 - 2026-08-13

> Release gate passed. The TEST deployment, live read-only suite, focused B10/B12/B13 checks, production package inspection, and installed Claude Desktop Home-chat smoke test all pass.

- Added preview-first, ownership-aware, persisted-result-verified management for stables, stable membership, contract gimmicks and personas, persona availability, worker promises, event series, scheduled shows, venues, storylines, releases, title vacations, and transactional segment edits.
- Added contract-scoped wrestler personas and custom ring names without changing the worker's global identity, including native gimmick/picture/mask selection, date-policy safeguards, promotion-specific/free-use availability changes, and exact restoration.
- Added complete show planning and validation with structured participants, multiple championships, ringside workers, announcers, referees, agents, angle subjects, safe rollbacks, and the beta.5 angle-group show-start hotfix.
- Added management dashboards, roster/hiring/contract analysis, gimmick discovery, promise reads/responses, stable reads, venue discovery, show reads, and storyline-attribution diagnostics.
- Added the official MCP SDK stdio transport and a self-contained MCPB entry point verified in a regular Claude Desktop Home conversation on Windows; Claude Code and Codex continue to use the stable direct server path.
- Fixed advanced-popularity company sizing when PWS omits the mode from its runtime state by reading `gameworld.advancedPopularityMode`; live save data confirms the corrected Regional calibration point.
- Fixed future-show availability for new plans and existing-segment edits by evaluating injury, rehab, worker suspension, contract suspension, and time-off return dates against the show's air date.
- Strengthened stable-member verification so a requested leader flag must persist, not merely the membership row.
- Corrected generic `sign_worker` terms: canonical monthly/appearance wages, compatible `wages` translation, day-based contract lengths, normalized types/gimmicks, and exact readback verification of requested supported terms.
- Passed syntax validation, all 79 automated tests, all 13 live read-only bridge checks, corrected Regional sizing, live injury/rehab date-boundary checks, reversible stable-leader persistence/cleanup, and an installed 0.4.0 MCPB connection/state read in a fresh Claude Desktop Home conversation. B11 preview receipts are explicitly deferred as a broader post-0.4.0 protocol change; current writes still default to preview, require explicit confirmation, revalidate at apply time, and verify persistence.

## 0.4.0-beta.5 - 2026-08-12

- Hotfix: normalized every MCP-created or MCP-edited angle beat to persist `group1`, `group2`, and `group3` arrays, including empty unused groups. This prevents PWS show startup from crashing when a promo omits `group2`.
- Added regression coverage for a single-person promo and for later angle-beat edits; the affected test show was repaired without changing its card and then started successfully in PWS.
- Replaced the hand-written JSON-lines stdin loop with the official MCP SDK server and stdio transport while preserving the existing tools, resources, prompts, and PWS version-pair checks.
- Added a dedicated MCPB entry point that starts unconditionally when Claude Desktop loads it through its Node UtilityProcess wrapper; the reusable direct-path server remains import-safe for Claude Code, Codex, and tests.
- Added real-client regression coverage that completes MCP initialization and lists the tool, resource, and prompt catalogues through the official SDK client transport.
- Bundled the MCP server and SDK into a self-contained Node.js file for Workshop, manual, TEST, Claude Code, Codex, and MCPB use without shipping `node_modules`.
- Rebuilt MCPB packaging around a minimal validated staging directory so the installed extension contains the exact same standalone server that passed transport tests.
- Generated and shipped third-party license notices for every dependency included in the standalone bundle.
- Fixed B14 by allowing both `Wrestler` and `Occasional Wrestler` in match-plan validation and transactional segment edits while continuing to reject angle-only worker types.
- Kept the beta narrow: game-facing changes are limited to B14 match eligibility and safe normalization of omitted angle-beat groups.
- Passed the Windows Claude Desktop Home-chat acceptance test: the corrected MCPB initialized, exposed the PWS integration, called the live beta.5 bridge, and returned the loaded save state.
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
