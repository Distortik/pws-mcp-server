# Roadmap

## 0.4.0 candidates

These require validated PWS action contracts or carefully established database invariants before implementation:

- [Implemented in 0.4.0-beta.1] Create and manage stables and stable membership.
- [Implemented in 0.4.0-beta.1] Schedule shows and create event instances.
- Create and manage tournaments, rounds, matches, and participants.
- Contract offers, renewals, negotiations, counters, and terms.
- [Implemented in 0.4.0-beta.1] Assign and change worker contract gimmicks.
- [Resolved outside MCP] Storyline-history attribution was broken by Concert Bands Pro replacing PWS's show-summary function. Attribution resumed after disabling it.
- Consider a true company-wide venue preference if PWS adds one; 0.3.0 supports show and recurring-event defaults.
- Promote remaining advanced generic actions—storyline creation, signing, title awards, news, and email—to preview-first purpose-built tools once their complete contracts are known.

## Findings imported during 0.4.0-beta.1 playtesting

### Immediate beta fixes

- [Implemented in 0.4.0-beta.2] Fix `pws_diagnose_storyline_attribution` false positives by normalizing HTML entities and filtering candidates to the storyline's `startDate .. endDate` lifetime.
- [Implemented in 0.4.0-beta.2] Replace the prestige-derived company-size label, report continental popularity directly, and use PWS's actual popularity-driven tiers.

### High-value 0.4.0 candidates

- [Implemented in 0.4.0-beta.3] Read worker promises with contract, type, deadline, and status; preview and transactionally accept or decline pending requests with the native decision-email and relationship consequences.
- [Implemented in 0.4.0-beta.3] Browse native worker alter egos, switch a player-company contract to a selected persona or custom ring name without changing the global worker identity, and explicitly change persona availability between promotion-specific and free use.
- Add network and TV-deal discovery and management: available networks, regional reach, offers, acceptance/termination, and show assignment.
- Read incoming rival contract-offer terms and support the safe response paths exposed by PWS.
- Complete contract negotiations beyond beta gimmick modification: renewals, offers, counters, matching, and terms.

## Findings from 0.4.0-beta.3 live playtesting

### Beta.3 release blockers

- [Fixed during playtest] Filter contract-scoped persona reads by the contract worker before applying the result limit. The original query returned no Mark Calaway personas because it paginated all alter egos first.
- [Fixed during playtest] Allow `pws_set_contract_persona` to restore the preview's exact name, gimmick, picture, and mask instead of leaving the selected persona picture behind.
- [Fixed during playtest] Normalize PWS's numeric event-importance values to their public names, normalize show segment types to lowercase, and verify every requested event field after creation. Preserve `House Show` despite the native PWS action's zero-value fallback.

### Live beta.3 release-gate results

- [Passed] Read-only management, roster, hiring, contract, show, venue, title, storyline, stable, gimmick, persona, promise, catalog, and audit tools against VWE1.
- [Passed] Read-only SQL security rejected writes and stacked statements.
- [Passed] Persona availability changed to free use and restored to the exact original promotion; date limits remained intact.
- [Passed] Undertaker, Mankind, Dude Love, and a custom contract ring name applied their intended presentation without changing the global worker identity, then restored name, gimmick, picture, mask, and restriction exactly.
- [Passed] Stable creation, leader/member changes, dissolution, gimmick changes, and storyline membership changes verified and cleaned up.
- [Passed] Event/show scheduling, show planning and validation, match/angle creation, transactional updates, angle subjects, venue/default assignment, segment removal, cancellation, audit coverage, and multiple-title persistence/clearing.
- [Passed] House Show event importance persisted as native value `0` and read back as `House Show`, covering PWS's native zero-value fallback edge case.
- [Visually confirmed] PWS displayed The Undertaker's VWE contract name, Phenom gimmick, and intended picture correctly; the test then restored Mark Calaway's original VWE presentation.
- [Partially covered] Promise reads, classification, and invalid-response rejection passed. VWE1 had no pending decision request for a legitimate live accept/decline test.

### Beta.4 implementation backlog

- [Implemented in 0.4.0-beta.4] Add a first-party live bridge regression runner that records compact pass/fail results and always cleans up reversible test data.
- [Implemented in 0.4.0-beta.4] Return structured participant groups from `pws_get_show` instead of only a display string, matching the richer shape used by segment previews and updates.
- [Implemented in 0.4.0-beta.4] Standardize mutation result envelopes; segment updates now return the persisted object as `after` and retain `segment` as a compatibility alias.
- [Implemented in 0.4.0-beta.4] Add safe, reversible event-series archiving so cancelled disposable test events no longer remain active in the save.
- [Implemented in 0.4.0-beta.4] Normalize database-backed flags such as persona eligibility and promise actionability to JSON booleans consistently across read tools.
- [Implemented in 0.4.0-beta.4] Reject date-ineligible personas by default while allowing `allowDateOverride=true` as an explicit creative-sandbox override; date limits are never silently changed.
- [Validated during playtest] `pws_get_audit_log` includes PWS-native match/angle creation and removal entries alongside the MCP server's verified local entries; consider a unified result shape in beta.4, but no actions were missing.
- [Implemented in 0.4.0-beta.4] Add a controlled copy-only promise-response test-save preparation workflow; VWE1 had no pending decision promise, so the fixture enables both live response paths without altering the source save.

