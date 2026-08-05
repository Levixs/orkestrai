import { Controller } from '@beeblock/svelar/routing';
import { z } from 'zod';
import { presetService } from '$lib/modules/agent-room/application/services/PresetService.js';

const createPresetSchema = z.object({
  workspaceId: z.string().trim().min(1, 'Informe o workspace.'),
  name: z.string().trim().min(1, 'Informe o nome do preset.'),
  icon: z.string().trim().nullish(),
  description: z.string().trim().nullish(),
});

const applyPresetSchema = z.object({
  workspaceId: z.string().trim().optional(),
  name: z.string().trim().optional(),
  workingDir: z.string().trim().optional(),
});

/** Presets de equipe (templates de workspace) — globais, nao por workspace. */
export class PresetController extends Controller {
  async list() {
    return this.json({ data: await presetService.list() });
  }

  async create(event: any) {
    try {
      const input = createPresetSchema.parse(await event.request.json());
      return this.json({ data: await presetService.createFromWorkspace(input.workspaceId, input) }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar preset.');
    }
  }

  async remove(event: any) {
    await presetService.remove(event.params.id);
    return this.json({ data: { deleted: true } });
  }

  /** Edita metadados (nome/icone/descricao). */
  async update(event: any) {
    try {
      const input = z.object({
        name: z.string().trim().optional(),
        icon: z.string().trim().nullish(),
        description: z.string().trim().nullish(),
      }).parse(await event.request.json());
      return this.json({ data: await presetService.updateMeta(event.params.id, input) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao atualizar preset.');
    }
  }

  /** Aplica: { workspaceId } (merge) ou { name, workingDir } (novo workspace). */
  async apply(event: any) {
    try {
      const input = applyPresetSchema.parse(await event.request.json());
      if (input.workspaceId) {
        return this.json({ data: await presetService.apply(event.params.id, { workspaceId: input.workspaceId }) });
      }
      if (!input.name?.trim() || !input.workingDir?.trim()) {
        throw new Error('Informe workspaceId (aplicar aqui) ou name+workingDir (novo workspace).');
      }
      return this.json({
        data: await presetService.apply(event.params.id, { name: input.name, workingDir: input.workingDir }),
      });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao aplicar preset.');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
