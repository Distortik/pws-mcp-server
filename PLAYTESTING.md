# 0.4.0 release-candidate testing

Use this checklist for the `0.4.0` production candidate. It promotes the live-validated beta.5 hotfix and adds focused B10/B12/B13/F19 hardening. Any save-changing regression check should still use a copied or backed-up save. Do not enable the Workshop and TEST versions of the plugin together.

## Production-candidate record

- All 79 automated tests and syntax checks pass.
- Live read-only inspection confirmed `advancedPopularityMode` is stored in `gameworld`, VWE1 has one regional-popularity row at 20 (Regional), and every injury/rehab/suspension/time-off return-date column used by B13 exists.
- The 0.4.0 TEST deployment hash-matched all 14 production runtime files and passed all 13 live read-only bridge checks.
- VWE1 reported Regional through advanced regional popularity, live injury/rehab rows passed return-date boundary checks, a current-show validation returned the exact injury date, and a temporary stable leader persisted and cleaned up exactly.
- The installed production MCPB initialized in a fresh Claude Desktop Home conversation, loaded the Pro Wrestling Sim integration, and returned VWE1 as Regional through regional popularity. The 0.4.0 release gate is complete.

## Beta.5 acceptance record

- All 73 automated tests passed, including direct and wrapper-loaded official-client initialization plus angle normalization on new cards and edits.
- The matching beta.5 TEST plugin passed all 13 non-mutating live bridge checks against VWE1.
- A new Claude Desktop Home conversation on Windows loaded the Pro Wrestling Sim integration and returned the live VWE1 state.
- B14 passed a live dry-run validation using Wendi Richter (`Occasional Wrestler`) and Debbie Combs (`Wrestler`); no segment was created and the save was not changed.
- B15 was reproduced on CareerMode show 52, traced to omitted empty beat groups, repaired without changing the card's creative content, and confirmed by successfully starting the show.

## Install the matching pair

1. Back up the target PWS save.
2. Disable the Workshop version of PWS MCP Server.
3. Extract `pws-mcp-server-TEST-plugin-v0.4.0.zip` under `%APPDATA%\ProWrestlingSimulator\plugins` and enable only **PWS MCP Server TEST**.
4. Install `pws-mcp-server-v0.4.0.mcpb` in Claude Desktop and restart it.
5. For Claude Code, point the user-level MCP entry to `%APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server-TEST\mcp-server.js`.
6. Confirm `pws_get_state` reports the intended save, player promotion, and `0.4.0` tool set.
7. If a client reports a version mismatch, update/reselect the matching in-game plugin and client server, then restart both; the server rejects mismatched pairs before running tools.

## Read-only checks

- Confirm `pws_get_state` reports all six continental popularity values and the correct popularity-derived company tier.
- On VWE1 with advanced popularity enabled, confirm `pws_get_state` reports **Regional**, `sizeMethod` is `regional popularity`, and the promotion's maximum regional-popularity row is 20.
- Run `pws_get_gimmicks` with search and disposition filters.
- Run `pws_get_promises` with no filter and then each applicable status. Check worker/title relationships, deadlines, `daysRemaining`, `overdue`, and declined requests.
- Run `pws_get_personas` for Mark Calaway or Mick Foley. Check promotion names, boolean promotion/date eligibility and mask flags, preferred gimmick, picture, and dates.
- Run `pws_get_stables`, `pws_get_upcoming_shows`, `pws_get_venues`, and `pws_diagnose_storyline_attribution`.
- Run `pws_get_show` on a booked show. Confirm `participants` contains grouped contract IDs, `opponentDetails` contains names/roles, and ringside/subject arrays match the card.
- On an unfinished disposable show, validate—but do not apply—a match containing an active `Occasional Wrestler` and a normal `Wrestler`; confirm validation accepts both. Confirm an angle-only type such as `Staff` remains rejected as a match participant.
- On a future disposable show, dry-run a worker whose injury or rehab return date is on or before the air date and confirm validation accepts them. Confirm the same worker is rejected for a show before that date. Repeat through `pws_update_segment` preview on an existing disposable segment if available.

