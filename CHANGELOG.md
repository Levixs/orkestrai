# Orkestrai Changelog

All notable changes to Orkestrai are documented here in English, from newest to
oldest. Public GitHub Release notes are generated directly from the matching
version section in this file. In-app and website changelogs provide equivalent
pt-BR, English, and Spanish translations.

## 0.8.2 - 2026-08-10

### Changed

- Made `orkestrai ask` preserve unquoted multi-word messages and require an
  explicitly confirmed provider reply before agents may report a consultation.
- Made `orkestrai task done` hand completion back to the workspace leader
  automatically without colliding with a human draft in the leader terminal.

### Fixed

- Matched Codex rollout sessions by their real workspace directory, preventing
  concurrent Codex terminals in different workspaces from reading each other's
  transcripts or confirming the wrong reply.
- Matched Kimi sessions by the provider's exact workspace-path hash instead of
  a shared final folder name such as `app`.
- Made unconfirmed and timed-out bridge requests fail with a nonzero exit code
  instead of appearing successful to the calling agent.

## 0.8.1 - 2026-08-10

### Added

- Added a searchable, bounded, and scrollable model selector for providers with
  large account catalogs, including Devin.
- Added deterministic canvas organization for either the current node selection
  or the whole workspace through the toolbar, command palette, and shortcut.
- Added a styled Windows desktop title bar with File, Edit, View, Workspace,
  Window, and Help menus while preserving native window controls.

### Changed

- Made the global voice orb pinnable and draggable within the visible canvas and
  kept it clear of open panels such as Presets, Usage, Roles, and Ports.
- Aligned Usage node progress colors with the panel's per-window green, yellow,
  and red thresholds, and loaded an initial Skills search automatically.
- Improved Orkestrai Light contrast across panels, canvas nodes, text, buttons,
  icons, provider marks, hover states, and onboarding surfaces.

### Fixed

- Captured the focused editable field before the global microphone takes focus,
  so dictation works on the first click without incorrectly requiring a leader.
- Validated real provider transcripts before resuming saved conversations,
  clearing stale Claude ids without re-injecting roles or activating idle agents.
- Used Windows command shims instead of launching provider JavaScript files
  directly, preserving CLI startup and workspace session recovery.
- Kept connections behind every canvas node and corrected terminal selection
  coordinates on Windows displays with DPI scaling.

## 0.8.0 - 2026-08-10

### Added

- Added a persistent Usage canvas node for Claude, Codex, and Kimi quotas with
  configurable source provider, fallback provider, and routing threshold.
- Added `orkestrai usage` to the native CLI and MCP bridge so leaders inspect
  the same quota snapshot and recommendation before assigning new work.
- Added three dark application themes, one light theme, and a semantic token
  editor with live preview, duplication, validated JSON import, and export.
- Added localized documentation, use cases, and onboarding tours for quota-aware
  delegation and custom themes in Brazilian Portuguese, English, and Spanish.

### Changed

- Updated the canvas, nodes, Provider Center, Skills, documentation, and Settings
  surfaces to honor the selected global theme tokens.
- Updated leader bridge instructions to route only new work to a healthy fallback
  and never silently move an active task to another provider.

## 0.7.0 - 2026-08-10

### Added

- Added a compact Agents menu to the canvas toolbar that lists every registered
  provider and sends unavailable agents directly to Provider Center.
- Added a global, persistent preference for pinning up to four ready agents as
  direct toolbar buttons in the user's chosen order.
- Added localized documentation, use case, and guided onboarding for the agent
  menu in Brazilian Portuguese, English, and Spanish.

### Changed

- Consolidated the eight provider buttons into the Agents menu while keeping
  Shell directly accessible and preserving the existing agent drawing flow.

## 0.6.0 - 2026-08-10

### Added

- Added Devin as a native provider with official CLI detection, account model
  discovery, autonomous interactive sessions, headless execution, and exact
  conversation resume.
- Added read-only discovery of concurrent Devin sessions by real workspace
  directory and clean agent replies from Devin's ATIF transcripts.
- Added Orkestrai skill and MCP bridge provisioning for Devin through
  `.devin/skills/orkestrai` and `.devin/mcp_config.json`.
- Added a localized Devin use case and guided onboarding tour in Brazilian
  Portuguese, English, and Spanish.

### Fixed

- Started Cursor Agent with workspace trust, MCP approval, and autonomous write
  access so canvas agents do not stop on repeated confirmation prompts.
- Started Antigravity autonomously and exposed its low, medium, and high effort
  controls in the agent configuration.

## 0.5.2 - 2026-08-10

### Fixed

- Raised the packaged server request limit from the adapter's 512 KB default
  so local dictation accepts recordings of approximately 15 minutes instead
  of failing after only a few seconds.
- Added a localized, actionable message when a recording exceeds the bounded
  upload limit in either global or terminal dictation.
