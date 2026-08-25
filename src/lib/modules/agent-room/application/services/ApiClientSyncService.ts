import { dirname } from 'node:path';
import { apiClientNativePayloadSchema } from '../../contracts/schemas/apiClient.schema.js';
import type { ApiClientNodePayload } from '../../domain/types.js';
import { serializePostmanCollection } from '../../domain/api-client-postman.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { apiClientPayloadFingerprint, apiClientSourceFingerprint, apiClientSourceRoot, mirrorGeneratedCollection, writeApiClientFileAtomic } from '../../infrastructure/api-client/ApiClientSyncFiles.js';
import { ApiClientSyncDto, ExportApiClientCollectionDto, ImportApiClientCollectionDto, type SyncAgentApiClientDto } from '../dto/ApiClientDtos.js';
import { apiClientService } from './ApiClientService.js';
import { workspacePathService } from './WorkspacePathService.js';

type LinkedKind = Exclude<ApiClientNodePayload['sourceKind'], null | undefined>;

export class ApiClientSyncService {
  async execute(workspaceId: string, dto: ApiClientSyncDto) {
    if (dto.input.action === 'status') return this.status(workspaceId, dto.input.nodeId);
    if (dto.input.action === 'pull') return this.pull(workspaceId, dto.input.nodeId);
    return this.push(workspaceId, dto);
  }

  async status(workspaceId: string, nodeId: string) {
    const node = await this.requireNode(workspaceId, nodeId);
    const payload = apiClientNativePayloadSchema.parse(node.payload ?? {});
    if (!payload.sourcePath || !payload.sourceKind) return { linked: false, writable: false, sourceChanged: false, localChanged: false, conflict: false, payload };
    const root = await apiClientSourceRoot(payload.sourcePath, payload.sourceKind);
    const sourceFingerprint = await apiClientSourceFingerprint(root);
    const localFingerprint = apiClientPayloadFingerprint(payload);
    const sourceChanged = Boolean(payload.sync?.sourceFingerprint && payload.sync.sourceFingerprint !== sourceFingerprint);
    const localChanged = Boolean(payload.sync?.localFingerprint && payload.sync.localFingerprint !== localFingerprint);
    return {
      linked: true,
      writable: payload.sourceKind === 'bruno' || payload.sourceKind === 'openCollection' || payload.sourceKind === 'postman',
      sourceChanged,
      localChanged,
      conflict: sourceChanged && localChanged,
      sourcePath: root,
      sourceKind: payload.sourceKind,
      lastSyncedAt: payload.sync?.lastSyncedAt ?? null,
      payload,
    };
  }

  async pull(workspaceId: string, nodeId: string) {
    const node = await this.requireNode(workspaceId, nodeId);
    const payload = apiClientNativePayloadSchema.parse(node.payload ?? {}) as ApiClientNodePayload;
    if (!payload.sourcePath || !payload.sourceKind) throw new Error('This collection is not linked to a source on disk.');
    const result = await apiClientService.import(workspaceId, ImportApiClientCollectionDto.from({
      nodeId,
      kind: payload.sourceKind as LinkedKind,
      path: payload.sourcePath,
    }));
    return { status: 'complete' as const, direction: 'pull' as const, ...result };
  }

