import { uuidv7 } from '@beeblock/svelar/support';
import type { WorkspaceGroup } from '../../domain/types.js';
import { AgentWorkspaceGroup } from '../../domain/models/AgentWorkspaceGroup.js';

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapGroup(model: AgentWorkspaceGroup): WorkspaceGroup {
  return {
    id: model.getAttribute('id'),
    name: model.getAttribute('name'),
    parentId: model.getAttribute('parent_id') ?? null,
    position: Number(model.getAttribute('position') ?? 0),
    createdAt: toIso(model.getAttribute('created_at')),
    updatedAt: toIso(model.getAttribute('updated_at')),
  };
}

/** Pastas para organizar workspaces na barra lateral (persistencia crua, sem regra de negocio). */
export class WorkspaceGroupRepository {
  async list(): Promise<WorkspaceGroup[]> {
    const rows = await AgentWorkspaceGroup.query().orderBy('position', 'asc').get();
    return rows.map(mapGroup);
  }

  async find(id: string): Promise<WorkspaceGroup | null> {
    const model = await AgentWorkspaceGroup.find(id);
    return model ? mapGroup(model) : null;
  }

  async create(input: { name: string; parentId: string | null; position: number }): Promise<WorkspaceGroup> {
    const model = await AgentWorkspaceGroup.create({
      id: uuidv7(),
      name: input.name,
      parent_id: input.parentId,
      position: input.position,
    });
    return mapGroup(model);
  }

  async update(id: string, input: { name?: string; parentId?: string | null; position?: number }): Promise<WorkspaceGroup | null> {
    const model = await AgentWorkspaceGroup.find(id);
    if (!model) return null;
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.parentId !== undefined) changes.parent_id = input.parentId;
    if (input.position !== undefined) changes.position = input.position;
    await model.update(changes);
    return this.find(id);
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await AgentWorkspaceGroup.query().where('id', id).delete();
    return deleted > 0;
  }

  /** Manda as subpastas de uma pasta apagada para a raiz (ver nota em WorkspaceRepository.clearWorkspaceGroup). */
  async clearChildGroups(parentId: string): Promise<void> {
    await AgentWorkspaceGroup.query().where('parent_id', parentId).update({ parent_id: null });
  }

  /** Proxima posicao livre no fim da pasta (ou da raiz, se parentId for null). */
  async nextPosition(parentId: string | null): Promise<number> {
    const siblings = parentId === null
      ? await AgentWorkspaceGroup.query().whereNull('parent_id').get()
      : await AgentWorkspaceGroup.query().where('parent_id', parentId).get();
    return siblings.length;
  }
}

export const workspaceGroupRepository = new WorkspaceGroupRepository();
