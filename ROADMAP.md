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

- Add a first-party live bridge regression runner that records compact pass/fail results and always cleans up reversible test data.
- Return structured participant groups from `pws_get_show` instead of only a display string, matching the richer shape used by segment previews and updates.
- Standardize mutation result envelopes; segment updates currently return the persisted object as `segment`, while most purpose-built actions return it as `after`.
- Add a safe event-series cleanup/archive action so cancelled disposable test events do not remain in the save database.
- Normalize database-backed flags such as persona eligibility and promise actionability to JSON booleans consistently across read tools.
- Decide and document whether contract persona switching should reject alter egos outside their `minDate`/`maxDate`, or allow an explicit creative-sandbox override; beta.3 reports date eligibility without silently changing the date limits.
- [Validated during playtest] `pws_get_audit_log` includes PWS-native match/angle creation and removal entries alongside the MCP server's verified local entries; consider a unified result shape in beta.4, but no actions were missing.
- Add a controlled promise-response integration fixture or test-save preparation workflow; VWE1 had no pending decision promise, so only read, classification, and rejection paths could be exercised live.

### Storyline attribution ground truth

- The failure is not caused by bulk versus per-segment booking.
- Apparent sporadic misses such as segments 987, 991, 1418, 1602, and 1644 were matcher false positives caused by escaped apostrophes. Both 1602 and 1609 registered correctly.
- Attribution became a total failure for qualifying VWE segments from 23 March onward across shows 347, 361, and 378.
- The real historical outage covers the qualifying VWE segments from 23-30 March. History rows still lack a segment ID, so diagnostics remain a best-effort match.
