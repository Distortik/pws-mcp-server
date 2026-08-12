# Beta playtesting

Use this checklist for `0.4.0-beta.3`. Test on a copied or backed-up save. Do not enable the Workshop and TEST versions of the plugin together.

## Install the matching pair

1. Back up the target PWS save.
2. Disable the Workshop version of PWS MCP Server.
3. Extract `pws-mcp-server-TEST-plugin-v0.4.0-beta.3.zip` under `%APPDATA%\ProWrestlingSimulator\plugins` and enable only **PWS MCP Server TEST**.
4. Install `pws-mcp-server-v0.4.0-beta.3.mcpb` in Claude Desktop and restart it.
5. For Claude Code, point the user-level MCP entry to `%APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server-TEST\mcp-server.js`.
6. Confirm `pws_get_state` reports the intended save, player promotion, and `0.4.0-beta.3` tool set.

## Read-only checks

- Confirm `pws_get_state` reports all six continental popularity values and the correct popularity-derived company tier.
- Run `pws_get_gimmicks` with search and disposition filters.
- Run `pws_get_promises` with no filter and then each applicable status. Check worker/title relationships, deadlines, `daysRemaining`, `overdue`, and declined requests.
- Run `pws_get_personas` for Mark Calaway or Mick Foley. Check promotion names and eligibility, date eligibility, preferred gimmick, picture, and mask.
- Run `pws_get_stables`, `pws_get_upcoming_shows`, `pws_get_venues`, and `pws_diagnose_storyline_attribution`.

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
9. For a date-limited persona such as biker Undertaker, confirm free use does not silently remove `minDate` or `maxDate`.

## Promise checks

Use pending decision emails on the backed-up save.

1. Preview both accept and decline decisions; confirm the status and relationship-effect range are explicit.
2. Accept one pending request. Confirm the promise becomes active, its email is handled, and the relationship change is between +5 and +15.
3. On a restored copy of the save, decline the same request. Confirm it becomes declined, its email is handled, and the relationship change is between -15 and -5.
4. Reload after each path and verify `pws_get_promises` returns the persisted status.

## Other beta mutations

For every operation, inspect the preview before applying it and confirm the PWS UI after application and save reload.

- Create a stable with a leader, add a member, remove that member, and dissolve the test stable.
- Change a contract gimmick, then restore it.
- Create a one-off event series, schedule a show, assign a venue, optionally set the event default, and cancel the unfinished test show.
- Confirm every successful mutation appears in `pws_get_audit_log`.

## Regression checks

- Preview, validate, and apply a small show plan to a disposable unfinished show.
- Update a match and an angle, including participants and one advanced field; confirm transactional verification.
- Remove a disposable segment.
- Add and remove a storyline worker, then run storyline-attribution diagnostics.
- Exercise release and title-vacation previews without applying them unless the save is disposable.
- Confirm raw `pws_query` remains read-only and rejects writes or stacked statements.

## Release gate

Beta playtesting passes when:

- no mutation reports success without the requested state persisting after reload;
- persona changes preserve the global worker identity and restore cleanly;
- the Workshop plugin can remain disabled while the TEST plugin and matching MCPB expose the same version;
- all unexpected behavior is recorded with the tool input, returned error/result, relevant IDs, and whether PWS was reloaded.
