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
- **Maestro mode:** assign a leader that can propose a team, recruit agents,
  delegate complete task briefings, coordinate work, and dismiss agents when the
  work is done.
- **Ready-made teams:** start or expand a workspace with complete Product,
  Campaign and launch, Brand and design, Content and SEO, React, Next.js,
  SvelteKit, Svelar, Laravel, and Orkestrai Contributing presets. Their agents
  start with autonomous full access, detailed operating roles, and an initial
  task that the lead receives and assigns without repeated permission prompts.
- **Workflows that fit the work:** name, color, and reorder up to ten board
  stages. Leads and agents discover and update the same stages automatically.
- **Operational team views:** install specialized roles from a 12-role catalog
  and inspect each task title, stage, assignee, and Git state across every floor.
- **Native agent bridge:** the bundled `orkestrai` CLI and MCP server expose
  typed commands for messages, tasks, notes, portals, floors, roles, and desktop
  notifications.
- **Parallel workspaces:** agents continue running when you switch to another
  workspace, with activity indicators and native notifications.
- **Git floors:** isolate work in Git worktrees, inspect conflicts, and land
  completed changes from the canvas.
- **Local voice:** dictate into any text field or use the no-focus canvas
  shortcut for the leader, then listen to replies in Brazilian Portuguese, US
  English, or Latin American Spanish. STT and TTS run on the user's machine.
- **Operational controls:** inspect provider usage, manage local portal ports,
  configure recurring routines, and install skills from the marketplace.
- **Provider Center:** detect all eight supported CLIs locally, follow OS-aware
  installation and official sign-in guidance, and inspect capabilities without
  sending provider credentials to Orkestrai.
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
- `src/routes/canvas/` and `src/lib/components/agent-room/canvas/` implement the
  desktop workspace.
- `packages/orkestrai-cli/` provides the agent-facing CLI and MCP bridge.
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
