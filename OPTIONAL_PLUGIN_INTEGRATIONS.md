# Optional community plugin integrations

PWS MCP Server may integrate with separately installed community plugins, but they are not dependencies and are not bundled into MCP releases. Core MCP tools must behave exactly as before when none of the optional plugins are installed.

## Approved initial set

The original owner gave direct permission to fork, update, and add to these plugins. The maintained source baseline lives in the separate `pws-community-plugins` project.

| Plugin | Upstream version | Workshop item | Initial MCP opportunity |
| --- | ---: | ---: | --- |
| Investments Manager | 8.0.0 | 3678007324 | Read assets, maintenance, and relevant company/network state |
| Plugin Features | 3.5.3 | 3669937858 | Dynamic launcher/settings registry for maintained forks |
| Booker Career Mode | 3.0.0 | 3672521864 | Read booker progress, directives, records, and milestones |
| Hire Local Worker | 1.0.0 | 3674977824 | Discover eligible local workers and preview verified one-day hires |
| Inner Circle | 2.0.0 | 3678007756 | Read role assignments and later preview verified role changes |

The installed “Universal Plugin Features Styling Plugin” identifies itself in its manifest as `Plugin Features` with plugin ID `plugin-features`. That identity is preserved in the import baseline until public fork naming and upgrade behavior are decided.

## Architecture

Optional plugins should register a small, versioned, declarative capability description and send sanitized save-scoped snapshots to the in-game MCP plugin. The MCP server exposes only reviewed static tools; an optional plugin cannot inject tool instructions, arbitrary JavaScript, callbacks, or raw SQL access.

The first implementation phase is discovery and read-only data. A later write phase requires the same safety properties as native MCP actions: exact preview, current-state binding, explicit confirmation, apply-time validation, post-save verification, and rollback where practical.

The integration must also:

- reject stale data after a save or player-promotion change;
- identify the optional plugin and protocol/schema versions;
- limit payload size and validate every field;
- remain silent and harmless when the other side is not installed;
- never read another plugin's private `localStorage` keys directly.

## Settings hub

Plugin Features currently recognizes supported plugins through a hard-coded catalogue of launcher containers and global function names. The maintained fork should add a dynamic registry with a backwards-compatible static fallback. Each plugin keeps ownership of its settings UI and data; the hub only provides discovery, layout, visibility, and a convenient way to open those settings.

## Release policy

The forked plugins are versioned, packaged, and published separately from PWS MCP Server. Compatibility should be documented as “enhanced when installed,” never “required.” Each side reports its own version and the negotiated integration protocol version so incompatible combinations fail clearly without affecting normal gameplay.

