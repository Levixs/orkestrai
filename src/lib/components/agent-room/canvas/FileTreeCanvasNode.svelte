<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { ArrowUp, File, Folder, FolderTree, GitBranch, GitCommitHorizontal, RefreshCw, Search, X } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';

  export type FileTreeNodeData = {
    title: string;
    workspaceId: string;
    payload: { path?: string };
    onDelete: (id: string) => void;
    onOpenFile: (path: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
  };

  type FsEntry = { name: string; path: string; type: 'file' | 'directory'; size: number };
  type GitChange = { path: string; status: string; staged: boolean };

  let { id, data, selected } = $props<NodeProps & { data: FileTreeNodeData }>();

  let entries = $state<FsEntry[]>([]);
  let changes = $state<GitChange[]>([]);
  let branch = $state<string | null>(null);
  let currentPath = $state(data.payload.path ?? '');
  let errorMessage = $state('');
  let branches = $state<string[]>([]);
  let commitOpen = $state(false);
  let commitMessage = $state('');
  let branchOpen = $state(false);
  let newBranchName = $state('');
  let searchQuery = $state('');
  let searchResults = $state<Array<{ path: string; line?: number; preview?: string }> | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let graphMode = $state(false);
  let graphText = $state('');

  async function toggleGraph() {
    graphMode = !graphMode;
    if (graphMode) {
      try {
        const result = await api<{ graph: string }>(`/api/agent-room/workspaces/${data.workspaceId}/git/graph`);
        graphText = result.graph || '(sem commits)';
      } catch {
        graphText = '(falha ao ler historico)';
      }
    }
  }

  async function api<T>(path: string): Promise<T> {
    const response = await fetch(path);
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'Falha na API.');
    return payload.data as T;
  }

  async function refresh() {
    errorMessage = '';
    try {
      const [list, status] = await Promise.all([
        api<FsEntry[]>(`/api/agent-room/workspaces/${data.workspaceId}/fs/list?path=${encodeURIComponent(currentPath)}`),
        api<{ isRepo: boolean; branch: string | null; changes: GitChange[] }>(
          `/api/agent-room/workspaces/${data.workspaceId}/git/status`
        ),
      ]);
      entries = list;
      changes = status.changes;
      branch = status.branch;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao listar.';
    }
  }

  function statusFor(entry: FsEntry): string | null {
    const change = changes.find((item) => item.path === entry.name || entry.path.endsWith(`/${item.path}`));
    return change ? (change.staged ? `${change.status}*` : change.status) : null;
  }

  function openEntry(entry: FsEntry) {
    if (entry.type === 'directory') {
      currentPath = entry.path;
      refresh();
    } else {
      data.onOpenFile(entry.path);
    }
  }

  async function post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'Falha na API.');
    return payload.data as T;
  }

  async function gitActionLabel(action: string, fn: () => Promise<unknown>) {
    errorMessage = '';
    try {
      await fn();
      await refresh();
    } catch (error) {
      errorMessage = `${action}: ${error instanceof Error ? error.message : 'falhou'}`;
    }
  }

  const doCommit = () => gitActionLabel('commit', async () => {
    await post(`/api/agent-room/workspaces/${data.workspaceId}/git/commit`, { message: commitMessage });
    commitMessage = '';
    commitOpen = false;
  });

  const doPull = () => gitActionLabel('pull', () => post(`/api/agent-room/workspaces/${data.workspaceId}/git/pull`));
  const doPush = () => gitActionLabel('push', () => post(`/api/agent-room/workspaces/${data.workspaceId}/git/push`));
  const doStash = () => gitActionLabel('stash', () => post(`/api/agent-room/workspaces/${data.workspaceId}/git/stash`));
  const doStashPop = () => gitActionLabel('stash pop', () => post(`/api/agent-room/workspaces/${data.workspaceId}/git/stash`, { pop: true }));

  async function loadBranches() {
    try {
      branches = await api<string[]>(`/api/agent-room/workspaces/${data.workspaceId}/git/branches`);
    } catch {
      branches = [];
    }
  }

  const doCheckout = (name: string) => gitActionLabel('checkout', () => post(`/api/agent-room/workspaces/${data.workspaceId}/git/checkout`, { branch: name }));

  const doCreateBranch = () => gitActionLabel('nova branch', async () => {
    await post(`/api/agent-room/workspaces/${data.workspaceId}/git/branch`, { branch: newBranchName });
    newBranchName = '';
    branchOpen = false;
    await loadBranches();
  });

  function handleSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    if (!searchQuery.trim()) {
      searchResults = null;
      return;
    }
    searchTimer = setTimeout(async () => {
      const byContent = searchQuery.startsWith('>');
      const needle = byContent ? searchQuery.slice(1) : searchQuery;
      if (!needle.trim()) {
        searchResults = null;
        return;
      }
      searchResults = await api<Array<{ path: string; line?: number; preview?: string }>>(
        `/api/agent-room/workspaces/${data.workspaceId}/fs/search?q=${encodeURIComponent(needle)}&content=${byContent}`
      );
    }, 350);
  }

  function openSearchResult(result: { path: string }) {
    data.onOpenFile(result.path);
    searchResults = null;
    searchQuery = '';
  }

  function goUp() {
    if (!currentPath) return;
    const parts = currentPath.replace(/\/+$/, '').split('/');
    parts.pop();
    currentPath = parts.join('/');
    refresh();
  }

  onMount(() => {
    refresh();
    loadBranches();
    refreshTimer = setInterval(refresh, 10_000);
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  });
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-filetree"
  accent="#8ec98e"
  minWidth={260}
  minHeight={200}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<FolderTree size={13} />{/snippet}
  {#snippet title()}
    {data.title || 'Arquivos'}
    {#if branch}
      <span class="branch-badge"><GitBranch size={10} /> {branch}</span>
    {/if}
  {/snippet}
  {#snippet actions()}
    {#if branch}
      <IconAction label={graphMode ? 'Ver arquivos' : 'Ver grafo de commits'} onclick={toggleGraph}>
        <GitCommitHorizontal size={13} />
      </IconAction>
    {/if}
    <IconAction label="Voltar" disabled={!currentPath} onclick={goUp}><ArrowUp size={13} /></IconAction>
    <IconAction label="Recarregar" onclick={refresh}><RefreshCw size={13} /></IconAction>
    <IconAction label="Remover" danger onclick={() => data.onDelete(id)}><X size={13} /></IconAction>
  {/snippet}

  {#if currentPath && !graphMode}
    <p class="current-path">{currentPath.split('/').slice(-2).join('/')}</p>
  {/if}

  {#if graphMode}
    <div class="graph-view nodrag nowheel">
      <pre>{graphText}</pre>
    </div>
  {/if}

  <div class="tree-search nodrag">
    <Search size={11} />
    <input
      bind:value={searchQuery}
      oninput={handleSearch}
      placeholder="Buscar nome... (> conteudo)"
      spellcheck="false"
    />
  </div>
  {#if searchResults}
    <div class="search-results nodrag nowheel">
      {#each searchResults as result}
        <button class="search-result" onclick={() => openSearchResult(result)}>
          <span class="result-path">{result.path.split('/').slice(-2).join('/')}{result.line ? `:${result.line}` : ''}</span>
          {#if result.preview}
            <span class="result-preview">{result.preview}</span>
          {/if}
        </button>
      {:else}
        <p class="empty">Nada encontrado.</p>
      {/each}
    </div>
  {/if}

  <div class="tree-body nodrag nowheel" class:hidden={graphMode}>
    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}
    {#each entries as entry (entry.path)}
      <button class="tree-entry" ondblclick={() => openEntry(entry)} onclick={() => entry.type === 'directory' && openEntry(entry)}>
        <span class="entry-icon">
          {#if entry.type === 'directory'}<Folder size={12} />{:else}<File size={12} />{/if}
        </span>
        <span class="entry-name">{entry.name}</span>
        {#if statusFor(entry)}
          <span class="entry-status">{statusFor(entry)}</span>
        {/if}
      </button>
    {/each}
    {#if entries.length === 0 && !errorMessage}
      <p class="empty">Diretorio vazio.</p>
    {/if}
  </div>
</NodeShell>

<Dialog.Root open={commitOpen} onOpenChange={(open) => !open && (commitOpen = false)}>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Commit</Dialog.Title>
      <Dialog.Description>Mensagem do commit em {branch}.</Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3">
      <Input bind:value={commitMessage} placeholder="Mensagem do commit" />
      {#if errorMessage}
        <p class="text-sm text-destructive">{errorMessage}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (commitOpen = false)}>Cancelar</Button>
      <Button onclick={doCommit} disabled={!commitMessage.trim()}>Commit</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={branchOpen} onOpenChange={(open) => !open && (branchOpen = false)}>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Nova branch</Dialog.Title>
      <Dialog.Description>Cria e muda para a nova branch.</Dialog.Description>
    </Dialog.Header>
    <div class="space-y-3">
      <Input bind:value={newBranchName} placeholder="minha-branch" />
      {#if errorMessage}
        <p class="text-sm text-destructive">{errorMessage}</p>
      {/if}
    </div>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (branchOpen = false)}>Cancelar</Button>
      <Button onclick={doCreateBranch} disabled={!newBranchName.trim()}>Criar</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .git-menu-trigger {
    display: inline-flex;
    align-items: center;
    border: none;
    background: transparent;
    color: #8ec98e;
    cursor: pointer;
    padding: 2px;
    border-radius: 5px;
  }

  .git-menu-trigger:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .tree-search {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: #6d6d78;
  }

  .tree-search input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: #d5d5dc;
    font-size: 11px;
  }

  .search-results {
    max-height: 160px;
    overflow-y: auto;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .search-result {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 4px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .search-result:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .result-path {
    font-size: 11px;
    color: #7DE5FF;
  }

  .result-preview {
    font-size: 10px;
    color: #6d6d78;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .graph-view {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 10px;
  }

  .graph-view pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    color: #c9d8f0;
  }

  .hidden {
    display: none;
  }

  .branch-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 400;
    color: #8ec98e;
    background: rgba(142, 201, 142, 0.12);
    padding: 1px 7px;
    border-radius: 8px;
    margin-left: 6px;
  }

  .current-path {
    margin: 0;
    padding: 3px 10px;
    font-size: 10px;
    color: #6d6d78;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .tree-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px;
  }

  .tree-entry {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 6px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #d5d5dc;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .tree-entry:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .entry-icon {
    display: inline-flex;
    color: #8b8c96;
  }

  .entry-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-status {
    font-size: 10px;
    color: #FFC857;
    font-weight: 600;
  }

  .error {
    color: #ffb3b6;
    font-size: 11px;
    padding: 6px;
  }

  .empty {
    color: #6d6d78;
    font-size: 11px;
    padding: 6px;
  }
</style>