## Persona checks

Use one active player-company contract whose original presentation has been recorded.

1. Preview a custom ring-name change. Confirm the worker's global name, picture, mask, and gimmick are not proposed to change.
2. Preview a native persona. Confirm the proposed contract name, preferred gimmick, picture, and mask match `pws_get_personas`.
3. Apply the native persona after approval. Confirm the returned verification and audit entry.
4. Check the contract/roster and booking screens in PWS, then reload the save and check again.
5. Restore the original contract presentation and verify it after reload.
6. Preview changing a promotion-specific persona to `free-use`. Record the preview's original `promotionExclusive` value.
7. Apply free use, re-read the persona, and confirm `promotionExclusive=0`.
8. Restore it with `availability=specific-promotion` and the recorded original promotion ID. Confirm the original promotion name returns.
9. For a date-limited persona such as biker Undertaker, confirm selection is rejected by default with an `allowDateOverride=true` instruction.
10. Preview it with `allowDateOverride=true`; confirm the creative-sandbox warning appears and free use/date override does not alter `minDate` or `maxDate`.

## Promise checks

Use pending decision emails on the backed-up save.

If the save has none, close PWS and create two independent fixture copies with Node.js 22 or newer:

```powershell
npm.cmd run fixture:promise -- "C:\path\VWE1.db" "C:\path\VWE1-promise-accept.db"
npm.cmd run fixture:promise -- "C:\path\VWE1.db" "C:\path\VWE1-promise-decline.db"
```

The command never edits the source and refuses to overwrite an existing output. Load only the generated copy and use the printed `promiseId`.

1. Preview both accept and decline decisions; confirm the status and relationship-effect range are explicit.
2. Accept one pending request. Confirm the promise becomes active, its email is handled, and the relationship change is between +5 and +15.
3. On a restored copy of the save, decline the same request. Confirm it becomes declined, its email is handled, and the relationship change is between -15 and -5.
4. Reload after each path and verify `pws_get_promises` returns the persisted status.

## Other beta mutations

For every operation, inspect the preview before applying it and confirm the PWS UI after application and save reload.

- Create a stable with a leader, add a member, remove that member, and dissolve the test stable.
- Change a contract gimmick, then restore it.
- Create a one-off event series, schedule a show, assign a venue, optionally set the event default, and cancel the unfinished test show.
- Preview and apply `pws_set_event_active` with `active=false`; confirm the cancelled series becomes archived but its show remains in history. Restore it with `active=true`, then archive it again for final cleanup.
- Confirm every successful mutation appears in `pws_get_audit_log`.

## Regression checks

- Preview, validate, and apply a small show plan to a disposable unfinished show.
- Update a match and an angle, including participants and one advanced field; confirm transactional verification.
- Remove a disposable segment.
- Add and remove a storyline worker, then run storyline-attribution diagnostics.
- Exercise release and title-vacation previews without applying them unless the save is disposable.
- Confirm raw `pws_query` remains read-only and rejects writes or stacked statements.

Run the automated live suite after the 0.4.0 TEST plugin is loaded:

```powershell
npm.cmd run test:live
```

For explicit reversible checks, supply a persona ID and an archive-safe disposable event ID. The runner restores both in a `finally` cleanup pass and writes a compact report under `dist`:

```powershell
npm.cmd run test:live -- --persona-id 79 --event-id 7
```

## Release gate

Beta playtesting passes when:

- no mutation reports success without the requested state persisting after reload;
- persona changes preserve the global worker identity and restore cleanly;
- the Workshop plugin can remain disabled while the TEST plugin and matching MCPB expose the same version;
- all unexpected behavior is recorded with the tool input, returned error/result, relevant IDs, and whether PWS was reloaded.
- the matching 0.4.0 MCPB completes initialization in a regular Claude Desktop Home conversation and exposes the same version/tool catalogue as direct Claude Code and Codex connections;
- Claude Code and Codex path setup is tested through the documented copy/paste assistant request as well as the explicit CLI commands, so users are not required to locate or edit configuration manually.
