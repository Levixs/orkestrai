# Orkestrai Changelog

All notable changes to Orkestrai are documented here in English, from newest to
oldest. Public GitHub Release notes are generated directly from the matching
version section in this file. In-app and website changelogs provide equivalent
pt-BR, English, and Spanish translations.

## 0.2.0 - 2026-08-09

### Added

- Added a first-class preset library to the canvas with search, category
  filters, create-new and merge-into-current flows, plus ready-made Product,
  React, Next.js, SvelteKit, Svelar, and Laravel teams.
- Added preset format v2 with portable `SKILL.md` files and complete task
  descriptions/status, while preserving compatibility with existing presets
  and never carrying PTY runtime state.
- Added a localized catalog of 12 installable roles covering leadership,
  product, architecture, frontend, backend, Svelar, QA, security,
  accessibility, documentation, release, and performance.
- Added an operational Floors overview that combines active agents, assigned
  tasks, changed files, branch synchronization, and latest commit information
  for ground and every Git worktree.
- Added localized native Electron menus for workspace, editing, view, window,
  documentation, changelog, updates, and issue reporting on macOS, Windows, and
  Linux.

### Changed

- Aligned Settings and Documentation with the website's neutral dark surfaces,
  brand action colors, compact radii, and operational typography.
- Made presets discoverable from the sidebar even before a workspace exists,
  from the bottom canvas toolbar, and from the native desktop menu.

## 0.1.5 - 2026-08-09

### Changed

- Reclassified terminal silence as a neutral idle state, with a green status
  indicator instead of a false attention warning.
- Renamed the terminal navigation shortcut to describe idle agents accurately.

### Fixed

- Stopped ordinary terminal silence and successful unload/reload exits from
  generating native desktop notifications; completion and attention messages
  now require an explicit event, while abnormal exits remain visible.
- Added a per-session composer delivery queue that preserves unfinished human
  drafts, serializes automated agent messages, and prevents concurrent input
  from being combined in the leader terminal.
- Removed the silent 4,000-character truncation from inter-agent messages.
- Corrected missing Brazilian Portuguese accents across the main UI, update,
  voice, workspace, task, terminal, and agent instruction surfaces, with a
  regression test for frequently mistyped words.

## 0.1.4 - 2026-08-08

### Changed

- Required every official macOS release to use Developer ID Application signing
  and Apple notarization; the ad-hoc fallback remains available only for local
  packaging.
- Added a release preflight gate for repository visibility and all five Apple
  signing/notarization secrets.
- Added the one-time dual-feed transition: `0.1.4` is published to both the
  main repository and the legacy public update repository, while future builds
  use the main repository feed.

### Fixed

- Prevented the release workflow from silently publishing an unsigned macOS
  package when a signing credential is missing.
- Added CI verification for the signing authority, Team ID, Hardened Runtime,
  Gatekeeper acceptance, and stapled notarization ticket on Apple Silicon and
  Intel app bundles.

### Notes

- macOS users on an unsigned or ad-hoc-signed build need one manual installation
  of `0.1.4`. This signed and notarized build opens normally and enables trusted
  in-place updates for subsequent releases.

## 0.1.3 - 2026-08-07

### Fixed

- Fixed the partial ad-hoc signature in the macOS `0.1.2` packages, which
  Gatekeeper reported as a damaged application.
- Applied complete ad-hoc signing to unsigned macOS bundles and added deep
  signature, DMG, and ZIP validation before publication.
- Disabled in-place replacement for unsigned macOS builds so the current
  installation is preserved and the app offers a manual download instead.

### Notes

- On first launch of an unsigned macOS package, try opening the app, dismiss the
  warning, then use **System Settings > Privacy & Security > Security > Open
  Anyway**. Automatic replacement without this warning requires Apple Developer
  ID signing and notarization.
- Windows packages were not affected by the macOS signing issue.

## 0.1.2 - 2026-08-07

### Changed

- Increased the automatic Usage refresh interval from 60 seconds to 5 minutes.
- Aligned the server cache with the same interval to prevent duplicate provider
  requests when the panel is reopened or the app returns to the foreground.
- Kept manual refresh as an explicit cache bypass.

### Fixed

- Reduced the risk of Claude HTTP 429 responses during long Usage sessions.

## 0.1.1 - 2026-08-07

### Fixed

- Moved `electron-updater` into production dependencies so installed apps
  contain the updater module.
- Replaced the incorrect "installed app only" diagnosis with a real package
  error when the updater module is unavailable.
- Ensured user-created Kanban tasks reach the leader with the complete title,
  Markdown description, and every attached image.
- Added regression coverage for complete task briefings and packaged updater
  availability.

### Notes

- Installations on `0.0.1` and `0.1.0` must install `0.1.1` manually once.

## 0.1.0 - 2026-08-07

### Added

- Added the first public cross-platform release pipeline for macOS Apple
  Silicon and Intel, Windows x64, and Linux x64.
- Added atomic draft publication with installer, blockmap, manifest, size, and
  SHA-512 validation.
- Added reliable update state reporting between Electron and the renderer.

### Fixed

- Prevented the manual-install fallback from opening on ordinary network or
  GitHub availability errors when no update was found.
- Matched Windows installer names to the assets referenced by `latest.yml`.

## Earlier Development - 2026-08-01 to 2026-08-06

Before the first public release, Orkestrai was rebuilt as a local-first visual
orchestrator with:

- a persistent multi-agent canvas, PTY sessions, Maestro orchestration, Git
  floors, task boards, notes, portals, flows, routines, roles, and presets;
- the native `orkestrai` CLI and MCP bridge for Claude Code, Codex, Kimi Code,
  and OpenCode;
- complete pt-BR, English, and Spanish UI, documentation, onboarding, and tours;
- local multilingual dictation and speech, provider Usage monitoring, managed
  portal ports, session resume, desktop notifications, and automatic updates;
- Electron packaging for macOS, Windows, and Linux with persistent user data.
