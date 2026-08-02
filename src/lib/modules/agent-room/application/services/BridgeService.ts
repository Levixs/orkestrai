import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanvasNode, Workspace } from '../../domain/types.js';
import { AgentWorkspace } from '../../domain/models/AgentWorkspace.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.ts';
import { getAgentAdapter, hasAgentAdapter } from '../adapters/registry.js';
import { defaultShell } from '../../infrastructure/workspace.js';

export type BridgeAgent = {
  nodeId: string;
  title: string;
  provider: string | null;
  command: string | null;
  sessionId: string | null;
  sessionAlive: boolean;
};

// Remove sequencias ANSI (cores, cursor, etc.) do output de TUIs.
const ANSI_PATTERN = /[[][0-9;?]*[a-zA-Z]|\][^]*|[()][0-9A-B]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '').replace(/\r\n/g, '\n').trim();
}

/**
 * Ponte agente<->app: autentica chamadas da CLI `orkestrai` por token de
 * workspace, lista agentes, injeta mensagens em terminais PTY (ask com
 * resposta), le/escreve notas e provisiona arquivos de skill/config.
 */
export class BridgeService {
  /** Resolve o workspace dono do token; lanca erro se invalido. */
  async resolveWorkspaceByToken(token: string): Promise<Workspace> {
    const model = await AgentWorkspace.query().where('bridge_token', token).first();
    if (!model) throw new Error('Token de bridge invalido.');
    const workspace = await workspaceRepository.getWorkspace(model.getAttribute('id'));
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return workspace;
  }

  /** Token do workspace, gerando (e persistindo config) se ainda nao existir. */
  async getOrCreateToken(workspaceId: string, apiUrl?: string): Promise<string> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');

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

  /** Lista os terminais (agentes) do workspace com estado da sessao PTY. */
  async listAgents(workspaceId: string): Promise<BridgeAgent[]> {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    return nodes
      .filter((node) => node.type === 'terminal')
      .map((node) => {
        const payload = node.payload as { provider?: string; command?: string; sessionId?: string };
        const sessionId = payload.sessionId ?? null;
        const session = sessionId ? ptySessionManager.get(sessionId) : null;
        return {
          nodeId: node.id,
          title: node.title ?? 'terminal',
          provider: payload.provider ?? null,
          command: payload.command ?? null,
          sessionId,
          sessionAlive: Boolean(session && !session.exited),
        };
      });
  }

  /**
   * Envia uma mensagem ao terminal de destino e aguarda a resposta:
   * escreve no PTY, acumula a saida e resolve quando o alvo fica ocioso
   * (deteccao de atencao) ou estoura o timeout. Se `from` for informado,
   * a resposta tambem e injetada de volta no terminal de origem.
   */
  /** Envia bytes brutos ao terminal (controlar TUIs/pagers interativos). */
  async askRaw(workspaceId: string, input: { to: string; message: string }): Promise<{ to: string; sent: boolean }> {
    const agents = await this.listAgents(workspaceId);
    const target = this.findAgent(agents, input.to);
    if (!target.sessionId || !target.sessionAlive) {
      throw new Error(`O agente "${target.title}" nao tem uma sessao PTY ativa.`);
    }
    ptySessionManager.write(target.sessionId, input.message);
    // Pulso de "conversando" na edge (raw nao tem ciclo de resposta).
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
      throw new Error(`O agente "${target.title}" nao tem uma sessao PTY ativa.`);
    }

    const origin = input.from ? this.findAgent(agents, input.from) : null;
    this.broadcastTalking(workspaceId, origin?.nodeId ?? null, target.nodeId, true);
    let reply: { text: string; timedOut: boolean };
    try {
      reply = await this.askAndWait(target.sessionId, input.message, input.timeoutMs ?? 180_000, input.signal);
    } finally {
      this.broadcastTalking(workspaceId, origin?.nodeId ?? null, target.nodeId, false);
    }

