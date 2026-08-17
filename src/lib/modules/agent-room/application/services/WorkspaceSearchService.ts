import { relative } from 'node:path';
import type {
  CanvasNode,
  Workspace,
  WorkspaceSearchResult,
  WorkspaceSearchResultKind,
} from '../../domain/types.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { filesystemService } from './FilesystemService.js';
import { roleService } from './RoleService.js';
import { skillMarketService } from './SkillMarketService.js';
import { taskBoardService } from './TaskBoardService.js';
import { routineService } from './RoutineService.js';
import { designDocumentService } from './DesignDocumentService.js';
import type { WorkspaceSearchDto } from '../dto/WorkspaceSearchDto.js';

const INDEX_TTL_MS = 15_000;
const INDEX_LIMIT_PER_WORKSPACE = 500;

type IndexedResult = Omit<WorkspaceSearchResult, 'score'> & {
  searchable: string;
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function clip(value: unknown, limit = 180): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, limit) : null;
}

function nodeKind(node: CanvasNode): WorkspaceSearchResultKind {
  if (node.type === 'terminal') return 'agent';
  if (node.type === 'note') return 'note';
  return 'artifact';
}

function nodePreview(node: CanvasNode): string | null {
  const payload = node.payload as Record<string, unknown>;
  if (node.type === 'terminal') return clip([payload.provider, payload.role].filter(Boolean).join(' · '));
  if (node.type === 'note') return clip(payload.content);
  return clip(payload.path ?? payload.url ?? payload.objective ?? payload.description);
}

function nodeAttachmentSearchText(node: CanvasNode): string {
  const attachments = (node.payload as { attachments?: Array<{ name?: string; path?: string | null; url?: string | null }> }).attachments;
  if (!Array.isArray(attachments)) return '';
  return attachments.flatMap((attachment) => [attachment.name, attachment.path, attachment.url]).filter(Boolean).join(' ');
}

function indexed(input: Omit<WorkspaceSearchResult, 'score'>, extra: unknown[] = []): IndexedResult {
  return {
    ...input,
    searchable: normalize([input.title, input.subtitle, input.preview, ...extra].filter(Boolean).join(' ')),
  };
}

function score(result: IndexedResult, query: string, activeWorkspaceId: string | null): number {
  const title = normalize(result.title);
  const subtitle = normalize(result.subtitle);
  let value = title === query ? 1_000 : title.startsWith(query) ? 700 : title.includes(query) ? 450 : 200;
  if (subtitle.includes(query)) value += 80;
  if (result.workspaceId === activeWorkspaceId) value += 60;
  if (result.kind === 'agent' || result.kind === 'task') value += 20;
  return value;
}

export class WorkspaceSearchService {
  private index: IndexedResult[] = [];
  private indexedAt = 0;
  private indexing: Promise<IndexedResult[]> | null = null;

