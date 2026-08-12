# Changelog

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