    if (origin?.sessionId && origin.sessionAlive) {
      const injection = `[resposta de ${target.title}] ${reply.text}\n`;
      ptySessionManager.write(origin.sessionId, injection);
    }

    return { to: target.title, reply: reply.text, timedOut: reply.timedOut };
  }

  /** Avisa o canvas (via broadcast WS) que uma edge esta conversando. */
  private broadcastTalking(workspaceId: string, from: string | null, to: string, talking: boolean) {
    const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
    broadcast?.({ type: 'talking', workspaceId, from, to, talking });
  }

  /** Avisa o canvas para recarregar o conteudo do workspace (nos/edges/andares). */
  notifyWorkspaceChanged(workspaceId: string) {
    const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
    broadcast?.({ type: 'workspaceChanged', workspaceId });
  }

  async readNote(workspaceId: string, nodeId: string): Promise<{ nodeId: string; title: string; content: string }> {
    const node = await this.requireNoteNode(workspaceId, nodeId);
    return { nodeId: node.id, title: node.title ?? 'nota', content: String((node.payload as { content?: string }).content ?? '') };
  }

  /** Cria uma nota no canvas (e opcionalmente ja conecta a um agente). */
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
    if (input.connect) {
      const agents = await this.listAgents(workspaceId);
      const agent = this.findAgent(agents, input.connect);
      await workspaceRepository.createEdge({ workspaceId, sourceNodeId: note.id, targetNodeId: agent.nodeId });
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
      throw new Error('Trecho antigo nao encontrado na nota.');
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

  /** Portais conectados ao agente (para o `list` da CLI): id, titulo e URL. */
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
      throw new Error(`O agente "${origin.title}" nao esta no Modo Maestro. Ative no no do terminal.`);
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
    await this.requireMaestro(workspaceId, input.from);

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

    const node = await workspaceRepository.createNode({
      workspaceId,
      type: 'terminal',
      title: input.title,
      x: input.x ?? 120,
      y: input.y ?? 120,
      width: 640,
      height: 400,
      payload: { ...command, provider: input.provider ?? null, role: input.role ?? null },
      floorId: input.floorId ?? null,
    });
    this.notifyWorkspaceChanged(workspaceId);
    return { nodeId: node.id, title: node.title, replaced: false };
  }

  /** Dispensa um recruta: mata a sessao PTY e remove o no do canvas. */
  async dismiss(workspaceId: string, input: { from: string; target: string }) {
    const origin = await this.requireMaestro(workspaceId, input.from);
    const agents = await this.listAgents(workspaceId);
    const target = this.findAgent(agents, input.target);
    if (target.nodeId === origin.nodeId) throw new Error('O maestro nao pode dispensar a si mesmo.');
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
    const edge = await workspaceRepository.createEdge({
      workspaceId,
      sourceNodeId: origin.nodeId,
      targetNodeId: target.nodeId,
    });
    this.notifyWorkspaceChanged(workspaceId);
    return { edgeId: edge.id, from: origin.title, to: target.title };
  }

  private commandForProvider(provider?: string | null): { command: string; args: string[] } {
    if (!provider || !hasAgentAdapter(provider)) return { command: defaultShell(), args: [] };
    const spec = getAgentAdapter(provider).interactiveCommand();
    return { command: spec.command, args: spec.args };
  }

  /** Conteudo da skill da ponte (extraido para comparar/atualizar installs antigas). */
  bridgeSkillContent(): string {
    return `---
name: orkestrai-bridge
description: Ponte com o canvas do Orkestrai. Use SEMPRE que precisar falar com outro agente, montar/orquestrar um time de agentes, recrutar ou dispensar agentes, distribuir tarefas no quadro (kanban), criar notas, controlar portais (browser) ou gerenciar andares (worktrees git).
---

# Ponte Orkestrai

Voce esta rodando dentro de um workspace do Orkestrai. A CLI \`orkestrai\` da acesso a ponte.
Sua identidade ja esta no ambiente (ORKESTRAI_NODE_ID) — a CLI sabe quem voce e, entao \`--from\` e \`--agent\` sao opcionais.

- \`orkestrai list\` — lista os agentes do workspace (titulo, provider, sessao viva) e SUAS notas e portais conectados.
- \`orkestrai ask "<TituloDoAgente>" "<mensagem>"\` — envia uma mensagem a outro agente e aguarda a resposta.
- \`orkestrai note read <nodeId>\` — le uma nota conectada a voce.
- \`orkestrai note create "<titulo>" [--content "<texto>"] [--connect "<Agente>"]\` — cria uma nota no canvas (e ja conecta).
- \`orkestrai note write <nodeId> "<conteudo>"\` — substitui o conteudo da nota.
- \`orkestrai note edit <nodeId> "<trecho antigo>" "<trecho novo>"\` — edicao pontual.
- \`orkestrai task list\` — quadro de tarefas do workspace.
- \`orkestrai task add "<titulo>" --assign "<Agente>"\` — cria tarefa e ja despacha para o agente.
- \`orkestrai task done <taskId>\` — marca tarefa atribuida a voce como concluida.
- \`orkestrai portal <nodeId> navigate "<url>"\` — abre uma URL no portal conectado.
- \`orkestrai portal <nodeId> eval "<js>"\` — executa JS na pagina e retorna o resultado.
- \`orkestrai portal <nodeId> dom\` — devolve o HTML atual (ler telas, pesquisar, testar o que voce esta construindo).
- \`orkestrai portal <nodeId> screenshot\` — captura a tela do portal.
- \`orkestrai floor create "<nome>" [--clone]\` — cria um andar (worktree git com branch propria) para trabalho isolado.
- \`orkestrai floor list\` / \`floor preview <id>\` / \`floor land <id>\` / \`floor remove <id>\` — gerencia andares; preview mostra conflitos ANTES do merge.
- \`orkestrai notify "<mensagem>"\` — notifica o usuario quando precisar de atencao.

Ao aterrissar (land), conflitos NAO sao resolvidos automaticamente — o erro lista os arquivos em conflito; resolva-os voce mesmo no checkout principal (ou atribua a um agente) e repita o land.

Use \`--json\` para saida estruturada em qualquer comando.

## Orquestrar times (Modo Maestro) — OBRIGATORIO para o lider

Se voce e o lider (Modo Maestro), voce NUNCA executa o trabalho sozinho: voce orquestra. Ao receber um projeto/tarefa grande:

PROIBIDO usar subagentes internos da sua CLI (Task, background agents, subagentes em segundo plano) para montar o time: eles NAO aparecem no canvas, NAO tem terminal proprio e o usuario nao ve nem gerencia nada. TODO agente do time precisa existir no canvas — recrute SEMPRE com \`orkestrai recruit\`.

1. PRIMEIRO proponha o time: liste os agentes sugeridos (titulo, provider, role de cada um) e pergunte quais ele quer criar — nao crie nada sem aprovacao.
2. Aprovado, crie com \`orkestrai recruit "<Titulo>" [--provider claude|codex|kimi] [--role <papel>]\`, conecte-os a voce com \`orkestrai connect <voce> <Agente>\` e distribua o trabalho com \`orkestrai task add --assign\`, notas com \`orkestrai note create\` e \`orkestrai ask\`.
3. Acompanhe o quadro com \`orkestrai task list\`, cobre os agentes com \`orkestrai ask\` e integre o trabalho dos andares com \`orkestrai floor preview/land\`.
4. Ao finalizar uma frente, dispense o que nao precisa mais com \`orkestrai dismiss <agente>\` — o time nasce e morre sob demanda.

Se uma tarefa exigir uma habilidade que voce nao tem, voce pode AUTORAR uma skill: crie \`.claude/skills/<nome>/SKILL.md\` (frontmatter com name/description + instrucoes). Skills novas sao descobertas nas proximas sessoes do agente.
`;
  }

  /**
   * Provisiona a skill da ponte nos diretorios convencionais dos agentes
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
      // Em repos git, exclui os arquivos da ponte do status (info/exclude
      // local) — senao o checkout fica "sujo" e o land de andares falha.
      const gitDir = resolve(workspace.workingDir, '.git');
      if (existsSync(gitDir)) {
        const excludePath = resolve(gitDir, 'info', 'exclude');
        const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
        const additions = ['.orkestrai/', '.claude/skills/orkestrai/'].filter((entry) => !current.includes(entry));
        if (additions.length) {
          mkdirSync(resolve(gitDir, 'info'), { recursive: true });
          writeFileSync(excludePath, `${current.replace(/\n?$/, '\n')}${additions.join('\n')}\n`);
        }
      }
    } catch {
      // Sem permissao de escrita no working_dir nao bloqueia a conexao.
    }
    this.writeBridgeConfig(workspace, token);
  }

  // -- Internos ---------------------------------------------------------------

  private findAgent(agents: BridgeAgent[], query: string): BridgeAgent {
    const normalized = query.trim().toLowerCase();
    const agent =
      agents.find((item) => item.nodeId === query) ??
      agents.find((item) => item.title.toLowerCase() === normalized) ??
      agents.find((item) => item.title.toLowerCase().includes(normalized));
    if (!agent) {
      throw new Error(`Agente "${query}" nao encontrado. Use orkestrai list para ver os disponiveis.`);
    }
    return agent;
  }

  private async requireNoteNode(workspaceId: string, nodeId: string): Promise<CanvasNode> {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'note') {
      throw new Error('Nota nao encontrada neste workspace.');
    }
    return node;
  }

  private askAndWait(
    sessionId: string,
    message: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ text: string; timedOut: boolean }> {
    return new Promise((resolvePromise, reject) => {
      let captured = '';
      let done = false;
      const sentAt = Date.now();
      let lastOutputAt = sentAt;

      // Conclusao por silencio: so termina depois de saida real seguida de
      // QUIET_MS sem novos bytes, e nunca antes de MIN_AFTER_SEND_MS — sem o
      // piso, um agente ja ocioso dispara "waiting" no eco da propria
      // mensagem e a resposta se perde.
      const MIN_AFTER_SEND_MS = 3_500;
      const QUIET_MS = 2_000;

      const finish = (timedOut: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (quietTimer) clearTimeout(quietTimer);
        signal?.removeEventListener('abort', onAbort);
        detach();
        resolvePromise({ text: stripAnsi(captured), timedOut });
      };

      let quietTimer: ReturnType<typeof setTimeout> | null = null;
      const maybeFinish = () => {
        if (done) return;
        const now = Date.now();
        const quietFor = now - lastOutputAt;
        const elapsed = now - sentAt;
        if (captured.trim() && quietFor >= QUIET_MS && elapsed >= MIN_AFTER_SEND_MS) {
          finish(false);
          return;
        }
        const wait = Math.min(Math.max(QUIET_MS - quietFor, MIN_AFTER_SEND_MS - elapsed, 250), 3_000);
        quietTimer = setTimeout(maybeFinish, wait);
      };

      const onAbort = () => finish(true);
      const timer = setTimeout(() => finish(true), timeoutMs);

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
        clearTimeout(timer);
        reject(error);
        return;
      }
      const detach = () => detachFn?.();

      if (signal?.aborted) {
        finish(true);
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      // Texto e Enter em writes separados: TUIs (Codex) tratam o \r colado
      // ao texto como quebra de linha no composer em vez de submit.
      ptySessionManager.write(sessionId, message);
      setTimeout(() => {
        if (done) return;
        try {
          ptySessionManager.write(sessionId, '\r');
        } catch {
          finish(true);
        }
      }, 120);
      // Rede de seguranca caso o evento de atencao nunca dispare.
      quietTimer = setTimeout(maybeFinish, MIN_AFTER_SEND_MS);
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
      // Config local e conveniencia; nao bloqueia o fluxo.
    }
  }
}

export const bridgeService = new BridgeService();
