<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { toast } from '@beeblock/svelar/ui';
  import {
    Background,
    ConnectionMode,
    Controls,
    MiniMap,
    Panel,
    SvelteFlow,
    type Connection,
    type Edge,
    type Node,
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import TerminalCanvasNode from '$lib/components/agent-room/canvas/TerminalCanvasNode.svelte';
  import NoteCanvasNode from '$lib/components/agent-room/canvas/NoteCanvasNode.svelte';
  import WorkspaceEditDialog from '$lib/components/agent-room/canvas/WorkspaceEditDialog.svelte';
  import WorkspaceCreateDialog from '$lib/components/agent-room/canvas/WorkspaceCreateDialog.svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import * as m from '$lib/paraglide/messages.js';
  import FileTreeCanvasNode from '$lib/components/agent-room/canvas/FileTreeCanvasNode.svelte';
  import EditorCanvasNode from '$lib/components/agent-room/canvas/EditorCanvasNode.svelte';
  import DiffCanvasNode from '$lib/components/agent-room/canvas/DiffCanvasNode.svelte';
  import PortalCanvasNode from '$lib/components/agent-room/canvas/PortalCanvasNode.svelte';
  import LoopCanvasNode from '$lib/components/agent-room/canvas/LoopCanvasNode.svelte';
  import GroupCanvasNode from '$lib/components/agent-room/canvas/GroupCanvasNode.svelte';
  import OrkestraiEdge from '$lib/components/agent-room/canvas/OrkestraiEdge.svelte';
  import ShapeCanvasNode from '$lib/components/agent-room/canvas/ShapeCanvasNode.svelte';
  import FloorPanel from '$lib/components/agent-room/canvas/FloorPanel.svelte';
  import AgentCreateDialog from '$lib/components/agent-room/canvas/AgentCreateDialog.svelte';
  import HeaderIconButton from '$lib/components/agent-room/canvas/HeaderIconButton.svelte';
  import OnboardingWizard from '$lib/components/agent-room/tours/OnboardingWizard.svelte';
  import TourGuidePanel from '$lib/components/agent-room/tours/TourGuidePanel.svelte';
  import WorkspaceIcon from '$lib/components/agent-room/WorkspaceIcon.svelte';
  import TasksCanvasNode from '$lib/components/agent-room/canvas/TasksCanvasNode.svelte';
  import FlowCanvasNode from '$lib/components/agent-room/canvas/FlowCanvasNode.svelte';
  import ImageCanvasNode from '$lib/components/agent-room/canvas/ImageCanvasNode.svelte';
  import ToolbarButton from '$lib/components/agent-room/canvas/ToolbarButton.svelte';
  import RoutinePanel from '$lib/components/agent-room/canvas/RoutinePanel.svelte';
  import RolesPanel from '$lib/components/agent-room/canvas/RolesPanel.svelte';
  import UsagePanel from '$lib/components/agent-room/canvas/UsagePanel.svelte';
  import PortsPanel from '$lib/components/agent-room/canvas/PortsPanel.svelte';
  import CommandPalette, { type PaletteAction } from '$lib/components/agent-room/canvas/CommandPalette.svelte';
  import { alignRects, boundingBox, distributeRects, tidyRects, type AlignMode } from '$lib/components/agent-room/canvas/layout.js';
  import { nextTerminalTheme } from '$lib/components/agent-room/terminal-themes.js';
  import {
    LEADER_DICTATION_COMMAND,
    LEADER_DICTATION_STATE,
    type LeaderDictationStateDetail,
    type LeaderDictationStatus,
  } from '$lib/components/agent-room/leader-dictation.js';
  import { BackgroundVariant, SvelteFlowProvider } from '@xyflow/svelte';
  import { BadgeCheck, Blocks, CalendarClock, ChevronLeft, ChevronRight, CodeXml, Download, FileDiff, Folder, FolderTree, Gauge, Image as ImageIcon, Layers, Mic, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Power, RadioTower, Search, Shapes, Square, SquareKanban, StickyNote, Upload, Workflow, X } from '@lucide/svelte';
  import ZoomBridge from '$lib/components/agent-room/canvas/ZoomBridge.svelte';
  import type {
    AgentProviderInfo,
    Floor,
    CanvasEdge,
    CanvasNode,
    NoteNodePayload,
    TerminalNodePayload,
    Workspace,
  } from '$lib/modules/agent-room/domain/types.js';

  const nodeTypes = {
    terminal: TerminalCanvasNode,
    note: NoteCanvasNode,
    fileTree: FileTreeCanvasNode,
    editor: EditorCanvasNode,
    diff: DiffCanvasNode,
    portal: PortalCanvasNode,
    loop: LoopCanvasNode,
    group: GroupCanvasNode,
    shape: ShapeCanvasNode,
    tasks: TasksCanvasNode,
    flow: FlowCanvasNode,
    image: ImageCanvasNode,
  };

  // Icones de marca dos providers (SVG em static/images); opencode cai no
  // fallback lucide (CodeXml) no toolbar.
  const PROVIDER_ICONS: Record<string, string> = {
    claude: '/images/claude.svg',
    codex: '/images/codex.svg',
    kimi: '/images/kimi.svg',
  };

  let workspaces = $state<Workspace[]>([]);
  let workspaceQuery = $state('');

  /** Resolve quando os providers (com resumeArgs) terminam de carregar — o
      respawn de sessao nao pode disparar antes disso ou perde os args de resume. */
  let providersReadyResolve: () => void = () => {};
  const providersReady = new Promise<void>((resolve) => {
    providersReadyResolve = resolve;
  });
  /** Lista filtrada pelo campo de busca da sidebar (por nome, case-insensitive). */
  const visibleWorkspaces = $derived(
    workspaceQuery.trim()
      ? workspaces.filter((workspace) => workspace.name.toLowerCase().includes(workspaceQuery.trim().toLowerCase()))
      : workspaces
  );
  let activeWorkspace = $state<Workspace | null>(null);
  let providers = $state<AgentProviderInfo[]>([]);
  let nodes = $state<Node[]>([]);
  let edges = $state<Edge[]>([]);
  let errorMessage = $state('');

  // Formulario de novo workspace
  let showWorkspaceForm = $state(false);
  let showOnboarding = $state(false);
  /** workspaceId -> sessoes PTY vivas (indicador de ativo na sidebar). */
  let activity = $state<Record<string, number>>({});
  let activityTimer: ReturnType<typeof setInterval> | null = null;
  let editingWorkspace = $state<Workspace | null>(null);
  let deletingWorkspace = $state<Workspace | null>(null);
  let selectionRequestId = 0;
  let showPalette = $state(false);
  let backgroundVariant = $state<BackgroundVariant | 'none'>(BackgroundVariant.Dots);
  let zoomApi = $state<{
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
    fitView: (options?: { duration?: number }) => void;
    screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number };
    getViewport: () => { x: number; y: number; zoom: number };
  } | null>(null);
  let flowWrapper: HTMLElement;

  // Undo/redo: snapshots leves de nodes+edges antes de cada mutacao estrutural.
  const undoStack: Array<{ nodes: Node[]; edges: Edge[] }> = [];
  const redoStack: Array<{ nodes: Node[]; edges: Edge[] }> = [];
  let undoArmed = true;

  function snapshot() {
    if (!undoArmed) return;
    undoStack.push({ nodes: nodes.map((node) => ({ ...node })), edges: edges.map((edge) => ({ ...edge })) });
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
  }

  async function undo() {
    const previous = undoStack.pop();
    if (!previous || !activeWorkspace) return;
    redoStack.push({ nodes: nodes.map((node) => ({ ...node })), edges: edges.map((edge) => ({ ...edge })) });
    await restoreSnapshot(previous);
  }

  async function redo() {
    const next = redoStack.pop();
    if (!next || !activeWorkspace) return;
    undoStack.push({ nodes: nodes.map((node) => ({ ...node })), edges: edges.map((edge) => ({ ...edge })) });
    await restoreSnapshot(next);
  }

  async function restoreSnapshot(snapshotData: { nodes: Node[]; edges: Edge[] }) {
    if (!activeWorkspace) return;
    undoArmed = false;
    try {
      // Recria o estado: apaga o que sobrou, recria o que faltava (por id).
      const currentIds = new Set(nodes.map((node) => node.id));
      const targetIds = new Set(snapshotData.nodes.map((node) => node.id));
      for (const id of currentIds) {
        if (!targetIds.has(id)) {
          await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
      for (const node of snapshotData.nodes) {
        await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${node.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ x: node.position.x, y: node.position.y }),
        }).catch(() => {});
      }
      nodes = snapshotData.nodes;
      edges = snapshotData.edges;
    } finally {
      undoArmed = true;
    }
  }

  // Modo "desenhar no": clique na ferramenta e arraste o retangulo no canvas.
  type DrawTool = 'terminal' | 'note' | 'fileTree' | 'diff' | 'portal' | 'loop' | 'shape' | 'tasks' | 'flow' | 'image';
  let drawTool = $state<DrawTool | null>(null);
  let drawStart = $state<{ x: number; y: number } | null>(null);
  let drawCurrent = $state<{ x: number; y: number } | null>(null);
  // Provider armado junto com a ferramenta terminal (Claude/Codex/Kimi...) —
  // sem isso o botao do agente criava um shell puro em vez do TUI do agente.
  let drawProvider = $state<AgentProviderInfo | null>(null);

  type DrawRect = { x: number; y: number; width: number; height: number };
  /** Tamanho do no criado: nunca menor que o minimo do NodeShell — desenhar
      pequeno demais vazava os botoes do header pra fora da janela. */
  function nodeSize(rect: DrawRect | undefined, minW: number, minH: number, defW: number, defH: number): { width: number; height: number } {
    return {
      width: rect?.width ? Math.max(rect.width, minW) : defW,
      height: rect?.height ? Math.max(rect.height, minH) : defH,
    };
  }
  // Criacao de terminal passa pelo dialogo (nome/modelo/esforco/lider) —
  // como no Maestri, que pergunta o nome ao soltar o retangulo no canvas.
  let pendingAgentCreation = $state<{ provider: AgentProviderInfo | null; rect?: DrawRect } | null>(null);
  const DRAW_CREATORS: Record<DrawTool, (rect: DrawRect | undefined, provider?: AgentProviderInfo | null) => Promise<void>> = {
    terminal: async (rect, provider) => { pendingAgentCreation = { provider: provider ?? null, rect }; },
    note: async (rect) => { await addNote(rect); },
    fileTree: async (rect) => { await addFileTree(rect); },
    diff: async (rect) => { await addDiff(rect); },
    portal: async (rect) => { await addPortal(rect); },
    loop: async (rect) => { await addLoop(rect); },
    shape: async (rect) => { await addShape(rect); },
    tasks: async (rect) => { await addTasksNode(rect); },
    flow: async (rect) => { await addFlowNode(rect); },
    image: async (rect) => { await addImageNode(rect); },
  };

  function toggleDrawTool(tool: DrawTool, provider?: AgentProviderInfo) {
    // Apenas arma a ferramenta: o no nasce no clique (tamanho padrao) ou
    // no arraste (tamanho customizado) sobre o canvas — como no Maestri.
    const sameTool = drawTool === tool && (provider?.id ?? null) === (drawProvider?.id ?? null);
    drawTool = sameTool ? null : tool;
    drawProvider = sameTool ? null : (provider ?? null);
    drawStart = null;
    drawCurrent = null;
  }

  function flowPoint(event: PointerEvent) {
    // Conversao manual: (cliente - rect do wrapper - pan) / zoom — robusta a
    // sidebar e a qualquer fitView aplicado.
    const wrapper = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const viewport = zoomApi?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    return {
      x: (event.clientX - wrapper.left - viewport.x) / viewport.zoom,
      y: (event.clientY - wrapper.top - viewport.y) / viewport.zoom,
    };
  }

  function handlePanePointerDown(event: PointerEvent) {
    if (!drawTool || !activeWorkspace) return;
    // So inicia o desenho no fundo vazio do canvas — cliques em nos, handles
    // e na toolbar nao contam (e o pointer capture nao rouba o clique).
    if (!(event.target as HTMLElement).classList.contains('svelte-flow__pane')) return;
    drawStart = flowPoint(event);
    drawCurrent = drawStart;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePanePointerMove(event: PointerEvent) {
    if (!drawStart) return;
    drawCurrent = flowPoint(event);
  }

  // O ghost e um overlay HTML fora do viewport do flow: precisa de coordenadas
  // de TELA (flow * zoom + pan), senao ele aparece deslocado do cursor.
  const ghostRect = $derived.by(() => {
    if (!drawStart || !drawCurrent) return null;
    const viewport = zoomApi?.getViewport() ?? { x: 0, y: 0, zoom: 1 };
    const sx = drawStart.x * viewport.zoom + viewport.x;
    const sy = drawStart.y * viewport.zoom + viewport.y;
    const cx = drawCurrent.x * viewport.zoom + viewport.x;
    const cy = drawCurrent.y * viewport.zoom + viewport.y;
    return {
      left: Math.min(sx, cx),
      top: Math.min(sy, cy),
      width: Math.abs(cx - sx),
      height: Math.abs(cy - sy),
    };
  });

  async function handlePanePointerUp(event: PointerEvent) {
    if (!drawTool || !drawStart || !drawCurrent) return;
    const rect = {
      x: Math.min(drawStart.x, drawCurrent.x),
      y: Math.min(drawStart.y, drawCurrent.y),
      width: Math.abs(drawCurrent.x - drawStart.x),
      height: Math.abs(drawCurrent.y - drawStart.y),
    };
    const tool = drawTool;
    const provider = drawProvider;
    drawTool = null;
    drawProvider = null;
    const start = drawStart;
    drawStart = null;
    drawCurrent = null;
    if (rect.width < 40 || rect.height < 30) {
      // Clique simples no fundo: cria com tamanho padrao nessa posicao.
      await DRAW_CREATORS[tool]({ x: start.x - 200, y: start.y - 120, width: 0, height: 0 }, provider);
      return;
    }
    await DRAW_CREATORS[tool](rect, provider);
  }
  let showFloorPanel = $state(false);
  let showRoutinePanel = $state(false);
  let showRolesPanel = $state(false);
  let showUsagePanel = $state(false);
  let showPortsPanel = $state(false);
  let leaderDictationState = $state<LeaderDictationStatus>('idle');
  let leaderDictationNodeId = $state<string | null>(null);
  let sidebarCollapsed = $state(false);
  let importInput: HTMLInputElement;
  let visibleFloorId = $state<string | null>(null);
  let floors = $state<Floor[]>([]);

  function leaderDictationLabel(): string {
    if (leaderDictationState === 'recording') return m['leader_dictation.stop']();
    if (leaderDictationState === 'transcribing') return m['leader_dictation.transcribing']();
    return m['leader_dictation.start']();
  }

  function dispatchLeaderDictation(nodeId: string) {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent(LEADER_DICTATION_COMMAND, { detail: { nodeId } }));
    });
  }

  async function toggleLeaderDictation() {
    if (!activeWorkspace || leaderDictationState === 'transcribing') return;
    if (leaderDictationState === 'recording' && leaderDictationNodeId) {
      dispatchLeaderDictation(leaderDictationNodeId);
      return;
    }
    let allNodes: CanvasNode[];
    try {
      allNodes = await api<CanvasNode[]>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`);
    } catch {
      toast.error(m['leader_dictation.error']());
      return;
    }
    const leader = allNodes.find((node) => node.type === 'terminal' && (node.payload as TerminalNodePayload).maestro);
    if (!leader) {
      leaderDictationState = 'idle';
      leaderDictationNodeId = null;
      toast.error(m['leader_dictation.no_leader']());
      return;
    }

    leaderDictationNodeId = leader.id;
    if ((leader.floorId ?? null) !== visibleFloorId) await selectFloor(leader.floorId ?? null);
    await tick();
    dispatchLeaderDictation(leader.id);
  }

  onMount(() => {
    const handleDictationState = (event: Event) => {
      const detail = (event as CustomEvent<LeaderDictationStateDetail>).detail;
      if (!detail) return;
      if (detail.nodeId !== leaderDictationNodeId) {
        const source = nodes.find((node) => node.id === detail.nodeId);
        if (source?.type !== 'terminal' || !(source.data?.payload as TerminalNodePayload | undefined)?.maestro) return;
        leaderDictationNodeId = detail.nodeId;
      }
      leaderDictationState = detail.status;
    };
    window.addEventListener(LEADER_DICTATION_STATE, handleDictationState);
    return () => window.removeEventListener(LEADER_DICTATION_STATE, handleDictationState);
  });

  function floorPath(floorId: string | null | undefined): string | null {
    if (!floorId) return null;
    return floors.find((floor) => floor.id === floorId)?.path ?? null;
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || m['canvas.error_api']());
    return payload.data as T;
  }

  let appSettings = $state<Record<string, string>>({});

  // Live refresh: a bridge (CLI dos agentes) escreve direto no banco; o
  // servidor avisa via WS e a pagina recarrega nos/edges/andares do workspace
  // ativo — sem precisar trocar de andar ou recarregar a pagina.
  let refreshDebounce: ReturnType<typeof setTimeout> | null = null;

  function connectWorkspaceEvents() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws/agent-room/pty`);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'workspaceChanged' && message.workspaceId === activeWorkspace?.id) {
          if (refreshDebounce) clearTimeout(refreshDebounce);
          refreshDebounce = setTimeout(() => {
            refreshDebounce = null;
            if (activeWorkspace) selectWorkspace(activeWorkspace.id, { force: true });
          }, 250);
        }
      } catch {
        // frame nao-JSON: ignora
      }
    };
    socket.onclose = () => {
      // Reconecta com backoff simples enquanto a pagina estiver aberta.
      setTimeout(connectWorkspaceEvents, 3_000);
    };
    return socket;
  }

  onMount(async () => {
    document.documentElement.classList.add('dark');
    const eventsSocket = connectWorkspaceEvents();
    const [workspaceList, status, settingsResponse] = await Promise.all([
      api<Workspace[]>('/api/agent-room/workspaces'),
      api<{ providers: AgentProviderInfo[] }>('/api/agent-room/status'),
      api<Record<string, string>>('/api/agent-room/settings'),
    ]);
    appSettings = settingsResponse ?? {};
    // Se o usuario ja criou/selecionou algo enquanto o fetch inicial estava
    // em voo, a lista antiga nao sobrescreve o estado mais novo.
    if (selectionRequestId === 0) {
      workspaces = workspaceList;
      if (workspaceList.length) await selectWorkspace(workspaceList[0].id);
    }
    providers = status.providers ?? [];
    providersReadyResolve();
    workspacesLoaded = true;
    // Indicador de workspaces ativos (sessoes PTY vivas em background).
    const refreshActivity = async () => {
      activity = await api<Record<string, number>>('/api/agent-room/workspaces/activity').catch(() => ({}));
    };
    await refreshActivity();
    activityTimer = setInterval(refreshActivity, 10_000);
    // Onboarding: automatico na primeira vez (sem workspaces) ou forcado
    // via /canvas?onboarding=1 (botao "Rever apresentacao" do /docs).
    // A intencao vai para sessionStorage: a troca de idioma remonta a arvore
    // ({#key locale}) DEPOIS do replaceState — sem a flag, o remount recriava
    // a pagina com showOnboarding=false e o wizard nunca abria fora de pt-BR.
    try {
      const forced = new URLSearchParams(location.search).has('onboarding');
      if (forced) {
        sessionStorage.setItem('orkestrai.onboarding', '1');
        history.replaceState(null, '', '/canvas');
      }
      if (forced || sessionStorage.getItem('orkestrai.onboarding') === '1') {
        showOnboarding = true;
      } else if (!workspaceList.length && !localStorage.getItem('orkestrai.onboarded')) {
        showOnboarding = true;
      }
    } catch {
      // storage indisponivel — nao bloqueia
    }
    return () => {
      if (activityTimer) clearInterval(activityTimer);
      toolbarResizeObserver?.disconnect();
      eventsSocket.onclose = null;
      eventsSocket.close();
    };
  });

  // Overflow da toolbar: re-checa quando o tamanho/conteudo muda (resize,
  // providers carregados, janela menor). Setas aparecem so quando ha para onde rolar.
  let toolbarResizeObserver: ResizeObserver | null = null;

  $effect(() => {
    if (!toolbarEl) return;
    void providers.length;
    updateToolbarScroll();
    toolbarResizeObserver ??= new ResizeObserver(updateToolbarScroll);
    toolbarResizeObserver.observe(toolbarEl);
    return () => toolbarResizeObserver?.disconnect();
  });

  function toFlowNode(node: CanvasNode): Node {
    return {
      id: node.id,
      type: node.type,
      position: { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      data: {
        title: node.title ?? '',
        workspaceId: activeWorkspace?.id ?? '',
        workspaceName: activeWorkspace?.name ?? '',
        providersReady,
        workingDir: floorPath(node.floorId) ?? activeWorkspace?.workingDir ?? '.',
        payload: node.payload,
        // Closures: avaliadas na hora do respawn (providers ja carregados) —
        // avaliar aqui congelaria undefined no restart (providers ainda vazios).
        resumeArgsFor: () => resumeArgsFor(node),
        exactResumeArgsFor: (agentSessionId: string) => exactResumeArgsFor(node)?.(agentSessionId) ?? null,
        onAgentSessionFound: (id: string, agentSessionId: string) => updateNodePayload(id, { agentSessionId }),
        connections: connectionsFor(node.id),
        onJumpToNode: jumpToNode,
        onRemoveConnection: removeConnection,
        onDelete: deleteNode,
        onResize: resizeNode,
        onSessionCreated: (id: string, sessionId: string) => updateNodePayload(id, { sessionId }),
        onToggleMaestro: (id: string) => {
          const current = (nodes.find((node) => node.id === id)?.data?.payload ?? {}) as Record<string, unknown>;
          updateNodePayload(id, { maestro: !current.maestro });
        },
        onCycleTheme: (id: string) => {
          const current = (nodes.find((node) => node.id === id)?.data?.payload ?? {}) as Record<string, unknown>;
          updateNodePayload(id, { theme: nextTerminalTheme(current.theme as string | undefined) });
        },
        onContentChange: (id: string, content: string) => updateNodePayload(id, { content }),
        onColorChange: (id: string, color: string) => updateNodePayload(id, { color }),
        onRoleChange: (id: string, role: string | null) => updateNodePayload(id, { role }),
        onOpenFile: (path: string) => openEditor(path),
        onUrlChange: (id: string, url: string) => updateNodePayload(id, { url }),
        onRename: (id: string, title: string) => {
          nodes = nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, title } } : node));
          api(`/api/agent-room/workspaces/${activeWorkspace?.id}/nodes/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ title }),
          }).catch(() => {});
        },
        onUngroup: (id: string) => ungroup(id),
        onPayloadChange: (id: string, partial: Record<string, unknown>) => updateNodePayload(id, partial),
        onTalking: handleTalking,
      },
    };
  }

  // A edge entre dois terminais acende (verde + fluxo animado) enquanto a
  // bridge esta levando uma mensagem entre eles.
  function handleTalking(payload: { from: string | null; to: string; talking: boolean }) {
    edges = edges.map((edge) => {
      const matches = payload.from
        ? (edge.source === payload.from && edge.target === payload.to) ||
          (edge.target === payload.from && edge.source === payload.to)
        : edge.source === payload.to || edge.target === payload.to;
      if (!matches) return edge;
      return { ...edge, data: { ...(edge.data ?? {}), talking: payload.talking } };
    });
  }

  function exactResumeArgsFor(node: CanvasNode): ((agentSessionId: string) => string[] | null) | undefined {
    const payload = node.payload as { command?: string };
    const provider = providers.find((item) => item.tui?.command === payload.command);
    if (!provider || !hasResume(provider.id)) return undefined;
    return (agentSessionId: string) => RESUME_EXACT[provider.id]?.(agentSessionId) ?? null;
  }

  function hasResume(providerId: string): boolean {
    return providerId in RESUME_EXACT;
  }

  function resumeArgsFor(node: CanvasNode): string[] | null {
    const payload = node.payload as { command?: string };
    if (!payload.command) return null;
    const provider = providers.find((item) => item.tui?.command === payload.command);
    return provider?.tui?.resumeArgs ?? null;
  }

  function connectionsFor(nodeId: string) {
    return edges
      .filter((edge) => edge.source === nodeId || edge.target === nodeId)
      .map((edge) => {
        const outgoing = edge.source === nodeId;
        const otherId = outgoing ? edge.target : edge.source;
        const other = nodes.find((node) => node.id === otherId);
        return {
          edgeId: edge.id,
          targetId: otherId,
          targetTitle: String(other?.data?.title ?? other?.type ?? m['canvas.fallback_node']()),
          targetType: String(other?.type ?? m['canvas.fallback_node']()),
          direction: (outgoing ? 'out' : 'in') as 'out' | 'in',
        };
      });
  }

  async function removeConnection(edgeId: string) {
    snapshot();
    selectedEdgeId = null;
    if (!activeWorkspace) return;
    await api(`/api/agent-room/workspaces/${activeWorkspace.id}/edges/${edgeId}`, { method: 'DELETE' }).catch(() => {});
    edges = edges.filter((edge) => edge.id !== edgeId);
  }

  const edgeTypes = { orkestrai: OrkestraiEdge };

  // Espelha resumeArgs(id) dos adapters (claude/codex/kimi/opencode).
  const RESUME_EXACT: Record<string, (id: string) => string[]> = {
    claude: (id) => ['--resume', id],
    codex: (id) => ['resume', id],
    kimi: (id) => ['-r', id],
    opencode: (id) => ['--session', id],
  };

  function toFlowEdge(edge: CanvasEdge): Edge {
    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      // Sempre a corda verlet — o estilo "circuit" (linhas retas) foi removido.
      type: 'orkestrai',
      data: { onRemove: removeConnection },
    };
  }

  async function selectWorkspace(id: string, options: { force?: boolean } = {}) {
    // Recarregar o workspace ja ativo pode sobrescrever estado mais novo
    // (ex.: um no criado enquanto o fetch estava em voo) — exceto com force
    // (refresh disparado pela bridge, que e a fonte da verdade).
    if (!options.force && activeWorkspace?.id === id) return;
    // So a selecao mais recente pode aplicar seu resultado: fetches antigos
    // (ex.: o auto-select do mount) nao sobrescrevem escolhas posteriores.
    const changingWorkspace = activeWorkspace?.id !== id;
    const requestId = ++selectionRequestId;
    errorMessage = '';
    try {
      const [workspace, canvasNodes, canvasEdges, floorList] = await Promise.all([
        api<Workspace>(`/api/agent-room/workspaces/${id}`),
        api<CanvasNode[]>(`/api/agent-room/workspaces/${id}/nodes`),
        api<CanvasEdge[]>(`/api/agent-room/workspaces/${id}/edges`),
        api<Floor[]>(`/api/agent-room/workspaces/${id}/floors`),
      ]);
      if (requestId !== selectionRequestId) return;
      activeWorkspace = workspace;
      if (changingWorkspace) {
        leaderDictationState = 'idle';
        leaderDictationNodeId = null;
      }
      floors = floorList;
      if (!options.force) {
        queueMicrotask(() => {
          if (canvasNodes.length) zoomApi?.fitView({ duration: 0, maxZoom: 1 } as never);
        });
      }
      nodes = canvasNodes
        .filter((node) => (node.floorId ?? null) === visibleFloorId)
        .map(toFlowNode);
      const visibleIds = new Set(nodes.map((node) => node.id));
      edges = canvasEdges.map(toFlowEdge).filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : m['canvas.error_open_ws']();
    }
  }

  async function selectFloor(floorId: string | null) {
    visibleFloorId = floorId;
    if (activeWorkspace) {
      const requestId = ++selectionRequestId;
      const workspaceId = activeWorkspace.id;
      const [canvasNodes, canvasEdges] = await Promise.all([
        api<CanvasNode[]>(`/api/agent-room/workspaces/${workspaceId}/nodes`),
        api<CanvasEdge[]>(`/api/agent-room/workspaces/${workspaceId}/edges`),
      ]);
      if (requestId !== selectionRequestId || activeWorkspace?.id !== workspaceId) return;
      nodes = canvasNodes.filter((node) => (node.floorId ?? null) === visibleFloorId).map(toFlowNode);
      const visibleIds = new Set(nodes.map((node) => node.id));
      edges = canvasEdges.map(toFlowEdge).filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    }
  }

  async function exportActiveWorkspace() {
    if (!activeWorkspace) return;
    const data = await api<unknown>(`/api/agent-room/workspaces/${activeWorkspace.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeWorkspace.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.orkestrai.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importWorkspaceFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    errorMessage = '';
    try {
      const data = JSON.parse(await file.text());
      const workspace = await api<Workspace>('/api/agent-room/workspaces/import', {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      workspaces = [workspace, ...workspaces];
      await selectWorkspace(workspace.id);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : m['canvas.error_import_ws']();
    } finally {
      importInput.value = '';
    }
  }

  // -- Setas de scroll da toolbar (so aparecem quando ha overflow) -----------
  let toolbarEl = $state<HTMLDivElement | null>(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);

  function updateToolbarScroll() {
    if (!toolbarEl) return;
    canScrollLeft = toolbarEl.scrollLeft > 2;
    canScrollRight = toolbarEl.scrollLeft < toolbarEl.scrollWidth - toolbarEl.clientWidth - 2;
  }

  function scrollToolbar(direction: 1 | -1) {
    toolbarEl?.scrollBy({ left: direction * 220, behavior: 'smooth' });
  }

  // -- Descarregar workspace (encerra terminais vivos, mantem o layout) ---------
  let confirmUnload = $state(false);
  let unloading = $state(false);
  let unloadMessage = $state('');
  let workspacesLoaded = $state(false);

  async function unloadActiveWorkspace() {
    if (!activeWorkspace) return;
    unloading = true;
    try {
      const result = await api<{ killedSessions: number }>(`/api/agent-room/workspaces/${activeWorkspace.id}/unload`, {
        method: 'POST',
      });
      const canvasNodes = await api<CanvasNode[]>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`);
      nodes = canvasNodes.filter((node) => (node.floorId ?? null) === visibleFloorId).map(toFlowNode);
      const count = result?.killedSessions ?? 0;
      unloadMessage = count > 0
        ? count === 1
          ? m['canvas.unload_done_one']({ count })
          : m['canvas.unload_done_many']({ count })
        : m['canvas.unload_none']();
    } finally {
      unloading = false;
      confirmUnload = false;
      setTimeout(() => (unloadMessage = ''), 5_000);
    }
  }

  async function handleWorkspaceCreated(workspace: Workspace) {
    selectionRequestId += 1; // invalida o auto-select do mount imediatamente
    workspaces = [workspace, ...workspaces];
    showWorkspaceForm = false;
    await selectWorkspace(workspace.id);
  }

  /** Cria workspace pelo wizard de onboarding (ja seleciona e devolve). */
  async function createWorkspaceFromWizard(input: { name: string; workingDir: string }): Promise<Workspace | null> {
    const workspace = await api<Workspace>('/api/agent-room/workspaces', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (!workspace) return null;
    selectionRequestId += 1;
    workspaces = [workspace, ...workspaces];
    await selectWorkspace(workspace.id);
    return workspace;
  }

  async function saveWorkspace(changes: {
    name: string;
    workingDir: string;
    icon: string | null;
    instructions: string | null;
    syncAgentInstructionFiles: boolean;
  }) {
    if (!editingWorkspace) return;
    const updated = await api<Workspace>(`/api/agent-room/workspaces/${editingWorkspace.id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
    workspaces = workspaces.map((item) => (item.id === updated.id ? updated : item));
    if (activeWorkspace?.id === updated.id) activeWorkspace = updated;
  }

  async function confirmDeleteWorkspace() {
    const workspace = deletingWorkspace;
    deletingWorkspace = null;
    if (!workspace) return;
    await api(`/api/agent-room/workspaces/${workspace.id}`, { method: 'DELETE' });
    workspaces = workspaces.filter((item) => item.id !== workspace.id);
    if (activeWorkspace?.id === workspace.id) {
      activeWorkspace = null;
      nodes = [];
      edges = [];
      if (workspaces.length) await selectWorkspace(workspaces[0].id);
    }
  }

  function nextFreePosition() {
    const index = nodes.length;
    return { x: 80 + (index % 4) * 620, y: 80 + (Math.floor(index / 4) % 4) * 460 };
  }

  /** Titulo unico no canvas: "Claude" ocupado vira "Claude 2"... (ask ambiguo quebra o roteamento). */
  function uniqueNodeTitle(base: string): string {
    const taken = new Set(nodes.map((node) => String(node.data?.title ?? '').toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base} ${suffix}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  async function addTerminal(
    provider?: AgentProviderInfo,
    rect?: { x: number; y: number; width: number; height: number },
    creation?: { title: string; model: string | null; effort: string | null; leader: boolean }
  ) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    let payload: TerminalNodePayload;
    if (provider) {
      // Monta o comando com model/effort escolhidos no dialogo (server-side,
      // via adapter — as flags variam por provider).
      let spec = provider.tui ? { command: provider.tui.command, args: provider.tui.args } : null;
      if (creation && (creation.model || creation.effort)) {
        const params = new URLSearchParams({ provider: provider.id });
        if (creation.model) params.set('model', creation.model);
        if (creation.effort) params.set('effort', creation.effort);
        spec = await api<{ command: string; args: string[] }>(`/api/agent-room/agent-spec?${params}`).catch(() => spec);
      }
      payload = spec
        ? { command: spec.command, args: spec.args, provider: provider.id, ...(creation?.leader ? { maestro: true } : {}) }
        : { command: provider.id, args: [], provider: provider.id };
    } else {
      payload = { command: navigator.platform.startsWith('Win') ? 'powershell.exe' : '/bin/zsh', args: [] };
    }
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'terminal',
        title: uniqueNodeTitle(creation?.title || provider?.displayName || m['canvas.default_shell']()),
        ...position,
        width: nodeSize(rect, 360, 220, Number(appSettings.newTerminalWidth ?? 560), Number(appSettings.newTerminalHeight ?? 340)).width,
        height: nodeSize(rect, 360, 220, Number(appSettings.newTerminalWidth ?? 560), Number(appSettings.newTerminalHeight ?? 340)).height,
        payload: { ...payload, theme: payload.theme ?? appSettings.terminalTheme },
        floorId: visibleFloorId,
      }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addFileTree(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'fileTree', title: m['canvas.default_files'](), ...position, ...nodeSize(rect, 260, 200, 300, 380), payload: {}, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function openEditor(path: string) {
    if (!activeWorkspace) return;
    // Reaproveita editor ja aberto para o mesmo arquivo
    const existing = nodes.find((node) => node.type === 'editor' && (node.data?.payload as { path?: string })?.path === path);
    if (existing) return;
    const position = nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'editor',
        title: path.split('/').at(-1) ?? m['canvas.default_editor'](),
        ...position,
        width: 640,
        height: 440,
        payload: { path },
        floorId: visibleFloorId,
      }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  const SHAPES = ['rectangle', 'ellipse', 'diamond', 'arrow'] as const;
  let shapeIndex = $state(0);

  async function addShape(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const kind = SHAPES[shapeIndex % SHAPES.length];
    shapeIndex += 1;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'shape',
        title: '',
        ...position,
        width: nodeSize(rect, 120, 60, kind === 'arrow' ? 220 : 160, kind === 'arrow' ? 80 : 160).width,
        height: nodeSize(rect, 120, 60, kind === 'arrow' ? 220 : 160, kind === 'arrow' ? 80 : 160).height,
        payload: { shape: kind, color: '#7C4DFF', label: '' },
        floorId: visibleFloorId,
      }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addPortal(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'portal', title: m['canvas.default_portal'](), ...position, ...nodeSize(rect, 360, 260, 720, 520), payload: {}, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addLoop(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'loop', title: m['canvas.default_loop'](), ...position, ...nodeSize(rect, 380, 280, 560, 460), payload: {}, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addTasksNode(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'tasks', title: m['canvas.default_tasks'](), ...position, ...nodeSize(rect, 400, 260, 560, 360), payload: {}, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addFlowNode(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'flow', title: m['canvas.default_flow'](), ...position, ...nodeSize(rect, 420, 300, 480, 420), payload: { steps: [], iterations: 1 }, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addImageNode(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'image', title: m['node.image'](), ...position, ...nodeSize(rect, 220, 160, 320, 240), payload: {}, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addDiff(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({ type: 'diff', title: m['canvas.default_diff'](), ...position, ...nodeSize(rect, 380, 240, 720, 440), payload: {}, floorId: visibleFloorId }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function addNote(rect?: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    const position = rect ? { x: rect.x, y: rect.y } : nextFreePosition();
    const payload: NoteNodePayload = { content: '' };
    const node = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'note',
        title: m['canvas.default_note'](),
        ...position,
        width: nodeSize(rect, 220, 140, Number(appSettings.newNoteWidth ?? 320), Number(appSettings.newNoteHeight ?? 220)).width,
        height: nodeSize(rect, 220, 140, Number(appSettings.newNoteWidth ?? 320), Number(appSettings.newNoteHeight ?? 220)).height,
        payload,
        floorId: visibleFloorId,
      }),
    });
    nodes = [...nodes, toFlowNode(node)];
  }

  async function deleteNode(id: string) {
    // X do no passa pela mesma confirmacao do Delete do teclado (modal).
    pendingNodeDeletion = { nodeIds: [id], edgeIds: [] };
  }

  async function resizeNode(id: string, params: { x: number; y: number; width: number; height: number }) {
    if (!activeWorkspace) return;
    await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }

  async function updateNodePayload(id: string, partial: Record<string, unknown>) {
    if (!activeWorkspace) return;
    const flowNode = nodes.find((node) => node.id === id);
    const current = (flowNode?.data?.payload ?? {}) as Record<string, unknown>;
    await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ payload: { ...current, ...partial } }),
    });
    nodes = nodes.map((node) =>
      node.id === id ? { ...node, data: { ...node.data, payload: { ...current, ...partial } } } : node
    );
  }

  const preDragPositions = new Map<string, { x: number; y: number }>();

  async function groupSelection() {
    if (!activeWorkspace) return;
    const selected = nodes.filter((node) => node.selected && node.type !== 'group');
    if (selected.length < 2) return;
    const box = boundingBox(selectedRects())!;
    const padding = 40;
    const headerSpace = 20;
    const groupNode = await api<CanvasNode>(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'group',
        title: m['canvas.default_group'](),
        x: box.x - padding,
        y: box.y - padding - headerSpace,
        width: box.width + padding * 2,
        height: box.height + padding * 2 + headerSpace,
        zIndex: -1,
        payload: { members: selected.map((node) => node.id) },
        floorId: visibleFloorId,
      }),
    });
    nodes = [...nodes, toFlowNode(groupNode)];
  }

  async function ungroup(groupId: string) {
    if (!activeWorkspace) return;
    await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${groupId}`, { method: 'DELETE' });
    nodes = nodes.filter((node) => node.id !== groupId);
  }

  function moveGroupWithMembers(groupNode: Node, previous: { x: number; y: number }) {
    const dx = groupNode.position.x - previous.x;
    const dy = groupNode.position.y - previous.y;
    if (!dx && !dy) return;
    const members = ((groupNode.data?.payload as { members?: string[] })?.members ?? []) as string[];
    nodes = nodes.map((node) =>
      members.includes(node.id)
        ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
        : node
    );
    for (const memberId of members) {
      const member = nodes.find((node) => node.id === memberId);
      if (member) {
        api(`/api/agent-room/workspaces/${activeWorkspace?.id}/nodes/${memberId}`, {
          method: 'PATCH',
          body: JSON.stringify({ x: member.position.x, y: member.position.y }),
        }).catch(() => {});
      }
    }
  }

  function selectedRects() {
    return nodes
      .filter((node) => node.selected)
      .map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? (node.width as number) ?? 560,
        height: node.measured?.height ?? (node.height as number) ?? 360,
      }));
  }

  async function applyPositions(positions: Map<string, { x: number; y: number }>) {
    if (!activeWorkspace || !positions.size) return;
    nodes = nodes.map((node) => {
      const next = positions.get(node.id);
      return next ? { ...node, position: { x: next.x, y: next.y } } : node;
    });
    for (const [id, position] of positions) {
      await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(position),
      }).catch(() => {});
    }
  }

  function jumpToNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const width = node.measured?.width ?? (node.width as number) ?? 560;
    const height = node.measured?.height ?? (node.height as number) ?? 360;
    zoomApi?.setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1, duration: 300 });
    nodes = nodes.map((item) => ({ ...item, selected: item.id === nodeId }));
  }

  const paletteActions = $derived<PaletteAction[]>([
    { id: 'shell', label: m['canvas.palette_new_shell'](), hint: m['canvas.hint_action'](), run: () => (pendingAgentCreation = { provider: null }) },
    ...providers
      .filter((provider) => provider.installed && provider.tui)
      .map((provider) => ({
        id: `agent-${provider.id}`,
        label: m['canvas.palette_new_agent']({ name: provider.displayName }),
        hint: m['canvas.hint_action'](),
        run: () => (pendingAgentCreation = { provider }),
      })),
    { id: 'note', label: m['canvas.palette_new_note'](), hint: m['canvas.hint_action'](), run: () => addNote() },
    { id: 'tasks', label: m['canvas.palette_new_tasks'](), hint: m['canvas.hint_action'](), run: () => addTasksNode() },
    { id: 'files', label: m['canvas.palette_new_files'](), hint: m['canvas.hint_action'](), run: () => addFileTree() },
    { id: 'diff', label: m['canvas.palette_new_diff'](), hint: m['canvas.hint_action'](), run: () => addDiff() },
    { id: 'fit', label: m['canvas.palette_fit'](), hint: m['canvas.hint_view'](), run: () => zoomApi?.fitView({ duration: 300 }) },
    {
      id: 'bg',
      label: m['canvas.palette_bg']({ variant: backgroundVariant }),
      hint: m['canvas.hint_view'](),
      run: () => {
        backgroundVariant =
          backgroundVariant === BackgroundVariant.Dots
            ? BackgroundVariant.Lines
            : backgroundVariant === BackgroundVariant.Lines
              ? 'none'
              : BackgroundVariant.Dots;
      },
    },
    { id: 'align-left', label: m['canvas.palette_align_left'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(alignRects(selectedRects(), 'left')) },
    { id: 'align-right', label: m['canvas.palette_align_right'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(alignRects(selectedRects(), 'right')) },
    { id: 'align-top', label: m['canvas.palette_align_top'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(alignRects(selectedRects(), 'top')) },
    { id: 'align-bottom', label: m['canvas.palette_align_bottom'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(alignRects(selectedRects(), 'bottom')) },
    { id: 'align-centerH', label: m['canvas.palette_center_h'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(alignRects(selectedRects(), 'centerH')) },
    { id: 'align-centerV', label: m['canvas.palette_center_v'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(alignRects(selectedRects(), 'centerV')) },
    { id: 'dist-h', label: m['canvas.palette_dist_h'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(distributeRects(selectedRects(), 'horizontal')) },
    { id: 'dist-v', label: m['canvas.palette_dist_v'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(distributeRects(selectedRects(), 'vertical')) },
    { id: 'tidy', label: m['canvas.palette_tidy'](), hint: m['canvas.hint_selection'](), run: () => applyPositions(tidyRects(selectedRects())) },
    { id: 'group', label: m['canvas.palette_group'](), hint: m['canvas.hint_selection'](), run: () => groupSelection() },
    { id: 'zoom-sel', label: m['canvas.palette_zoom_sel'](), hint: m['canvas.hint_view'](), run: zoomToSelection },
  ]);

  function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.closest('.cm-editor') !== null;
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      showPalette = !showPalette;
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      redo();
      return;
    }
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      jumpToNextAttention();
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      const selectedGroup = nodes.find((node) => node.selected && node.type === 'group');
      if (selectedGroup) ungroup(selectedGroup.id);
      return;
    }
    if (mod && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      groupSelection();
      return;
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === 't') {
      event.preventDefault();
      applyPositions(tidyRects(selectedRects()));
      return;
    }
    if (mod && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      zoomApi?.fitView({ duration: 200 });
      return;
    }
    if (mod && event.shiftKey && event.key === '!') {
      event.preventDefault();
      zoomToSelection();
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (event.altKey && /^[1-9]$/.test(event.key)) {
      focusTerminalByIndex(Number(event.key) - 1);
      return;
    }
    switch (event.key.toLowerCase()) {
      case 'n':
        if (!mod) addNote();
        break;
      case 'l':
        if (!mod) connectFromSelection();
        break;
      case 'arrowright':
      case 'arrowleft':
        walkConnection(event.key === 'arrowright' ? 1 : -1);
        break;
    }
  }

  function jumpToNextAttention() {
    const attentive = nodes.find((node) => (node.data?.payload as { waiting?: boolean } | undefined)?.waiting);
    if (attentive) jumpToNode(attentive.id);
  }

  function focusTerminalByIndex(index: number) {
    const terminals = nodes.filter((node) => node.type === 'terminal');
    const target = terminals[index];
    if (target) jumpToNode(target.id);
  }

  function connectFromSelection() {
    const selected = nodes.filter((node) => node.selected);
    if (selected.length === 2 && activeWorkspace) {
      handleConnect({ source: selected[0].id, target: selected[1].id } as Connection);
    }
  }

  function walkConnection(direction: 1 | -1) {
    const selected = nodes.find((node) => node.selected);
    if (!selected) return;
    const links = connectionsFor(selected.id);
    if (!links.length) return;
    const target = direction === 1 ? links[0] : links[links.length - 1];
    jumpToNode(target.targetId);
  }

  function zoomToSelection() {
    const box = boundingBox(selectedRects());
    if (!box) return;
    zoomApi?.setCenter(box.x + box.width / 2, box.y + box.height / 2, { zoom: 1, duration: 300 });
  }

  async function handleConnect(connection: Connection) {
    if (!activeWorkspace || !connection.source || !connection.target) return;
    const edge = await api<CanvasEdge>(`/api/agent-room/workspaces/${activeWorkspace.id}/edges`, {
      method: 'POST',
      body: JSON.stringify({ sourceNodeId: connection.source, targetNodeId: connection.target }),
    });
    edges = [
      ...edges.filter(
        (item) =>
          !(item.source === connection.source && item.target === connection.target && item.type !== 'orkestrai' && item.type !== 'smoothstep')
      ),
      toFlowEdge(edge),
    ];
  }

  // O bind:edges do xyflow adiciona uma edge default (bezier solida) no
  // onconnect — dependendo do timing ela sobrevive ao filtro acima e so
  // some no reload. Esta guarda remove qualquer edge que nao seja a nossa
  // corda, nao importa quando ela apareca.
  $effect(() => {
    if (edges.some((edge) => edge.type !== 'orkestrai')) {
      edges = edges.filter((edge) => edge.type === 'orkestrai');
    }
  });

  async function handleDelete({ nodes: deletedNodes, edges: deletedEdges }: { nodes: Node[]; edges: Edge[] }) {
    if (!activeWorkspace) return;
    // So arestas chegam aqui (nos sao interceptados no onbeforedelete): apaga na API.
    snapshot();
    for (const edge of deletedEdges) {
      await api(`/api/agent-room/workspaces/${activeWorkspace.id}/edges/${edge.id}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  /**
   * Intercepta o Delete do teclado ANTES do xyflow mexer no estado: com nos,
   * retorna false (bloqueia) e abre a modal de confirmacao — o canvas nao
   * perde o no se o usuario cancelar. Arestas passam direto (barato refazer).
   */
  function handleBeforeDelete({ nodes: deletingNodes }: { nodes: Node[]; edges: Edge[] }): boolean {
    if (!deletingNodes.length) return true;
    pendingNodeDeletion = { nodeIds: deletingNodes.map((node) => node.id), edgeIds: [] };
    return false;
  }

  /** Confirma a exclusao de nos (modal): apaga nos + arestas e atualiza o estado. */
  async function confirmNodeDeletion() {
    const pending = pendingNodeDeletion;
    pendingNodeDeletion = null;
    if (!pending || !activeWorkspace) return;
    snapshot();
    for (const edgeId of pending.edgeIds) {
      await api(`/api/agent-room/workspaces/${activeWorkspace.id}/edges/${edgeId}`, { method: 'DELETE' }).catch(() => {});
    }
    for (const nodeId of pending.nodeIds) {
      await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${nodeId}`, { method: 'DELETE' }).catch(() => {});
    }
    nodes = nodes.filter((node) => !pending.nodeIds.includes(node.id));
    edges = edges.filter((edge) => !pending.edgeIds.includes(edge.id) && !pending.nodeIds.includes(edge.source) && !pending.nodeIds.includes(edge.target));
  }

  let pendingNodeDeletion = $state<{ nodeIds: string[]; edgeIds: string[] } | null>(null);
  let selectedEdgeId = $state<string | null>(null);

  function handleEdgeClick({ edge }: { edge: Edge; event: MouseEvent }) {
    if (!activeWorkspace) return;
    // Clique so fixa/desfixa o X de remover — sem troca de estilo.
    selectedEdgeId = selectedEdgeId === edge.id ? null : edge.id;
    edges = edges.map((item) => ({
      ...item,
      data: { ...(item.data ?? {}), pinned: item.id === selectedEdgeId },
    }));
  }

  async function handleDragStop({ targetNode }: { targetNode: Node | null; nodes: Node[]; event: MouseEvent | TouchEvent }) {
    if (!activeWorkspace || !targetNode) return;
    const previous = preDragPositions.get(targetNode.id);
    preDragPositions.delete(targetNode.id);
    if (targetNode.type === 'group' && previous) {
      moveGroupWithMembers(targetNode, previous);
    }
    await api(`/api/agent-room/workspaces/${activeWorkspace.id}/nodes/${targetNode.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ x: targetNode.position.x, y: targetNode.position.y }),
    }).catch(() => {});
  }

  function handleDragStart({ targetNode }: { targetNode: Node | null }) {
    if (targetNode) {
      preDragPositions.set(targetNode.id, { x: targetNode.position.x, y: targetNode.position.y });
    }
  }
</script>

<svelte:head>
  <title>{m['canvas.page_title']()}</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="canvas-page">
  <aside class="sidebar">
    {#if !sidebarCollapsed}
      <div class="brand-row">
        <img src="/brand/icon.svg" width="22" height="22" alt="Orkestrai" />
        <span class="brand-name">Orkestrai</span>
      </div>
    {/if}
    <div class="sidebar-header">
      {#if !sidebarCollapsed}
        <h2>{m['canvas.workspaces']()}</h2>
      {/if}
      <div class="sidebar-header-actions">
        {#if !sidebarCollapsed}
          <HeaderIconButton label={m['canvas.how_to_use']()} href="/docs">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
        </HeaderIconButton>
        <HeaderIconButton label="Skills (skills.sh)" href={activeWorkspace ? `/skills?workspace=${activeWorkspace.id}` : '/skills'}>
          <Blocks size={14} />
        </HeaderIconButton>
        <HeaderIconButton label={m['settings.title']()} href="/settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </HeaderIconButton>
        <HeaderIconButton label={m['canvas.import_ws']()} onclick={() => importInput.click()}>
            <Upload size={14} />
          </HeaderIconButton>
          {#if activeWorkspace}
            <HeaderIconButton label={m['canvas.export_ws']()} onclick={exportActiveWorkspace}>
              <Download size={14} />
            </HeaderIconButton>
            <HeaderIconButton label={m['canvas.unload_tooltip']()} onclick={() => (confirmUnload = true)}>
              <Power size={14} />
            </HeaderIconButton>
          {/if}
          <HeaderIconButton label={m['canvas.new_ws']()} onclick={() => (showWorkspaceForm = !showWorkspaceForm)}>
            <Plus size={15} />
          </HeaderIconButton>
        {/if}
        <HeaderIconButton
          label={sidebarCollapsed ? m['canvas.sidebar_expand']() : m['canvas.sidebar_collapse']()}
          side={sidebarCollapsed ? 'right' : 'bottom'}
          onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
        >
          {#if sidebarCollapsed}<PanelLeftOpen size={14} />{:else}<PanelLeftClose size={14} />{/if}
        </HeaderIconButton>
      </div>
    </div>
    <input bind:this={importInput} type="file" accept=".json" class="hidden-input" onchange={importWorkspaceFile} />

    {#if !sidebarCollapsed}
      <label class="workspace-filter">
        <Search size={13} aria-hidden="true" />
        <input
          bind:value={workspaceQuery}
          placeholder={m['ph.filter_workspaces']()}
          aria-label={m['canvas.filter_ws_aria']()}
          autocomplete="off"
          spellcheck="false"
        />
      </label>
    {/if}

    <WorkspaceCreateDialog
      open={showWorkspaceForm}
      onCreated={handleWorkspaceCreated}
      onClose={() => (showWorkspaceForm = false)}
    />

    {#if sidebarCollapsed}
      <ul class="workspace-list collapsed">
        {#if !workspacesLoaded}
          {#each [0, 1] as index (index)}
            <li class="ws-skeleton collapsed"><Skeleton class="h-6 w-6 bg-white/5" /></li>
          {/each}
        {:else}
        {#each visibleWorkspaces as workspace (workspace.id)}
          <li class:active={activeWorkspace?.id === workspace.id}>
            <HeaderIconButton label={activity[workspace.id] ? m['canvas.ws_active_sessions']({ name: workspace.name, count: activity[workspace.id] }) : workspace.name} side="right" class="workspace-item" onclick={() => selectWorkspace(workspace.id)}>
              <span class="workspace-icon">
                {#if activity[workspace.id]}<span class="live-dot rail" aria-hidden="true"></span>{/if}
                <WorkspaceIcon name={workspace.icon} size={14} />
              </span>
            </HeaderIconButton>
          </li>
        {/each}
        {/if}
      </ul>
    {:else}
      <ul class="workspace-list">
        {#if !workspacesLoaded}
          {#each [0, 1, 2] as index (index)}
            <li class="ws-skeleton"><Skeleton class="h-7 w-full bg-white/5" /></li>
          {/each}
        {:else}
        {#each visibleWorkspaces as workspace (workspace.id)}
          <li class:active={activeWorkspace?.id === workspace.id}>
            <button class="workspace-item" onclick={() => selectWorkspace(workspace.id)}>
              <span class="workspace-icon">
                <WorkspaceIcon name={workspace.icon} size={14} />
              </span>
              <span class="workspace-name">{workspace.name}</span>
              {#if activity[workspace.id]}
                <span class="live-dot" role="status" aria-label={m['canvas.active_sessions_aria']({ count: activity[workspace.id] })}></span>
              {/if}
            </button>
            <HeaderIconButton label={m['canvas.edit_ws']()} side="right" onclick={() => (editingWorkspace = workspace)}>
              <Pencil size={13} />
            </HeaderIconButton>
            <HeaderIconButton label={m['canvas.delete_ws']()} side="right" danger onclick={() => (deletingWorkspace = workspace)}>
              <X size={13} />
            </HeaderIconButton>
          </li>
        {/each}
        {#if workspaces.length > 0 && visibleWorkspaces.length === 0}
          <li class="empty-filter">{m['canvas.no_ws_match']({ query: workspaceQuery.trim() })}</li>
        {/if}
        {#if workspaces.length === 0}
          <li class="empty">{m['canvas.no_ws']()}</li>
        {/if}
        {/if}
      </ul>
    {/if}
  </aside>

  <section class="canvas-area" class:drawing={drawTool !== null}>
    <SvelteFlowProvider>
    {#if activeWorkspace}
      <ZoomBridge onReady={(api) => (zoomApi = api)} />
      {#if ghostRect}
        <div
          class="draw-ghost"
          style:left={`${ghostRect.left}px`}
          style:top={`${ghostRect.top}px`}
          style:width={`${ghostRect.width}px`}
          style:height={`${ghostRect.height}px`}
        ></div>
      {/if}
      <SvelteFlow
        bind:nodes
        bind:edges
        {nodeTypes}
        {edgeTypes}
        connectionMode={ConnectionMode.Loose}
        zIndexMode="basic"
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={4}
        panOnDrag={drawTool === null ? true : [1, 2]}
        deleteKey={['Backspace', 'Delete']}
        onconnect={handleConnect}
        onedgeclick={handleEdgeClick}
        onbeforedelete={handleBeforeDelete}
        ondelete={handleDelete}
        onnodedragstop={handleDragStop}
        onnodedragstart={handleDragStart}
        onpointerdown={handlePanePointerDown}
        onpointermove={handlePanePointerMove}
        onpointerup={handlePanePointerUp}
      >
        {#if backgroundVariant !== 'none'}
          <Background gap={20} variant={backgroundVariant} />
        {/if}
        {#if appSettings.showControls !== 'false'}
          <Controls />
        {/if}
        {#if appSettings.showMinimap !== 'false'}
          <MiniMap bgColor="#1C1946" maskColor="rgba(16, 16, 20, 0.72)" nodeColor="#3a3b46" />
        {/if}
        <Panel position="top-right">
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  class="leader-dictation-orb"
                  class:recording={leaderDictationState === 'recording'}
                  class:transcribing={leaderDictationState === 'transcribing'}
                  aria-label={leaderDictationLabel()}
                  aria-pressed={leaderDictationState === 'recording'}
                  disabled={leaderDictationState === 'transcribing'}
                  onclick={toggleLeaderDictation}
                >
                  <span class="orb-core" aria-hidden="true">
                    {#if leaderDictationState === 'recording'}
                      <Square size={14} fill="currentColor" />
                    {:else}
                      <Mic size={18} />
                    {/if}
                  </span>
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="left">{leaderDictationLabel()}</Tooltip.Content>
          </Tooltip.Root>
        </Panel>
        <Panel position="bottom-center">
          <div class="toolbar-wrap">
            {#if canScrollLeft}
              <button class="toolbar-arrow" aria-label={m['canvas.scroll_left']()} onclick={() => scrollToolbar(-1)}>
                <ChevronLeft size={14} />
              </button>
            {/if}
            <div class="toolbar" bind:this={toolbarEl} onscroll={updateToolbarScroll}>
            <ToolbarButton label={m['tool.shell']()} active={drawTool === 'terminal' && !drawProvider} onclick={() => toggleDrawTool('terminal')}>
              <img src="/images/cli.svg" width="15" height="15" alt="" class="tool-icon" /> {m['canvas.default_shell']()}
            </ToolbarButton>
            {#each providers as provider}
              <ToolbarButton label={provider.detail ?? provider.displayName} active={drawTool === 'terminal' && drawProvider?.id === provider.id} disabled={!provider.installed} onclick={() => toggleDrawTool('terminal', provider)}>
                {#if PROVIDER_ICONS[provider.id]}
                  <img src={PROVIDER_ICONS[provider.id]} width="15" height="15" alt="" class="tool-icon" />
                {:else}
                  <CodeXml size={15} class="tool-icon-svg" />
                {/if}
                {provider.displayName}
              </ToolbarButton>
            {/each}
            <ToolbarButton label={m['tool.note']()} active={drawTool === 'note'} onclick={() => toggleDrawTool('note')}>
              <StickyNote size={15} class="tool-icon-svg" /> {m['canvas.default_note']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.image']()} active={drawTool === 'image'} onclick={() => toggleDrawTool('image')}>
              <ImageIcon size={15} class="tool-icon-svg" /> {m['node.image']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.files']()} active={drawTool === 'fileTree'} onclick={() => toggleDrawTool('fileTree')}>
              <FolderTree size={15} class="tool-icon-svg" /> {m['canvas.default_files']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.diff']()} active={drawTool === 'diff'} onclick={() => toggleDrawTool('diff')}>
              <FileDiff size={15} class="tool-icon-svg" /> {m['canvas.default_diff']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.portal']()} active={drawTool === 'portal'} onclick={() => toggleDrawTool('portal')}>
              <img src="/images/portal.svg" width="15" height="15" alt="" class="tool-icon" /> {m['canvas.default_portal']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.loop']()} active={drawTool === 'loop'} onclick={() => toggleDrawTool('loop')}>
              <img src="/images/loop.svg" width="15" height="15" alt="" class="tool-icon" /> {m['canvas.label_loop']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.tasks']()} active={drawTool === 'tasks'} onclick={() => toggleDrawTool('tasks')}>
              <SquareKanban size={15} class="tool-icon-svg" /> {m['canvas.default_tasks']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.flow']()} active={drawTool === 'flow'} onclick={() => toggleDrawTool('flow')}>
              <Workflow size={15} class="tool-icon-svg" /> {m['canvas.default_flow']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.shape']()} active={drawTool === 'shape'} onclick={() => toggleDrawTool('shape')}>
              <Shapes size={15} class="tool-icon-svg" /> {m['canvas.label_shape']()}
            </ToolbarButton>
            <span class="toolbar-sep"></span>
            <ToolbarButton label={m['tool.floors']()} active={showFloorPanel} onclick={() => { showFloorPanel = !showFloorPanel; showRoutinePanel = false; showRolesPanel = false; showUsagePanel = false; showPortsPanel = false; }}>
              <Layers size={15} class="tool-icon-svg" /> {m['canvas.label_floors']()}{floors.length ? ` (${floors.length})` : ''}
            </ToolbarButton>
            <ToolbarButton label={m['tool.routines']()} active={showRoutinePanel} onclick={() => { showRoutinePanel = !showRoutinePanel; showFloorPanel = false; showRolesPanel = false; showUsagePanel = false; showPortsPanel = false; }}>
              <CalendarClock size={15} class="tool-icon-svg" /> {m['canvas.label_routines']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.roles']()} active={showRolesPanel} onclick={() => { showRolesPanel = !showRolesPanel; showFloorPanel = false; showRoutinePanel = false; showUsagePanel = false; showPortsPanel = false; }}>
              <BadgeCheck size={15} class="tool-icon-svg" /> {m['canvas.label_roles']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.usage']()} active={showUsagePanel} onclick={() => { showUsagePanel = !showUsagePanel; showFloorPanel = false; showRoutinePanel = false; showRolesPanel = false; showPortsPanel = false; }}>
              <Gauge size={15} class="tool-icon-svg" /> {m['canvas.label_usage']()}
            </ToolbarButton>
            <ToolbarButton label={m['tool.ports']()} active={showPortsPanel} onclick={() => { showPortsPanel = !showPortsPanel; showFloorPanel = false; showRoutinePanel = false; showRolesPanel = false; showUsagePanel = false; }}>
              <RadioTower size={15} class="tool-icon-svg" /> {m['canvas.label_ports']()}
            </ToolbarButton>
            </div>
            {#if canScrollRight}
              <button class="toolbar-arrow" aria-label={m['canvas.scroll_right']()} onclick={() => scrollToolbar(1)}>
                <ChevronRight size={14} />
              </button>
            {/if}
          </div>
        </Panel>
      </SvelteFlow>
    {:else}
      <div class="canvas-empty">
        <img src="/brand/icon.svg" width="56" height="56" alt="" />
        <p>{m['canvas.empty']()}</p>
      </div>
    {/if}
    {#if showPalette}
      <CommandPalette {nodes} actions={paletteActions} onJumpToNode={jumpToNode} onClose={() => (showPalette = false)} />
    {/if}
    {#if showFloorPanel && activeWorkspace}
      <FloorPanel
        workspace={activeWorkspace}
        {visibleFloorId}
        onSelectFloor={selectFloor}
        onClose={() => (showFloorPanel = false)}
        {api}
      />
    {/if}
    {#if showRolesPanel && activeWorkspace}
      <RolesPanel workspace={activeWorkspace} onClose={() => (showRolesPanel = false)} {api} />
    {/if}
    {#if showRoutinePanel && activeWorkspace}
      <RoutinePanel
        workspace={activeWorkspace}
        terminals={nodes.filter((node) => node.type === 'terminal').map((node) => ({ id: node.id, title: String(node.data?.title ?? m['canvas.fallback_terminal']()) }))}
        onClose={() => (showRoutinePanel = false)}
        {api}
      />
    {/if}
    {#if showUsagePanel}
      <UsagePanel onClose={() => (showUsagePanel = false)} />
    {/if}
    {#if showPortsPanel && activeWorkspace}
      <PortsPanel workspace={activeWorkspace} onClose={() => (showPortsPanel = false)} />
    {/if}
    <AgentCreateDialog
      open={pendingAgentCreation !== null}
      provider={pendingAgentCreation?.provider ?? null}
      defaultLeader={!nodes.some((node) => node.type === 'terminal' && (node.data?.payload as { maestro?: boolean } | undefined)?.maestro)}
      onConfirm={async (creation) => {
        const pending = pendingAgentCreation;
        pendingAgentCreation = null;
        await addTerminal(pending?.provider ?? undefined, pending?.rect, creation);
      }}
      onCancel={() => (pendingAgentCreation = null)}
    />
    <OnboardingWizard
      open={showOnboarding}
      onClose={() => {
        showOnboarding = false;
        try { sessionStorage.removeItem('orkestrai.onboarding'); } catch {}
      }}
      onCreateWorkspace={createWorkspaceFromWizard}
      activeWorkspaceId={activeWorkspace?.id ?? null}
    />
    <AlertDialog.Root open={deletingWorkspace !== null} onOpenChange={(isOpen) => !isOpen && (deletingWorkspace = null)}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{m['canvas.delete_ws']()}</AlertDialog.Title>
          <AlertDialog.Description>
            {m['canvas.delete_ws_desc']({ name: deletingWorkspace?.name ?? '' })}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>{m['settings.cancel']()}</AlertDialog.Cancel>
          <AlertDialog.Action onclick={confirmDeleteWorkspace}>{m['settings.delete']()}</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>

    <AlertDialog.Root open={pendingNodeDeletion !== null} onOpenChange={(isOpen) => !isOpen && (pendingNodeDeletion = null)}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{m['canvas.del_nodes_title']({ count: pendingNodeDeletion?.nodeIds.length ?? 0 })}</AlertDialog.Title>
          <AlertDialog.Description>
            {m['canvas.del_nodes_desc']()}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>{m['settings.cancel']()}</AlertDialog.Cancel>
          <AlertDialog.Action onclick={confirmNodeDeletion}>{m['settings.delete']()}</AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>

    <AlertDialog.Root open={confirmUnload} onOpenChange={(isOpen) => !isOpen && (confirmUnload = false)}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{m['canvas.unload_title']()}</AlertDialog.Title>
          <AlertDialog.Description>
            {m['canvas.unload_desc']()}
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>{m['settings.cancel']()}</AlertDialog.Cancel>
          <AlertDialog.Action disabled={unloading} onclick={unloadActiveWorkspace}>
            {unloading ? m['canvas.unloading']() : m['canvas.unload_action']()}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>

    {#if editingWorkspace}
      <WorkspaceEditDialog workspace={editingWorkspace} onSave={saveWorkspace} onClose={() => (editingWorkspace = null)} />
    {/if}
    {#if errorMessage}
      <p class="error-banner">{errorMessage}</p>
    {/if}
    {#if unloadMessage}
      <p class="notice-banner">{unloadMessage}</p>
    {/if}
    <TourGuidePanel />
    </SvelteFlowProvider>
  </section>
</main>

<style>
  .canvas-page {
    display: flex;
    height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
  }

  .sidebar:has(.workspace-list.collapsed) {
    width: 54px;
  }

  /* Colapsada: so o botao de expandir, centralizado. */
  .sidebar:has(.workspace-list.collapsed) .sidebar-header {
    justify-content: center;
  }

  .sidebar:has(.workspace-list.collapsed) .sidebar-header-actions {
    margin-left: 0;
  }

  .sidebar {
    /* Largura para o cabecalho caber em UMA linha: titulo + 8 icones. */
    width: 332px;
    flex-shrink: 0;
    border-right: 1px solid #2c2c36;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* A lista de workspaces rola; o cabecalho nunca encolhe (flex-shrink do
       flex container esmagava o cabecalho em 2 linhas sobre a lista). */
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    /* Muitos botoes no cabecalho: deixa quebrar para uma segunda linha em
       vez de gerar scroll horizontal na sidebar. */
    flex-wrap: wrap;
    row-gap: 4px;
    flex-shrink: 0;
  }

  .sidebar-header h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9a9aa5;
    margin: 0;
    white-space: nowrap;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 2px 6px;
    border-bottom: 1px solid rgba(229, 225, 255, 0.08);
  }

  .brand-name {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 16.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #e5e1ff;
  }

  .workspace-filter {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 9px;
    border-radius: 9px;
    border: 1px solid rgba(229, 225, 255, 0.09);
    background: rgba(9, 8, 32, 0.6);
    color: #8b8c96;
    flex-shrink: 0;
    transition: border-color 140ms ease;
  }

  .workspace-filter:focus-within {
    border-color: rgba(124, 77, 255, 0.55);
  }

  .workspace-filter input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 12px;
  }

  .workspace-filter input:focus-visible {
    outline: none;
  }

  .empty-filter {
    padding: 8px;
    font-size: 12px;
    color: #6d6d78;
    font-style: italic;
  }

  .workspace-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .workspace-list li {
    display: flex;
    align-items: center;
    gap: 2px;
    border-radius: 6px;
    padding-right: 2px;
  }

  .workspace-list li .icon-btn {
    flex-shrink: 0;
    opacity: 0.45;
  }

  .workspace-list li:hover .icon-btn,
  .workspace-list li.active .icon-btn {
    opacity: 1;
  }

  .workspace-list li.active {
    background: #1e1e26;
  }

  .workspace-list.collapsed li {
    justify-content: center;
  }

  .ws-skeleton {
    padding: 3px 6px;
  }

  .ws-skeleton.collapsed {
    display: flex;
    justify-content: center;
    padding: 3px 0;
  }

  .sidebar-header-actions {
    display: flex;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .hidden-input {
    display: none;
  }

  .canvas-page :global(.workspace-item) {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
    text-align: left;
  }

  .canvas-page :global(.workspace-icon) {
    display: inline-flex;
    align-items: center;
    color: #8b8c96;
    flex-shrink: 0;
    position: relative;
  }

  /* Bolinha verde = workspace com sessoes vivas em background. */
  .live-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #8ec98e;
    box-shadow: 0 0 6px rgba(142, 201, 142, 0.8);
    margin-left: 6px;
    flex-shrink: 0;
    animation: live-pulse 2s ease-in-out infinite;
  }

  .live-dot.rail {
    position: absolute;
    top: -3px;
    right: -4px;
    margin-left: 0;
    width: 6px;
    height: 6px;
  }

  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-dot {
      animation: none;
    }
  }

  .canvas-page :global(.workspace-emoji) {
    font-size: 13px;
  }

  .canvas-page :global(.workspace-name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* :global — o HeaderIconButton vive em outro componente; o escopo do
     Svelte nao alcança os filhos sem isso. */
  .canvas-page :global(.icon-btn) {
    border: none;
    background: transparent;
    color: #9a9aa5;
    cursor: pointer;
    font-size: 15px;
    padding: 2px 6px;
    border-radius: 6px;
  }

  .canvas-page :global(.icon-btn:hover) {
    color: #e6e6eb;
    background: rgba(255, 255, 255, 0.06);
  }

  .canvas-page :global(.icon-btn.danger:hover) {
    color: #e5484d;
  }

  .empty {
    color: #6d6d78;
    font-size: 12px;
    padding: 8px;
  }

  .canvas-area {
    flex: 1;
    min-width: 0;
    position: relative;
    /* Linha: o flow ocupa o espaco e os paineis laterais (Andares/Rotinas/
       Roles) entram como irmaos de 300px na direita. */
    display: flex;
  }

  .canvas-area :global(.svelte-flow) {
    flex: 1;
    min-width: 0;
    background: #0D0B2E;
  }

  .canvas-area :global(.svelte-flow__minimap) {
    background: #1C1946;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    overflow: hidden;
  }

  .leader-dictation-orb {
    width: 48px;
    height: 48px;
    padding: 3px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 50%;
    background: conic-gradient(from 25deg, #58d6ff, #9674ff, #f05fb4, #ffb45e, #61e5a7, #58d6ff);
    color: #f7f6ff;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(5, 4, 26, 0.48), 0 0 14px rgba(88, 214, 255, 0.18);
    transition: box-shadow 160ms ease, transform 160ms ease;
  }

  .leader-dictation-orb:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.03);
    box-shadow: 0 10px 26px rgba(5, 4, 26, 0.54), 0 0 20px rgba(240, 95, 180, 0.3);
  }

  .leader-dictation-orb:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 3px;
  }

  .leader-dictation-orb:disabled {
    cursor: wait;
  }

  .leader-dictation-orb.recording {
    animation: leader-orb-recording 1.25s ease-in-out infinite;
  }

  .leader-dictation-orb.transcribing {
    animation: leader-orb-transcribing 900ms linear infinite;
  }

  .orb-core {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 50%;
    background: #11102f;
  }

  @keyframes leader-orb-recording {
    0%, 100% { box-shadow: 0 8px 24px rgba(5, 4, 26, 0.48), 0 0 10px rgba(240, 95, 180, 0.28); }
    50% { box-shadow: 0 8px 24px rgba(5, 4, 26, 0.48), 0 0 25px rgba(240, 95, 180, 0.62); }
  }

  @keyframes leader-orb-transcribing {
    to { transform: rotate(360deg); }
  }

  .canvas-area :global(.svelte-flow__controls) {
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .canvas-area :global(.svelte-flow__controls-button) {
    background: #1C1946;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: #c7c8d0;
  }

  .canvas-area :global(.svelte-flow__controls-button:hover) {
    background: #26272e;
  }

  .canvas-area :global(.svelte-flow__controls-button svg) {
    fill: #c7c8d0;
  }

  .canvas-area :global(.svelte-flow__edge-path) {
    stroke: #4A4580;
    stroke-width: 1.6;
  }

  .canvas-area :global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
    stroke: #7C4DFF;
  }

  .canvas-area :global(.svelte-flow__connectionline path) {
    stroke: #7C4DFF;
    stroke-width: 1.6;
  }

  .canvas-area :global(.svelte-flow__attribution) {
    background: transparent;
    color: #4a4a55;
  }

  /* Labels de edge (X de remover) acima dos nos; o tema default do xyflow
     pinta o label de branco — aqui ele precisa ser invisivel. O wrapper nao
     recebe cliques (passa para a corda → pin); so o botao X e clicavel. */
  .canvas-area :global(.svelte-flow__edge-labels) {
    /* zIndexMode=basic eleva a edge selecionada a z 1000 — a camada de
       labels precisa ficar acima disso ou o X fica inalcancavel. */
    z-index: 2000 !important;
  }

  .canvas-area :global(.svelte-flow__edge-label) {
    z-index: 100 !important;
    background: transparent;
    padding: 0;
    border: none;
    box-shadow: none;
    pointer-events: none !important;
  }

  .canvas-area.drawing :global(.svelte-flow__pane) {
    cursor: crosshair;
  }

  .draw-ghost {
    position: absolute;
    border: 1.5px dashed #7C4DFF;
    background: rgba(91, 141, 239, 0.08);
    border-radius: 10px;
    z-index: 40;
    pointer-events: none;
  }

  .toolbar button.active {
    background: rgba(91, 141, 239, 0.2);
    color: #fff;
  }

  .toolbar-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 14px;
  }

  .toolbar-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(27, 28, 33, 0.92);
    color: #c7c8d0;
    cursor: pointer;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
    transition: color 120ms ease, background 120ms ease;
  }

  .toolbar-arrow:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-radius: 999px;
    background: rgba(27, 28, 33, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    /* Muitos botoes (providers + paineis): rola em vez de cortar fora da tela.
       O painel do xyflow nao tem largura propria — limita pelo viewport
       (sidebar 332 + painel lateral 300 + setas 58 + margens). */
    max-width: max(320px, calc(100vw - 738px));
    overflow-x: auto;
    scrollbar-width: none;
  }

  .toolbar::-webkit-scrollbar {
    display: none;
  }

  .toolbar button {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 5px 10px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: #c7c8d0;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.1;
    flex-shrink: 0;
  }

  .toolbar .tool-icon {
    display: block;
    flex-shrink: 0;
  }

  .toolbar .tool-icon-svg {
    flex-shrink: 0;
    color: #8b8c96;
  }

  .toolbar button.active .tool-icon-svg,
  .toolbar button:hover .tool-icon-svg {
    color: currentColor;
  }

  .toolbar button:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  .toolbar button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toolbar-sep {
    width: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 4px;
  }

  .canvas-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 100%;
    text-align: center;
    color: #6d6d78;
  }

  .canvas-empty img {
    opacity: 0.55;
  }

  .error-banner {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(229, 72, 77, 0.15);
    border: 1px solid #e5484d;
    color: #ffb3b6;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 12px;
  }

  .notice-banner {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(61, 214, 140, 0.12);
    border: 1px solid rgba(61, 214, 140, 0.55);
    color: #8ff0c0;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .leader-dictation-orb,
    .leader-dictation-orb.recording,
    .leader-dictation-orb.transcribing {
      animation: none;
      transition: none;
    }
  }
</style>
