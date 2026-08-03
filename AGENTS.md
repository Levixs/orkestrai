# Svelar App — Agent Guidelines

## Required Flow

- Follow the Svelar architecture: route -> controller/page action -> FormRequest/shared schema validation -> DTO -> action/service -> repository -> model/resource -> response.
- Use Svelar CLI generators before hand-writing artifacts when a generator exists.
- Use Svelar ORM and migrations. Avoid raw SQL unless it is a low-level driver/infrastructure exception.
- Keep one migration per table or focused schema change.
- Use shared schemas for backend validation and frontend forms. Use Superforms where app forms need shared validation.
- Keep validation consistent with `svelar.validation.json`. Use Zod schemas in Zod apps and Valibot schemas in Valibot apps.
- Use policies, permissions, teams, middleware, rate limits, sessions, jobs, events, listeners, observers, cache, storage, search, PDF, and broadcasting through Svelar APIs instead of ad hoc implementations.

## Imports

- Prefer app aliases such as `$lib/modules/...`, `$lib/domain/models/shared/...`, `$lib/database/...`, and `$lib/factories/...`.
- Prefer Svelar subpath imports such as `@beeblock/svelar/orm`, `@beeblock/svelar/routing`, `@beeblock/svelar/forms`, `@beeblock/svelar/validation`, `@beeblock/svelar/auth`, `@beeblock/svelar/queue`, and `@beeblock/svelar/storage`.

## Frontend

- Use Svelte 5 runes in `.svelte` files: `$props`, `$state`, `$derived`, `$effect`, and `{@render children()}`.
- Do not use Svelte runes in plain `.ts` files.
- Use generated shadcn-svelte components for app UI.
- Mutating browser `fetch` calls must include Svelar's CSRF header. Enhanced forms can use the regular form flow.

## Agent Room Module

- Agent CLIs (claude, codex, kimi, opencode) are accessed only through adapters in `src/lib/modules/agent-room/application/adapters/`. Register new providers via `registerAgentAdapter` in `registry.ts` — never hardcode provider ids outside `domain/types.ts` defaults.
- Agent Room persistence uses Svelar ORM models in `domain/models/` (tables `agent_*`) and repositories in `infrastructure/repositories/`. The legacy better-sqlite3 store (`data/app.sqlite`) was migrated by `npm run migrate:agent-room-data`.
- IDs are UUID v7 (`uuidv7()` from `@beeblock/svelar/support`).
- Legacy data import: `npm run migrate:agent-room-data` (idempotent).
- PTY sessions live in `infrastructure/pty/PtySessionManager.ts` — the singleton MUST stay attached to `globalThis` (the SSR bundle and the type-stripped WS layer load separate module copies; only `globalThis` makes it a true process singleton).
- The PTY WebSocket (`/ws/agent-room/pty`) is served by the vite plugin in dev and by `scripts/orkestrai-server.mjs` in production (HTTP handler + WS in one process; also what Electron spawns). `pty-ws.ts` must stay self-contained (erasable-syntax TS only — Node type stripping runs it).
- The `orkestrai` CLI bridge (ask/list/note/notify/recruit/dismiss/connect) lives in `packages/orkestrai-cli` and authenticates per-workspace via `.orkestrai/workspace.json` token written by `BridgeService`. A boot shim (`scripts/install-orkestrai-shim.mjs`, called by both `vite.config.ts` and `scripts/orkestrai-server.mjs`) writes `orkestrai`/`orkestrai.cmd` into `ORKESTRAI_SHIM_DIR` (`storage/bin` in dev, `<userData>/bin` packaged) which `PtySessionManager` prepends to the PTY `PATH`. The packaged port is dynamic, so the CLI resolves the API URL in this order: `ORKESTRAI_API_URL` env → `~/.orkestrai/runtime.json` (rewritten at every boot) → `workspace.json` apiUrl → default. Agents get their identity via `ORKESTRAI_NODE_ID`/`ORKESTRAI_AGENT_TITLE` env injected at terminal spawn; the CLI uses them as default `--from`/`--agent`.
- Bridge provisioning (skill `.claude/skills/orkestrai/SKILL.md` + `workspace.json`) happens at workspace create AND is repaired lazily in `WorkspaceService.get` (`ensureProvisioned`) — never rely on create-only provisioning for old workspaces. The skill content is re-written when the template changes.
- Bridge automation (all in `BridgeService`): `recruit` auto-connects the recruit to the maestro and clamps titles to 48 chars and roles to 60 (sentence-long values break the node header; the UI additionally truncates the role label to 24 chars); `ask` auto-creates an edge between the two agents (edges reflect real conversations); `note create` connects to the whole team by default (`--connect all`); the first bridge `task add` auto-creates the `tasks` (kanban) node connected to the maestro via `ensureTasksBoard`; `portal create` (maestro-only) creates portal nodes — bare localhost URLs default to `http://`, the rest to `https://`. `orkestrai notify` prints `[orkestrai:notify]` to the server stdout, which `electron/main.cjs` turns into a native desktop notification — agents are told (via the skill) to call it when finishing or needing attention.