- Restored Portal pages automatically when their saved local server starts
  after the canvas, and made automation wait for a real page load instead of
  running against Chromium's empty error document.
- Reserved each new Claude conversation id before spawn, preventing concurrent
  agents in the same workspace from swapping transcript ownership and sending
  corrupted terminal redraws through agent-to-agent replies.
- Preserved actionable Portal failure details through the CLI and rejected raw
  TUI output whenever a structured provider transcript cannot be confirmed.
- Stopped re-injecting roles when provider conversations resume. Restored
  terminals now submit input only to agents with assigned unfinished tasks or
  to the leader when unfinished work still needs an owner, including custom
  Kanban stages.
- Kept the packaged server responsive while macOS waits for workspace-folder
  consent by moving the initial access check off the event loop; a denied or
  interrupted check is retried instead of being cached as provisioned.

## 0.5.1 - 2026-08-10

### Fixed

- Restored every terminal automatically after an application restart by
  discarding process-local PTY identifiers that no longer exist while
  preserving each provider's real conversation identifier.
- Added a stable WebSocket error code and removed the timing window that could
  briefly reattach a recovering terminal to its obsolete PTY identifier.

## 0.5.0 - 2026-08-10

### Added

- Added global local dictation for every editable text field, including task
  titles and descriptions, roles, notes, and forms. When no field is active on
  the canvas, the voice control retains its leader-terminal shortcut.
- Added in-place provider switching for terminal agents. The replacement starts
  a clean provider conversation while preserving the node name, role, Maestro
  status, floor, position, theme, and team connections.
- Added automatic preset-role delivery when a terminal starts and initial
  kanban queue delivery to the leader with complete title, description, images,
  and linked-note context.
- Added task titles, stages, and assignees to the ground and worktree summaries
  in Floors.

### Changed

- Expanded every built-in preset role with a concrete mission, team context,
  operating process, acceptance criteria, handoff requirements, and a
  Kanban-first delegation protocol.
- Classified native notifications as task completion, project completion,
  attention, or information. Completing a task now emits its own explicit task
  notification, while project completion is reserved for the whole project.
- Required leaders to create and assign delegated work on the board before
  sending direct agent messages.

### Fixed

- Matched the shape text editor to the rendered font size, weight, alignment,
  and color so large text remains legible while editing.

## 0.4.0 - 2026-08-09

### Added

- Added native Cursor Agent, Antigravity CLI, and Cline CLI adapters alongside
  Claude Code, Codex CLI, Kimi Code, and OpenCode.
- Added provider-specific model, reasoning-effort, interactive, headless,
  structured-output, and exact-resume contracts where each CLI supports them.
- Added bridge skills and MCP provisioning for Cursor (`.cursor/mcp.json`),
  Cline (`.cline/mcp.json` with workspace-scoped settings), and Antigravity
  (`.agents/mcp_config.json`).
- Added exact session discovery from Cursor transcripts, Antigravity's
  workspace cache, and Cline session manifests, plus clean transcript reads for
  agent-to-agent replies.
- Added localized documentation and onboarding for choosing agents by desired
  outcome, aimed at developers, vibe coders, designers, marketers, creators,
  and product teams.
- Added a localized Provider Center that detects available CLIs, explains each
  provider's capabilities, and provides OS-aware installation and official
  authentication guidance without collecting credentials.
- Added language selection as the first onboarding step, persisted immediately
  for Brazilian Portuguese, English, or Spanish.

### Changed

- Replaced fixed provider enums and effort lists across the canvas, validation,
  tours, recruitment bridge, and PTY transport with adapter registry metadata.
- Prevented ambiguous latest-session fallback for providers whose exact
  conversation ID is not known.
- Changed the default interface language for new installations to English;
  existing saved language preferences remain unchanged.

### Fixed

- Prevented the initial locale request from mixing languages on one screen or
  discarding an early click while the application remounted.
- Ensured preset terminals are materialized through the current provider
  adapter so Claude, Codex, and Kimi start with their autonomous full-access
  flags. Existing provider terminals with empty arguments are repaired lazily,
  while customized arguments remain untouched.

## 0.3.0 - 2026-08-09

### Added

- Added up to ten customizable task-board stages with names, colors, ordering,
  safe deletion, and automatic awareness through the Orkestrai CLI and MCP
  bridge.
- Added Campaign and launch, Brand and design, and Content and SEO teams with
  localized briefs, specialist roles, portable skills, notes, tasks, and canvas
  layouts for marketers, designers, creators, and multidisciplinary teams.
- Added the Orkestrai Contributing preset with a Claude lead, independent Codex
  and Kimi oracles, Svelar, desktop, and QA/release specialists, a six-stage
  board, and a consensus Flow that requires both oracle approvals before task
  creation.

### Changed

- Expanded the product language and documentation beyond software engineering
  so non-programmers can start from familiar goals, briefs, stages, and
  approvals while technical agent controls stay automatic.

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