  async push(workspaceId: string, dto: ApiClientSyncDto) {
    if (dto.input.action !== 'push') throw new Error('Invalid synchronization action.');
    const node = await this.requireNode(workspaceId, dto.input.nodeId);
    const persisted = apiClientNativePayloadSchema.parse(node.payload ?? {}) as ApiClientNodePayload;
    if (!persisted.sourcePath || !persisted.sourceKind) throw new Error('This collection is not linked to a source on disk.');
    if (persisted.sourceKind !== 'bruno' && persisted.sourceKind !== 'openCollection' && persisted.sourceKind !== 'postman') {
      throw new Error('This source format is read-only. Export it as Bruno, Postman, or OpenCollection to enable bidirectional sync.');
    }
    const sourceRoot = await apiClientSourceRoot(persisted.sourcePath, persisted.sourceKind);
    const currentSourceFingerprint = await apiClientSourceFingerprint(sourceRoot);
    const sourceChanged = Boolean(persisted.sync?.sourceFingerprint && persisted.sync.sourceFingerprint !== currentSourceFingerprint);
    const incoming = apiClientNativePayloadSchema.parse({
      ...dto.input.payload,
      sourcePath: persisted.sourcePath,
      sourceKind: persisted.sourceKind,
      sourceCollection: persisted.sourceCollection,
    }) as ApiClientNodePayload;
    const localChanged = Boolean(persisted.sync?.localFingerprint && persisted.sync.localFingerprint !== apiClientPayloadFingerprint(incoming));
    const resolution = dto.input.resolution ?? incoming.sync?.conflictPolicy ?? 'ask';
    if (sourceChanged && resolution === 'filesystem') return this.pull(workspaceId, dto.input.nodeId);
    if (sourceChanged && resolution === 'ask') {
      return { status: 'conflict' as const, sourceChanged, localChanged, sourcePath: sourceRoot };
    }

    await workspaceRepository.updateNode(node.id, { payload: incoming });
    let managedFiles: string[];
    if (persisted.sourceKind === 'postman') {
      await writeApiClientFileAtomic(
        sourceRoot,
        `${JSON.stringify(serializePostmanCollection(node.title ?? 'Orkestrai API', incoming), null, 2)}\n`,
      );
      managedFiles = [];
    } else {
      const exported = await apiClientService.export(workspaceId, ExportApiClientCollectionDto.from({
        nodeId: node.id,
        kind: persisted.sourceKind,
        path: dirname(sourceRoot),
      }));
      managedFiles = await mirrorGeneratedCollection({
        generatedRoot: exported.path,
        sourceRoot,
        previousManagedFiles: persisted.sync?.managedFiles ?? [],
      });
    }
    const sourceFingerprint = await apiClientSourceFingerprint(sourceRoot);
    const nextPayload: ApiClientNodePayload = {
      ...incoming,
      sync: {
        mode: incoming.sync?.mode ?? 'manual',
        conflictPolicy: incoming.sync?.conflictPolicy ?? 'ask',
        lastSyncedAt: new Date().toISOString(),
        sourceFingerprint,
        localFingerprint: apiClientPayloadFingerprint(incoming),
        managedFiles,
      },
    };
    await workspaceRepository.updateNode(node.id, { payload: nextPayload });
    return { status: 'complete' as const, direction: 'push' as const, files: persisted.sourceKind === 'postman' ? 1 : managedFiles.length, payload: nextPayload };
  }

  async executeForAgent(workspaceId: string, nodeId: string, dto: SyncAgentApiClientDto) {
    await this.requireAgentConnection(workspaceId, nodeId, dto.input.from);
    await this.requireRepositorySource(workspaceId, nodeId);
    const currentStatus = await this.status(workspaceId, nodeId);
    if (dto.input.action === 'status') return currentStatus;
    if (!currentStatus.linked) throw new Error('This collection is not linked to a repository source.');

    if (dto.input.action === 'pull') {
      if (currentStatus.localChanged && dto.input.resolution !== 'filesystem') {
        return { status: 'conflict' as const, direction: 'pull' as const, ...currentStatus };
      }
      return this.pull(workspaceId, nodeId);
    }

    if (!currentStatus.writable) throw new Error('This linked source is read-only.');
    const node = await this.requireNode(workspaceId, nodeId);
    const payload = apiClientNativePayloadSchema.parse(node.payload ?? {});
    return this.push(workspaceId, ApiClientSyncDto.from({
      action: 'push',
      nodeId,
      payload,
      resolution: dto.input.resolution,
    }));
  }

  private async requireNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'apiClient') throw new Error('API Client node not found.');
    return node;
  }

  private async requireAgentConnection(workspaceId: string, nodeId: string, agentIdOrTitle: string) {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    const agent = nodes.find((candidate) => candidate.type === 'terminal' && (candidate.id === agentIdOrTitle || candidate.title === agentIdOrTitle));
    if (!agent) throw new Error('Agent node not found in this workspace.');
    const connected = (await workspaceRepository.listEdges(workspaceId)).some((edge) =>
      (edge.sourceNodeId === agent.id && edge.targetNodeId === nodeId)
      || (edge.targetNodeId === agent.id && edge.sourceNodeId === nodeId)
    );
    if (!connected) throw new Error('API Client node is not connected to this agent.');
  }

  private async requireRepositorySource(workspaceId: string, nodeId: string) {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    const node = await this.requireNode(workspaceId, nodeId);
    const payload = apiClientNativePayloadSchema.parse(node.payload ?? {}) as ApiClientNodePayload;
    if (!workspace || !payload.sourcePath) throw new Error('This collection is not linked to a repository source.');
    await workspacePathService.assertRegistered(workspace, payload.sourcePath);
  }
}

export const apiClientSyncService = new ApiClientSyncService();
