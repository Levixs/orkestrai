import { uuidv7 } from '@beeblock/svelar/support';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { AgentPreset } from '../../domain/models/AgentPreset.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { workspaceService } from './WorkspaceService.js';
import { roleService } from './RoleService.js';
import { routineService } from './RoutineService.js';
import { taskBoardService } from './TaskBoardService.js';
import { mcpService } from './McpService.js';
import { builtinPresetCatalog, normalizePresetLocale, type PresetLocale } from '../catalogs/BuiltinPresetCatalog.js';
import { CreateWorkspaceDto } from '../dto/WorkspaceDtos.js';
import { boardColumnService, type BoardColumnRecipe } from './BoardColumnService.js';
import { materializeInteractiveAgentCommand } from '../adapters/registry.js';

export type PresetSummary = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  agents: number;
  createdAt: string;
  builtin: boolean;
  category: 'product' | 'frontend' | 'backend' | 'creative' | 'growth' | 'orkestrai' | 'custom';
};

export type PresetData = {
  format: 'orkestrai-preset';
  version: 1 | 2;
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
  /** Tarefas-template do quadro (nascem como todo/doing ao aplicar). */
  tasks: Array<{
    title: string;
    description?: string | null;
    status?: string;
    assigneeTitle?: string | null;
    noteTitle?: string | null;
    images?: string[];
  }>;
  /** Servidores MCP extras (a entrada 'orkestrai' da ponte NAO entra — e automatica). */
  mcpServers: Array<{ name: string; command: string; args: string[] }>;
  taskColumns?: BoardColumnRecipe[];
  /** Arquivos SKILL.md portaveis, sempre relativos ao projeto de destino. */
  skills?: Array<{ relativePath: string; content: string }>;
};

/** Campos de runtime que NUNCA viajam num preset. */
const RUNTIME_PAYLOAD_KEYS = [
  'sessionId',
  'agentSessionId',
  'lastDictatedAt',
  'initialRoleArgs',
  'roleConfiguredAtLaunch',
];

function sanitizePayload(payload: unknown): Record<string, unknown> {
  const clean = { ...((payload ?? {}) as Record<string, unknown>) };
  for (const key of RUNTIME_PAYLOAD_KEYS) delete clean[key];
  return clean;
}

async function presetNodePayload(workspaceId: string, node: PresetData['nodes'][number]): Promise<Record<string, unknown>> {
  const payload = sanitizePayload(node.payload);
  if (node.type !== 'terminal') return payload;
  const roleName = typeof payload.role === 'string' ? payload.role : null;
  const role = roleName ? await roleService.launchContext(workspaceId, roleName) : null;
  return materializeInteractiveAgentCommand(payload, role).payload;
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
    builtin: false,
    category: 'custom',
  };
}

function builtinSummary(locale: PresetLocale): PresetSummary[] {
  return builtinPresetCatalog(locale).map((preset) => ({
    id: preset.id,
    name: preset.name,
    icon: preset.icon,
    description: preset.description,
    agents: preset.data.nodes.filter((node) => node.type === 'terminal').length,
    createdAt: preset.data.createdAt,
    builtin: true,
    category: preset.category,
  }));
}

const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.codex/skills'];
const MAX_SKILL_BYTES = 64 * 1024;
const MAX_SKILLS = 40;

function snapshotSkills(workingDir: string): NonNullable<PresetData['skills']> {
  const files: NonNullable<PresetData['skills']> = [];
  if (!workingDir) return files;
  for (const root of SKILL_ROOTS) {
    const rootPath = resolve(workingDir, root);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'orkestrai' || files.length >= MAX_SKILLS) continue;
      const file = resolve(rootPath, entry.name, 'SKILL.md');
      if (!existsSync(file)) continue;
      const content = readFileSync(file, 'utf8');
      if (Buffer.byteLength(content) > MAX_SKILL_BYTES) continue;
      files.push({ relativePath: relative(workingDir, file).split(sep).join('/'), content });
    }
  }
  return files;
}

