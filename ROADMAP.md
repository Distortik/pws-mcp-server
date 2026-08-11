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

- Read outstanding worker promises with contract, type, deadline, and status; add preview-first accept/decline actions.
- Add network and TV-deal discovery and management: available networks, regional reach, offers, acceptance/termination, and show assignment.
- Read incoming rival contract-offer terms and support the safe response paths exposed by PWS.
- Complete contract negotiations beyond beta gimmick modification: renewals, offers, counters, matching, and terms.

### Storyline attribution ground truth

- The failure is not caused by bulk versus per-segment booking.
- Apparent sporadic misses such as segments 987, 991, 1418, 1602, and 1644 were matcher false positives caused by escaped apostrophes. Both 1602 and 1609 registered correctly.
- Attribution became a total failure for qualifying VWE segments from 23 March onward across shows 347, 361, and 378.
- The real historical outage covers the qualifying VWE segments from 23-30 March. History rows still lack a segment ID, so diagnostics remain a best-effort match.
