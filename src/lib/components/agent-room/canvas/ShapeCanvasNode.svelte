<script lang="ts">
  import HeaderIconButton from './HeaderIconButton.svelte';

  import type { NodeProps } from '@xyflow/svelte';
  import { NodeResizer } from '@xyflow/svelte';
  import { X } from '@lucide/svelte';

  export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond' | 'arrow';

  export type ShapeNodeData = {
    title: string;
    payload: { shape?: ShapeKind; color?: string; label?: string };
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onPayloadChange?: (id: string, partial: Record<string, unknown>) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: ShapeNodeData }>();

  const shape = $derived(data.payload.shape ?? 'rectangle');
  const color = $derived(data.payload.color ?? '#7C4DFF');
  const label = $derived(data.payload.label ?? data.title ?? '');

  let editing = $state(false);
  let draft = $state('');

  function editLabel() {
    draft = label;
    editing = true;
  }

  function commitLabel() {
    editing = false;
    data.onPayloadChange?.(id, { label: draft });
  }

  function handleLabelKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitLabel();
    if (event.key === 'Escape') editing = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="canvas-shape" class:selected ondblclick={editLabel}>
  <NodeResizer isVisible={selected ?? false} minWidth={60} minHeight={40} onResizeEnd={(_e, params) => data.onResize?.(id, params)} />
  {#if selected}
    <HeaderIconButton label="Remover" class="shape-delete nodrag" side="left" onclick={() => data.onDelete(id)}>
      <X size={12} />
    </HeaderIconButton>
  {/if}

  <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="shape-svg">
    {#if shape === 'rectangle'}
      <rect x="2" y="2" width="96" height="96" rx="10" fill="none" stroke={color} stroke-width="2.5" />
    {:else if shape === 'ellipse'}
      <ellipse cx="50" cy="50" rx="48" ry="48" fill="none" stroke={color} stroke-width="2.5" />
    {:else if shape === 'diamond'}
      <polygon points="50,2 98,50 50,98 2,50" fill="none" stroke={color} stroke-width="2.5" />
    {:else if shape === 'arrow'}
      <line x1="4" y1="50" x2="88" y2="50" stroke={color} stroke-width="2.5" />
      <polygon points="84,40 98,50 84,60" fill={color} />
    {/if}
  </svg>
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="shape-label-input nodrag"
      bind:value={draft}
      onkeydown={handleLabelKeydown}
      onblur={commitLabel}
      autofocus
    />
  {:else if label}
    <span class="shape-label" style:color>{label}</span>
  {/if}
</div>

<style>
  .canvas-shape {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .shape-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .shape-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    text-align: center;
    padding: 8px;
    pointer-events: none;
  }

  .shape-label-input {
    position: absolute;
    inset: 30% 10%;
    border: none;
    outline: none;
    background: transparent;
    text-align: center;
    font-size: 12px;
    color: inherit;
  }

  :global(.shape-delete) {
    position: absolute;
    top: -10px;
    right: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: #262155;
    color: #8b8c96;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
  }

  :global(.shape-delete):hover {
    color: #e5484d;
  }
</style>