## Voice (dictation + TTS)

- Dictation and speak-back run through the **voice-stack sidecar** (OpenAI-compatible local API, STT faster-whisper/Parakeet + TTS Kokoro pt-BR), NOT in the browser — the whisper.cpp WASM approach was removed (unstable in Electron's Chromium).
- `VoiceService` (server) proxies to the sidecar via `/api/agent-room/voice/{transcribe,speak,health}` — the renderer never calls the sidecar directly (no CORS, URL is a setting: `voiceStackUrl`, default `http://localhost:8000`; also `voiceSttModel`, `voiceTtsVoice` = Kokoro pt-BR presets like `pf_dora`).
- The dictation hotkey is reactive: `app-settings.svelte.ts` is a shared store (`getAppSettings`/`invalidateAppSettings`) — terminals re-read it; the settings page invalidates it on save. Do not fetch settings per-component at mount.
- Speak-back: `BridgeService.ask` broadcasts `agentReply` on the PTY WS; each `TerminalNode` forwards it and `TerminalCanvasNode` speaks it (toggle in the node header) via `voice-speech.ts`.
- `scripts/orkestrai-server.mjs` must set `ORIGIN` (adapter-node defaults to https when deriving `event.url`, which breaks the Svelar same-origin middleware). `hooks.server.ts` normalizes loopback Origin spellings (localhost vs 127.0.0.1) — do not remove that middleware.
- The Svelar rate limit is raised to 5000 in `hooks.server.ts`; the default (100/min) is exceeded by the canvas UI and the e2e suite.

## Canvas UI

- The canvas (`src/routes/canvas/+page.svelte`) uses @xyflow/svelte with custom node components in `src/lib/components/agent-room/canvas/`. Layout persists per workspace via the workspaces/nodes/edges API.
- `useSvelteFlow()` only works inside `SvelteFlowProvider` — use the `ZoomBridge` component pattern to expose zoom functions to the page.
- Canvas page and `/terminal` are client-only (`ssr = false`) — avoids hydration races with xterm/xyflow.
- e2e tests run against the production build (`npm run build && PORT=5199 node scripts/orkestrai-server.mjs`), serial workers. Clean up created workspaces via API at the end of each test.

## Electron

- `electron/main.cjs` spawns the adapter-node server (`build/index.js`) as a child process with `ELECTRON_RUN_AS_NODE=1` and loads it in a BrowserWindow.
- After changing native deps (better-sqlite3, node-pty), run `npm run electron:rebuild` to rebuild them for the Electron ABI.
- Dev: `npm run electron:dev` (build + launch).
- Packaging: `asar` is OFF on purpose — the production server (`scripts/orkestrai-server.mjs`) is ESM and Node's ESM loader cannot resolve packages inside an asar; with asar enabled the app only worked because the source repo's `node_modules` happened to be nearby. Do not re-enable it.
- Electron is pinned to v42 (ABI 146) because better-sqlite3 only publishes Electron prebuilds up to ABI 146 — upgrading Electron means compiling better-sqlite3 for every target (mac needs `electron:rebuild`; Linux/Windows cross-builds break).
- macOS: `npx electron-builder --mac dmg` (arm64 and/or `--x64` for Intel). Linux/Windows locally via Docker: `scripts/package-cross.sh linux|windows|windows-zip|clean` (official electronuserland images, staging without host `node_modules`, npm pinned to the host version). Native Windows build (recommended for the NSIS installer): see `docs/build-windows.md` — no MSVC needed, prebuilds cover everything.

## Verification

- Before shipping meaningful changes, run focused tests and `npm run build` when feasible.
- For queue or scheduler behavior, run `npm run dev:worker` and `npm run dev:scheduler` locally with Redis available.
- Do not revert unrelated user changes in the working tree.
