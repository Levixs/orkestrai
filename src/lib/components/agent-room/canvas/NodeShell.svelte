<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Handle, NodeResizer, Position, useEdges, useNodes, type NodeProps } from '@xyflow/svelte';
  import * as Popover from '$lib/components/ui/popover';
  import { Link2, X } from '@lucide/svelte';
  import { floatingAnchorFor } from './floating-anchor.js';

  export type NodeConnection = {
    edgeId: string;
    targetId: string;
    targetTitle: string;
    targetType: string;
    direction: 'in' | 'out';
  };

  type Props = {
    id: NodeProps['id'];
    selected: NodeProps['selected'];
    /** Cor de destaque do tipo de no (borda selecionada / dot). */
    accent?: string;
    minWidth?: number;
    minHeight?: number;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    /** Conexoes do no (para o popover de inspecao). */
    connections?: NodeConnection[];
    onJumpToNode?: (nodeId: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
    /** Titulo em texto puro + callback — habilita renomear com duplo-clique. */
    titleText?: string;
    onRename?: (id: string, title: string) => void;
    /** Classe extra no wrapper (ex.: canvas-terminal) — mantida para testes/estilo. */
    class?: string;
    icon: Snippet;
    title: Snippet;
    actions?: Snippet;
    children: Snippet;
  };

  let {
    id,
    selected,
    accent = '#7C4DFF',
    minWidth = 320,
    minHeight = 200,
    onResize,
    connections = [],
    onJumpToNode,
    onRemoveConnection,
    titleText = '',
    onRename,
    class: klass = '',
    icon,
    title,
    actions,
    children,
  }: Props = $props();

  // Renomear inline: duplo-clique no titulo vira input; Enter/blur confirma.
  let editingTitle = $state(false);
  let titleDraft = $state('');

  function startRename() {
    if (!onRename) return;
    titleDraft = titleText;
    editingTitle = true;
  }

  function commitRename() {
    editingTitle = false;
    const next = titleDraft.trim();
    if (next && next !== titleText) onRename?.(id, next);
  }

  const nodesStore = useNodes();
  const edgesStore = useEdges();

  // Handle flutuante: a bolinha desliza pela borda do no ate o ponto mais
  // proximo do vizinho conectado mais perto — a mesma matematica da ancora
  // da corda (OrkestraiEdge), entao a ponta da corda sempre toca a bolinha.
  const floatingAnchor = $derived.by(() => {
    const absolute = floatingAnchorFor(id, nodesStore.current, edgesStore.current);
    if (!absolute) return null;
    const self = nodesStore.current.find((node) => node.id === id);
    if (!self) return null;
    return { x: absolute.x - self.position.x, y: absolute.y - self.position.y };
  });

  const handleStyle = $derived(
    floatingAnchor
      ? `left: ${floatingAnchor.x}px; top: ${floatingAnchor.y}px; right: auto; transform: translate(-50%, -50%);`
      : undefined
  );
</script>

<div class={`node-shell ${klass}`} class:selected style:--accent={accent}>
  <NodeResizer
    isVisible={selected ?? false}
    {minWidth}
    {minHeight}
    onResizeEnd={(_event, params) => onResize?.(id, params)}
    lineStyle="border-color: var(--accent)"
    handleStyle="background: var(--accent)"
  />
  <!-- Handle unico bidirecional (connectionMode Loose), estilo Maestri: sem
       conexoes fica na lateral direita; com conexoes flutua pela borda ate a
       ancora da corda (ver floatingAnchor acima). -->
  <Handle type="source" position={Position.Right} class="node-handle" style={handleStyle} />

  <header class="node-header">
    <span class="node-icon">{@render icon()}</span>
    {#if editingTitle}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="node-title-input nodrag"
        bind:value={titleDraft}
        autofocus
        spellcheck="false"
        onkeydown={(event) => {
          if (event.key === 'Enter') commitRename();
          if (event.key === 'Escape') editingTitle = false;
        }}
        onblur={commitRename}
      />
    {:else}
      <span
        class="node-title"
        class:renamable={Boolean(onRename)}
        aria-label={onRename ? 'Duplo-clique para renomear' : undefined}
        ondblclick={startRename}
        role={onRename ? 'button' : undefined}
      >{@render title()}</span>
    {/if}
    {#if connections.length}
      <Popover.Root>
        <Popover.Trigger class="connections-badge nodrag" aria-label="Conexoes">
          <Link2 size={11} />{connections.length}
        </Popover.Trigger>
        <Popover.Content class="w-56 p-1">
          {#each connections as connection (connection.edgeId)}
            <div class="connection-row">
              <button class="connection-jump" onclick={() => onJumpToNode?.(connection.targetId)}>
                <span class="connection-dir">{connection.direction === 'out' ? '→' : '←'}</span>
                <span class="connection-title">{connection.targetTitle}</span>
                <span class="connection-type">{connection.targetType}</span>
              </button>
              <button class="connection-remove" aria-label="Remover conexao" onclick={() => onRemoveConnection?.(connection.edgeId)}>
                <X size={11} />
              </button>
            </div>
          {/each}
        </Popover.Content>
      </Popover.Root>
    {/if}
    {#if actions}
      <span class="node-actions nodrag">{@render actions()}</span>
    {/if}
  </header>

  <div class="node-body">
    {@render children()}
  </div>
</div>

<style>
  .node-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: #1C1946;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.35),
      0 10px 32px rgba(0, 0, 0, 0.38);
    /* overflow visivel: os handles ficam a cavalo da borda (estilo Maestri)
       e precisam ser clicaveis fora da caixa; o recorte dos cantos fica a
       cargo do header/body. */
    overflow: visible;
    transition: border-color 120ms ease;
  }

  .node-shell.selected {
    border: 1.5px dashed var(--accent);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: #262155;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 13px 13px 0 0;
    color: #d7d8de;
    font-size: 12px;
    font-weight: 500;
    cursor: grab;
    user-select: none;
  }

  .node-header:active {
    cursor: grabbing;
  }

  .node-icon {
    display: inline-flex;
    color: var(--accent);
  }

  .node-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .node-title.renamable {
    cursor: text;
  }

  .node-title-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    color: #e6e6eb;
    font-size: 12px;
    font-weight: 500;
    padding: 2px 6px;
  }

  .node-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .connections-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: none;
    background: rgba(255, 255, 255, 0.07);
    color: #8b8c96;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 8px;
    cursor: pointer;
  }

  .connections-badge:hover {
    color: var(--accent);
  }

  .connection-row {
    display: flex;
    align-items: center;
  }

  .connection-jump {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 7px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #d7d8de;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .connection-jump:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .connection-dir {
    color: #6d6d78;
  }

  .connection-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .connection-type {
    color: #6d6d78;
    font-size: 10px;
  }

  .connection-remove {
    border: none;
    background: transparent;
    color: #6d6d78;
    cursor: pointer;
    padding: 4px;
  }

  .connection-remove:hover {
    color: #e5484d;
  }

  .node-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 0 0 13px 13px;
  }

  .node-shell :global(.node-action-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    padding: 0;
  }

  .node-shell :global(.node-action-btn:hover) {
    background: rgba(255, 255, 255, 0.07);
    color: #e6e6eb;
  }

  .node-shell :global(.node-action-btn.danger:hover) {
    color: #e5484d;
  }

  .node-shell :global(.node-action-btn.active) {
    color: #FFC857;
  }

  .node-shell :global(.node-handle) {
    width: 13px;
    height: 13px;
    z-index: 20;
    background: var(--accent);
    border: 2.5px solid rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35), 0 0 8px var(--accent);
    opacity: 0.95;
    transition: transform 130ms ease, box-shadow 130ms ease;
  }

  .node-shell :global(.node-handle:hover) {
    transform: scale(1.45);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.35), 0 0 14px var(--accent);
  }

  /* area de clique um pouco maior que a bolinha para iniciar conexoes —
     sem exagerar para nao cobrir a corda quando os nos estao proximos */
  .node-shell :global(.node-handle::after) {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
  }
</style>
