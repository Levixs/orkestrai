# Orkestrai Release Contract

## Repositories And Credential

- Private source and workflow: `beeblock/pantheon`
- Public update feed and installers: `beeblock/orkestrai-releases`
- Required source-repository secret: `RELEASES_TOKEN`
- Token access: only `beeblock/orkestrai-releases`, Contents read/write
- Workflow: `.github/workflows/release.yml` (`Release Desktop`)

## Required Public Assets

For version `<v>`, require:

- Apple Silicon: `Orkestrai-<v>-arm64.dmg`, its blockmap, `Orkestrai-<v>-arm64-mac.zip`, and its blockmap
- macOS Intel: `Orkestrai-<v>.dmg`, its blockmap, `Orkestrai-<v>-mac.zip`, and its blockmap
- Windows x64: `Orkestrai-Setup-<v>.exe` and its blockmap
- Linux x64: `Orkestrai-<v>.AppImage`; its blockmap is embedded, so no separate `.AppImage.blockmap` exists
- Feeds: `latest-mac.yml`, `latest.yml`, and `latest-linux.yml`

The Windows filename must exactly match the URL in `latest.yml`. The macOS manifest must contain both architecture ZIPs. Installer sizes and SHA-512 values must match their manifest entries.

## Publication Contract

The workflow builds each OS natively, downloads the artifacts into the publisher, runs `scripts/validate-release-artifacts.mjs`, creates or updates a draft in the public repository, uploads all assets, compares local and remote asset counts, and only then publishes it as latest.

The publisher refuses to alter an already-public release. Failed upload retries may clobber assets only while the release is draft.

## Known Build Requirements

- Use Node 24 and npm `11.6.2` in every job, including the publisher.
- Keep `NODE_OPTIONS=--max-old-space-size=6144`; the adapter-node build exceeds Node's default heap on macOS runners.
- When Apple signing secrets are absent, use `scripts/package-macos.sh`: it unsets signing variables, applies a complete ad-hoc signature with hardened runtime disabled, and sets the macOS manifest rollout to 0%.
- Every macOS build must pass strict deep code-sign verification for both app bundles, DMG verification, and ZIP integrity checks before upload.
- Electron stays pinned according to `AGENTS.md`; changing it can break native dependency prebuilds.
- `asar` remains disabled according to the production server constraint in `AGENTS.md`.

## Updater Behavior

- The packaged app checks on boot and every six hours.
- The renderer receives persisted updater state through Electron IPC.
- Windows NSIS and Linux AppImage support unsigned replacement.
- Ad-hoc macOS builds do not download or replace applications in place; their feed rollout is 0% to stop legacy updaters, while the current app checks the public GitHub release API and offers manual installation. In-place macOS update requires Apple signing and notarization secrets.
- User data, workspaces, settings, and voice models live outside the application bundle.

## Failure Triage

- Build OOM near the adapter-node phase: confirm the workflow heap setting.
- `npm ci` lock mismatch only in publisher: confirm the pinned npm install runs there too.
- macOS `not a file` with no certificate: confirm empty signing variables are unset.
- Missing Linux blockmap: do not require a separate AppImage blockmap.
- Manifest references a missing Windows asset: confirm the hyphenated `artifactName` in `package.json`.
- Publication authorization failure: verify the `RELEASES_TOKEN` secret exists and its fine-grained repository/Contents permissions; never expose its value.
