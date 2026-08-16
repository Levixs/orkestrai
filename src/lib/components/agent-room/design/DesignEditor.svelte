<script lang="ts">
  import { onMount } from 'svelte';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import { toast } from '@beeblock/svelar/ui';
  import {
    Circle,
    Eye,
    EyeOff,
    Frame,
    Lock,
    Maximize2,
    MousePointer2,
    Redo2,
    RectangleHorizontal,
    Trash2,
    Type,
    Undo2,
    Unlock,
    ZoomIn,
    ZoomOut,
    ArrowDown,
    ArrowUp,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import type {
    DesignDocument,
    DesignElement,
    DesignElement as Element,
    DesignOperation,
  } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import * as m from '$lib/paraglide/messages.js';
  import DesignRenderer from './DesignRenderer.svelte';

  let {
    workspaceId,
    nodeId,
    externalRevision = 0,
    class: className = '',
  }: {
    workspaceId: string;
    nodeId: string;
    externalRevision?: number;
    class?: string;
  } = $props();

  type Tool = 'select' | 'frame' | 'rectangle' | 'ellipse' | 'text';
  type HistoryEntry = { forward: DesignOperation[]; inverse: DesignOperation[]; summary: string };

  let document = $state<DesignDocument | null>(null);
  let selectedId = $state<string | null>(null);
  let tool = $state<Tool>('select');
  let loading = $state(true);
  let saving = $state(false);
  let errorMessage = $state('');
  let zoom = $state(0.65);
  let viewport = $state<HTMLElement>();
  let editorRoot = $state<HTMLElement>();
  let undoStack = $state<HistoryEntry[]>([]);
  let redoStack = $state<HistoryEntry[]>([]);

  const page = $derived(document?.pages.find((item) => item.id === document?.activePageId) ?? document?.pages[0] ?? null);
  const pageElements = $derived(document && page ? document.elements.filter((element) => element.pageId === page.id) : []);
  const selected = $derived(document?.elements.find((element) => element.id === selectedId) ?? null);

  function uuidv7(): string {
    const timestamp = Date.now().toString(16).padStart(12, '0');
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const variant = ((Number.parseInt(random[3], 16) & 0x3) | 0x8).toString(16);
    return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(7, 19)}`;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const csrf = getCsrfToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      const error = new Error(payload.error || m['design.error_save']()) as Error & { status?: number; data?: DesignDocument };
      error.status = response.status;
      error.data = payload.data;
      throw error;
    }
    return payload.data as T;
  }

  async function load(silent = false) {
    if (!silent) loading = true;
    errorMessage = '';
    try {
      const latest = await api<DesignDocument>(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}`);
      if (!document || latest.revision > document.revision) {
        document = latest;
        selectedId = document.elements.some((element) => element.id === selectedId) ? selectedId : null;
        if (silent) {
          undoStack = [];
          redoStack = [];
        }
      }
    } catch (error) {
      if (!silent) errorMessage = error instanceof Error ? error.message : m['design.error_load']();
    } finally {
      if (!silent) loading = false;
    }
  }

  async function apply(
    operations: DesignOperation[],
    summary: string,
    options: { inverse?: DesignOperation[]; record?: boolean } = {},
  ): Promise<boolean> {
    if (!document || saving) return false;
    saving = true;
    try {
      document = await api<DesignDocument>(`/api/agent-room/workspaces/${workspaceId}/designs/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          baseRevision: document.revision,
          operations,
          summary,
          actor: { kind: 'user', id: null, name: null, taskId: null },
        }),
      });
      if (options.record !== false && options.inverse) {
        undoStack = [...undoStack.slice(-99), { forward: operations, inverse: options.inverse, summary }];
        redoStack = [];
      }
      return true;
    } catch (error) {
      const candidate = error as Error & { status?: number; data?: DesignDocument };
      if (candidate.status === 409 && candidate.data) {
        document = candidate.data;
        selectedId = document.elements.some((element) => element.id === selectedId) ? selectedId : null;
        undoStack = [];
        redoStack = [];
        toast.error(m['design.conflict']());
      } else {
        toast.error(candidate.message || m['design.error_save']());
      }
      return false;
    } finally {
      saving = false;
    }
  }

  function toolLabel(value: Tool): string {
    if (value === 'frame') return m['design.frame']();
    if (value === 'rectangle') return m['design.rectangle']();
    if (value === 'ellipse') return m['design.ellipse']();
    if (value === 'text') return m['design.text']();
    return m['design.select']();
  }

  function elementDefaults(kind: Exclude<Tool, 'select'>, x: number, y: number): DesignElement {
    const count = document?.elements.filter((element) => element.type === kind).length ?? 0;
    const common = {
      id: uuidv7(),
      pageId: page!.id,
      parentId: null,
      type: kind,
      name: `${toolLabel(kind)} ${count + 1}`,
      x,
      y,
      width: kind === 'frame' ? 390 : kind === 'text' ? 240 : 180,
      height: kind === 'frame' ? 844 : kind === 'text' ? 48 : 120,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fill: kind === 'frame' ? '#ffffff' : kind === 'text' ? '#191919' : '#7c5cff',
      stroke: kind === 'frame' ? '#d4d4d0' : 'transparent',
      strokeWidth: kind === 'frame' ? 1 : 0,
      cornerRadius: kind === 'ellipse' ? 0 : 8,
      text: kind === 'text' ? m['design.text']() : '',
      fontSize: kind === 'text' ? 32 : 16,
      fontWeight: kind === 'text' ? 600 : 400,
      textAlign: 'left' as const,
      order: Math.max(-1, ...pageElements.map((element) => element.order)) + 1,
    };
    return common;
  }

  async function canvasPointerDown(event: PointerEvent) {
    if (!page) return;
    if (tool === 'select') {
      const target = (event.target as SVGElement).closest<SVGGElement>('[data-design-element]');
      const element = target ? pageElements.find((item) => item.id === target.dataset.designElement) : null;
      selectedId = element?.id ?? null;
      if (element) startDrag(event, element);
      return;
    }
    const svg = event.currentTarget as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    const x = Math.max(0, Math.round((event.clientX - bounds.left) * page.width / bounds.width));
    const y = Math.max(0, Math.round((event.clientY - bounds.top) * page.height / bounds.height));
    const element = elementDefaults(tool, x, y);
    const operation: DesignOperation = { kind: 'create', element };
    if (await apply([operation], m['design.operation_create']({ type: toolLabel(tool) }), {
      inverse: [{ kind: 'delete', elementId: element.id }],
    })) {
      selectedId = element.id;
      tool = 'select';
    }
  }

  function startDrag(event: PointerEvent, element: Element) {
    if (!document || element.locked || tool !== 'select') return;
    const start = { clientX: event.clientX, clientY: event.clientY, x: element.x, y: element.y };
    const move = (moveEvent: PointerEvent) => {
      if (!document) return;
      const x = Math.round(start.x + (moveEvent.clientX - start.clientX) / zoom);
      const y = Math.round(start.y + (moveEvent.clientY - start.clientY) / zoom);
      document = {
        ...document,
        elements: document.elements.map((item) => item.id === element.id ? { ...item, x, y } : item),
      };
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const moved = document?.elements.find((item) => item.id === element.id);
      if (!moved || (moved.x === start.x && moved.y === start.y)) return;
      await apply(
        [{ kind: 'update', elementId: element.id, changes: { x: moved.x, y: moved.y } }],
        m['design.operation_move']({ name: element.name }),
        { inverse: [{ kind: 'update', elementId: element.id, changes: { x: start.x, y: start.y } }] },
      );
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  async function updateSelected(changes: Partial<DesignElement>, summary = selected?.name ?? '') {
    if (!selected) return;
    const inverse = Object.fromEntries(Object.keys(changes).map((key) => [key, selected[key as keyof DesignElement]])) as Partial<DesignElement>;
    await apply(
      [{ kind: 'update', elementId: selected.id, changes }],
      m['design.operation_update']({ name: summary }),
      { inverse: [{ kind: 'update', elementId: selected.id, changes: inverse }] },
    );
  }

  async function updateElement(element: DesignElement, changes: Partial<DesignElement>) {
    selectedId = element.id;
    const inverse = Object.fromEntries(Object.keys(changes).map((key) => [key, element[key as keyof DesignElement]])) as Partial<DesignElement>;
    await apply(
      [{ kind: 'update', elementId: element.id, changes }],
      m['design.operation_update']({ name: element.name }),
      { inverse: [{ kind: 'update', elementId: element.id, changes: inverse }] },
    );
  }

  async function removeSelected() {
    if (!selected || selected.locked) return;
    const target = structuredClone(selected);
    if (await apply(
      [{ kind: 'delete', elementId: selected.id }],
      m['design.operation_delete']({ name: selected.name }),
      { inverse: [{ kind: 'create', element: target }] },
    )) selectedId = null;
  }

  async function reorder(direction: -1 | 1) {
    if (!selected) return;
    const siblings = pageElements.filter((element) => element.parentId === selected.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((element) => element.id === selected.id);
    const other = siblings[index + direction];
    if (!other) return;
    await apply([
      { kind: 'reorder', elementId: selected.id, order: other.order },
      { kind: 'reorder', elementId: other.id, order: selected.order },
    ], m['design.operation_update']({ name: selected.name }), {
      inverse: [
        { kind: 'reorder', elementId: selected.id, order: selected.order },
        { kind: 'reorder', elementId: other.id, order: other.order },
      ],
    });
  }

  async function undo() {
    const entry = undoStack.at(-1);
    if (!entry) return;
    if (await apply(entry.inverse, m['design.undo'](), { record: false })) {
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, entry];
    }
  }

  async function redo() {
    const entry = redoStack.at(-1);
    if (!entry) return;
    if (await apply(entry.forward, m['design.redo'](), { record: false })) {
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, entry];
    }
  }

  function fitPage() {
    if (!viewport || !page) return;
    zoom = Math.max(0.1, Math.min(1.5, Math.min((viewport.clientWidth - 96) / page.width, (viewport.clientHeight - 96) / page.height)));
  }

  function keyboard(event: KeyboardEvent) {
    if (!editorRoot?.contains(globalThis.document?.activeElement ?? null)) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      void removeSelected();
    }
  }

  function number(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value);
  }

  function focusEditor(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, button, [contenteditable="true"]')) return;
    editorRoot?.focus({ preventScroll: true });
  }

  onMount(() => {
    void load().then(fitPage);
  });

  $effect(() => {
    const revision = externalRevision;
    if (!revision || saving || loading || !document || revision <= document.revision) return;
    void load(true);
  });
</script>

<svelte:window onkeydown={keyboard} />

<div class={`@container/design h-full min-h-0 ${className}`}>
  <div
    bind:this={editorRoot}
    class="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)_236px] grid-rows-[40px_minmax(0,1fr)] overflow-hidden bg-[var(--app-canvas)] text-[var(--app-text)] @max-[620px]:grid-cols-[1fr]"
    aria-label={m['design.mode_aria']()}
    tabindex="-1"
    onpointerdowncapture={focusEditor}
  >
  <header class="col-span-3 flex min-w-0 items-center gap-1 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2 @max-[620px]:col-span-1">
    {#each [
      { id: 'select' as const, icon: MousePointer2 },
      { id: 'frame' as const, icon: Frame },
      { id: 'rectangle' as const, icon: RectangleHorizontal },
      { id: 'ellipse' as const, icon: Circle },
      { id: 'text' as const, icon: Type },
    ] as item (item.id)}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant={tool === item.id ? 'secondary' : 'ghost'} size="icon-sm" aria-label={toolLabel(item.id)} aria-pressed={tool === item.id} onclick={() => (tool = item.id)}>
              <span class="grid place-items-center">
                <item.icon size={16} aria-hidden="true" />
                <span class="sr-only">{toolLabel(item.id)}</span>
              </span>
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{toolLabel(item.id)}</Tooltip.Content>
      </Tooltip.Root>
    {/each}
    <span class="mx-1 h-5 w-px bg-[var(--app-border)]"></span>
    <Button variant="ghost" size="icon-sm" disabled={!undoStack.length || saving} aria-label={m['design.undo']()} onclick={() => void undo()}><Undo2 /></Button>
    <Button variant="ghost" size="icon-sm" disabled={!redoStack.length || saving} aria-label={m['design.redo']()} onclick={() => void redo()}><Redo2 /></Button>
    <div class="min-w-0 flex-1"></div>
    {#if document}
      <span class="hidden text-[10px] text-[var(--app-text-muted)] sm:inline">{m['design.revision']({ revision: document.revision })}</span>
    {/if}
    <Button variant="ghost" size="icon-sm" aria-label={m['design.zoom_out']()} onclick={() => (zoom = Math.max(0.1, zoom - 0.1))}><ZoomOut /></Button>
    <span class="w-11 text-center text-[10px] tabular-nums text-[var(--app-text-muted)]">{Math.round(zoom * 100)}%</span>
    <Button variant="ghost" size="icon-sm" aria-label={m['design.zoom_in']()} onclick={() => (zoom = Math.min(3, zoom + 0.1))}><ZoomIn /></Button>
    <Button variant="ghost" size="icon-sm" aria-label={m['design.fit']()} onclick={fitPage}><Maximize2 /></Button>
  </header>

  <aside class="min-h-0 overflow-y-auto border-r border-[var(--app-border)] bg-[var(--app-surface)] @max-[620px]:hidden">
    <div class="sticky top-0 z-10 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.layers']()}</div>
    {#if loading}
      <p class="p-3 text-xs text-[var(--app-text-muted)]">{m['design.loading']()}</p>
    {:else}
      <div class="flex flex-col-reverse p-1">
        {#each pageElements as element (element.id)}
          <div class={`group flex h-8 items-center gap-1 rounded px-1 ${selectedId === element.id ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]' : 'text-[var(--app-text-soft)] hover:bg-[var(--app-surface-raised)]'}`}>
            <button class="min-w-0 flex-1 truncate px-1 text-left text-[11px]" onclick={() => (selectedId = element.id)}>{element.name}</button>
            <button class="grid size-6 place-items-center text-[var(--app-text-muted)] hover:text-[var(--app-text)]" aria-label={element.visible ? m['design.hide']() : m['design.show']()} onclick={() => void updateElement(element, { visible: !element.visible })}>
              {#if element.visible}<Eye size={12} />{:else}<EyeOff size={12} />{/if}
            </button>
            <button class="grid size-6 place-items-center text-[var(--app-text-muted)] hover:text-[var(--app-text)]" aria-label={element.locked ? m['design.unlock']() : m['design.lock']()} onclick={() => void updateElement(element, { locked: !element.locked })}>
              {#if element.locked}<Lock size={12} />{:else}<Unlock size={12} />{/if}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </aside>

  <main class="relative min-h-0 min-w-0 overflow-auto bg-[var(--app-canvas)]" bind:this={viewport}>
    {#if errorMessage}
      <div class="grid h-full place-items-center p-8 text-center">
        <div><p class="text-sm text-[var(--app-danger)]">{errorMessage}</p><Button class="mt-3" variant="outline" size="sm" onclick={() => void load()}>{m['workspace_access.retry']()}</Button></div>
      </div>
    {:else if loading || !document || !page}
      <div class="grid h-full place-items-center text-xs text-[var(--app-text-muted)]">{m['design.loading']()}</div>
    {:else}
      <div class="min-h-full min-w-full p-12" style:width={`${Math.max(viewport?.clientWidth ?? 0, page.width * zoom + 96)}px`} style:height={`${Math.max(viewport?.clientHeight ?? 0, page.height * zoom + 96)}px`}>
        <svg
          class={`mx-auto block shadow-[0_8px_30px_rgba(0,0,0,0.18)] ${tool === 'select' ? 'cursor-default [&_g[data-design-element]]:cursor-move' : 'cursor-crosshair'}`}
          width={page.width * zoom}
          height={page.height * zoom}
          viewBox={`0 0 ${page.width} ${page.height}`}
          style:background={page.background}
          onpointerdown={canvasPointerDown}
          role="application"
          aria-label={page.name}
        >
          <DesignRenderer elements={pageElements} {selectedId} />
        </svg>
        {#if !pageElements.length}
          <div class="pointer-events-none absolute inset-0 grid place-items-center p-10 text-center text-xs text-[var(--app-text-muted)]">{m['design.empty']()}</div>
        {/if}
      </div>
    {/if}
  </main>

  <aside class="min-h-0 overflow-y-auto border-l border-[var(--app-border)] bg-[var(--app-surface)] @max-[620px]:hidden">
    <div class="sticky top-0 z-10 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['design.properties']()}</div>
    {#if selected}
      <div class="space-y-4 p-3 text-[11px]">
        <label class="block space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.name']()}</span><Input value={selected.name} onchange={(event: Event) => void updateSelected({ name: (event.currentTarget as HTMLInputElement).value })} /></label>
        <section class="space-y-2">
          <h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.position']()}</h3>
          <div class="grid grid-cols-2 gap-2">
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">X</span><Input type="number" value={selected.x} onchange={(event: Event) => void updateSelected({ x: number(event) })} /></label>
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">Y</span><Input type="number" value={selected.y} onchange={(event: Event) => void updateSelected({ y: number(event) })} /></label>
          </div>
        </section>
        <section class="space-y-2">
          <h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.size']()}</h3>
          <div class="grid grid-cols-2 gap-2">
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">W</span><Input type="number" min="1" value={selected.width} onchange={(event: Event) => void updateSelected({ width: Math.max(1, number(event)) })} /></label>
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">H</span><Input type="number" min="1" value={selected.height} onchange={(event: Event) => void updateSelected({ height: Math.max(1, number(event)) })} /></label>
          </div>
        </section>
        <section class="space-y-2">
          <h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.appearance']()}</h3>
          <div class="grid grid-cols-2 gap-2">
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.fill']()}</span><Input type="color" value={selected.fill === 'transparent' ? '#000000' : selected.fill} onchange={(event: Event) => void updateSelected({ fill: (event.currentTarget as HTMLInputElement).value })} /></label>
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.stroke']()}</span><Input type="color" value={selected.stroke === 'transparent' ? '#000000' : selected.stroke} onchange={(event: Event) => void updateSelected({ stroke: (event.currentTarget as HTMLInputElement).value, strokeWidth: selected.strokeWidth || 1 })} /></label>
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.stroke_width']()}</span><Input type="number" min="0" value={selected.strokeWidth} onchange={(event: Event) => void updateSelected({ strokeWidth: Math.max(0, number(event)) })} /></label>
            <label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.radius']()}</span><Input type="number" min="0" value={selected.cornerRadius} onchange={(event: Event) => void updateSelected({ cornerRadius: Math.max(0, number(event)) })} /></label>
            <label class="col-span-2 space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.opacity']()}</span><Input type="number" min="0" max="100" value={Math.round(selected.opacity * 100)} onchange={(event: Event) => void updateSelected({ opacity: Math.max(0, Math.min(1, number(event) / 100)) })} /></label>
          </div>
        </section>
        {#if selected.type === 'text'}
          <section class="space-y-2">
            <h3 class="font-semibold text-[var(--app-text-soft)]">{m['design.content']()}</h3>
            <Textarea value={selected.text} onchange={(event: Event) => void updateSelected({ text: (event.currentTarget as HTMLTextAreaElement).value })} />
            <div class="grid grid-cols-2 gap-2">
              <label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.font_size']()}</span><Input type="number" min="4" value={selected.fontSize} onchange={(event: Event) => void updateSelected({ fontSize: Math.max(4, number(event)) })} /></label>
              <label class="space-y-1"><span class="text-[var(--app-text-muted)]">{m['design.font_weight']()}</span><Input type="number" min="100" max="900" step="100" value={selected.fontWeight} onchange={(event: Event) => void updateSelected({ fontWeight: Math.max(100, Math.min(900, number(event))) })} /></label>
            </div>
          </section>
        {/if}
        <div class="flex items-center gap-1 border-t border-[var(--app-border)] pt-3">
          <Button variant="outline" size="icon-sm" aria-label={m['design.move_down']()} onclick={() => void reorder(-1)}><ArrowDown /></Button>
          <Button variant="outline" size="icon-sm" aria-label={m['design.move_up']()} onclick={() => void reorder(1)}><ArrowUp /></Button>
          <div class="flex-1"></div>
          <Button variant="destructive" size="icon-sm" disabled={selected.locked} aria-label={m['design.delete']()} onclick={() => void removeSelected()}><Trash2 /></Button>
        </div>
      </div>
    {:else}
      <p class="p-3 text-xs leading-5 text-[var(--app-text-muted)]">{m['design.no_selection']()}</p>
    {/if}
  </aside>
  </div>
</div>
