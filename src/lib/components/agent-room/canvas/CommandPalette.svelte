<script lang="ts">
  import type { Node } from '@xyflow/svelte';

  export type PaletteAction = {
    id: string;
    label: string;
    hint?: string;
    run: () => void;
  };

  type Props = {
    nodes: Node[];
    actions: PaletteAction[];
    onJumpToNode: (nodeId: string) => void;
    onClose: () => void;
  };

  let { nodes, actions, onJumpToNode, onClose }: Props = $props();

  let query = $state('');
  let selectedIndex = $state(0);
  let inputEl: HTMLInputElement;

  type Item = { kind: 'node' | 'action'; id: string; label: string; hint: string };

  const items = $derived.by<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const nodeItems: Item[] = nodes.map((node) => ({
      kind: 'node',
      id: node.id,
      label: String(node.data?.title ?? node.type ?? 'no'),
      hint: `ir para ${node.type}`,
    }));
    const actionItems: Item[] = actions.map((action) => ({
      kind: 'action',
      id: action.id,
      label: action.label,
      hint: action.hint ?? 'acao',
    }));
    const all = [...actionItems, ...nodeItems];
    if (!q) return all;
    return all.filter((item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  });

  function choose(item: Item) {
    if (item.kind === 'node') {
      onJumpToNode(item.id);
    } else {
      actions.find((action) => action.id === item.id)?.run();
    }
    onClose();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[selectedIndex] ?? items[0];
      if (item) choose(item);
    }
  }

  $effect(() => {
    inputEl?.focus();
  });

  $effect(() => {
    query;
    selectedIndex = 0;
  });
</script>

<div class="palette-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && onClose()}>
  <div class="palette" role="dialog" aria-label="Paleta de comandos">
    <input
      bind:this={inputEl}
      bind:value={query}
      onkeydown={handleKeydown}
      placeholder="Buscar noes e acoes..."
      class="palette-input"
    />
    <ul class="palette-list">
      {#each items as item, index (item.kind + item.id)}
        <li>
          <button class:active={index === selectedIndex} onclick={() => choose(item)}>
            <span class="item-kind">{item.kind === 'node' ? '◈' : '⚡'}</span>
            <span class="item-label">{item.label}</span>
            <span class="item-hint">{item.hint}</span>
          </button>
        </li>
      {:else}
        <li class="empty">Nada encontrado.</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    z-index: 200;
  }

  .palette {
    width: 480px;
    max-width: 92vw;
    background: #1A1742;
    border: 1px solid #2c2c36;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  }

  .palette-input {
    width: 100%;
    padding: 12px 14px;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 14px;
    border-bottom: 1px solid #2c2c36;
    box-sizing: border-box;
  }

  .palette-list {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 320px;
    overflow-y: auto;
  }

  .palette-list button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #e6e6eb;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }

  .palette-list button.active,
  .palette-list button:hover {
    background: #26262f;
  }

  .item-kind {
    color: #7DE5FF;
  }

  .item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-hint {
    color: #6d6d78;
    font-size: 11px;
  }

  .empty {
    padding: 10px;
    color: #6d6d78;
    font-size: 12px;
  }
</style>
