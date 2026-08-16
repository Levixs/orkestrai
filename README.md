<p align="center">
  <img src="orkestrai-branding/logo.svg" alt="Orkestrai" width="360">
</p>

<p align="center">
  <strong>Orchestrate AI teams for building, designing, marketing, and shipping on a visual canvas.</strong>
</p>

<p align="center">
  English · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.es.md">Español</a>
</p>

Orkestrai is a local-first desktop application for macOS, Windows, and Linux. It
brings Claude Code, Codex CLI, Kimi Code, OpenCode, Cursor, Antigravity, Cline,
Devin, shells, tasks, notes,
browsers, and Git worktrees into one persistent canvas where developers, vibe
coders, designers, marketers, and creators can direct an AI team in real time.

Download the latest installers from
[beeblock/orkestrai](https://github.com/beeblock/orkestrai/releases/latest).

## Highlights

- **Live agent canvas:** arrange real PTY terminals, notes, task boards, browser
  portals, file trees, loops, and shapes. Connections show collaboration between
  agents as it happens.
- **Configurable Workbench:** keep open terminals, boards, notes, portals,
  files, flows, and usage in vertical tabs by default or optional horizontal
  tabs, then arrange up to eight live artifacts in resizable right/down splits.
  Tabs move between panes by drag and drop or an accessible menu. The Workbench
  references canvas artifacts without duplicating sessions, while workspace
  files remain local editor tabs, and the global
  voice orb follows its active workspace and leader. Its footer keeps every
  reported Claude, Codex, and Kimi quota window visible without opening a panel.
- **Integrated mobile devices:** add a persistent Mobile Device node from the
  Canvas toolbar; Workbench lists and opens that same node and session. Control
  iPhone and iPad Simulators on Apple Silicon Macs, or Android AVDs and explicitly
  authorized physical devices on macOS, Windows, and Linux. Stream the screen,
  send gestures and system buttons, install and launch workspace apps, manage
  permissions, inspect bounded logs and accessibility data, and save screenshots.
  Android uses Android Studio Platform Tools plus the bundled scrcpy server; the
  live screen is decoded with WebCodecs and fits either surface by default.
  Agents run the same workspace-scoped flow through the bundled CLI or MCP tools.
- **Operational Control Center:** inspect every agent's current task, state,
  state duration, provider, role, and usage. Its persistent communications inbox
  proves whether each handoff was queued, delivered, acknowledged, replied to,
  or failed under one message id, without waking idle terminals after restart.
- **Encrypted workspace sharing (experimental):** host an end-to-end encrypted
  session, choose a browser/mobile or installed-app invite, approve the device
  fingerprint, and assign a Viewer, Collaborator, Operator, or Administrator
  role. The installable Remote PWA follows sanitized team state, tasks, reviews,
  activity, provider usage, and leader messages; its pairing key stays
  non-extractable in the browser and the invitation secret is removed from the
  URL before connecting. Installed-app invites open Orkestrai automatically;
  guests can also paste one through **Workspace → Join remote workspace**.
  Operators can hold a traceable structured conversation whose reply is bound
  to the exact turn across every registered provider. The overview keeps the
  leader thread visible and waits through intermediate tool use until the
  provider finishes the turn. Dictation is available for leader, agent, and
  terminal input through the host's local STT without exposing plaintext audio
  to the relay; terminal dictation inserts text without submitting it.
  Administrators can start or restore an agent. Raw terminal control is a
  separate Administrator-only switch for each approved device, disabled by
  default, responsive to its viewport, rate-limited, limited to one terminal,
  and audited. Files, notes, portals,
  credentials, private URLs, and local paths stay on the host. Access is
  revocable and every command is audited.
- **Traceable automations:** trigger work manually, on a schedule, from task or
  message events, Git commits, GitHub pull requests, webhooks, file changes, or
  provider usage thresholds. Actions can prompt an agent, create a Kanban task,
  or notify the desktop. Ready recipes, idempotent queued jobs, bounded retries,
  and execution history keep every run visible; GitHub credentials remain
  encrypted in Electron secure storage instead of the workspace database.
- **Git Review Center:** inspect staged and unstaged changes, compare files in a
  Monaco diff, create reviews linked to tasks and assignees, leave persistent
  file and line comments, and approve, reject, or request changes. Feedback is
  routed back to the responsible live agent without losing the review history.
- **Portal Design Mode:** point at the exact interface element that needs work,
  review its cropped screenshot and safe visual context, then track feedback in
  a new leader-triage task, a task assigned to an agent, or an existing task.
  Browser secrets and hidden state stay excluded.
- **Native Design Mode:** create structured interface documents directly on the
  Canvas and open the same artifact in Workbench. Build frames, shapes, and text
  manually or connect a designer or leader that edits through typed Orkestrai
  tools with revision checks and live updates. Documents and history stay under
  `.orkestrai/designs` in the workspace.
- **Council decisions:** open Council from the Canvas toolbar, the workspace in
  Workbench, or `Cmd/Ctrl+K`, then ask two to five real agents for independent,
  budget-limited perspectives on one task or objective, compare the same
  evidence, risk, test, disagreement, and confidence contract, then record the
  human selection, consensus request, or rejection. Implementation prototypes
  stay in isolated Git floors and land only after an explicit safe preview.
- **Universal search:** press `Cmd/Ctrl+K` to find workspaces, agents, tasks,
  notes, roles, skills, files, settings, and commands, with recent and favorite
  items plus direct actions to open in the current pane, right, or below.
- **Rich local editor and previews:** browse the workspace's native file tree
  and open files directly in local Workbench tabs, without creating canvas
  nodes. The lazy-loaded Monaco editor keeps undo, cursor, dirty state, find/replace,
  formatting, outline, minimap, wrapping, and optional autosave. Preview
  Markdown, PDFs, and images offline; binary files show safe metadata and open
  through the system application.
- **Shared reference material:** drop, paste, or select images, PDFs, files, and
  HTTP/HTTPS links in agent prompts, task cards, notes, and composers. Files up
  to 10 MB stay inside the workspace under `.orkestrai/attachments/`, and agents
  receive the complete relative path or URL.
- **Maestro mode:** assign a leader that can propose a team, recruit agents,
  delegate complete task briefings, coordinate work, and dismiss agents when the
  work is done.
- **Ready-made teams:** start or expand a workspace with complete Product,
  Campaign and launch, Brand and design, Content and SEO, React, Next.js,
  SvelteKit, Svelar, Laravel, and Orkestrai Contributing presets. Their agents
  start with autonomous full access and native system/developer-level roles,
  with validated Kimi agent-file frontmatter and without long instructions
  blocking the terminal as pasted text. The lead receives and assigns the
  complete initial task without repeated prompts.
- **Workflows that fit the work:** name, color, and reorder up to ten board
  stages. Leads and agents discover and update the same stages automatically.
- **Operational team views:** install specialized roles from a 12-role catalog
  and inspect each task title, stage, assignee, and Git state across every floor.
- **Native agent bridge:** the bundled `orkestrai` CLI and MCP server expose
  typed commands for messages, tasks, notes, portals, mobile devices, floors,
  roles, and desktop notifications.
- **Parallel workspaces:** agents continue running when you switch to another
  workspace, with activity indicators and native notifications.
- **Mixed Windows and WSL runtimes:** choose a default runtime per workspace,
  then let each terminal inherit it, use native Windows, or target an exact WSL
  distribution and Linux project path. Provider discovery, sessions, resume,
  Council, recruited agents, and the bridge follow each terminal, so one team
  can combine tools installed across Windows, Ubuntu, Debian, or other distros.
- **Git floors:** isolate work in Git worktrees, inspect conflicts, and land
  completed changes from the canvas.
- **Local voice:** dictate into any text field or use the no-focus workspace
  shortcut for the leader, then listen to replies in Brazilian Portuguese, US
  English, or Latin American Spanish. Terminal dictation can optionally submit
  with Enter; regular text fields remain insert-only. The voice orb's pin badge
  opens its position controls directly, while the tooltip also reveals the
  platform shortcut. STT and TTS run locally.
- **Quota-aware delegation:** pin Claude, Codex, and Kimi usage to the canvas,
  configure a source, fallback, 5-hour/weekly/monthly window, and threshold,
  and let the leader consult the same recommendation through the CLI or MCP
  before assigning new work.
- **Custom appearance:** start from a coherent graphite-and-gold dark system or
  a high-contrast light palette, choose the other built-in themes, or duplicate
  one and edit semantic tokens with live preview and JSON import/export.
- **Readable terminals:** choose 1 of 10 complete ANSI palettes from the compact
  terminal options menu, alongside provider, role, reload, and Maestro controls.
- **Operational controls:** manage local portal ports, configure recurring
  routines, and install skills from the marketplace.
- **Provider Center:** detect all eight supported CLIs locally, follow OS-aware
  installation and official sign-in guidance, and inspect capabilities without
  sending provider credentials to Orkestrai.
- **Personal agent toolbar:** choose any service from one compact Agents menu
  and pin up to four ready favorites globally across workspaces and restarts.
- **Replaceable providers:** switch a team member from Claude to Codex, Kimi, or
  another installed provider while preserving its role, floor, and connections.
- **Session continuity:** each terminal resumes its own provider conversation
  after the application is closed and reopened.

## Supported Platforms

| Platform | Architectures | Package |
| --- | --- | --- |
| macOS | Apple Silicon and Intel | DMG and update ZIP |
| Windows | x64 | NSIS installer |
| Linux | x64 | AppImage |

The desktop application uses your locally installed agent CLIs. Install and
authenticate only the providers you plan to use:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI](https://github.com/openai/codex)
- [Kimi Code](https://www.kimi.com/code)
- [OpenCode](https://opencode.ai/)
- [Cursor Agent CLI](https://docs.cursor.com/en/cli/overview)
- [Antigravity CLI](https://antigravity.google/docs/cli/getting-started)
- [Cline CLI](https://docs.cline.bot/cli/cli-reference)
- [Devin CLI](https://docs.devin.ai/cli)

You do not need every provider or terminal expertise. Orkestrai enables the CLIs
it detects, keeps their conversations separate, and lets you organize agents by
outcome: research, design, content, marketing, product, engineering, or review.
Open Provider Center from the canvas cable icon, `Cmd/Ctrl+2`, or the native
Workspace menu to prepare a provider and check it again after installation.
New installations start in English and ask for the preferred interface language
as the first onboarding step.

## Development

Requirements:

- Node.js 24 or newer
- npm 11 or newer
- Git

```bash
git clone https://github.com/beeblock/orkestrai.git
cd orkestrai
npm ci

npm run dev            # SvelteKit at http://localhost:5173
npm run electron:dev   # production build followed by Electron
```

Voice works without Docker or Python. On first use, Orkestrai asks before
downloading the embedded runtime and local models. An OpenAI-compatible voice
sidecar remains available as an optional backend.

## Architecture

Orkestrai is built with Svelte 5, SvelteKit, Electron, Svelar, SQLite,
`node-pty`, and `@xyflow/svelte`.

- `src/lib/modules/agent-room/` contains the application, domain, persistence,
  PTY, bridge, voice, and provider adapter layers.
- `src/lib/modules/collaboration/` owns host sessions, sanitized projections,
  role policies, commands, device approval, revocation, and audit records.
- `src/routes/canvas/`, `src/routes/terminal/`, and
  `src/lib/components/agent-room/canvas/` implement the two desktop workspace
  views.
- `packages/orkestrai-cli/` provides the agent-facing CLI and MCP bridge.
- `packages/orkestrai-collaboration-protocol/` defines the versioned encrypted
  envelope for Node and browser WebCrypto clients;
  `packages/orkestrai-relay/` is an opaque WebSocket
  transport that cannot decrypt workspace content. The production service is
  available at `wss://relay.orkestrai.app/v1/connect`.
- `electron/` owns the desktop lifecycle, native notifications, and updates.
- `docs/` contains build and release documentation.

Read [AGENTS.md](AGENTS.md) before changing the architecture. It documents the
required Svelar flow, i18n rules, release discipline, and platform constraints.

## Quality Checks

```bash
npm test
npm run build
npm run test:e2e
```

End-to-end tests run serially against the production build. Follow the cleanup
rules in [AGENTS.md](AGENTS.md) after packaging or E2E runs.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and use
GitHub Issues for reproducible bugs and focused proposals. Report security
problems privately as described in [SECURITY.md](SECURITY.md).

## Releases

Tags follow Semantic Versioning. The `Release Desktop` workflow builds all
platforms, validates update manifests, and publishes verified artifacts as
[GitHub Releases](https://github.com/beeblock/orkestrai/releases).
See [docs/releases.md](docs/releases.md) for the complete process.

## License

Orkestrai is licensed under the [Apache License 2.0](LICENSE). Third-party
components and downloaded models remain subject to the licenses listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
