import { uuidv7 } from '@beeblock/svelar/support';
import { AgentPreset } from '../../domain/models/AgentPreset.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { workspaceService } from './WorkspaceService.js';
import { roleService } from './RoleService.js';
import { routineService } from './RoutineService.js';

export type PresetSummary = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  agents: number;
  createdAt: string;
};

export type PresetData = {
  format: 'orkestrai-preset';
  version: 1;
  createdAt: string;
  workspace: {
    name: string;
    icon?: string | null;
    instructions?: string | null;
    syncAgentInstructionFiles?: boolean;
    hooks?: object;
  };
  nodes: Array<{
    type: string;
    title?: string | null;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
    payload?: Record<string, unknown>;
  }>;
  edges: Array<{ sourceIndex: number; targetIndex: number; style?: 'cord' | 'circuit' }>;
  roles: Array<{ name: string; color?: string; prompt: string }>;
  routines: Array<{ targetTitle: string; prompt: string; intervalMinutes?: number | null }>;
};

/** Campos de runtime que NUNCA viajam num preset. */
const RUNTIME_PAYLOAD_KEYS = ['sessionId', 'agentSessionId', 'lastDictatedAt'];

function sanitizePayload(payload: unknown): Record<string, unknown> {
  const clean = { ...((payload ?? {}) as Record<string, unknown>) };
  for (const key of RUNTIME_PAYLOAD_KEYS) delete clean[key];
  return clean;
}

function mapSummary(model: AgentPreset): PresetSummary {
  let agents = 0;
  try {
    const data = JSON.parse(model.getAttribute('data')) as PresetData;
    agents = (data.nodes ?? []).filter((node) => node.type === 'terminal' && (node.payload as { provider?: string })?.provider).length;
  } catch {
    // data invalido — agentes 0
  }
  return {
    id: model.getAttribute('id'),
    name: model.getAttribute('name'),
    icon: model.getAttribute('icon'),
    description: model.getAttribute('description'),
    agents,
    createdAt: String(model.getAttribute('created_at')),
  };
}

/**
 * Presets de equipe: snapshot de um workspace (time, layout, notas, roles,
 * rotinas) que pode ser aplicado a projetos novos ou existentes. Estado de
 * runtime (sessoes PTY, session-ids) NUNCA entra no preset.
 */
export class PresetService {
  async list(): Promise<PresetSummary[]> {
    const rows = await AgentPreset.query().orderBy('created_at', 'desc').get();
    return rows.map(mapSummary);
  }

  async data(id: string): Promise<PresetData> {
    const model = await AgentPreset.find(id);
    if (!model) throw new Error('Preset nao encontrado.');
    return JSON.parse(model.getAttribute('data')) as PresetData;
  }

  /** Snapshot: cria o preset a partir do workspace atual. */
  async createFromWorkspace(workspaceId: string, meta: { name: string; icon?: string | null; description?: string | null }): Promise<PresetSummary> {
    const name = meta.name.trim();
    if (!name) throw new Error('Informe o nome do preset.');
    const exported = (await workspaceService.exportWorkspace(workspaceId)) as {
      workspace: PresetData['workspace'] & { workingDir?: string };
      nodes: PresetData['nodes'];
      edges: PresetData['edges'];
    };
    // Preset nao leva a pasta do projeto original (quem aplica escolhe a dele).
    delete exported.workspace.workingDir;
    const nodes = exported.nodes.map((node) => ({ ...node, payload: sanitizePayload(node.payload) }));
    // Rotinas viram receita por TITULO do agente (ids mudam a cada aplicacao).
    const routines: PresetData['routines'] = [];
    for (const routine of await routineService.list(workspaceId)) {
      const node = await workspaceRepository.getNode(routine.targetNodeId);
      routines.push({
        targetTitle: node?.title ?? '',
        prompt: routine.prompt,
        intervalMinutes: routine.intervalMinutes,
      });
    }
    const data: PresetData = {
      format: 'orkestrai-preset',
      version: 1,
      createdAt: new Date().toISOString(),
      workspace: exported.workspace,
      nodes,
      edges: exported.edges,
      roles: await roleService.list(workspaceId),
      routines,
    };
    const now = new Date().toISOString();
    const id = uuidv7();
    await AgentPreset.query().insert({
      id,
      name,
      icon: meta.icon ?? exported.workspace.icon ?? null,
      description: meta.description ?? null,
      data: JSON.stringify(data),
      created_at: now,
      updated_at: now,
    });
    const model = await AgentPreset.find(id);
    return mapSummary(model!);
  }

