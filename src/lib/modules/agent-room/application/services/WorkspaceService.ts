import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Workspace } from '../../domain/types.js';
import { AgentBoardTask } from '../../domain/models/AgentBoardTask.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.ts';
import { bridgeService } from './BridgeService.js';
import type {
  CreateCanvasEdgeDto,
  ChangeTerminalProviderDto,
  CreateCanvasNodeDto,
  CreateWorkspaceDto,
  UpdateCanvasEdgeDto,
  UpdateCanvasNodeDto,
  UpdateWorkspaceDto,
} from '../dto/WorkspaceDtos.js';
import { getAgentAdapter, materializeInteractiveAgentCommand } from '../adapters/registry.js';

/**
 * Servico de aplicacao de workspaces e canvas: valida diretorios,
 * sincroniza CLAUDE.md/AGENTS.md e delega ao WorkspaceRepository.
 */
export class WorkspaceService {
  /** Workspaces ja verificados neste processo (evita statSync a cada chamada). */
  private provisionChecked = new Set<string>();

  /**
   * Avisa o canvas que a estrutura mudou (no/aresta criada ou removida FORA da
   * pagina — tours, CLI, API): sem isso o no so aparecia ao sair e voltar ao
   * workspace. So mudancas ESTRUTURAIS — updateNode fica de fora de proposito
   * (arrastar/redimensionar dispararia reloads em tempestade).
   */
  private notifyStructureChanged(workspaceId: string): void {
    const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
    broadcast?.({ type: 'workspaceChanged', workspaceId });
  }

  async list() {
    return workspaceRepository.listWorkspaces();
  }

  async get(id: string) {
    const workspace = await workspaceRepository.getWorkspace(id);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    await this.ensureProvisioned(workspace);
    return workspace;
  }

  /**
   * Reparo idempotente: workspaces criados antes do provisionamento zero-config
   * (ou cujos arquivos foram apagados) recuperam skill + token da ponte ao
   * serem abertos — sem isso o lider nascia sem saber que e orquestrador.
   * Skill com conteudo antigo e regravada (o template evolui com o app).
   */
  private async ensureProvisioned(workspace: Workspace) {
    if (this.provisionChecked.has(workspace.id)) return;
    this.provisionChecked.add(workspace.id);
    const skillPath = resolve(workspace.workingDir, '.claude', 'skills', 'orkestrai', 'SKILL.md');
    const skillCurrent = existsSync(skillPath) && readFileSync(skillPath, 'utf8') === bridgeService.bridgeSkillContent();
    const hasConfig = existsSync(resolve(workspace.workingDir, '.orkestrai', 'workspace.json'));
    const agentsMd = resolve(workspace.workingDir, 'AGENTS.md');
    // Bloco AGENTS.md (codex/kimi/opencode) entrou depois — workspaces antigos
    // so ganham os arquivos novos se o reparo verificar o marcador tambem.
    const hasAgentsMd = existsSync(agentsMd) && readFileSync(agentsMd, 'utf8').includes('<!-- orkestrai:begin -->');
    if (skillCurrent && hasConfig && hasAgentsMd) return;
    const token = await bridgeService.getOrCreateToken(workspace.id).catch(() => null);
    if (token) bridgeService.provisionSkill(workspace, token);
  }

  async create(dto: CreateWorkspaceDto) {
    const workingDir = this.assertWorkingDir(dto.workingDir);
    const workspace = await workspaceRepository.createWorkspace({
      name: dto.name,
      workingDir,
      icon: dto.icon,
      instructions: dto.instructions,
      syncAgentInstructionFiles: dto.syncAgentInstructionFiles,
      hooks: dto.hooks,
    });
    this.writeInstructionFiles(workspace);
    // Provisiona a ponte (token + skill) ja no nascimento do workspace:
    // qualquer agente criado depois nasce sabendo usar a CLI orkestrai,
    // sem o usuario precisar conectar nada antes (fluxo zero-config).
    const token = await bridgeService.getOrCreateToken(workspace.id).catch(() => null);
    if (token) bridgeService.provisionSkill(workspace, token);
    return workspace;
  }