  async search(dto: WorkspaceSearchDto): Promise<WorkspaceSearchResult[]> {
    const normalizedQuery = normalize(dto.query.replace(/^content:/i, '').trim());
    if (!normalizedQuery) return [];
    let index = await this.getIndex();
    let indexedMatches = index.filter((result) => result.searchable.includes(normalizedQuery));
    // A write can happen immediately after the last cached lookup. Refresh on a
    // miss so newly created tasks/nodes are discoverable without waiting 15 s.
    if (!indexedMatches.length && this.indexedAt) {
      index = await this.buildIndex();
      indexedMatches = index.filter((result) => result.searchable.includes(normalizedQuery));
    }
    const matches = indexedMatches
      .map(({ searchable: _searchable, ...result }) => ({
        ...result,
        score: score({ ...result, searchable: '' }, normalizedQuery, dto.workspaceId),
      }));

    if (dto.includeFiles && dto.workspaceId && normalizedQuery.length >= 2) {
      const workspace = await workspaceRepository.getWorkspace(dto.workspaceId);
      if (workspace) {
        const byContent = /^content:/i.test(dto.query);
        const files = await filesystemService.search(dto.workspaceId, dto.query.replace(/^content:/i, '').trim(), {
          byContent,
          limit: Math.min(30, dto.limit),
        }).catch(() => []);
        for (const file of files) {
          const path = relative(workspace.workingDir, file.path);
          matches.push({
            id: `file:${workspace.id}:${path}:${file.line ?? 0}`,
            kind: 'file',
            title: path.split(/[\\/]/).at(-1) ?? path,
            subtitle: file.line ? `${path}:${file.line}` : path,
            preview: clip(file.preview),
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            nodeId: null,
            taskId: null,
            path,
            route: `/canvas?workspace=${workspace.id}`,
            score: 360 + (file.preview ? 30 : 0),
          });
        }
      }
    }

    return matches
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, dto.limit);
  }

  private async getIndex(): Promise<IndexedResult[]> {
    if (this.indexedAt && Date.now() - this.indexedAt < INDEX_TTL_MS) return this.index;
    if (this.indexing) return this.indexing;
    this.indexing = this.buildIndex().finally(() => {
      this.indexing = null;
    });
    return this.indexing;
  }

  private async buildIndex(): Promise<IndexedResult[]> {
    const workspaces = await workspaceRepository.listWorkspaces();
    const groups = await Promise.all(workspaces.map((workspace) => this.indexWorkspace(workspace)));
    this.index = groups.flat();
    this.indexedAt = Date.now();
    return this.index;
  }

  private async indexWorkspace(workspace: Workspace): Promise<IndexedResult[]> {
    const results: IndexedResult[] = [indexed({
      id: `workspace:${workspace.id}`,
      kind: 'workspace',
      title: workspace.name,
      subtitle: workspace.workingDir,
      preview: clip(workspace.instructions),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      nodeId: null,
      taskId: null,
      path: null,
      route: `/canvas?workspace=${workspace.id}`,
    })];
    const [nodes, tasks, roles, skills, automations] = await Promise.all([
      workspaceRepository.listNodes(workspace.id).catch(() => []),
      taskBoardService.list(workspace.id).catch(() => []),
      roleService.list(workspace.id).catch(() => []),
      skillMarketService.listInstalled(workspace.id).catch(() => []),
      routineService.list(workspace.id).catch(() => []),
    ]);
    const taskBoardNode = nodes.find((node) => node.type === 'tasks');

    for (const node of nodes.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
      if (node.type === 'group' || node.type === 'shape') continue;
      const title = node.title || node.type;
      const preview = nodePreview(node);
      results.push(indexed({
        id: `node:${node.id}`,
        kind: nodeKind(node),
        title,
        subtitle: workspace.name,
        preview,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        nodeId: node.id,
        taskId: null,
        path: null,
        route: `/terminal?workspace=${workspace.id}&node=${node.id}`,
      }, [node.type, (node.payload as Record<string, unknown>).provider, nodeAttachmentSearchText(node)]));
    }

    const designDocuments = await Promise.all(nodes
      .filter((node) => node.type === 'design')
      .map(async (node) => ({ node, document: await designDocumentService.get(workspace.id, node.id).catch(() => null) })));
    for (const { node, document } of designDocuments) {
      if (!document) continue;
      const route = `/terminal?workspace=${workspace.id}&node=${node.id}`;
      for (const component of document.components.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
        results.push(indexed({
          id: `design-component:${node.id}:${component.id}`,
          kind: 'artifact',
          title: component.name,
          subtitle: `${workspace.name} · ${document.name}`,
          preview: clip(component.description || component.key),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          nodeId: node.id,
          taskId: null,
          path: null,
          route,
        }, ['design component componente componente de diseño', component.key, Object.values(component.variantValues), component.codeConnect?.path]));
      }
      for (const variable of document.variables.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
        const collection = document.variableCollections.find((candidate) => candidate.id === variable.collectionId);
        results.push(indexed({
          id: `design-variable:${node.id}:${variable.id}`,
          kind: 'artifact',
          title: variable.name,
          subtitle: `${workspace.name} · ${collection?.name ?? document.name}`,
          preview: clip(variable.description || variable.type),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          nodeId: node.id,
          taskId: null,
          path: null,
          route,
        }, ['design token variável variable', variable.type, collection?.codeSource?.path]));
      }
      for (const link of document.figmaLinks.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
        results.push(indexed({
          id: `design-figma:${node.id}:${link.id}`,
          kind: 'artifact',
          title: link.fileName,
          subtitle: `${workspace.name} · ${document.name}`,
          preview: clip(link.url),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          nodeId: node.id,
          taskId: null,
          path: null,
          route,
        }, ['figma design source origem fuente linked sync', link.sourceNodeIds]));
      }
      for (const artifact of document.codeArtifacts.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
        results.push(indexed({
          id: `design-code:${node.id}:${artifact.id}`,
          kind: 'artifact',
          title: artifact.name,
          subtitle: `${workspace.name} · ${document.name}`,
          preview: clip(artifact.path),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          nodeId: node.id,
          taskId: null,
          path: artifact.path,
          route,
        }, ['generated code codigo generado', artifact.framework, artifact.path, artifact.componentMappings]));
      }
      for (const flow of document.prototypeFlows.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
        const interactions = document.prototypeInteractions.filter((interaction) => interaction.sourceElementId === flow.startFrameId);
        results.push(indexed({
          id: `design-prototype:${node.id}:${flow.id}`,
          kind: 'artifact',
          title: flow.name,
          subtitle: `${workspace.name} · ${document.name}`,
          preview: clip(flow.description || `${interactions.length} interactions`),
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          nodeId: node.id,
          taskId: null,
          path: null,
          route,
        }, ['prototype prototipo prototipo flow fluxo flujo interaction interacao interaccion', interactions.map((interaction) => interaction.action.type)]));
      }
      for (const token of document.motionTokens.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
        results.push(indexed({
          id: `design-motion:${node.id}:${token.id}`,
          kind: 'artifact',
          title: token.name,
          subtitle: `${workspace.name} · ${document.name}`,
          preview: `${token.durationMs} ms`,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          nodeId: node.id,
          taskId: null,
          path: null,
          route,
        }, ['motion animation animacao animacion easing timeline keyframe', token.easing]));
      }
    }

    for (const task of tasks.slice(0, INDEX_LIMIT_PER_WORKSPACE)) {
      results.push(indexed({
        id: `task:${task.id}`,
        kind: 'task',
        title: task.title,
        subtitle: `${workspace.name} · ${task.status}`,
        preview: clip(task.description),
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        nodeId: taskBoardNode?.id ?? null,
        taskId: task.id,
        path: null,
        route: taskBoardNode
          ? `/terminal?workspace=${workspace.id}&node=${taskBoardNode.id}`
          : `/canvas?workspace=${workspace.id}`,
      }, [
        task.assigneeTitle,
        task.status,
        ...task.attachments.flatMap((attachment) => [attachment.name, attachment.path, attachment.url]),
      ]));
    }

    for (const role of roles) {
      results.push(indexed({
        id: `role:${workspace.id}:${role.slug}`,
        kind: 'role',
        title: role.name,
        subtitle: workspace.name,
        preview: clip(role.prompt),
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        nodeId: null,
        taskId: null,
        path: null,
        route: `/canvas?workspace=${workspace.id}`,
      }));
    }

    for (const skill of skills) {
      results.push(indexed({
        id: `skill:${workspace.id}:${skill.skillId}`,
        kind: 'skill',
        title: skill.name,
        subtitle: workspace.name,
        preview: clip(skill.description),
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        nodeId: null,
        taskId: null,
        path: null,
        route: `/skills?workspace=${workspace.id}`,
      }, [skill.skillId]));
    }
    for (const automation of automations) {
      results.push(indexed({
        id: `automation:${automation.id}`,
        kind: 'automation',
        title: automation.name,
        subtitle: `${workspace.name} · ${automation.triggerType}`,
        preview: clip(automation.prompt || automation.actionConfig.message || automation.actionConfig.title),
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        nodeId: `workbench-automations:${workspace.id}`,
        taskId: null,
        path: null,
        route: `/terminal?workspace=${workspace.id}&node=${encodeURIComponent(`workbench-automations:${workspace.id}`)}`,
      }, [automation.triggerType, automation.actionType, JSON.stringify(automation.triggerConfig)]));
    }
    return results;
  }
}

export const workspaceSearchService = new WorkspaceSearchService();
