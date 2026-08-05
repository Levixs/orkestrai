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
- The `orkestrai` CLI bridge (ask/list/note/notify/recruit/dismiss/connect/port) lives in `packages/orkestrai-cli` and authenticates per-workspace via `.orkestrai/workspace.json` token written by `BridgeService`. A boot shim (`scripts/install-orkestrai-shim.mjs`, called by both `vite.config.ts` and `scripts/orkestrai-server.mjs`) writes `orkestrai`/`orkestrai.cmd` into `ORKESTRAI_SHIM_DIR` (`storage/bin` in dev, `<userData>/bin` packaged) which `PtySessionManager` prepends to the PTY `PATH`. The packaged port is dynamic, so the CLI resolves the API URL in this order: `ORKESTRAI_API_URL` env → `~/.orkestrai/runtime.json` (rewritten at every boot) → `workspace.json` apiUrl → default. Agents get their identity via `ORKESTRAI_NODE_ID`/`ORKESTRAI_AGENT_TITLE` env injected at terminal spawn; the CLI uses them as default `--from`/`--agent`.
- Bridge provisioning (skill `.claude/skills/orkestrai/SKILL.md` + `workspace.json`) happens at workspace create AND is repaired lazily in `WorkspaceService.get` (`ensureProvisioned`) — never rely on create-only provisioning for old workspaces. The skill content is re-written when the template changes.
- Bridge automation (all in `BridgeService`): `recruit` auto-connects the recruit to the maestro and clamps titles to 48 chars and roles to 60 (sentence-long values break the node header; the UI additionally truncates the role label to 24 chars); `ask` auto-creates an edge between the two agents (edges reflect real conversations); `note create` connects to the whole team by default (`--connect all`); the first bridge `task add` auto-creates the `tasks` (kanban) node connected to the maestro via `ensureTasksBoard`; `portal create` (maestro-only) creates portal nodes — bare localhost URLs default to `http://`, the rest to `https://`. `orkestrai notify` prints `[orkestrai:notify]` to the server stdout, which `electron/main.cjs` turns into a native desktop notification — agents are told (via the skill) to call it when finishing or needing attention.

## Voice (dictation + TTS)

- **Default: embedded voice, no Docker and no Python.** `infrastructure/voice/EmbeddedVoice.ts` runs STT (Parakeet-TDT v3 int8) and TTS (Kokoro multi-lang, pt-BR voices via `KOKORO_PT_VOICES` sid map) through the `sherpa-onnx-node` npm package in a **forked subprocess under a real Node.js** — never under the Electron binary: Electron's V8 sandbox rejects the external buffers sherpa's TTS uses ("External buffers are not allowed"). The app downloads a standalone Node runtime (~50 MB from nodejs.org) together with the models; `resolveVoiceNode()` prefers it, falling back to a system Node (PATH, Homebrew, nvm). The subprocess self-terminates after 5 min idle (frees ~600 MB of model RAM) and on IPC disconnect (no orphans). Models (~740 MB) + runtime land in `<data dir>/voice/models` (system `tar` extracts tar.bz2/tar.gz/tar.xz/zip), model dirs marked with `.complete` — `embeddedModelsReady()` gates the confirm dialog.
- **Optional: voice-stack sidecar** (Docker, OpenAI-compatible) for faster-whisper/Chatterbox — selected via the `voiceBackend` setting (`embedded` default, `sidecar`). `VoiceService` branches on it; the sidecar path keeps `voiceStackUrl`/`voiceSttModel`.
- Dictation flow: renderer decodes MediaRecorder webm to WAV PCM16 16 kHz (`audio-pcm.ts` — no ffmpeg on the server), server runs `wavToPcm16` → `transcribePcm`. TTS: `speakPcm` → `pcmToWav` (24 kHz) to the client.
- `VoiceService` (server) is also the proxy for the sidecar via `/api/agent-room/voice/{transcribe,speak,health}`.
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
- **Build hygiene**: after every packaging run, delete the unpacked intermediates — `release/mac`, `release/mac-arm64`, `release/linux-unpacked`, `release/win-unpacked` (~500-600 MB each, fully reproducible from the DMG/AppImage). Keep only the final artifacts (`*.dmg`, `*.AppImage`, `*.zip`, `*.exe`). The cross script already cleans its staging via trap; apply the same rule to local electron-builder runs.
- **Auto-update**: `electron-updater` wired in `electron/main.cjs` (packaged only) — checks at boot + every 6h, downloads to a cache dir, verifies sha512 from `latest-*.yml`, and swaps only on `quitAndInstall` (user data lives outside the bundle and is never touched). Events flow to the renderer via `orkestrai:update` IPC; `UpdateNotifier.svelte` (root layout) shows progress + the restart dialog, with manual-download fallback on error. Releases publish to the PUBLIC repo `beeblock/orkestrai-releases` (source repo is private — public feed = no token in the app): `GH_TOKEN=… npx electron-builder --mac --win --linux --publish always`. macOS auto-update fully works only with Apple code signing (unsigned builds get the manual-download dialog); Windows NSIS and Linux AppImage update unsigned. mac target includes `zip` on purpose — the updater needs it (dmg alone is not enough).
- **Install hygiene (macOS)**: never install from a `/Volumes/Orkestrai*` glob — stale mounted DMGs make it copy the wrong arch and `cp -R` merges bundles instead of replacing. Detach every `Orkestrai` volume first, `rm -rf /Applications/Orkestrai.app`, then `cp -R` from the exact volume path that `hdiutil attach` printed, and verify with `file /Applications/Orkestrai.app/Contents/MacOS/Orkestrai` (must say `arm64` on Apple Silicon).

## Docs & Changelog (obrigatório a cada mudança)

- Toda mudança de funcionalidade, correção visível ou UX **exige** atualizar, no MESMO commit: `CHANGELOG.md` (raiz, em pt-BR), o changelog in-app (array `changelog` em `src/routes/docs/+page.svelte`) e, quando aplicável, as seções/casos de uso da página "Como usar" e o `README.md`. Nunca empacotar/instalar com docs ou changelog desatualizados.

## i18n (pt-BR / en / es)

- O app é internacionalizado com paraglide (`project.inlang`, `messages/{pt-BR,en,es}.json` compilado para `src/lib/paraglide`). **Toda string nova de UI passa por `m['chave']()`** de `$lib/paraglide/messages.js` — nunca texto hardcoded; sempre adicione a chave nos 3 idiomas no mesmo commit.
- O locale vem da setting `uiLanguage` (seletor em Configurações) via `overwriteGetLocale` em `src/lib/i18n/locale.svelte.ts`; o layout raiz usa `{#key localeState.current}` para remontar a árvore na troca (é o mecanismo de reatividade — não remova).
- Migração é progressiva: páginas já migradas usam `m.*`; as demais seguem em pt-BR até serem migradas.

## Verification

- Before shipping meaningful changes, run focused tests and `npm run build` when feasible.
- For queue or scheduler behavior, run `npm run dev:worker` and `npm run dev:scheduler` locally with Redis available.
- Do not revert unrelated user changes in the working tree.