  async update(id: string, dto: UpdateWorkspaceDto) {
    await this.get(id);
    if (dto.changes.workingDir) this.assertWorkingDir(dto.changes.workingDir);
    const workspace = await workspaceRepository.updateWorkspace(id, dto.changes);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    this.writeInstructionFiles(workspace);
    return workspace;
  }

  async remove(id: string) {
    const deleted = await workspaceRepository.deleteWorkspace(id);
    if (!deleted) throw new Error('Workspace nao encontrado.');
    return { deleted: true };
  }

  // -- Nos -----------------------------------------------------------------

  async listNodes(workspaceId: string) {
    await this.get(workspaceId);
    const nodes = await workspaceRepository.listNodes(workspaceId);
    return Promise.all(nodes.map(async (node) => {
      if (node.type !== 'terminal') return node;
      const materialized = materializeInteractiveAgentCommand(node.payload as Record<string, unknown>);
      if (!materialized.changed) return node;
      return (await workspaceRepository.updateNode(node.id, { payload: materialized.payload as never })) ?? node;
    }));
  }

  async createNode(dto: CreateCanvasNodeDto) {
    await this.get(dto.workspaceId);
    const node = await workspaceRepository.createNode({
      workspaceId: dto.workspaceId,
      type: dto.type,
      title: dto.title,
      x: dto.x,
      y: dto.y,
      width: dto.width,
      height: dto.height,
      zIndex: dto.zIndex,
      payload: dto.payload,
    });
    this.notifyStructureChanged(dto.workspaceId);
    return node;
  }

  async updateNode(dto: UpdateCanvasNodeDto) {
    const node = await workspaceRepository.updateNode(dto.nodeId, dto.changes);
    if (!node) throw new Error('No nao encontrado.');
    return node;
  }

