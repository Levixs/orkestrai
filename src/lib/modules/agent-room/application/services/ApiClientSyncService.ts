import { dirname } from 'node:path';
import { apiClientNativePayloadSchema } from '../../contracts/schemas/apiClient.schema.js';
import type { ApiClientNodePayload } from '../../domain/types.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { apiClientPayloadFingerprint, apiClientSourceFingerprint, apiClientSourceRoot, mirrorGeneratedCollection } from '../../infrastructure/api-client/ApiClientSyncFiles.js';
import { ApiClientSyncDto, ExportApiClientCollectionDto, ImportApiClientCollectionDto } from '../dto/ApiClientDtos.js';
import { apiClientService } from './ApiClientService.js';

type LinkedKind = Exclude<ApiClientNodePayload['sourceKind'], null | undefined>;

export class ApiClientSyncService {
  async execute(workspaceId: string, dto: ApiClientSyncDto) {
    if (dto.input.action === 'status') return this.status(workspaceId, dto.input.nodeId);
    if (dto.input.action === 'pull') return this.pull(workspaceId, dto.input.nodeId);
    return this.push(workspaceId, dto);
  }

  async status(workspaceId: string, nodeId: string) {
    const node = await this.requireNode(workspaceId, nodeId);
    const payload = apiClientNativePayloadSchema.parse(node.payload ?? {}) as ApiClientNodePayload;
    if (!payload.sourcePath || !payload.sourceKind) return { linked: false, writable: false, sourceChanged: false, localChanged: false, conflict: false, payload };
    const root = await apiClientSourceRoot(payload.sourcePath, payload.sourceKind);
    const sourceFingerprint = await apiClientSourceFingerprint(root);
    const localFingerprint = apiClientPayloadFingerprint(payload);
    const sourceChanged = Boolean(payload.sync?.sourceFingerprint && payload.sync.sourceFingerprint !== sourceFingerprint);
    const localChanged = Boolean(payload.sync?.localFingerprint && payload.sync.localFingerprint !== localFingerprint);
    return {
      linked: true,
      writable: payload.sourceKind === 'bruno' || payload.sourceKind === 'openCollection',
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
    if (persisted.sourceKind !== 'bruno' && persisted.sourceKind !== 'openCollection') throw new Error('This source format is read-only. Export it as Bruno or OpenCollection to enable bidirectional sync.');
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
    const exported = await apiClientService.export(workspaceId, ExportApiClientCollectionDto.from({
      nodeId: node.id,
      kind: persisted.sourceKind,
      path: dirname(sourceRoot),
    }));
    const managedFiles = await mirrorGeneratedCollection({
      generatedRoot: exported.path,
      sourceRoot,
      previousManagedFiles: persisted.sync?.managedFiles ?? [],
    });
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
    return { status: 'complete' as const, direction: 'push' as const, files: managedFiles.length, payload: nextPayload };
  }

  private async requireNode(workspaceId: string, nodeId: string) {
    const node = await workspaceRepository.getNode(nodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'apiClient') throw new Error('API Client node not found.');
    return node;
  }
}

export const apiClientSyncService = new ApiClientSyncService();
