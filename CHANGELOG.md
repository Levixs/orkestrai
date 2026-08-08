# Orkestrai Changelog

All notable changes to Orkestrai are documented here in English, from newest to
oldest. Public GitHub Release notes are generated directly from the matching
version section in this file. In-app and website changelogs provide equivalent
pt-BR, English, and Spanish translations.

## Unreleased

### Changed

- Required every official macOS release to use Developer ID Application signing
  and Apple notarization; the ad-hoc fallback remains available only for local
  packaging.
- Added a release preflight gate for repository visibility and all five Apple
  signing/notarization secrets.

### Fixed

- Prevented the release workflow from silently publishing an unsigned macOS
  package when a signing credential is missing.
- Added CI verification for the signing authority, Team ID, Hardened Runtime,
  Gatekeeper acceptance, and stapled notarization ticket on Apple Silicon and
  Intel app bundles.

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
