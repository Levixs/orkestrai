<script lang="ts">
  import HeaderIconButton from './HeaderIconButton.svelte';

  import type { NodeProps } from '@xyflow/svelte';
  import { Group, Ungroup } from '@lucide/svelte';
  import * as m from '$lib/paraglide/messages.js';

  export type GroupNodeData = {
    title: string;
    payload: { members?: string[] };
    onRename: (id: string, title: string) => void;
    onUngroup: (id: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: GroupNodeData }>();

  let editing = $state(false);
  let draft = $state('');

  function startRename() {
    draft = data.title;
    editing = true;
  }

  function commitRename() {
    editing = false;
    if (draft.trim() && draft.trim() !== data.title) {
      data.onRename(id, draft.trim());
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') editing = false;
  }
</script>

<div class="canvas-group" class:selected>
  <header class="group-header" ondblclick={startRename} role="presentation">
    <Group size={12} />
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="group-rename nodrag"
        bind:value={draft}
        onkeydown={handleKeydown}
        onblur={commitRename}
        autofocus
      />
    {:else}
      <span class="group-title">{data.title}</span>
    {/if}
    <HeaderIconButton label={m['group.ungroup']()} class="group-ungroup nodrag" side="left" onclick={() => data.onUngroup(id)}>
      <Ungroup size={12} />
    </HeaderIconButton>
  </header>
</div>

<style>
  .canvas-group {
    width: 100%;
    height: 100%;
    border: 1.5px dashed rgba(122, 165, 248, 0.5);
    border-radius: 16px;
    background: rgba(122, 165, 248, 0.05);
    position: relative;
  }

  .canvas-group.selected {
    border-color: #7DE5FF;
  }

  .group-header {
    position: absolute;
    top: -14px;
    left: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: #262155;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #c7c8d0;
    font-size: 11px;
    font-weight: 500;
    cursor: grab;
    user-select: none;
  }

  .group-rename {
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font-size: 11px;
    width: 120px;
  }

  :global(.group-ungroup) {
    border: none;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    display: inline-flex;
    padding: 0;
  }

  :global(.group-ungroup):hover {
    color: #e5484d;
  }
</style>