  /** Recarrega UM terminal: mata a sessao PTY e limpa o sessionId — o no
      recria a sessao com resume (o contexto volta, util apos suspensao ou
      atualizacao da CLI do provider). */
  async reloadNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId) throw new Error('No nao encontrado.');
    const payload = { ...((node.payload ?? {}) as Record<string, unknown>) };
    const sessionId = payload.sessionId as string | undefined;
    if (sessionId) ptySessionManager.kill(sessionId);
    delete payload.sessionId;
    await workspaceRepository.updateNode(nodeId, { payload: payload as never });
    return { reloaded: true };
  }

  /** Troca o provider preservando a identidade visual e organizacional do nó. */
  async changeTerminalProvider(dto: ChangeTerminalProviderDto) {
    const node = await workspaceRepository.getNode(dto.nodeId);
    if (!node || node.workspaceId !== dto.workspaceId || node.type !== 'terminal') {
      throw new Error('Terminal não encontrado neste workspace.');
    }
    const adapter = getAgentAdapter(dto.provider);
    const detection = await adapter.detect();
    if (!detection.installed) throw new Error(`${adapter.displayName} não está disponível neste dispositivo.`);

    const current = { ...((node.payload ?? {}) as Record<string, unknown>) };
    const sessionId = typeof current.sessionId === 'string' ? current.sessionId : null;
    if (sessionId) ptySessionManager.kill(sessionId);
    const command = adapter.interactiveCommand();
    const payload: Record<string, unknown> = {
      ...current,
      provider: adapter.id,
      command: command.command,
      args: [...command.args],
      ...(command.env && Object.keys(command.env).length ? { env: { ...command.env } } : {}),
    };
    delete payload.sessionId;
    delete payload.agentSessionId;
    if (!command.env || Object.keys(command.env).length === 0) delete payload.env;

    const updated = await workspaceRepository.updateNode(node.id, { payload: payload as never });
    this.notifyStructureChanged(dto.workspaceId);
    return updated;
  }

  async deleteNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId) throw new Error('No nao encontrado.');
    // Nota vinculada a tarefa do quadro NAO apaga pelo X do canvas: ela so sai
    // de verdade junto com a tarefa (ou quando desvinculada).
    if (node.type === 'note') {
      const linked = await AgentBoardTask.query().where('workspace_id', workspaceId).where('note_node_id', nodeId).get();
      if (linked.length > 0) {
        const titles = linked.map((task) => `"${task.getAttribute('title')}"`).join(', ');
        throw new Error(`Esta nota esta vinculada a ${linked.length === 1 ? 'tarefa' : 'tarefas'} do quadro: ${titles}. Desvincule ou apague a tarefa.`);
      }
    }
    await workspaceRepository.deleteNode(nodeId);
    this.notifyStructureChanged(workspaceId);
    return { deleted: true };
  }

  // -- Arestas ---------------------------------------------------------------

  async listEdges(workspaceId: string) {
    await this.get(workspaceId);
    return workspaceRepository.listEdges(workspaceId);
  }

  async createEdge(dto: CreateCanvasEdgeDto) {
    const workspace = await this.get(dto.workspaceId);
    const [source, target] = await Promise.all([
      workspaceRepository.getNode(dto.sourceNodeId),
      workspaceRepository.getNode(dto.targetNodeId),
    ]);
    if (!source || source.workspaceId !== dto.workspaceId) throw new Error('No de origem nao encontrado.');
    if (!target || target.workspaceId !== dto.workspaceId) throw new Error('No de destino nao encontrado.');
    const edge = await workspaceRepository.createEdge({
      workspaceId: dto.workspaceId,
      sourceNodeId: dto.sourceNodeId,
      targetNodeId: dto.targetNodeId,
      style: dto.style,
    });

    // Conexao com terminal => provisiona a skill da ponte nos agentes.
    if (source.type === 'terminal' || target.type === 'terminal') {
      const token = await bridgeService.getOrCreateToken(workspace.id).catch(() => null);
      if (token) bridgeService.provisionSkill(workspace, token);
    }

    this.notifyStructureChanged(dto.workspaceId);
    return edge;
  }

  async updateEdge(dto: UpdateCanvasEdgeDto) {
    const edge = await workspaceRepository.updateEdgeStyle(dto.edgeId, dto.style);
    if (!edge) throw new Error('Aresta nao encontrada.');
    return edge;
  }

  async deleteEdge(workspaceId: string, edgeId: string) {
    const edges = await workspaceRepository.listEdges(workspaceId);
    if (!edges.some((edge) => edge.id === edgeId)) throw new Error('Aresta nao encontrada.');
    await workspaceRepository.deleteEdge(edgeId);
    this.notifyStructureChanged(workspaceId);
    return { deleted: true };
  }

  /** Exporta o workspace completo (definicao + nos + arestas) como JSON. */
  async exportWorkspace(id: string) {
    const workspace = await this.get(id);
    const [nodes, edges] = await Promise.all([
      workspaceRepository.listNodes(id),
      workspaceRepository.listEdges(id),
    ]);
    return {
      format: 'orkestrai-workspace',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: {
        name: workspace.name,
        workingDir: workspace.workingDir,
        icon: workspace.icon,
        instructions: workspace.instructions,
        syncAgentInstructionFiles: workspace.syncAgentInstructionFiles,
        hooks: workspace.hooks,
      },
      nodes: nodes.map((node) => ({
        type: node.type,
        title: node.title,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        payload: node.payload,
      })),
      edges: edges.map((edge) => ({
        sourceIndex: nodes.findIndex((node) => node.id === edge.sourceNodeId),
        targetIndex: nodes.findIndex((node) => node.id === edge.targetNodeId),
        style: edge.style,
      })),
    };
  }

  /** Importa um workspace exportado (novo id; workingDir pode ser sobrescrito). */
  async importWorkspace(data: unknown, workingDirOverride?: string) {
    const parsed = data as {
      format?: string;
      workspace?: { name: string; workingDir: string; icon?: string | null; instructions?: string | null; syncAgentInstructionFiles?: boolean; hooks?: object };
      nodes?: Array<{ type: string; title?: string | null; x?: number; y?: number; width?: number; height?: number; zIndex?: number; payload?: object }>;
      edges?: Array<{ sourceIndex: number; targetIndex: number; style?: 'cord' | 'circuit' }>;
    };
    if (parsed.format !== 'orkestrai-workspace' || !parsed.workspace) {
      throw new Error('Arquivo nao e um workspace do Orkestrai (format: orkestrai-workspace).');
    }
    const info = parsed.workspace;
    const workingDir = workingDirOverride ?? info.workingDir;
    const workspace = await workspaceRepository.createWorkspace({
      name: `${info.name} (importado)`,
      workingDir,
      icon: info.icon ?? null,
      instructions: info.instructions ?? null,
    });
    if (info.syncAgentInstructionFiles || info.hooks) {
      await workspaceRepository.updateWorkspace(workspace.id, {
        syncAgentInstructionFiles: info.syncAgentInstructionFiles,
        hooks: (info.hooks as never) ?? {},
      });
    }

    const nodeIds: string[] = [];
    for (const node of parsed.nodes ?? []) {
      // Sessoes PTY nao viajam: terminais importados reiniciam limpos.
      const payload = { ...(node.payload as Record<string, unknown>) };
      delete payload.sessionId;
      const created = await workspaceRepository.createNode({
        workspaceId: workspace.id,
        type: node.type as never,
        title: node.title ?? null,
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? 560,
        height: node.height ?? 360,
        zIndex: node.zIndex ?? 0,
        payload,
      });
      nodeIds.push(created.id);
    }
    for (const edge of parsed.edges ?? []) {
      const source = nodeIds[edge.sourceIndex];
      const target = nodeIds[edge.targetIndex];
      if (source && target) {
        await workspaceRepository.createEdge({
          workspaceId: workspace.id,
          sourceNodeId: source,
          targetNodeId: target,
          style: edge.style ?? 'cord',
        });
      }
    }
    return workspace;
  }

  /**
   * Descarrega o workspace: mata todas as sessoes PTY dos seus terminais e
   * limpa os sessionIds, liberando processos sem perder o layout.
   */
  async unloadWorkspace(id: string) {
    await this.get(id);
    const nodes = await workspaceRepository.listNodes(id);
    let killed = 0;
    for (const node of nodes) {
      const payload = node.payload as { sessionId?: string };
      if (!payload.sessionId) continue;
      ptySessionManager.kill(payload.sessionId);
      const next = { ...payload };
      delete next.sessionId;
      await workspaceRepository.updateNode(node.id, { payload: next });
      killed += 1;
    }
    return { unloaded: true, killedSessions: killed };
  }

  // -- Internos ----------------------------------------------------------------

  private assertWorkingDir(dir: string): string {
    const resolved = resolve(dir.trim());
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error(`Diretorio de trabalho nao existe: ${resolved}`);
    }
    return resolved;
  }

  /**
   * Escreve AGENTS.md com as instrucoes do workspace no working_dir.
   * Com syncAgentInstructionFiles, espelha em CLAUDE.md (Claude Code so le
   * CLAUDE.md; os demais agentes padronizaram AGENTS.md).
   */
  private writeInstructionFiles(workspace: Workspace) {
    const instructions = workspace.instructions?.trim();
    if (!instructions) return;
    try {
      writeFileSync(resolve(workspace.workingDir, 'AGENTS.md'), `${instructions}\n`);
      if (workspace.syncAgentInstructionFiles) {
        writeFileSync(resolve(workspace.workingDir, 'CLAUDE.md'), `${instructions}\n`);
      }
    } catch {
      // Diretorio sem permissao de escrita nao bloqueia o workspace.
    }
  }
}

export const workspaceService = new WorkspaceService();
