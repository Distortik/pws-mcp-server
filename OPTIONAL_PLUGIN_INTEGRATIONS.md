# Optional community plugin integrations

PWS MCP Server may integrate with separately installed community plugins, but they are not dependencies and are not bundled into MCP releases. Core MCP tools must behave exactly as before when none of the optional plugins are installed.

## Approved plugins

The original owner gave direct permission to fork, update, and add to these plugins. The maintained source baselines and future imports live in the separate `pws-community-plugins` project. The first five plugins below have already been imported; the additional three are approved next candidates whose exact source hashes still need to be recorded before development begins.

| Plugin | Installed version | Workshop item | Status | Initial MCP opportunity |
| --- | ---: | ---: | --- | --- |
| Investments Manager | 8.0.0 | 3678007324 | Imported; maintained patch at 8.0.1 | Read assets, maintenance, and relevant company/network state |
| Plugin Features | 3.5.3 | 3669937858 | Imported | Dynamic launcher/settings registry for maintained forks |
| Booker Career Mode | 3.0.0 | 3672521864 | Imported | Read booker progress, directives, records, and milestones |
| Hire Local Worker | 1.0.0 | 3674977824 | Imported | Discover eligible local workers and preview verified one-day hires |
| Inner Circle | 2.0.0 | 3678007756 | Imported | Read role assignments and later preview verified role changes |
| Dynamic Negotiations | 8.0.0 | 3677428750 | Approved; import pending | Read worker interest, mood, lockouts, promises, and offer/counter context before previewing verified negotiations |
| Network Approval Hub | 5.0.0 | 3682099011 | Approved; import pending | Read network compatibility, reputation, negotiations, deal history, and ownership after reconciling its state with Investments Manager |
| Tag Team and Stables Overhaul | 1.0.0 | 3700914929 | Approved; import pending | Read team/stable membership, status, and history before previewing verified lifecycle changes |

The installed “Universal Plugin Features Styling Plugin” identifies itself in its manifest as `Plugin Features` with plugin ID `plugin-features`. That identity is preserved in the import baseline until public fork naming and upgrade behavior are decided.

## Investments Manager and Network Hub compatibility

The two plugins overlap, but they currently model different parts of the network system:

- Investments Manager creates a real row in PWS's `networks` table plus `networkAvailability` rows, then records the network as an owned investment in its private save-scoped `localStorage`. It deliberately creates no automatic broadcast deal; the player must explicitly add event access through **Manage Events**.
- Network Hub reads the native `networks`, `networkAvailability`, and `networkDeals` tables for its market and deal views, but records acquisitions in its own `api.storage` state under `ownedNetworks`. That ownership entry is created only after Network Hub's takeover flow completes.

Consequently, an Investments-created network has a native database identity but no Network Hub ownership record or active deal. It should be visible after refresh in Network Hub's unfiltered **All** network list, but it will not appear under **My Deals** until an active `networkDeals` row exists, and it will not appear as Hub-owned because the Hub does not know about Investments' private record. If it is absent even from the refreshed **All** list, that is a separate refresh/filter regression to reproduce.

The maintained forks should negotiate a save-scoped ownership snapshot keyed by native `networkID` and player `promotionID`. A launch in Investments should appear as owned in Network Hub, and a completed Hub acquisition should appear in the Investments portfolio. Neither plugin should read the other's private storage directly. Deal creation remains separate and explicit.

## Architecture

Optional plugins register a small, versioned, declarative capability description and return sanitized save-scoped snapshots through PWS Community Interop v1. The neutral read-only channels are `pws-community:v1:describe` and `pws-community:v1:snapshot`; PWS MCP Server is one optional consumer, not the protocol host. The MCP server exposes only reviewed static tools, so an optional plugin cannot inject tool instructions, arbitrary JavaScript, callbacks, raw SQL access, or generic writes.

The first implemented provider is Inner Circle 2.1 capability `inner-circle.assignments`. The consumer tools are `pws_list_optional_integrations` and `pws_get_inner_circle`. The snapshot includes public role definitions and assignment facts keyed by native worker/contract IDs, while excluding notes, complete roster data, and internal history. The consumer accepts at most 64 KiB and independently verifies provider identity, schema/capability versions, assignment consistency, current save hash, native promotion ID, and revision monotonicity.

The first implementation phase is discovery and read-only data. A later write phase requires the same safety properties as native MCP actions: exact preview, current-state binding, explicit confirmation, apply-time validation, post-save verification, and rollback where practical.

The integration must also:

- reject stale data after a save or player-promotion change and invalidate revision evidence on `database:opened`;
- identify the optional plugin and protocol/schema versions;
- limit payload size and validate every field;
- remain silent and harmless when the other side is not installed;
- never read another plugin's private `localStorage` keys directly.

## Settings hub

Plugin Features currently recognizes supported plugins through a hard-coded catalogue of launcher containers and global function names. The maintained fork should add a dynamic registry with a backwards-compatible static fallback. Each plugin keeps ownership of its settings UI and data; the hub only provides discovery, layout, visibility, and a convenient way to open those settings.

## Release policy

The forked plugins are versioned, packaged, and published separately from PWS MCP Server. Compatibility should be documented as “enhanced when installed,” never “required.” Each side reports its own version and the negotiated integration protocol version so incompatible combinations fail clearly without affecting normal gameplay.
