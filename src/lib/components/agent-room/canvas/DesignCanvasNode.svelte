<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { Maximize2, Palette, RefreshCw, X } from '@lucide/svelte';
  import NodeShell, { type NodeConnection } from './NodeShell.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import DesignRenderer from '../design/DesignRenderer.svelte';
  import type { DesignDocument } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
  import { resolveDesignElements } from '$lib/modules/agent-room/domain/design-variables.js';
  import * as m from '$lib/paraglide/messages.js';

  export type DesignNodeData = {
    title: string;
    workspaceId: string;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    connections?: NodeConnection[];
    onJumpToNode?: (nodeId: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
    onRename?: (id: string, title: string) => void;
    onOpenWorkbench?: (id: string) => void;
    designRevision?: number;
  };

  let { id, data, selected } = $props<NodeProps & { data: DesignNodeData }>();
  let document = $state<DesignDocument | null>(null);
  let loading = $state(true);
  let failed = $state(false);
  let thumbnailFailed = $state(false);
  let thumbnailAttempt = $state(0);
  let thumbnailRetry: ReturnType<typeof setTimeout> | null = null;
  const page = $derived(document?.pages.find((item) => item.id === document?.activePageId) ?? document?.pages[0] ?? null);
  const elements = $derived(document && page ? resolveDesignElements(document, document.elements.filter((element) => element.pageId === page.id)) : []);

  async function load() {
    loading = true;
    failed = false;
    try {
      const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/designs/${id}`);
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error);
      document = payload.data;
      thumbnailFailed = false;
      thumbnailAttempt = 0;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  function retryThumbnail() {
    thumbnailFailed = true;
    if (thumbnailAttempt >= 6) return;
    if (thumbnailRetry) clearTimeout(thumbnailRetry);
    thumbnailRetry = setTimeout(() => {
      thumbnailAttempt += 1;
      thumbnailFailed = false;
    }, 900);
  }

  onMount(() => {
    void load();
    return () => {
      if (thumbnailRetry) clearTimeout(thumbnailRetry);
    };
  });

  $effect(() => {
    const revision = data.designRevision ?? 0;
    if (!revision || loading || revision <= (document?.revision ?? -1)) return;
    void load();
  });
</script>

<NodeShell
  {id}
  {selected}
  accent="var(--app-secondary)"
  minWidth={360}
  minHeight={260}
  onResize={data.onResize}
  connections={data.connections ?? []}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
  titleText={data.title}
  onRename={data.onRename}
  class="canvas-design"
>
  {#snippet icon()}<Palette size={14} />{/snippet}
  {#snippet title()}{data.title}{/snippet}
  {#snippet actions()}
    <HeaderIconButton label={m['design.edit']()} class="node-action-btn" side="left" onclick={() => data.onOpenWorkbench?.(id)}><Maximize2 size={12} /></HeaderIconButton>
    <HeaderIconButton label={m['usage.refresh']()} class="node-action-btn" side="left" onclick={() => void load()}><RefreshCw size={12} /></HeaderIconButton>
    <HeaderIconButton label={m['settings.delete']()} class="node-action-btn danger" side="left" onclick={() => data.onDelete(id)}><X size={12} /></HeaderIconButton>
  {/snippet}

  <button class="nodrag nowheel relative block h-full min-h-0 w-full overflow-hidden bg-[var(--app-canvas)] text-left" ondblclick={() => data.onOpenWorkbench?.(id)} aria-label={m['design.edit']()}>
    {#if loading}
      <span class="absolute inset-0 grid place-items-center text-xs text-[var(--app-text-muted)]">{m['design.loading']()}</span>
    {:else if failed || !document || !page}
      <span class="absolute inset-0 grid place-items-center text-xs text-[var(--app-danger)]">{m['design.error_load']()}</span>
    {:else}
      {#if !thumbnailFailed}
        <img
          class="h-full w-full object-contain p-4"
          src={`/api/agent-room/workspaces/${data.workspaceId}/designs/${id}/thumbnail?revision=${document.revision}&attempt=${thumbnailAttempt}`}
          alt=""
          onerror={retryThumbnail}
        />
      {:else}
        <svg class="h-full w-full p-4" viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="xMidYMid meet" style:background={page.background}>
          <DesignRenderer {elements} assets={document.assets} workspaceId={data.workspaceId} />
        </svg>
      {/if}
      <span class="absolute right-2 bottom-2 left-2 truncate rounded bg-[var(--app-surface)]/90 px-1.5 py-1 text-[9px] text-[var(--app-text-muted)] shadow-sm">
        {m['design.layers_count']({ count: elements.length })} · {document.components.length} {m['design.components']()} · {document.variables.length} {m['design.tokens']()} · {m['design.revision']({ revision: document.revision })}
      </span>
    {/if}
  </button>
</NodeShell>