function safeSkillTarget(workingDir: string, relativePath: string): string | null {
  if (!relativePath || isAbsolute(relativePath) || !relativePath.endsWith('/SKILL.md')) return null;
  const normalized = relativePath.replaceAll('\\', '/');
  if (!SKILL_ROOTS.some((root) => normalized.startsWith(`${root}/`))) return null;
  const target = resolve(workingDir, normalized);
  const root = resolve(workingDir);
  return target.startsWith(`${root}${sep}`) ? target : null;
}

/**
 * Presets de equipe: snapshot de um workspace (time, layout, notas, roles,
 * rotinas) que pode ser aplicado a projetos novos ou existentes. Estado de
 * runtime (sessoes PTY, session-ids) NUNCA entra no preset.
 */
export class PresetService {
  async list(options: { includeBuiltin?: boolean; locale?: PresetLocale } = {}): Promise<PresetSummary[]> {
    const rows = await AgentPreset.query().orderBy('created_at', 'desc').get();
    const userPresets = rows.map(mapSummary);
    return options.includeBuiltin
      ? [...builtinSummary(options.locale ?? 'pt-BR'), ...userPresets]
      : userPresets;
  }

  async data(id: string, locale: PresetLocale = 'pt-BR'): Promise<PresetData> {
    if (id.startsWith('builtin:')) {
      const preset = builtinPresetCatalog(locale).find((item) => item.id === id);
      if (!preset) throw new Error('Preset embutido nao encontrado.');
      return preset.data as PresetData;
    }
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
    const sourceWorkingDir = exported.workspace.workingDir ?? '';
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
    // Tarefas-template: titulo + responsavel/nota por TITULO (mesma regra).
    const sourceNodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const titleOf = (id: string | null) => (id ? (sourceNodes.find((node) => node.id === id)?.title ?? null) : null);
    const tasks = (await taskBoardService.list(workspaceId)).map((task) => ({
      title: task.title,
      description: task.description,
      status: task.status,
      assigneeTitle: task.assigneeTitle ?? titleOf(task.assigneeNodeId),
      noteTitle: task.noteTitle ?? titleOf(task.noteId),
      images: task.images,
    }));
    // MCPs extras (sem a entrada 'orkestrai' — provisionada sozinha).
    const mcpServers = (await mcpService.list(workspaceId).catch(() => []))
      .filter((server) => !server.builtin)
      .map(({ name, command, args }) => ({ name, command, args }));
    const data: PresetData = {
      format: 'orkestrai-preset',
      version: 2,
      createdAt: new Date().toISOString(),
      workspace: exported.workspace,
      nodes,
      edges: exported.edges,
      roles: await roleService.list(workspaceId),
      routines,
      tasks,
      mcpServers,
      taskColumns: (await boardColumnService.list(workspaceId)).map(({ key, name, color, position }) => ({ key, name, color, position })),
      skills: snapshotSkills(sourceWorkingDir),
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
    if (id.startsWith('builtin:')) throw new Error('Presets embutidos nao podem ser excluidos.');
    return (await AgentPreset.query().where('id', id).delete()) > 0;
  }

  /**
   * Aplica o preset: num workspace existente (soma o time ao canvas, com
   * offset de posicao) ou num novo (name+workingDir). Retorna o workspace.
   */
  async apply(
    presetId: string,
    target: ({ workspaceId: string } | { name: string; workingDir: string; icon?: string | null }) & { locale?: PresetLocale }
  ): Promise<{ workspaceId: string; nodes: number; edges: number; roles: number; routines: number; tasks: number; columns: number; mcps: number; skills: number }> {
    const preset = await this.data(presetId, target.locale ?? 'pt-BR');
    let workspaceId: string;
    let offsetX = 0;
    let offsetY = 0;
    const creatingWorkspace = !('workspaceId' in target);

    if ('workspaceId' in target) {
      workspaceId = target.workspaceId;
      // Merge sem colidir com o que ja existe: desloca o preset para a direita.
      const existing = await workspaceRepository.listNodes(workspaceId);
      if (existing.length) {
        offsetX = Math.max(...existing.map((node) => node.x + node.width)) + 80;
      }
    } else {
      const name = target.name.trim() || preset.workspace.name;
      const workspace = await workspaceService.create(new CreateWorkspaceDto(
        name,
        target.workingDir,
        target.icon ?? preset.workspace.icon ?? null,
        preset.workspace.instructions ?? null,
        preset.workspace.syncAgentInstructionFiles ?? false,
        (preset.workspace.hooks ?? {}) as never
      ));
      workspaceId = workspace.id;
    }

    const columnsApplied = await boardColumnService.install(workspaceId, preset.taskColumns ?? [], creatingWorkspace);

    // Roles precisam existir antes dos terminais: Kimi recebe o AGENTS.md da
    // role no launch e os outros adapters materializam suas instrucoes nativas.
    let rolesApplied = 0;
    for (const role of preset.roles) {
      await roleService.save(workspaceId, role);
      rolesApplied += 1;
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
        payload: await presetNodePayload(workspaceId, node) as never,
      });
      nodeIds.push(created.id);
    }
    for (const edge of preset.edges) {
      const source = nodeIds[edge.sourceIndex];
      const targetId = nodeIds[edge.targetIndex];
      if (!source || !targetId) continue;
      await workspaceRepository.createEdge({ workspaceId, sourceNodeId: source, targetNodeId: targetId, style: edge.style });
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

    // Tarefas-template: responsavel e nota por TITULO (mesma regra das rotinas).
    const nodeIdByTitle = new Map(preset.nodes.map((node, index) => [node.title ?? '', nodeIds[index]]));
    let tasksApplied = 0;
    for (const task of preset.tasks ?? []) {
      await taskBoardService.create(workspaceId, {
        title: task.title,
        description: task.description,
        images: task.images,
        assigneeNodeId: task.assigneeTitle ? (nodeIdByTitle.get(task.assigneeTitle) ?? null) : null,
        noteId: task.noteTitle ? (nodeIdByTitle.get(task.noteTitle) ?? null) : null,
        createdBy: 'preset',
        status: task.status,
      });
      tasksApplied += 1;
    }

    // MCPs extras do preset (merge no .mcp.json do destino).
    let mcpsApplied = 0;
    for (const server of preset.mcpServers ?? []) {
      await mcpService.add(workspaceId, server).catch(() => {});
      mcpsApplied += 1;
    }

    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    let skillsApplied = 0;
    if (workspace) {
      for (const skill of preset.skills ?? []) {
        const targetPath = safeSkillTarget(workspace.workingDir, skill.relativePath);
        if (!targetPath || existsSync(targetPath)) continue;
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, skill.content, { flag: 'wx' });
        skillsApplied += 1;
      }
    }

    return { workspaceId, nodes: nodeIds.length, edges: preset.edges.length, roles: rolesApplied, routines: routinesApplied, tasks: tasksApplied, columns: columnsApplied, mcps: mcpsApplied, skills: skillsApplied };
  }

  /** Edita metadados do preset (nome/icone/descricao — o conteudo e por snapshot). */
  async updateMeta(id: string, input: { name?: string; icon?: string | null; description?: string | null }): Promise<PresetSummary> {
    if (id.startsWith('builtin:')) throw new Error('Presets embutidos nao podem ser editados.');
    const model = await AgentPreset.find(id);
    if (!model) throw new Error('Preset nao encontrado.');
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('Informe o nome do preset.');
      patch.name = name;
    }
    if (input.icon !== undefined) patch.icon = input.icon;
    if (input.description !== undefined) patch.description = input.description;
    await AgentPreset.query().where('id', id).update(patch);
    return mapSummary((await AgentPreset.find(id))!);
  }
}

export const presetService = new PresetService();