  async remove(id: string): Promise<boolean> {
    return (await AgentPreset.query().where('id', id).delete()) > 0;
  }

  /**
   * Aplica o preset: num workspace existente (soma o time ao canvas, com
   * offset de posicao) ou num novo (name+workingDir). Retorna o workspace.
   */
  async apply(
    presetId: string,
    target: { workspaceId: string } | { name: string; workingDir: string; icon?: string | null }
  ): Promise<{ workspaceId: string; nodes: number; edges: number; roles: number; routines: number }> {
    const preset = await this.data(presetId);
    let workspaceId: string;
    let offsetX = 0;
    let offsetY = 0;

    if ('workspaceId' in target) {
      workspaceId = target.workspaceId;
      // Merge sem colidir com o que ja existe: desloca o preset para a direita.
      const existing = await workspaceRepository.listNodes(workspaceId);
      if (existing.length) {
        offsetX = Math.max(...existing.map((node) => node.x + node.width)) + 80;
      }
    } else {
      const name = target.name.trim() || preset.workspace.name;
      const workspace = await workspaceRepository.createWorkspace({
        name,
        workingDir: target.workingDir,
        icon: target.icon ?? preset.workspace.icon ?? null,
        instructions: preset.workspace.instructions ?? null,
      });
      workspaceId = workspace.id;
      if (preset.workspace.syncAgentInstructionFiles || preset.workspace.hooks) {
        await workspaceRepository.updateWorkspace(workspaceId, {
          syncAgentInstructionFiles: preset.workspace.syncAgentInstructionFiles,
          hooks: (preset.workspace.hooks as never) ?? {},
        });
      }
    }

    // Nos + arestas (por indice, como o import de workspace).
    const nodeIds: string[] = [];
    for (const node of preset.nodes) {
      const created = await workspaceRepository.createNode({
        workspaceId,
        type: node.type as never,
        title: node.title ?? null,
        x: (node.x ?? 0) + offsetX,
        y: (node.y ?? 0) + offsetY,
        width: node.width ?? 560,
        height: node.height ?? 360,
        zIndex: node.zIndex ?? 0,
        payload: sanitizePayload(node.payload) as never,
      });
      nodeIds.push(created.id);
    }
    for (const edge of preset.edges) {
      const source = nodeIds[edge.sourceIndex];
      const targetId = nodeIds[edge.targetIndex];
      if (!source || !targetId) continue;
      await workspaceRepository.createEdge({ workspaceId, sourceNodeId: source, targetNodeId: targetId, style: edge.style });
    }

    // Roles (biblioteca .orkestrai/roles do projeto de destino).
    let rolesApplied = 0;
    for (const role of preset.roles) {
      await roleService.save(workspaceId, role);
      rolesApplied += 1;
    }

    // Rotinas: o alvo e resolvido por TITULO do agente instanciado agora.
    let routinesApplied = 0;
    for (const routine of preset.routines) {
      const index = preset.nodes.findIndex((node) => (node.title ?? '') === routine.targetTitle);
      const targetNodeId = index >= 0 ? nodeIds[index] : null;
      if (!targetNodeId) continue;
      await routineService.create({
        workspaceId,
        targetNodeId,
        prompt: routine.prompt,
        intervalMinutes: routine.intervalMinutes,
      });
      routinesApplied += 1;
    }

    return { workspaceId, nodes: nodeIds.length, edges: preset.edges.length, roles: rolesApplied, routines: routinesApplied };
  }
}

export const presetService = new PresetService();
