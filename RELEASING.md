# Publishing a release

Publish the in-game plugin and Claude Desktop extension together under one GitHub tag and one GitHub Release. Do not create separate plugin and MCPB releases.

## 1. Set the version

Use the same semantic version in:

- `package.json`
- `plugin.json`
- `manifest.json`
- the `SERVER.version` value in `mcp-server.js`

Commit the finished code and documentation before tagging it.

## 2. Build both release assets

From PowerShell in the repository root:

```powershell
npm install
npm run release
```

The release command runs syntax checks and tests, validates all four version values, builds and verifies the Workshop package, validates the MCPB manifest, and creates:

```text
dist/pws-mcp-server-plugin-vX.Y.Z.zip
dist/pws-mcp-server-vX.Y.Z.mcpb
```

The ZIP is for manual installation of the in-game PWS plugin. The MCPB is the one-click Claude Desktop extension. Steam subscribers receive the in-game plugin from Workshop and need only the MCPB asset from GitHub.

Steam cannot update Claude Desktop's installed extension. Every release and Workshop update must tell existing Claude Desktop users to download and install the matching new `.mcpb`, then restart Claude Desktop.

## 3. Create one GitHub Release

1. Push the release commit to GitHub.
2. Open the repository's **Releases** page.
3. Select **Draft a new release**.
4. Select **Choose a tag**, enter `vX.Y.Z`, and create the tag from the release commit.
5. Use the title `PWS MCP Server vX.Y.Z`.
6. Select **Generate release notes**, then put the short installation section below above the generated changelog.
7. Upload both files from `dist` to the same release:
   - `pws-mcp-server-plugin-vX.Y.Z.zip`
   - `pws-mcp-server-vX.Y.Z.mcpb`
8. Confirm the tag, title, and both asset versions match.
9. Publish the release.

Suggested text for the top of the release notes:

```markdown
## Installation

### Steam Workshop + Claude Desktop (recommended)

1. Subscribe to PWS MCP Server in Steam Workshop and enable it in PWS.
2. Download `pws-mcp-server-vX.Y.Z.mcpb` below.
3. In Claude Desktop, open **Settings > Extensions > Advanced settings > Install Extension**.

> **Updating:** A Steam Workshop update changes only the in-game plugin. Install this release's `.mcpb` separately and restart Claude Desktop.

### Manual PWS plugin installation

Download `pws-mcp-server-plugin-vX.Y.Z.zip`, extract it, and copy the included `pws-mcp-server` folder to `%APPDATA%\ProWrestlingSimulator\plugins`. Claude Desktop users must also install the `.mcpb` asset.
```

## 4. Update Steam Workshop

Upload the contents of `dist/pws-mcp-server` to the existing Workshop item. Keep the Workshop item and GitHub Release on the same version. This is an update to the existing distributions, not another GitHub release.

Include the separate MCPB update warning in both the Workshop description/change notes and the GitHub release notes.

## Testing prereleases

Use a SemVer prerelease version such as `0.3.0-beta.1`, then run:

```powershell
npm run release:test
```

This creates a separately identified `PWS MCP Server TEST` plugin ZIP and the matching Claude Desktop MCPB. Mark the GitHub Release as a prerelease and do not upload `dist/pws-mcp-server` to Steam Workshop. Testers can keep their Workshop subscription, but should disable the Workshop plugin and enable only the TEST plugin while testing.

Claude Code does not install the MCPB. During prerelease testing, its user-level MCP entry must point to `%APPDATA%\ProWrestlingSimulator\plugins\pws-mcp-server-TEST\mcp-server.js`; otherwise Claude Code will continue exposing the older Workshop tool list even while the TEST in-game plugin is enabled.
