import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { CanvasNode, Workspace } from '../../domain/types.js';
import { AgentWorkspace } from '../../domain/models/AgentWorkspace.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager, sanitizeComposerText } from '../../infrastructure/pty/PtySessionManager.ts';
import { lastReplyText } from '../../infrastructure/transcript/AgentTranscript.js';
import { floorService } from './FloorService.js';
import { getAgentAdapter, hasAgentAdapter } from '../adapters/registry.js';
import { defaultShell } from '../../infrastructure/workspace.js';
import { upsertCodexMcpConfig } from '../../infrastructure/codex-mcp-config.js';

export type BridgeAgent = {
  nodeId: string;
  title: string;
  provider: string | null;
  command: string | null;
  sessionId: string | null;
  sessionAlive: boolean;
  /** true quando o agente e o líder do time (Modo Maestro). */
  maestro: boolean;
};

// Remove sequencias ANSI (cores, cursor, etc.) do output de TUIs.
const ANSI_PATTERN = /[[][0-9;?]*[a-zA-Z]|\][^]*|[()][0-9A-B]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n').trim();
}

/** Título curto de no: primeira linha, max 48 chars (títulos-frase quebram o header). */
function shortTitle(title: string, max = 48): string {
  const first = title.split('\n')[0].trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** URL sem esquema: http para hosts locais (dev server), https para o resto. */
function defaultPortalUrl(url: string): string {
  const local = /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/.test(url);
  return `${local ? 'http' : 'https'}://${url}`;
}

/**
 * Ponte agente<->app: autentica chamadas da CLI `orkestrai` por token de
 * workspace, lista agentes, injeta mensagens em terminais PTY (ask com
 * resposta), le/escreve notas e provisiona arquivos de skill/config.
 */
export class BridgeService {
  /** Resolve o workspace dono do token; lanca erro se inválido. */
  async resolveWorkspaceByToken(token: string): Promise<Workspace> {
    const model = await AgentWorkspace.query().where('bridge_token', token).first();
    if (!model) throw new Error('Token de bridge inválido.');
    const workspace = await workspaceRepository.getWorkspace(model.getAttribute('id'));
    if (!workspace) throw new Error('Workspace não encontrado.');
    return workspace;
  }

  /** Token do workspace, gerando (e persistindo config) se ainda não existir. */
  async getOrCreateToken(workspaceId: string, apiUrl?: string): Promise<string> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace não encontrado.');

    const existing = await AgentWorkspace.query().where('id', workspaceId).first();
    const token = existing?.getAttribute('bridge_token') as string | null;
    if (token) {
      this.writeBridgeConfig(workspace, token, apiUrl);
      return token;
    }

    const generated = randomBytes(24).toString('hex');
    await AgentWorkspace.query().where('id', workspaceId).update({ bridge_token: generated });
    this.writeBridgeConfig(workspace, generated, apiUrl);
    return generated;
  }

  /** Lista os terminais (agentes) do workspace com estado da sessão PTY. */
  async listAgents(workspaceId: string): Promise<BridgeAgent[]> {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    return nodes
      .filter((node) => node.type === 'terminal')
      .map((node) => {
        const payload = node.payload as { provider?: string; command?: string; sessionId?: string; maestro?: boolean };
        const sessionId = payload.sessionId ?? null;
        const session = sessionId ? ptySessionManager.get(sessionId) : null;
        return {
          nodeId: node.id,
          title: node.title ?? 'terminal',
          provider: payload.provider ?? null,
          command: payload.command ?? null,
          sessionId,
          sessionAlive: Boolean(session && !session.exited),
          maestro: Boolean(payload.maestro),
        };
      });
  }

  /**
   * Envia uma mensagem ao terminal de destino e aguarda a resposta:
   * escreve no PTY, acumula a saída e resolve quando o alvo fica ocioso
   * (deteccao de atenção) ou estoura o timeout. Se `from` for informado,
   * a resposta também e injetada de volta no terminal de origem.
   */
  /** Envia bytes brutos ao terminal (controlar TUIs/pagers interativos). */
  async askRaw(workspaceId: string, input: { to: string; message: string }): Promise<{ to: string; sent: boolean }> {
    const agents = await this.listAgents(workspaceId);
    const target = this.findAgent(agents, input.to);
    if (!target.sessionId || !target.sessionAlive) {
      throw new Error(`O agente "${target.title}" não tem uma sessão PTY ativa.`);
    }
    ptySessionManager.write(target.sessionId, input.message);
    // Pulso de "conversando" na edge (raw não tem ciclo de resposta).
    this.broadcastTalking(workspaceId, null, target.nodeId, true);
    const pulse = setTimeout(() => this.broadcastTalking(workspaceId, null, target.nodeId, false), 6_000);
    pulse.unref?.();
    return { to: target.title, sent: true };
  }

  async ask(
    workspaceId: string,
    input: { to: string; message: string; from?: string | null; timeoutMs?: number; signal?: AbortSignal }
  ): Promise<{ to: string; reply: string; timedOut: boolean }> {
    const agents = await this.listAgents(workspaceId);
    const target = this.findAgent(agents, input.to);
    if (!target.sessionId || !target.sessionAlive) {
      throw new Error(`O agente "${target.title}" não tem uma sessão PTY ativa.`);
    }

    const origin = input.from ? this.findAgent(agents, input.from) : null;
    if (origin) await this.ensureEdge(workspaceId, origin.nodeId, target.nodeId);

    // Baseline ANTES de mandar: a resposta só vale quando o transcrito muda
    // (assistente novo depois da nossa mensagem) — nunca o boot do TUI.
    const baseline = await this.transcriptReply(workspaceId, target.nodeId).catch(() => null);

    this.broadcastTalking(workspaceId, origin?.nodeId ?? null, target.nodeId, true);
    let reply: { text: string; timedOut: boolean };
    try {
      reply = await this.askAndWait(target.sessionId, input.message, input.timeoutMs ?? 180_000, input.signal, target.provider);
    } finally {
      this.broadcastTalking(workspaceId, origin?.nodeId ?? null, target.nodeId, false);
    }

    // Resposta LIMPA pelo transcrito da CLI (JSONL em disco — sem lixo de
    // TUI/ANSI, sem status bar, sem caracteres duplicados de redraw). A
    // raspagem de tela crua vazava tudo isso para o composer do outro agente
    // (quebras de linha soltas disparavam submits parciais e até o editor
    // externo do Claude Code). Se o transcrito ainda não mudou (silencio cedo
    // demais: boot, trust screen, composer ecoando), espera ele encher.
    let replyText = await this.transcriptReply(workspaceId, target.nodeId).catch(() => null);
    if (replyText && replyText === baseline) replyText = null;
    if (!replyText) {
      const node = await workspaceRepository.getNode(target.nodeId);
      const payload = (node?.payload ?? {}) as { provider?: string; agentSessionId?: string };
      // Só espera quando a sessão da CLI já foi identificada (transcrito
      // localizavel) — sem isso não há o que pollar e o fallback e imediato.
      if (payload.provider && payload.agentSessionId) {
        const deadline = Date.now() + 90_000;
        while (!replyText && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          const attempt = await this.transcriptReply(workspaceId, target.nodeId).catch(() => null);
          if (attempt && attempt !== baseline) replyText = attempt;
        }
      }
    }
    replyText ??= sanitizeComposerText(reply.text);

    // A resposta chega ao agente de origem pelo RETORNO do comando (stdout da
    // CLI / resultado da tool MCP). NAO injetamos mais no composer de origem:
    // o texto digitado colidia com o que o usuário estava escrevendo naquele
    // terminal (mensagem emendada/corrompida).
    // Voz de volta: o no alvo pode ler a resposta em voz alta (toggle por
    // terminal; TTS na voz/idioma configurados — ver /api/agent-room/voice/speak).
    const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
    broadcast?.({ type: 'agentReply', workspaceId, to: target.nodeId, from: origin?.title ?? null, text: replyText });

    return { to: target.title, reply: replyText, timedOut: reply.timedOut };
  }

  /** Ultima resposta do agente pelo transcrito da CLI (null = indisponivel). */
  private async transcriptReply(workspaceId: string, nodeId: string): Promise<string | null> {
    const node = await workspaceRepository.getNode(nodeId);
    const payload = (node?.payload ?? {}) as { provider?: string; agentSessionId?: string };
    if (!node || !payload.provider || !payload.agentSessionId) return null;
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    let cwd = workspace?.workingDir ?? '.';
    if (node.floorId) {
      const floor = await floorService.get(node.floorId).catch(() => null);
      if (floor?.path) cwd = floor.path;
    }
    return lastReplyText(payload.provider, cwd, payload.agentSessionId);
  }

  /** Avisa o canvas (via broadcast WS) que uma edge esta conversando. */
  private broadcastTalking(workspaceId: string, from: string | null, to: string, talking: boolean) {
    const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
    broadcast?.({ type: 'talking', workspaceId, from, to, talking });
  }

  /** Avisa o canvas para recarregar o conteúdo do workspace (nos/edges/andares). */
  notifyWorkspaceChanged(workspaceId: string) {
    const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
    broadcast?.({ type: 'workspaceChanged', workspaceId });
  }

  async readNote(workspaceId: string, nodeId: string): Promise<{ nodeId: string; title: string; content: string }> {
    const node = await this.requireNoteNode(workspaceId, nodeId);
    return { nodeId: node.id, title: node.title ?? 'nota', content: String((node.payload as { content?: string }).content ?? '') };
  }

  /** Cria uma nota no canvas (e opcionalmente já conecta a um agente ou a todos). */
  async createNote(
    workspaceId: string,
    input: { title: string; content?: string; connect?: string | null }
  ): Promise<{ nodeId: string; title: string; connectedTo: string | null }> {
    const siblings = await workspaceRepository.listNodes(workspaceId);
    const note = await workspaceRepository.createNode({
      workspaceId,
      type: 'note',
      title: input.title.trim(),
      x: 120 + (siblings.length % 4) * 620,
      y: 120 + (Math.floor(siblings.length / 4) % 4) * 460,
      width: 320,
      height: 220,
      payload: { content: input.content ?? '' },
    });
    let connectedTo: string | null = null;
    if (input.connect === 'all') {
      // Specs/briefs do líder: visiveis para o time inteiro.
      const agents = await this.listAgents(workspaceId);
      for (const agent of agents) {
        await this.ensureEdge(workspaceId, note.id, agent.nodeId);
      }
      connectedTo = 'todos os agentes';
    } else if (input.connect) {
      const agents = await this.listAgents(workspaceId);
      const agent = this.findAgent(agents, input.connect);
      await this.ensureEdge(workspaceId, note.id, agent.nodeId);
      connectedTo = agent.title;
    }
    this.notifyWorkspaceChanged(workspaceId);
    return { nodeId: note.id, title: note.title ?? input.title, connectedTo };
  }

  async writeNote(workspaceId: string, nodeId: string, content: string) {
    const node = await this.requireNoteNode(workspaceId, nodeId);
    const payload = { ...(node.payload as Record<string, unknown>), content };
    await workspaceRepository.updateNode(node.id, { payload });
    return { nodeId: node.id, written: content.length };
  }

  async editNote(workspaceId: string, nodeId: string, oldText: string, newText: string) {
    const node = await this.requireNoteNode(workspaceId, nodeId);
    const content = String((node.payload as { content?: string }).content ?? '');
    if (!content.includes(oldText)) {
      throw new Error('Trecho antigo não encontrado na nota.');
    }
    const next = content.replace(oldText, newText);
    const payload = { ...(node.payload as Record<string, unknown>), content: next };
    await workspaceRepository.updateNode(node.id, { payload });
    return { nodeId: node.id, edited: true };
  }

  /** Notas conectadas a um agente (arestas terminal<->nota do workspace). */
  async notesForAgent(workspaceId: string, agentNodeId: string): Promise<string[]> {
    const edges = await workspaceRepository.listEdges(workspaceId);
    const noteIds = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceNodeId === agentNodeId) noteIds.add(edge.targetNodeId);
      if (edge.targetNodeId === agentNodeId) noteIds.add(edge.sourceNodeId);
    }
    const nodes = await workspaceRepository.listNodes(workspaceId);
    return nodes.filter((node) => noteIds.has(node.id) && node.type === 'note').map((node) => node.id);
  }

  /** Portais conectados ao agente (para o `list` da CLI): id, título e URL. */
  async portalsForAgent(workspaceId: string, agentNodeId: string): Promise<Array<{ id: string; title: string; url: string }>> {
    const edges = await workspaceRepository.listEdges(workspaceId);
    const portalIds = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceNodeId === agentNodeId) portalIds.add(edge.targetNodeId);
      if (edge.targetNodeId === agentNodeId) portalIds.add(edge.sourceNodeId);
    }
    const nodes = await workspaceRepository.listNodes(workspaceId);
    return nodes
      .filter((node) => portalIds.has(node.id) && node.type === 'portal')
      .map((node) => ({
        id: node.id,
        title: node.title ?? 'portal',
        url: String((node.payload as { url?: string }).url ?? ''),
      }));
  }

  async notify(workspace: Workspace, message: string): Promise<{ notified: boolean }> {
    // A entrega nativa (Electron Notification) entra na Fase 6; por ora fica
    // registrada no log do servidor e retorna sucesso para a CLI.
    console.log(`[orkestrai:notify] [${workspace.name}] ${message}`);
    return { notified: true };
  }


  // -- Modo Maestro -----------------------------------------------------------

  /** Garante que o agente `from` tem permissao de maestro no workspace. */
  private async requireMaestro(workspaceId: string, from: string): Promise<BridgeAgent> {
    const agents = await this.listAgents(workspaceId);
    const origin = this.findAgent(agents, from);
    const node = await workspaceRepository.getNode(origin.nodeId);
    const maestro = Boolean((node?.payload as { maestro?: boolean } | undefined)?.maestro);
    if (!maestro) {
      throw new Error(`O agente "${origin.title}" não está no Modo Maestro. Ative no nó do terminal.`);
    }
    return origin;
  }

  /**
   * Recruta um novo agente: cria um no terminal no canvas com o comando TUI
   * do provider. Com `replace`, substitui o recruta existente (preserva
   * posicao/nome, troca o comando).
   */
  async recruit(
    workspaceId: string,
    input: { from: string; title: string; provider?: string | null; role?: string | null; x?: number; y?: number; replace?: string | null; floorId?: string | null }
  ) {
    const origin = await this.requireMaestro(workspaceId, input.from);

    const command = this.commandForProvider(input.provider);

    if (input.replace) {
      const agents = await this.listAgents(workspaceId);
      const existing = this.findAgent(agents, input.replace);
      const node = (await workspaceRepository.getNode(existing.nodeId))!;
      const payload = {
        ...(node.payload as Record<string, unknown>),
        ...command,
        role: input.role ?? (node.payload as { role?: string }).role,
        sessionId: undefined,
      };
      delete payload.sessionId;
      const updated = await workspaceRepository.updateNode(node.id, { payload, title: input.title || node.title });
      this.notifyWorkspaceChanged(workspaceId);
      return { nodeId: updated!.id, title: updated!.title, replaced: true };
    }

    // Sem coordenadas explicitas: organograma — fileira abaixo do maestro.
    const position = input.x == null || input.y == null
      ? await this.orgChartPosition(workspaceId, origin.nodeId, input.floorId)
      : null;

    const node = await workspaceRepository.createNode({
      workspaceId,
      type: 'terminal',
      title: await this.uniqueAgentTitle(workspaceId, shortTitle(input.title)),
      x: input.x ?? position!.x,
      y: input.y ?? position!.y,
      width: 640,
      height: 400,
      payload: { ...command, provider: input.provider ?? null, role: input.role ? shortTitle(input.role, 60) : null },
      floorId: input.floorId ?? null,
    });
    // Recruta nasce conectado ao maestro (canal de comunicacao visual).
    await this.ensureEdge(workspaceId, origin.nodeId, node.id);
    this.notifyWorkspaceChanged(workspaceId);
    return { nodeId: node.id, title: node.title, replaced: false };
  }

  /** Título único por workspace: "Dev" ocupado vira "Dev 2", "Dev 3"... (ask ambiguo quebra o roteamento). */
  private async uniqueAgentTitle(workspaceId: string, title: string): Promise<string> {
    const agents = await this.listAgents(workspaceId);
    const taken = new Set(agents.map((agent) => agent.title.toLowerCase()));
    if (!taken.has(title.toLowerCase())) return title;
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${title} ${suffix}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /** Cria a aresta se o par ainda não estiver conectado (qualquer direcao). */
  private async ensureEdge(workspaceId: string, a: string, b: string): Promise<string | null> {
    if (a === b) return null;
    const edges = await workspaceRepository.listEdges(workspaceId);
    const existing = edges.find(
      (edge) =>
        (edge.sourceNodeId === a && edge.targetNodeId === b) ||
        (edge.sourceNodeId === b && edge.targetNodeId === a)
    );
    if (existing) return existing.id;
    const created = await workspaceRepository.createEdge({ workspaceId, sourceNodeId: a, targetNodeId: b });
    return created.id;
  }

  /**
   * Posicao de organograma para um novo recruta: fileiras de 3 abaixo do
   * maestro, offsets estaveis (nos já postos nunca se movem). O maestro só
   * recruta reports diretos, entao uma árvore de 1 nível basta.
   */
  private async orgChartPosition(workspaceId: string, maestroNodeId: string, floorId?: string | null) {
    const maestro = await workspaceRepository.getNode(maestroNodeId);
    const nodes = await workspaceRepository.listNodes(workspaceId);
    const targetFloor = floorId !== undefined ? floorId : ((maestro as { floorId?: string | null } | null)?.floorId ?? null);
    const recruits = nodes.filter(
      (node) => node.type === 'terminal' && node.id !== maestroNodeId && ((node as { floorId?: string | null }).floorId ?? null) === targetFloor
    );
    const index = recruits.length;
    const perRow = 3;
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const leaderCenterX = (maestro?.x ?? 0) + (maestro?.width ?? 640) / 2;
    const leaderBottomY = (maestro?.y ?? 0) + (maestro?.height ?? 400);
    return {
      x: Math.round(leaderCenterX + (col - 1) * 700 - 320),
      y: Math.round(leaderBottomY + 80 + row * 480),
    };
  }

  /** Cria um portal (browser embutido) no canvas e conecta a um agente (default: o maestro). */
  async createPortal(
    workspaceId: string,
    input: { from: string; url: string; title?: string | null; connect?: string | null }
  ): Promise<{ nodeId: string; title: string; url: string; connectedTo: string | null }> {
    const maestro = await this.requireMaestro(workspaceId, input.from);
    const maestroNode = await workspaceRepository.getNode(maestro.nodeId);
    const url = input.url.startsWith('http') ? input.url : defaultPortalUrl(input.url);
    const node = await workspaceRepository.createNode({
      workspaceId,
      type: 'portal',
      title: shortTitle(input.title?.trim() || new URL(url).hostname),
      x: (maestroNode?.x ?? 0) + (maestroNode?.width ?? 640) + 80,
      y: maestroNode?.y ?? 120,
      width: 560,
      height: 400,
      payload: { url },
    });
    let connectedTo = maestro.title;
    if (input.connect && input.connect !== 'all') {
      const agents = await this.listAgents(workspaceId);
      const agent = this.findAgent(agents, input.connect);
      await this.ensureEdge(workspaceId, agent.nodeId, node.id);
      connectedTo = agent.title;
    } else {
      if (input.connect === 'all') {
        const agents = await this.listAgents(workspaceId);
        for (const agent of agents) await this.ensureEdge(workspaceId, agent.nodeId, node.id);
        connectedTo = 'todos os agentes';
      }
      await this.ensureEdge(workspaceId, maestro.nodeId, node.id);
    }
    this.notifyWorkspaceChanged(workspaceId);
    return { nodeId: node.id, title: node.title ?? url, url, connectedTo };
  }

  /**
   * Garante que existe um no de quadro (tasks) no canvas — criado na primeira
   * tarefa para o kanban não ficar invisivel "por baixo dos panos". O quadro
   * nasce conectado ao maestro (ou ao primeiro terminal).
   */
  async ensureTasksBoard(workspaceId: string): Promise<void> {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    if (nodes.some((node) => node.type === 'tasks')) return;
    const anchor = nodes.find((node) => node.type === 'terminal' && Boolean((node.payload as { maestro?: boolean }).maestro))
      ?? nodes.find((node) => node.type === 'terminal');
    const board = await workspaceRepository.createNode({
      workspaceId,
      type: 'tasks',
      title: 'Tarefas',
      x: (anchor?.x ?? 0) + (anchor?.width ?? 640) + 80,
      y: (anchor?.y ?? 120) + 80,
      width: 480,
      height: 360,
      payload: {},
    });
    if (anchor) await this.ensureEdge(workspaceId, anchor.id, board.id);
    this.notifyWorkspaceChanged(workspaceId);
  }

  /** Dispensa um recruta: mata a sessão PTY e remove o no do canvas. */
  async dismiss(workspaceId: string, input: { from: string; target: string }) {
    const origin = await this.requireMaestro(workspaceId, input.from);
    const agents = await this.listAgents(workspaceId);
    const target = this.findAgent(agents, input.target);
    if (target.nodeId === origin.nodeId) throw new Error('O maestro não pode dispensar a si mesmo.');
    if (target.sessionId) ptySessionManager.kill(target.sessionId);
    await workspaceRepository.deleteNode(target.nodeId);
    this.notifyWorkspaceChanged(workspaceId);
    return { dismissed: target.title };
  }

  /** Reatribui papel (e opcionalmente prompt) de um recruta, preservando o no. */
  async reassignRole(workspaceId: string, input: { from: string; target: string; role: string; prompt?: string | null }) {
    await this.requireMaestro(workspaceId, input.from);
    const agents = await this.listAgents(workspaceId);
    const target = this.findAgent(agents, input.target);
    const node = (await workspaceRepository.getNode(target.nodeId))!;
    const payload: Record<string, unknown> = { ...(node.payload as Record<string, unknown>), role: input.role };
    if (input.prompt != null) payload.rolePrompt = input.prompt;
    await workspaceRepository.updateNode(node.id, { payload });
    return { nodeId: node.id, role: input.role };
  }

  /** Conecta dois nos do canvas (qualquer par), exigindo maestro. */
  async connectNodes(workspaceId: string, input: { from: string; source?: string | null; to: string }) {
    const maestro = await this.requireMaestro(workspaceId, input.from);
    const agents = await this.listAgents(workspaceId);
    const origin = input.source ? this.findAgent(agents, input.source) : maestro;
    const target = this.findAgent(agents, input.to);
    const edgeId = await this.ensureEdge(workspaceId, origin.nodeId, target.nodeId);
    this.notifyWorkspaceChanged(workspaceId);
    return { edgeId, from: origin.title, to: target.title };
  }

  private commandForProvider(provider?: string | null): { command: string; args: string[] } {
    if (!provider || !hasAgentAdapter(provider)) return { command: defaultShell(), args: [] };
    const spec = getAgentAdapter(provider).interactiveCommand();
    return { command: spec.command, args: spec.args };
  }

  /** Conteúdo da skill da ponte (extraido para comparar/atualizar installs antigas). */
  bridgeSkillContent(): string {
    return `---
name: orkestrai-bridge
description: Ponte com o canvas do Orkestrai. Use SEMPRE que precisar falar com outro agente, montar/orquestrar um time de agentes, recrutar ou dispensar agentes, distribuir tarefas no quadro (kanban), criar notas, controlar portais (browser) ou gerenciar andares (worktrees git).
---

# Ponte Orkestrai

Você está rodando dentro de um workspace do Orkestrai. A CLI \`orkestrai\` dá acesso à ponte.
Sua identidade já está no ambiente (ORKESTRAI_NODE_ID) — a CLI sabe quem você é, então \`--from\` e \`--agent\` são opcionais.
Se \`orkestrai\` não resolver no seu shell (acontece em alguns executores, ex.: Codex no Windows), chame a CLI DIRETO pelo node: \`node "$ORKESTRAI_CLI" ...\` (Linux/macOS), \`node %ORKESTRAI_CLI% ...\` (cmd.exe) ou \`node $env:ORKESTRAI_CLI ...\` (PowerShell) — o caminho completo da CLI está na variável de ambiente ORKESTRAI_CLI e funciona sempre, sem depender de PATH.
Se as tools \`orkestrai\` (list/ask/note_*/task_*/portal_*/floor_*/notify/port/recruit/dismiss) estiverem disponíveis como MCP neste ambiente, PREFIRA elas (chamadas tipadas, sem parse de shell) — a CLI continua valendo como fallback.

- \`orkestrai list\` — lista os agentes do workspace (título, provider, sessão viva) e SUAS notas e portais conectados. O agente marcado com [LIDER] e o maestro do time: "Maestro" e o PAPEL, não um título — fale com o líder pelo TITULO dele (ex.: \`orkestrai ask "Líder" ...\`), nunca por \`orkestrai ask "Maestro"\` (esse agente não existe).
- \`orkestrai ask "<TituloDoAgente>" "<mensagem>"\` — envia uma mensagem a outro agente e aguarda a resposta.
- \`orkestrai note read <nodeId>\` — lê uma nota conectada a você.
- \`orkestrai note create "<título>" [--content "<texto>"] [--connect "<Agente>"|all]\` — cria uma nota no canvas (default: conecta ao time inteiro).
- \`orkestrai note write <nodeId> "<conteúdo>"\` — substitui o conteúdo da nota.
- \`orkestrai note edit <nodeId> "<trecho antigo>" "<trecho novo>"\` — edição pontual.
- \`orkestrai task list\` — quadro de tarefas do workspace. Tarefas podem ter IMAGENS DE REFERÊNCIA (paths relativos ao workspace, ex.: .orkestrai/images/x.png) — leia o arquivo se a referência for útil para a execução.
- \`orkestrai task columns\` — lista as etapas configuradas pelo usuário neste quadro. Nunca suponha que todo workspace usa somente "a fazer / fazendo / feito".
- \`orkestrai task add "<título>" --assign "<Agente>" [--column "<etapa>"]\` — cria tarefa, opcionalmente numa etapa específica, e já despacha para o agente.
- \`orkestrai task move <taskId> "<etapa>"\` — move o trabalho entre as etapas personalizadas. O líder deve refletir no quadro o estado real de cada entrega.
- \`orkestrai task done <taskId>\` — marca a tarefa atribuída a você como concluída.
- \`orkestrai task archive <taskId>\` / \`task archive-done\` — arquiva concluídas: saem do quadro, ficam no histórico. Lidere a limpeza do quadro ao fechar uma frente.
- \`orkestrai task history\` — histórico do workspace (concluídas + arquivadas, da mais recente): o "o que já foi feito" do projeto.
- \`orkestrai task add "<título>" --note "<título-da-nota>"\` / \`task link <taskId> <nota>\` / \`task unlink <taskId>\` — vincula a tarefa à sua nota de spec. SEMPRE vincule: tarefa com spec vinculada é autossuficiente. Regras: UMA nota por tarefa (a mesma nota pode servir várias tarefas); ao arquivar a tarefa, a nota sai do canvas JUNTO (fica acessível pelo histórico); nota vinculada não é apagada pelo X do canvas — só sai de verdade junto com a tarefa (ou se desvinculada).
- \`orkestrai portal create "<url>" [--title "<t>"] [--connect "<Agente>"|all]\` — cria um portal (browser) no canvas.
- \`orkestrai portal <nodeId> navigate "<url>"\` — abre uma URL no portal conectado.
- \`orkestrai portal <nodeId> eval "<js>"\` — executa JS na página e retorna o resultado.
- \`orkestrai portal <nodeId> dom\` — devolve o HTML atual (ler telas, pesquisar, testar o que você está construindo).
- \`orkestrai portal <nodeId> screenshot\` — captura a tela do portal.
- \`orkestrai floor create "<nome>" [--clone]\` — cria um andar (worktree git com branch própria) para trabalho isolado.
- \`orkestrai floor list\` / \`floor preview <id>\` / \`floor land <id>\` / \`floor remove <id>\` — gerencia andares; preview mostra conflitos ANTES do merge.
- \`orkestrai notify "<mensagem>"\` — notificação NATIVA no desktop do usuário (use ao concluir ou ao precisar de atenção).
- \`orkestrai port\` — devolve uma porta LIVRE para subir servidores; \`orkestrai port --check <porta>\` testa se uma porta está livre.
- \`orkestrai fs read <path>\` / \`fs write <path> <conteúdo>\` / \`fs search <termo> [--content]\` — arquivos do workspace via ponte.
- \`orkestrai run <taskId>\` — re-despacha a tarefa para o responsável (re-tentar/re-briefar).
- \`orkestrai say "<texto>"\` — fala em voz alta no desktop do usuário, na voz configurada.
- \`orkestrai notes\` / \`orkestrai portals\` — listagens rapidas das suas notas/portais.
- \`orkestrai clip\` — lê a área de transferência local.

## Portas e processos (varios workspaces rodam AO MESMO TEMPO nesta maquina)

- Ao subir QUALQUER servidor (dev server, preview, API local), NUNCA assuma a porta padrão (5173, 3000...): ela pode estar em uso por OUTRO workspace/time. Pegue uma porta livre e use-a: \`PORTA=$(orkestrai port)\` e então ex.: \`npm run dev -- --port $PORTA\` ou \`npx vite --port $PORTA\`.
- NUNCA mate processos por porta (\`kill $(lsof -ti :5173)\`, \`fuser -k\`, Stop-Process etc.) — o processo pode ser de outro time e você derruba o trabalho dele. Porta ocupada? Escolha OUTRA com \`orkestrai port\`; não mate nada.
- Depois de subir o servidor, REGISTRE a porta: diga ao líder (\`orkestrai ask\`) ou escreva na nota do projeto — o portal e o time precisam da URL certa.

Ao aterrissar (land), conflitos NÃO são resolvidos automaticamente — o erro lista os arquivos em conflito; resolva-os você mesmo no checkout principal (ou atribua a um agente) e repita o land.

Use \`--json\` para saída estruturada em qualquer comando.

## Orquestrar times (Modo Maestro) — OBRIGATÓRIO para o líder

Se você é o líder (Modo Maestro), você NUNCA executa o trabalho sozinho: você orquestra — isso vale INCLUSIVE quando o time trava, demora ou erra. Se der ruim, você DESBLOQUEIA o time (passo 7); assumir o trabalho é falha de orquestração, não solução. Ao receber um projeto/tarefa grande:

PROIBIDO usar subagentes internos da sua CLI (Task, background agents, subagentes em segundo plano) para montar o time: eles NÃO aparecem no canvas, NÃO têm terminal próprio e o usuário não vê nem gerencia nada. TODO agente do time precisa existir no canvas — recrute SEMPRE com \`orkestrai recruit\`.

1. PRIMEIRO proponha o time: liste os agentes sugeridos (título, provider, role de cada um) e pergunte quais ele quer criar — não crie nada sem aprovação. VARIE os providers: times com 3+ agentes devem misturar claude, codex, kimi e opencode (ex.: codex implementa, claude revisa/arquiteta, kimi cuida de design/docs) — NUNCA crie o time inteiro com um provider só.
2. Aprovado, crie com \`orkestrai recruit "<Título>" [--provider claude|codex|kimi|opencode] [--role <papel>]\`. Recrutas nascem CONECTADOS a você no organograma (não precisa de \`connect\`). Use títulos CURTOS (2-3 palavras, ex.: "Dev API", "Designer UI") e roles de UMA palavra ("frontend", "qa", "design") — descrições longas vão para a nota de briefing.
3. Escreva o spec/briefing do projeto numa nota: \`orkestrai note create "Spec — <projeto>" --content "..." --connect all\` (sem --connect, a nota já conecta ao time inteiro por padrão).
4. Trabalho em código? Cada agente trabalha no PRÓPRIO ANDAR (worktree isolada): \`orkestrai floor create "<frente>"\` antes do agente começar — NUNCA deixe vários agentes codando na mesma branch. Integre depois com \`orkestrai floor preview\` (vê conflitos) e \`orkestrai floor land\`.
5. Distribua o trabalho com \`orkestrai task add --assign\` (o quadro kanban aparece no canvas sozinho na primeira tarefa), notas com \`orkestrai note create\` e \`orkestrai ask\` (quem conversa fica conectado por aresta automaticamente). HANDOFF: cada task tem que ser AUTOSSUFICIENTE (a descrição diz o que fazer e onde está o spec) OU citar o id de uma nota que JÁ EXISTE e já está conectada ao agente — NUNCA atribua uma task que depende de uma nota/artefato que você ainda não criou. E cada agente PRODUZ os próprios artefatos: o designer CRIA a nota de design com \`orkestrai note create\`; não fica esperando o líder mandar uma — deixe isso explícito na descrição da task.
6. Projeto web? CRIE UM PORTAL para acompanhar/verificar o resultado ao vivo: \`orkestrai portal create "http://localhost:<porta-do-dev-server>" --connect all\` e use \`orkestrai portal <nodeId> dom|screenshot|eval\` para testar o que o time está construindo. A porta do dev server vem de \`orkestrai port\` (NUNCA a padrão 5173/3000 — outro workspace pode estar usando).
7. Acompanhe o quadro com \`orkestrai task list\`, cobre os agentes com \`orkestrai ask\` e integre o trabalho dos andares com \`orkestrai floor preview/land\`. DESBLOQUEIO (regra dura): se um agente travar, ficar em silêncio ou pedir algo (uma nota, um id, um esclarecimento), VOCÊ resolve na hora — responda com \`orkestrai ask\`, crie/edite a nota que falta (\`orkestrai note create ... --connect "<Agente>"\`) e devolva o id. Implementar a tarefa VOCÊ MESMO é o último recurso, só depois de tentar desbloquear e o agente realmente não dar conta — e, mesmo assim, prefira reatribuir a outro agente com \`orkestrai task add --assign\`. Time travado é problema de coordenação do líder, não motivo para assumir o trabalho.
8. AO CONCLUIR (ou quando precisar de atenção/aprovação do usuário), chame \`orkestrai notify "<resumo do que foi entregue>"\` — vira notificação nativa no desktop do usuário. NUNCA termine em silêncio.
9. Ao finalizar uma frente, dispense o que não precisa mais com \`orkestrai dismiss <agente>\` — o time nasce e morre sob demanda.

Se uma tarefa exigir uma habilidade que você não tem, você pode AUTORAR uma skill: crie \`.claude/skills/<nome>/SKILL.md\` (frontmatter com name/description + instruções). Skills novas são descobertas nas próximas sessões do agente.
`;
  }

  /**
   * Provisiona a skill da ponte nos diretórios convencionais dos agentes
   * (.claude/skills e .orkestrai) ao conectar dois terminais.
   */
  provisionSkill(workspace: Workspace, token: string): void {
    const skill = this.bridgeSkillContent();
    try {
      const dirs = [
        resolve(workspace.workingDir, '.claude', 'skills', 'orkestrai'),
        resolve(workspace.workingDir, '.orkestrai'),
      ];
      for (const dir of dirs) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, 'SKILL.md'), skill);
      }
      // .mcp.json na raiz do projeto: agentes que falam MCP (Claude, Kimi...)
      // ganham as ações do canvas como TOOLS nativas via `orkestrai mcp`.
      // MERGE — nunca sobrescreve os servidores que o usuário já configurou.
      const mcpPath = resolve(workspace.workingDir, '.mcp.json');
      let mcpConfig: { mcpServers?: Record<string, unknown> } = {};
      try {
        mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
      } catch {
        // não existe ou inválido — cria do zero
      }
      const current = JSON.stringify(mcpConfig.mcpServers?.orkestrai ?? null);
      const desired = { command: 'orkestrai', args: ['mcp'] };
      if (current !== JSON.stringify(desired)) {
        mcpConfig.mcpServers = { ...(mcpConfig.mcpServers ?? {}), orkestrai: desired };
        writeFileSync(mcpPath, `${JSON.stringify(mcpConfig, null, 2)}\n`);
      }
      this.provisionAgentsMd(workspace.workingDir);
      this.provisionCodexMcp();
      this.provisionOpenCodeMcp(workspace.workingDir);
      // Em repos git, exclui os arquivos da ponte do status (info/exclude
      // local) — senao o checkout fica "sujo" e o land de andares falha.
      const gitDir = resolve(workspace.workingDir, '.git');
      if (existsSync(gitDir)) {
        const excludePath = resolve(gitDir, 'info', 'exclude');
        const currentExclude = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
        const additions = ['.orkestrai/', '.claude/skills/orkestrai/', '.mcp.json', 'opencode.json', 'AGENTS.md'].filter((entry) => !currentExclude.includes(entry));
        if (additions.length) {
          mkdirSync(resolve(gitDir, 'info'), { recursive: true });
          writeFileSync(excludePath, `${currentExclude.replace(/\n?$/, '\n')}${additions.join('\n')}\n`);
        }
      }
    } catch {
      // Sem permissao de escrita no working_dir não bloqueia a conexão.
    }
    this.writeBridgeConfig(workspace, token);
  }

  /** Bloco AGENTS.md: o que Codex, Kimi e OpenCode leem (eles não leem .claude/skills). */
  private agentsMdBlock(): string {
    return [
      '<!-- orkestrai:begin -->',
      '## Ponte Orkestrai (agentes)',
      '',
      'Este projeto roda dentro de um workspace do Orkestrai. Você tem a CLI `orkestrai` e/ou tools MCP `orkestrai` disponíveis para colaborar com o time no canvas:',
      '- `orkestrai list` — agentes do workspace, notas e portais conectados. O [LIDER] marcado e o maestro do time: fale com ele pelo TITULO ("Maestro" e o papel, não um nome de agente).',
      '- `orkestrai ask "<Agente>" "<mensagem>"` — fala com outro agente e aguarda a resposta.',
      '- `orkestrai note read/write/edit/create` — notas compartilhadas no canvas.',
      '- `orkestrai task list/columns/add/move/done` — quadro do time; consulte `task columns` e respeite as etapas personalizadas pelo usuário.',
      '- `orkestrai floor create/preview/land` — andares (worktrees git) isolados por frente.',
      '- `orkestrai notify "<msg>"` — notificação nativa para o usuário ao concluir.',
      '- Sua identidade está no ambiente (ORKESTRAI_NODE_ID) — `--from`/`--agent` são opcionais. Se `orkestrai` não resolver no PATH, use `node "$ORKESTRAI_CLI" ...`.',
      '- Se as tools MCP `orkestrai` estiverem disponíveis, PREFIRA elas (chamadas tipadas); a CLI e o fallback.',
      '- Detalhes completos: `.claude/skills/orkestrai/SKILL.md` ou `.orkestrai/SKILL.md`.',
      '<!-- orkestrai:end -->',
    ].join('\n');
  }

  /** Escreve/mescla o bloco da ponte no AGENTS.md (preserva o conteúdo do usuário). */
  private provisionAgentsMd(workingDir: string): void {
    const path = resolve(workingDir, 'AGENTS.md');
    const block = this.agentsMdBlock();
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const pattern = /<!-- orkestrai:begin -->[\s\S]*?<!-- orkestrai:end -->/;
    if (pattern.test(current)) {
      const next = current.replace(pattern, block);
      if (next !== current) writeFileSync(path, next);
      return;
    }
    writeFileSync(path, `${current.replace(/\s*$/, '\n\n')}${block}\n`);
  }

  /** Codex le MCP de ~/.codex/config.toml ([mcp_servers.*]) — não le .mcp.json. */
  private provisionCodexMcp(): void {
    if (process.env.VITEST) return;
    const dir = resolve(homedir(), '.codex');
    if (!existsSync(dir)) return; // codex não instalado — não polui o HOME
    const path = resolve(dir, 'config.toml');
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const cliEntry = process.env.ORKESTRAI_CLI ?? resolve(process.cwd(), 'packages', 'orkestrai-cli', 'bin', 'orkestrai.js');
    const runtime = process.env.ORKESTRAI_CLI_RUNTIME ?? process.execPath;
    const next = upsertCodexMcpConfig(current, {
      command: runtime,
      args: [cliEntry, 'mcp'],
      electronRuntime:
        process.env.ORKESTRAI_CLI_RUNTIME_IS_ELECTRON === '1' || Boolean(process.versions.electron),
    });
    if (next !== current) writeFileSync(path, next);
  }

  /** OpenCode le MCP do opencode.json do projeto (secao "mcp", type local). */
  private provisionOpenCodeMcp(workingDir: string): void {
    const path = resolve(workingDir, 'opencode.json');
    let config: { mcp?: Record<string, unknown> } & Record<string, unknown> = {};
    try {
      config = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      // não existe ou inválido — cria do zero
    }
    const desired = { type: 'local', command: ['orkestrai', 'mcp'], enabled: true };
    if (JSON.stringify(config.mcp?.orkestrai ?? null) === JSON.stringify(desired)) return;
    config.mcp = { ...(config.mcp ?? {}), orkestrai: desired };
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  }

  // -- Internos ---------------------------------------------------------------

  private findAgent(agents: BridgeAgent[], query: string): BridgeAgent {
    const normalized = query.trim().toLowerCase();
    const exact = agents.filter((item) => item.title.toLowerCase() === normalized);
    if (exact.length > 1) {
      throw new Error(`Há ${exact.length} agentes chamados "${query}" — renomeie um deles (duplo-clique no título do no) ou use o id do no.`);
    }
    const agent =
      agents.find((item) => item.nodeId === query) ??
      exact[0] ??
      agents.find((item) => item.title.toLowerCase().includes(normalized));
    if (!agent) {
      throw new Error(`Agente "${query}" não encontrado. Use orkestrai list para ver os disponíveis.`);
    }
    return agent;
  }

  private async requireNoteNode(workspaceId: string, nodeId: string): Promise<CanvasNode> {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'note') {
      throw new Error('Nota não encontrada neste workspace.');
    }
    return node;
  }

  private askAndWait(
    sessionId: string,
    message: string,
    timeoutMs: number,
    signal?: AbortSignal,
    provider?: string | null
  ): Promise<{ text: string; timedOut: boolean }> {
    return new Promise((resolvePromise, reject) => {
      let captured = '';
      let capturedAtSend = 0;
      let done = false;
      const sentAt = Date.now();
      let lastOutputAt = sentAt;

      // Conclusao por silencio: só termina depois de saída real seguida de
      // QUIET_MS sem novos bytes, e nunca antes de MIN_AFTER_SEND_MS — sem o
      // piso, um agente já ocioso dispara "waiting" no eco da propria
      // mensagem e a resposta se perde.
      const MIN_AFTER_SEND_MS = 3_500;
      const QUIET_MS = 2_000;
      let retryTimer: ReturnType<typeof setInterval> | null = null;

      let cancelQueuedDelivery: (() => boolean) | null = null;
      const finish = (timedOut: boolean) => {
        if (done) return;
        done = true;
        cancelQueuedDelivery?.();
        if (timer) clearTimeout(timer);
        if (quietTimer) clearTimeout(quietTimer);
        if (retryTimer) clearInterval(retryTimer);
        signal?.removeEventListener('abort', onAbort);
        detach();
        // Só conta o que saiu DEPOIS do envio (boot paint não e resposta).
        resolvePromise({ text: stripAnsi(captured.slice(capturedAtSend)), timedOut });
      };

      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      let sent = false;
      let sentRealAt = 0;
      const maybeFinish = () => {
        if (done || !sent) return; // boot quieto NAO e resposta — só vale depois do envio
        const now = Date.now();
        const quietFor = now - lastOutputAt;
        const elapsed = now - sentRealAt;
        // TUIs de provider precisam de tempo para pensar (8s pos-envio); o
        // quieto imediato após o eco não e resposta — e o retry do Enter atua
        // nessa janela. Shell puro segue o piso classico.
        const sessInfo = ptySessionManager.get(sessionId);
        const isTui = Boolean(provider && sessInfo && /claude|codex|kimi|opencode/.test(sessInfo.command));
        const minElapsed = isTui ? 8_000 : MIN_AFTER_SEND_MS;
        if (captured.length > capturedAtSend && quietFor >= QUIET_MS && elapsed >= minElapsed) {
          finish(false);
          return;
        }
        const wait = Math.min(Math.max(QUIET_MS - quietFor, minElapsed - elapsed, 250), 3_000);
        quietTimer = setTimeout(maybeFinish, wait);
      };

      const onAbort = () => finish(true);
      let timer: ReturnType<typeof setTimeout> | null = null;

      let detachFn: (() => void) | null = null;
      try {
        const attached = ptySessionManager.attach(
          sessionId,
          (data) => {
            captured += data;
            lastOutputAt = Date.now();
          },
          undefined,
          (waiting) => {
            if (waiting) maybeFinish();
          }
        );
        detachFn = attached.detach;
      } catch (error) {
        if (timer) clearTimeout(timer);
        reject(error);
        return;
      }
      const detach = () => detachFn?.();

      if (signal?.aborted) {
        finish(true);
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      const send = () => {
        const delivery = ptySessionManager.queueWithSubmit(sessionId, message, 120);
        cancelQueuedDelivery = delivery.cancel;
        delivery.submitted
          .then(() => {
            if (done) return;
            cancelQueuedDelivery = null;
            // Ignora boot/eco/comandos observados enquanto a mensagem aguardava
            // um rascunho humano ser enviado. Daqui em diante e resposta real.
            capturedAtSend = captured.length;
            sent = true;
            sentRealAt = Date.now();
            lastOutputAt = sentRealAt;
            timer = setTimeout(() => finish(true), timeoutMs);
            // Seguro contra Enter engolido: o eco do texto engana o "output
            // novo". O que conta e ATIVIDADE RECENTE: se ficou quieto de novo
            // (composer parado, nada processando), tenta reenviar o \r. O
            // gerenciador recusa se o usuário já tiver iniciado outro rascunho.
            let retries = 0;
            retryTimer = setInterval(() => {
              if (done || retries >= 3) {
                if (retryTimer) clearInterval(retryTimer);
                return;
              }
              if (Date.now() - lastOutputAt < 3_500) return; // atividade recente: segue
              retries += 1;
              try {
                ptySessionManager.submitIfComposerFree(sessionId);
              } catch {
                finish(true);
              }
            }, 4_000);
            retryTimer.unref?.();
            // Rede de segurança caso o evento de ociosidade nunca dispare.
            quietTimer = setTimeout(maybeFinish, MIN_AFTER_SEND_MS);
          })
          .catch(() => finish(true));
      };

      // PRONTIDAO: escrever durante o boot faz o Enter virar newline no
      // composer (Kimi) ou cair no limbo. Agente de provider (TUI): só escreve
      // quando JA PRODUZIU output E ficou ocioso E a sessão tem idade minima
      // (o boot do Kimi e bifasico: paint, depois MCP/sessão — o ocioso de
      // 2.5s dispara no meio). Shell puro/desconhecido: escreve na hora.
      const readyDeadline = Date.now() + 30_000;
      const waitReady = () => {
        if (done) return;
        const sess = ptySessionManager.get(sessionId);
        const ageMs = sess ? Date.now() - Date.parse(sess.createdAt) : 0;
        // A espera só vale para TUIs de provider de verdade (claude/codex/
        // kimi/opencode): shell puro (ou provider simulado em teste) manda na hora.
        const isTui = Boolean(provider && sess && /claude|codex|kimi|opencode/.test(sess.command));
        const ready = Boolean(sess?.hasOutput && sess.waiting && ageMs >= 12_000);
        if (!sess || sess.exited || !isTui || ready || Date.now() >= readyDeadline) {
          send();
          return;
        }
        setTimeout(waitReady, 400);
      };
      waitReady();
    });
  }

  private writeBridgeConfig(workspace: Workspace, token: string, apiUrl?: string) {
    try {
      const dir = resolve(workspace.workingDir, '.orkestrai');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, 'workspace.json'),
        JSON.stringify(
          {
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            token,
            apiUrl: apiUrl ?? process.env.ORKESTRAI_API_URL ?? 'http://127.0.0.1:4173',
          },
          null,
          2
        )
      );
    } catch {
      // Config local e conveniencia; não bloqueia o fluxo.
    }
  }
}

export const bridgeService = new BridgeService();
