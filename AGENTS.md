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
- The `orkestrai` CLI bridge (ask/list/note/notify/recruit/dismiss/connect) lives in `packages/orkestrai-cli` and authenticates per-workspace via `.orkestrai/workspace.json` token written by `BridgeService`.
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
- Dev: `npm run electron:dev` (build + launch). Distribution/packaging is Phase 7 — do not add electron-builder config yet.

## Verification

- Before shipping meaningful changes, run focused tests and `npm run build` when feasible.
- For queue or scheduler behavior, run `npm run dev:worker` and `npm run dev:scheduler` locally with Redis available.
- Do not revert unrelated user changes in the working tree.
