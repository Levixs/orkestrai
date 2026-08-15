import { Controller } from '@beeblock/svelar/routing';
import { z } from 'zod';
import { presetService } from '$lib/modules/agent-room/application/services/PresetService.js';
import { normalizePresetLocale } from '$lib/modules/agent-room/application/catalogs/BuiltinPresetCatalog.js';

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
  runtimeKind: z.enum(['native', 'wsl']).optional(),
  wslDistribution: z.string().trim().nullish(),
  wslWorkingDir: z.string().trim().nullish(),
  locale: z.enum(['pt-BR', 'en', 'es']).optional(),
});

/** Presets de equipe (templates de workspace) — globais, nao por workspace. */
export class PresetController extends Controller {
  async list(event: any) {
    const url = new URL(event.request.url);
    return this.json({
      data: await presetService.list({
        includeBuiltin: url.searchParams.get('scope') === 'all',
        locale: normalizePresetLocale(url.searchParams.get('locale')),
      }),
    });
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
        return this.json({ data: await presetService.apply(event.params.id, { workspaceId: input.workspaceId, locale: input.locale }) });
      }
      if (!input.name?.trim() || !input.workingDir?.trim()) {
        throw new Error('Informe workspaceId (aplicar aqui) ou name+workingDir (novo workspace).');
      }
      return this.json({
        data: await presetService.apply(event.params.id, {
          name: input.name,
          workingDir: input.workingDir,
          runtimeKind: input.runtimeKind,
          wslDistribution: input.wslDistribution,
          wslWorkingDir: input.wslWorkingDir,
          locale: input.locale,
        }),
      });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao aplicar preset.');
    }
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
