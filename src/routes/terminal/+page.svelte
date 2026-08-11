<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import { toast } from '@beeblock/svelar/ui';
  import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    FileCode2,
    FolderTree,
    Gauge,
    GitCompareArrows,
    Globe2,
    Image as ImageIcon,
    Network,
    Repeat2,
    Search,
    SquareKanban,
    SquareTerminal,
    StickyNote,
    Workflow,
  } from '@lucide/svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as InputGroup from '$lib/components/ui/input-group';
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import FocusedCanvasNode from '$lib/components/agent-room/FocusedCanvasNode.svelte';
  import {
    LEADER_DICTATION_COMMAND,
    LEADER_DICTATION_STATE,
    type LeaderDictationStateDetail,
    type LeaderDictationStatus,
  } from '$lib/components/agent-room/leader-dictation.js';
  import { TEXT_DICTATION_FALLBACK, type TextDictationFallbackDetail } from '$lib/components/agent-room/text-dictation.js';
  import WorkspaceIcon from '$lib/components/agent-room/WorkspaceIcon.svelte';
  import WorkspaceModeSwitch from '$lib/components/agent-room/WorkspaceModeSwitch.svelte';
  import type {
    AgentProviderInfo,
    CanvasEdge,
    CanvasNode,
    CanvasNodeType,
    Floor,
    TerminalNodePayload,
    Workspace,
  } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  const BROWSABLE_TYPES = new Set<CanvasNodeType>([
    'terminal',
    'tasks',
    'note',
    'portal',
    'fileTree',
    'editor',
    'diff',
    'image',
    'flow',
    'loop',
    'usage',
  ]);

  let workspaces = $state<Workspace[]>([]);
  let nodesByWorkspace = $state<Record<string, CanvasNode[]>>({});
  let edgesByWorkspace = $state<Record<string, CanvasEdge[]>>({});
  let floorsByWorkspace = $state<Record<string, Floor[]>>({});
  let providers = $state<AgentProviderInfo[]>([]);
  let activity = $state<Record<string, number>>({});
  let expandedWorkspaceIds = $state<string[]>([]);
  let selectedWorkspaceId = $state<string | null>(null);
  let selectedNodeId = $state<string | null>(null);
  let deletingNode = $state<CanvasNode | null>(null);
  let query = $state('');
  let loading = $state(true);
  let errorMessage = $state('');
  let leaderDictationState = $state<LeaderDictationStatus>('idle');
  let leaderDictationNodeId = $state<string | null>(null);

  const selectedWorkspace = $derived(workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null);
  const selectedNode = $derived(
    selectedWorkspaceId && selectedNodeId
      ? (nodesByWorkspace[selectedWorkspaceId] ?? []).find((node) => node.id === selectedNodeId) ?? null
      : null
  );

  function browsableNodes(workspaceId: string): CanvasNode[] {
    const normalized = query.trim().toLocaleLowerCase();
    return (nodesByWorkspace[workspaceId] ?? [])
      .filter((node) => BROWSABLE_TYPES.has(node.type))
      .filter((node) => {
        if (!normalized) return true;
        const payload = node.payload as { provider?: string; path?: string; url?: string; role?: string };
        return [node.title, node.type, payload.provider, payload.path, payload.url, payload.role]
          .some((value) => String(value ?? '').toLocaleLowerCase().includes(normalized));
      })
      .sort((a, b) => {
        if (a.type === 'terminal' && b.type !== 'terminal') return -1;
        if (a.type !== 'terminal' && b.type === 'terminal') return 1;
        return String(a.title ?? a.type).localeCompare(String(b.title ?? b.type));
      });
  }

  const visibleWorkspaces = $derived.by(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return workspaces;
    return workspaces.filter((workspace) =>
      workspace.name.toLocaleLowerCase().includes(normalized) || browsableNodes(workspace.id).length > 0
    );
  });

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
    if (!response.ok || payload.error) throw new Error(payload.error || m['canvas.error_api']());
    return payload.data as T;
  }

  async function loadWorkspace(workspaceId: string) {
    const [nodes, edges, floors] = await Promise.all([
      api<CanvasNode[]>(`/api/agent-room/workspaces/${workspaceId}/nodes`),
      api<CanvasEdge[]>(`/api/agent-room/workspaces/${workspaceId}/edges`),
      api<Floor[]>(`/api/agent-room/workspaces/${workspaceId}/floors`).catch(() => []),
    ]);
    nodesByWorkspace = { ...nodesByWorkspace, [workspaceId]: nodes };
    edgesByWorkspace = { ...edgesByWorkspace, [workspaceId]: edges };
    floorsByWorkspace = { ...floorsByWorkspace, [workspaceId]: floors };

    if (selectedWorkspaceId === workspaceId && selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      selectedNodeId = browsableNodes(workspaceId)[0]?.id ?? null;
    }
  }

  function persistSelection() {
    if (selectedWorkspaceId) localStorage.setItem('orkestrai.activeWorkspaceId', selectedWorkspaceId);
    const params = new URLSearchParams();
    if (selectedWorkspaceId) params.set('workspace', selectedWorkspaceId);
    if (selectedNodeId) params.set('node', selectedNodeId);
    history.replaceState(null, '', `/terminal${params.size ? `?${params}` : ''}`);
  }

  function selectNode(workspaceId: string, nodeId: string) {
    if (selectedWorkspaceId !== workspaceId) {
      leaderDictationState = 'idle';
      leaderDictationNodeId = null;
    }
    selectedWorkspaceId = workspaceId;
    selectedNodeId = nodeId;
    if (!expandedWorkspaceIds.includes(workspaceId)) expandedWorkspaceIds = [...expandedWorkspaceIds, workspaceId];
    persistSelection();
  }

  function toggleWorkspace(workspaceId: string) {
    if (expandedWorkspaceIds.includes(workspaceId)) {
      expandedWorkspaceIds = expandedWorkspaceIds.filter((id) => id !== workspaceId);
      return;
    }
    expandedWorkspaceIds = [...expandedWorkspaceIds, workspaceId];
  }

  function updateNode(updated: CanvasNode) {
    const current = nodesByWorkspace[updated.workspaceId] ?? [];
    nodesByWorkspace = {
      ...nodesByWorkspace,
      [updated.workspaceId]: current.map((node) => node.id === updated.id ? updated : node),
    };
  }

  function addNode(created: CanvasNode) {
    nodesByWorkspace = {
      ...nodesByWorkspace,
      [created.workspaceId]: [...(nodesByWorkspace[created.workspaceId] ?? []), created],
    };
  }

  async function confirmDeleteNode() {
    const target = deletingNode;
    deletingNode = null;
    if (!target) return;
    await api(`/api/agent-room/workspaces/${target.workspaceId}/nodes/${target.id}`, { method: 'DELETE' });
    const remaining = (nodesByWorkspace[target.workspaceId] ?? []).filter((node) => node.id !== target.id);
    nodesByWorkspace = { ...nodesByWorkspace, [target.workspaceId]: remaining };
    if (selectedNodeId === target.id) {
      selectedNodeId = remaining.find((node) => BROWSABLE_TYPES.has(node.type))?.id ?? null;
      persistSelection();
    }
  }

  function nodeTypeLabel(node: CanvasNode): string {
    if (node.type === 'terminal') {
      const payload = node.payload as TerminalNodePayload;
      return providers.find((provider) => provider.id === payload.provider)?.displayName ?? m['terminal_browser.kind_terminal']();
    }
    if (node.type === 'tasks') return m['terminal_browser.kind_tasks']();
    if (node.type === 'note') return m['terminal_browser.kind_note']();
    if (node.type === 'portal') return m['terminal_browser.kind_portal']();
    if (node.type === 'fileTree') return m['terminal_browser.kind_files']();
    if (node.type === 'editor') return m['terminal_browser.kind_editor']();
    if (node.type === 'diff') return m['terminal_browser.kind_diff']();
    if (node.type === 'image') return m['terminal_browser.kind_image']();
    if (node.type === 'flow') return m['terminal_browser.kind_flow']();
    if (node.type === 'loop') return m['terminal_browser.kind_loop']();
    if (node.type === 'usage') return m['terminal_browser.kind_usage']();
    return node.type;
  }

  function handleKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === '1') {
      event.preventDefault();
      location.assign(selectedWorkspaceId ? `/canvas?workspace=${selectedWorkspaceId}${selectedNodeId ? `&node=${selectedNodeId}` : ''}` : '/canvas');
    }
  }

  function dispatchLeaderDictation(nodeId: string) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(LEADER_DICTATION_COMMAND, { detail: { nodeId } }));
    });
  }

  async function toggleLeaderDictation() {
    const workspaceId = selectedWorkspaceId;
    if (!workspaceId || leaderDictationState === 'transcribing') return;
    if (leaderDictationState === 'recording' && leaderDictationNodeId) {
      dispatchLeaderDictation(leaderDictationNodeId);
      return;
    }

    let workspaceNodes: CanvasNode[];
    try {
      workspaceNodes = await api<CanvasNode[]>(`/api/agent-room/workspaces/${workspaceId}/nodes`);
      nodesByWorkspace = { ...nodesByWorkspace, [workspaceId]: workspaceNodes };
    } catch {
      toast.error(m['leader_dictation.error']());
      return;
    }

    const leader = workspaceNodes.find(
      (node) => node.type === 'terminal' && Boolean((node.payload as TerminalNodePayload).maestro)
    );
    if (!leader) {
      leaderDictationState = 'idle';
      leaderDictationNodeId = null;
      toast.error(m['leader_dictation.no_leader']());
      return;
    }

    leaderDictationNodeId = leader.id;
    if (selectedNodeId !== leader.id) {
      selectNode(workspaceId, leader.id);
      await tick();
    }
    dispatchLeaderDictation(leader.id);
  }

  onMount(() => {
    const handleDictationState = (event: Event) => {
      const detail = (event as CustomEvent<LeaderDictationStateDetail>).detail;
      if (!detail) return;
      if (detail.nodeId !== leaderDictationNodeId) {
        const source = selectedWorkspaceId
          ? (nodesByWorkspace[selectedWorkspaceId] ?? []).find((node) => node.id === detail.nodeId)
          : null;
        if (source?.type !== 'terminal' || !(source.payload as TerminalNodePayload).maestro) return;
        leaderDictationNodeId = detail.nodeId;
      }
      leaderDictationState = detail.status;
    };
    const handleFallback = (event: Event) => {
      const detail = (event as CustomEvent<TextDictationFallbackDetail>).detail;
      if (!detail || !selectedWorkspaceId) return;
      detail.handled = true;
      void toggleLeaderDictation();
    };
    window.addEventListener(LEADER_DICTATION_STATE, handleDictationState);
    window.addEventListener(TEXT_DICTATION_FALLBACK, handleFallback);
    return () => {
      window.removeEventListener(LEADER_DICTATION_STATE, handleDictationState);
      window.removeEventListener(TEXT_DICTATION_FALLBACK, handleFallback);
    };
  });

  onMount(() => {
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let activityTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshActivity = async () => {
      activity = await api<Record<string, number>>('/api/agent-room/workspaces/activity').catch(() => ({}));
    };

    const connectEvents = () => {
      if (destroyed) return;
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${location.host}/ws/agent-room/pty`);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type !== 'workspaceChanged' || !message.workspaceId) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void loadWorkspace(String(message.workspaceId)), 200);
        } catch {
          // Frames PTY não relacionados não fazem parte deste explorer.
        }
      };
      socket.onclose = () => {
        if (!destroyed) reconnectTimer = setTimeout(connectEvents, 3_000);
      };
    };

    const initialize = async () => {
      try {
        const [workspaceList, status] = await Promise.all([
          api<Workspace[]>('/api/agent-room/workspaces'),
          api<{ providers: AgentProviderInfo[] }>('/api/agent-room/status'),
        ]);
        if (destroyed) return;
        workspaces = workspaceList;
        providers = status.providers ?? [];
        await Promise.all(workspaceList.map((workspace) => loadWorkspace(workspace.id)));
        if (destroyed) return;
        await refreshActivity();

        const params = new URLSearchParams(location.search);
        const requestedWorkspace = params.get('workspace') || localStorage.getItem('orkestrai.activeWorkspaceId');
        const initialWorkspace = workspaceList.find((workspace) => workspace.id === requestedWorkspace) ?? workspaceList[0] ?? null;
        selectedWorkspaceId = initialWorkspace?.id ?? null;
        expandedWorkspaceIds = initialWorkspace ? [initialWorkspace.id] : [];
        if (initialWorkspace) {
          const requestedNode = params.get('node');
          const candidates = (nodesByWorkspace[initialWorkspace.id] ?? []).filter((node) => BROWSABLE_TYPES.has(node.type));
          selectedNodeId = candidates.find((node) => node.id === requestedNode)?.id
            ?? candidates.find((node) => node.type === 'terminal' && Boolean((node.payload as TerminalNodePayload).maestro))?.id
            ?? candidates[0]?.id
            ?? null;
          persistSelection();
        }
        connectEvents();
        activityTimer = setInterval(refreshActivity, 10_000);
      } catch (error) {
        if (!destroyed) errorMessage = error instanceof Error ? error.message : m['terminal_browser.load_error']();
      } finally {
        if (!destroyed) loading = false;
      }
    };

    void initialize();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (activityTimer) clearInterval(activityTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  });
</script>

<svelte:head>
  <title>Orkestrai - {m['workspace_view.terminals']()}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-[var(--app-canvas)] text-[var(--app-text)] max-[720px]:grid-cols-[220px_minmax(360px,1fr)]">
  <aside class="flex min-h-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-sidebar)]">
    <div class="flex h-12 shrink-0 items-center border-b border-[var(--app-border)] px-3">
      <WorkspaceModeSwitch active="terminals" workspaceId={selectedWorkspaceId} nodeId={selectedNodeId} />
    </div>

    <div class="shrink-0 p-2.5">
      <InputGroup.Root class="h-8 border-[var(--app-border)] bg-[var(--app-canvas)] shadow-none">
        <InputGroup.Addon><Search size={13} /></InputGroup.Addon>
        <InputGroup.Input
          bind:value={query}
          data-testid="terminal-workspace-search"
          placeholder={m['terminal_browser.search_placeholder']()}
          aria-label={m['terminal_browser.search_aria']()}
          autocomplete="off"
          spellcheck="false"
        />
      </InputGroup.Root>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3" data-testid="terminal-workspace-tree">
      {#if loading}
        <div class="space-y-2 px-1 py-1">
          {#each [0, 1, 2, 3] as item (item)}
            <Skeleton class="h-8 w-full bg-[var(--app-surface-raised)]" />
          {/each}
        </div>
      {:else if errorMessage}
        <p class="px-3 py-4 text-xs leading-5 text-[var(--app-danger)]">{errorMessage}</p>
      {:else}
        {#each visibleWorkspaces as workspace (workspace.id)}
          {@const workspaceNodes = browsableNodes(workspace.id)}
          {@const expanded = expandedWorkspaceIds.includes(workspace.id) || Boolean(query.trim())}
          <section class="mb-0.5">
            <button
              class="group flex h-8 w-full items-center gap-1.5 rounded-[5px] px-1.5 text-left text-xs text-[var(--app-text-soft)] transition-[background-color,color] hover:bg-[var(--app-surface-raised)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
              aria-expanded={expanded}
              onclick={() => toggleWorkspace(workspace.id)}
            >
              {#if expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
              <WorkspaceIcon name={workspace.icon} size={14} />
              <span class="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
              {#if activity[workspace.id]}
                <span class="h-1.5 w-1.5 rounded-full bg-[var(--app-success)]" role="status" aria-label={m['canvas.active_sessions_aria']({ count: activity[workspace.id] })}></span>
              {/if}
              <span class="min-w-5 text-right text-[10px] tabular-nums text-[var(--app-text-muted)]">{workspaceNodes.length}</span>
            </button>

            {#if expanded}
              <div class="ml-3 border-l border-[var(--app-border)] py-0.5 pl-1.5">
                {#each workspaceNodes as item (item.id)}
                  <button
                    class={`flex h-8 w-full items-center gap-2 rounded-[5px] px-2 text-left text-[11px] transition-[background-color,color] hover:bg-[var(--app-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${selectedNodeId === item.id ? 'bg-[var(--app-accent-soft)] text-[var(--app-text)]' : 'text-[var(--app-text-soft)]'}`}
                    aria-current={selectedNodeId === item.id ? 'page' : undefined}
                    onclick={() => selectNode(workspace.id, item.id)}
                  >
                    <span class={`shrink-0 ${selectedNodeId === item.id ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-muted)]'}`}>
                      {#if item.type === 'terminal'}<SquareTerminal size={13} />
                      {:else if item.type === 'tasks'}<SquareKanban size={13} />
                      {:else if item.type === 'note'}<StickyNote size={13} />
                      {:else if item.type === 'portal'}<Globe2 size={13} />
                      {:else if item.type === 'fileTree'}<FolderTree size={13} />
                      {:else if item.type === 'editor'}<FileCode2 size={13} />
                      {:else if item.type === 'diff'}<GitCompareArrows size={13} />
                      {:else if item.type === 'image'}<ImageIcon size={13} />
                      {:else if item.type === 'flow'}<Workflow size={13} />
                      {:else if item.type === 'loop'}<Repeat2 size={13} />
                      {:else if item.type === 'usage'}<Gauge size={13} />
                      {/if}
                    </span>
                    <span class="min-w-0 flex-1 truncate">{item.title || nodeTypeLabel(item)}</span>
                    <span class="max-w-20 truncate text-[9px] text-[var(--app-text-muted)]">{nodeTypeLabel(item)}</span>
                  </button>
                {:else}
                  <p class="px-2 py-2 text-[10px] text-[var(--app-text-muted)]">{m['terminal_browser.workspace_empty']()}</p>
                {/each}
              </div>
            {/if}
          </section>
        {:else}
          <p class="px-3 py-4 text-xs text-[var(--app-text-muted)]">{m['terminal_browser.no_results']()}</p>
        {/each}
      {/if}
    </div>
  </aside>

  <section class="grid min-h-0 min-w-0 grid-rows-[44px_minmax(0,1fr)]">
    <header class="flex min-w-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3" data-testid="terminal-workspace-header">
      {#if selectedWorkspace && selectedNode}
        <WorkspaceIcon name={selectedWorkspace.icon} size={15} />
        <span class="truncate text-xs font-medium">{selectedWorkspace.name}</span>
        <ChevronRight size={13} class="shrink-0 text-[var(--app-text-muted)]" />
        <span class="min-w-0 truncate text-xs text-[var(--app-text-soft)]">{selectedNode.title || nodeTypeLabel(selectedNode)}</span>
        <span class="ml-auto shrink-0 text-[10px] text-[var(--app-text-muted)]">{nodeTypeLabel(selectedNode)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m['terminal_browser.open_canvas']()}
          title={m['terminal_browser.open_canvas']()}
          href={`/canvas?workspace=${selectedWorkspace.id}&node=${selectedNode.id}`}
          data-testid="terminal-open-canvas"
        >
          <Network size={14} />
          <ExternalLink size={8} class="-ml-1 -mt-2" />
        </Button>
      {:else}
        <span class="text-xs text-[var(--app-text-muted)]">{m['terminal_browser.title']()}</span>
      {/if}
    </header>

    <div class="min-h-0 min-w-0">
      {#if selectedWorkspace && selectedNode}
        {#key selectedNode.id}
          <FocusedCanvasNode
            workspace={selectedWorkspace}
            node={selectedNode}
            workspaceNodes={nodesByWorkspace[selectedWorkspace.id] ?? []}
            edges={edgesByWorkspace[selectedWorkspace.id] ?? []}
            floors={floorsByWorkspace[selectedWorkspace.id] ?? []}
            {providers}
            onNodeUpdated={updateNode}
            onNodeCreated={addNode}
            onDeleteRequested={(node) => (deletingNode = node)}
            onSelectNode={(nodeId) => selectNode(selectedWorkspace.id, nodeId)}
            onRefresh={() => loadWorkspace(selectedWorkspace.id)}
          />
        {/key}
      {:else if !loading}
        <div class="flex h-full items-center justify-center p-8">
          <div class="max-w-sm text-center">
            <SquareTerminal size={28} class="mx-auto mb-3 text-[var(--app-text-muted)]" strokeWidth={1.5} />
            <h1 class="text-sm font-semibold">{m['terminal_browser.empty_title']()}</h1>
            <p class="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{m['terminal_browser.empty_body']()}</p>
          </div>
        </div>
      {/if}
    </div>
  </section>
</main>

<AlertDialog.Root open={Boolean(deletingNode)} onOpenChange={(open) => { if (!open) deletingNode = null; }}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{m['terminal_browser.delete_title']()}</AlertDialog.Title>
      <AlertDialog.Description>{m['terminal_browser.delete_description']({ name: deletingNode?.title || (deletingNode ? nodeTypeLabel(deletingNode) : '') })}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{m['dlg.cancel']()}</AlertDialog.Cancel>
      <AlertDialog.Action variant="destructive" onclick={confirmDeleteNode}>{m['settings.delete']()}</AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
