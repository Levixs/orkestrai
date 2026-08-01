<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { GitCompareArrows, RefreshCw, X } from '@lucide/svelte';
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';

  export type DiffNodeData = {
    title: string;
    workspaceId: string;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onOpenFile?: (path: string) => void;
  };

  type GitChange = { path: string; status: string; staged: boolean };

  let { id, data, selected } = $props<NodeProps & { data: DiffNodeData }>();

  let changes = $state<GitChange[]>([]);
  let branch = $state<string | null>(null);
  let isRepo = $state(true);
  let selectedPath = $state<string | null>(null);
  let diffText = $state('');
  let errorMessage = $state('');
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'Falha na API.');
    return payload.data as T;
  }

  async function refresh() {
    try {
      const status = await api<{ isRepo: boolean; branch: string | null; changes: GitChange[] }>(
        `/api/agent-room/workspaces/${data.workspaceId}/git/status`
      );
      changes = status.changes;
      branch = status.branch;
      isRepo = status.isRepo;
      if (selectedPath && !changes.some((change) => change.path === selectedPath)) {
        selectedPath = null;
        diffText = '';
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao ler status.';
    }
  }

  async function openDiff(change: GitChange) {
    selectedPath = change.path;
    errorMessage = '';
    try {
      const result = await api<{ diff: string }>(
        `/api/agent-room/workspaces/${data.workspaceId}/git/diff?path=${encodeURIComponent(change.path)}&staged=${change.staged}`
      );
      diffText = result.diff || '(diff vazio — arquivo novo ou sem alteracoes de conteudo)';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao ler diff.';
    }
  }

  async function gitAction(action: 'stage' | 'unstage' | 'discard', path: string) {
    errorMessage = '';
    try {
      await api(`/api/agent-room/workspaces/${data.workspaceId}/git/${action}`, {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
      await refresh();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : `Falha em ${action}.`;
    }
  }

  function stageChange() {
    const change = changes.find((item) => item.path === selectedPath);
    if (change) gitAction('stage', change.path);
  }

  function statusLabel(change: GitChange): string {
    return change.staged ? change.status + '*' : change.status;
  }

  function lineClass(line: string): string {
    if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-add';
    if (line.startsWith('-') && !line.startsWith('---')) return 'diff-del';
    if (line.startsWith('@@')) return 'diff-hunk';
    if (line.startsWith('diff --git') || line.startsWith('index')) return 'diff-meta';
    return '';
  }

  onMount(() => {
    refresh();
    refreshTimer = setInterval(refresh, 8_000);
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  });
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-diff"
  accent="#7DE5FF"
  minWidth={380}
  minHeight={240}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<GitCompareArrows size={13} />{/snippet}
  {#snippet title()}
    {data.title || 'Diff'}
    {#if branch}
      <span class="branch-badge">{branch}</span>
    {/if}
  {/snippet}
  {#snippet actions()}
    <IconAction label="Recarregar" onclick={refresh}><RefreshCw size={13} /></IconAction>
    <IconAction label="Remover" danger onclick={() => data.onDelete(id)}><X size={13} /></IconAction>
  {/snippet}

  {#if !isRepo}
    <p class="empty">Este workspace nao e um repositorio git.</p>
  {:else}
    <div class="diff-columns nodrag nowheel">
      <aside class="change-list">
        {#each changes as change (change.path + change.staged)}
          <div class="change-row" class:active={selectedPath === change.path}>
            <button class="change-open" onclick={() => openDiff(change)} aria-label="Ver diff">
              <span class="change-status" class:staged={change.staged}>{statusLabel(change)}</span>
              {change.path}
            </button>
            <span class="change-actions">
              {#if change.staged}
                <button aria-label="Unstage" onclick={() => gitAction('unstage', change.path)}>unstage</button>
              {:else}
                <button aria-label="Stage" onclick={() => gitAction('stage', change.path)}>stage</button>
                <button aria-label="Descartar alteracoes" onclick={() => gitAction('discard', change.path)}>descartar</button>
              {/if}
              <button aria-label="Abrir no editor" onclick={() => data.onOpenFile?.(change.path)}>abrir</button>
            </span>
          </div>
        {/each}
        {#if changes.length === 0}
          <p class="empty">Working tree limpo.</p>
        {/if}
      </aside>

      <div class="diff-view">
        {#if selectedPath}
          <p class="diff-path">{selectedPath}</p>
          <pre class="diff-text">{#each diffText.split('\n') as line}<span class={lineClass(line)}>{line}
</span>{/each}</pre>
        {:else}
          <p class="empty">Selecione um arquivo para ver o diff.</p>
        {/if}
      </div>
    </div>
  {/if}
  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}
</NodeShell>

<style>
  .branch-badge {
    font-size: 11px;
    color: #8ec98e;
    background: rgba(142, 201, 142, 0.12);
    padding: 1px 7px;
    border-radius: 8px;
  }

  .diff-columns {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(140px, 38%) 1fr;
  }

  .change-list {
    overflow-y: auto;
    border-right: 1px solid #1e1e26;
    padding: 4px;
  }

  .change-row {
    display: flex;
    align-items: center;
    border-radius: 5px;
  }

  .change-row.active {
    background: #1e1e26;
  }

  .change-open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border: none;
    background: transparent;
    color: #d5d5dc;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .change-status {
    color: #FFC857;
    font-weight: 700;
  }

  .change-status.staged {
    color: #8ec98e;
  }

  .change-actions {
    display: flex;
  }

  .change-actions button {
    border: none;
    background: transparent;
    color: #9a9aa5;
    cursor: pointer;
    font-size: 11px;
    padding: 1px 3px;
  }

  .change-actions button:hover {
    color: #e6e6eb;
  }

  .diff-view {
    overflow: auto;
    padding: 6px;
  }

  .diff-path {
    margin: 0 0 6px;
    font-size: 10px;
    color: #6d6d78;
  }

  .diff-text {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .diff-add {
    color: #8ec98e;
    background: rgba(142, 201, 142, 0.08);
    display: block;
  }

  .diff-del {
    color: #e58a8d;
    background: rgba(229, 72, 77, 0.08);
    display: block;
  }

  .diff-hunk {
    color: #7DE5FF;
    display: block;
  }

  .diff-meta {
    color: #6d6d78;
    display: block;
  }

  .empty {
    color: #6d6d78;
    font-size: 11px;
    padding: 8px;
  }

  .error {
    margin: 0;
    padding: 4px 10px;
    font-size: 11px;
    color: #ffb3b6;
    border-top: 1px solid #1e1e26;
  }
</style>