### Beta.4 and 0.4.0 release gate

- [Passed] Beta.4 syntax checks and 67 automated tests.
- [Implemented in 0.4.0-beta.4] Keep Claude Code and Codex pointed at stable Workshop/TEST folder paths across updates and automatically reject mismatched client/plugin version pairs with restart/install guidance.
- [Passed] The matching beta.4 TEST plugin is deployed and hash-verified; the first-party live regression runner passed all 17 read-only and reversible checks against VWE1, including cleanup.
- [Passed] Structured show results passed the live runner; event archiving and the date-overridden biker Undertaker persona plus its exact restoration were visually confirmed in PWS. After a full restart, the exact restored contract, WWF-only persona restriction, archived event, and all four cancelled show records persisted.
- [Passed] Separate copy-only accept and decline fixtures were prepared from VWE1 with pending Rick Rude promise 1015. Acceptance and decline both passed transactionally and after restart, including status, handled-email, relationship-effect, and audit verification (+5 and -8 respectively).
- [Passed] Built and inspected the beta.4 TEST ZIP and MCPB from a clean release command after all 67 automated tests passed.
- [Passed] Beta.4 feature, save-safety, visual, and restart-persistence testing completed with no PWS/save-operation blockers.
- [Release blocker discovered after beta.4] The installed Windows MCPB launches in Claude Desktop regular chat but does not complete `initialize`; Claude cancels after 60 seconds. The identical server responds immediately when invoked directly, and Claude Code/Codex remain functional, isolating the issue to Desktop MCPB/stdio compatibility.

### Beta.5 Claude Desktop compatibility gate

- [Implemented in 0.4.0-beta.5] Replace the hand-written stdio layer with the official MCP SDK server and transport while preserving existing tool/resource/prompt behavior and version-pair safety.
- [Passed] Official MCP client initialization and catalogue reads against both the source server and the self-contained Workshop/MCPB server, including a copy outside the repository with no `node_modules`.
- [Implemented in 0.4.0-beta.5] Build Workshop and MCPB distributions from the same self-contained bundled server and validate the MCPB manifest from a minimal staging directory.
- [Passed] Beta.5 syntax checks and all 71 automated tests, including official-client transport coverage and both B14 match-validation paths.
- [Implemented in 0.4.0-beta.5] Fix backlog item B14 so `Occasional Wrestler` is match-eligible in new show plans and segment edits while `Staff`, `Personality`, `Referee`, and `Announcer` remain ineligible.
- [Pending live client check] Install the matching beta.5 MCPB and confirm regular Claude Desktop Home chat receives PWS tools, not only Claude Code/Code and Codex.
- [Pending after TEST deployment] Confirm the beta.5 client/plugin version pair and repeat the live read-only bridge checks; beta.5 does not change any save operations.
- [Planned for 0.4.0 promotion] Re-run the complete automated, live read-only, version-pair, and production packaging gates.
- [Documented workaround] Claude Code and Codex users can paste a setup request into the client and let it locate, configure, and verify the stable Workshop/TEST `mcp-server.js` path instead of editing configuration manually.

### Remaining backlog after the beta.5 candidate

The version-controlled [backlog](BACKLOG.md) was reconciled with the implementation and live-test record on 12 August 2026. The current status is:

- [Open] **B12:** calibrate company-size tiers against the game's actual thresholds.
- [Open] **B13:** evaluate worker availability against a future show's air date.
- [Partial] **B10:** stable reads normalize `isLeader`, but mixed native persistence and leader-state verification still need hardening.
- [Partial] **B11:** approval guidance is explicit, but confirmed writes are not yet cryptographically tied to the exact preview the user approved.
- [Fixed in beta.5; live check pending] **B14:** allow `Occasional Wrestler` in both match-validation paths.
- [Shipped and live-verified] **F9** worker-promise responses and **F15** contract-scoped personas/ring names.
- [Future features] **F17** brands/titles, **F13** tag teams, **F14** worker-type visibility/default filtering, **F16** cash-aware hiring budgets, **F12** callable server information, **F10** network/TV management, **F11** incoming rival offers, **F6** contract negotiations, **F4** tournaments, **F14b** movesets, and purpose-built replacements for remaining generic write actions.

Unless beta.5 live testing exposes a release blocker, 0.4.0 should remain focused on client compatibility, B12/B13 correctness, and targeted B10/B11 safety hardening. The larger management features should follow 0.4.0.

### Storyline attribution ground truth

- The failure is not caused by bulk versus per-segment booking.
- Apparent sporadic misses such as segments 987, 991, 1418, 1602, and 1644 were matcher false positives caused by escaped apostrophes. Both 1602 and 1609 registered correctly.
- Attribution became a total failure for qualifying VWE segments from 23 March onward across shows 347, 361, and 378.
- The real historical outage covers the qualifying VWE segments from 23-30 March. History rows still lack a segment ID, so diagnostics remain a best-effort match.
