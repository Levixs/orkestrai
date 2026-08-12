# Product UI Baseline

Status: active gate for the Workbench rollout

Last reviewed: 2026-08-12

## Reproducible visual matrix

`tests/e2e/workbench-visual.spec.ts` owns the reference screenshots for the
Workbench at 1280x720, 1440x900, and 1920x1080 in Orkestrai Light and Orkestrai
Dark. Its APIs and usage values are deterministic, animations are disabled, and
the test uses locally packaged fonts.

Update a baseline only after reviewing every generated image:

```bash
npx playwright test tests/e2e/workbench-visual.spec.ts --update-snapshots
```

The screenshots live beside the spec under
`tests/e2e/workbench-visual.spec.ts-snapshots/`. The separate overflow and axe
gate is `tests/e2e/workbench-accessibility.spec.ts`.

## State checklist

Every changed operational surface must cover:

- loading without layout shift;
- empty state with one concrete next action;
- recoverable error that remains visible long enough to act on;
- disabled controls with an accessible reason or label;
- disconnected/offline state where a live process is involved;
- long titles, paths, provider windows, and translated labels;
- keyboard focus and pointer interaction;
- light and dark themes;
- 1280x720, 1440x900, and 1920x1080 desktop viewports;
- macOS, Windows, and Linux behavior where native integration differs.

## Component inventory

| Responsibility | Canonical component or module | Decision |
| --- | --- | --- |
| Canvas node chrome | `NodeShell.svelte` | Keep as the only node frame and resize contract. |
| Compact icon actions | shadcn `Button`, `HeaderIconButton.svelte`, `IconAction.svelte` | Use shadcn in app shells; retain the two node wrappers until node chrome is migrated. |
| Workbench navigation | `WorkbenchTabs.svelte`, `WorkspaceModeSwitch.svelte` | One state model with vertical/horizontal renderers. |
| Split layout | shadcn `resizable` wrappers over PaneForge | No second split implementation. |
| Search | `GlobalCommandPalette.svelte`, shadcn Command | Global source for commands and indexed entities; explorer filtering remains local. |
| Provider usage data | `usage-store.svelte.ts` | One snapshot, in-flight request, visibility listener, and five-minute timer. |
| Provider usage presentation | `UsagePanel.svelte`, `UsageCanvasNode.svelte`, `WorkbenchUsageFooter.svelte` | Separate density-specific views over the same store. |
| Workspace attachments | `workspace-attachments.ts`, `AttachmentList.svelte` | One upload/link pipeline and one compact attachment list across notes, tasks, and agents. |
| Workspace shell cache | `workspace-view-cache.ts` | Shared short-lived cache prevents blank mode switches without duplicating domain state. |

## Semantic token contract

Workbench surfaces use the existing `--app-*` semantic roles for canvas,
sidebar, surfaces, borders, text, accent, success, warning, and danger. Theme
implementations may change values but must not introduce component-specific
palette branches. Provider marks use the global light-theme asset treatment.

## Acceptance gates

- `npm run build`
- focused Vitest suites for layout, attachments, docs, and tours
- Workbench layout/search/attachment Playwright flows
- six reviewed Workbench visual baselines
- axe with no serious or critical findings
- no document-level overflow at the three supported baseline sizes
