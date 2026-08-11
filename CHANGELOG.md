# Changelog

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
