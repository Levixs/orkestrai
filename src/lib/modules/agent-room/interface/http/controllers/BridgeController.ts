import { Controller } from '@beeblock/svelar/routing';
import { bridgeService } from '$lib/modules/agent-room/application/services/BridgeService.js';
import { roleService } from '$lib/modules/agent-room/application/services/RoleService.js';
import { taskBoardService } from '$lib/modules/agent-room/application/services/TaskBoardService.js';
import { boardColumnService } from '$lib/modules/agent-room/application/services/BoardColumnService.js';
import { floorService } from '$lib/modules/agent-room/application/services/FloorService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { filesystemService } from '$lib/modules/agent-room/application/services/FilesystemService.js';
import { bridgeReassignSchema, bridgeRoleEditSchema, bridgeRoleWriteSchema, bridgeFloorCreateSchema, bridgeFloorLandSchema, bridgeNoteCreateSchema } from '$lib/modules/agent-room/contracts/schemas/bridgeSchemas.js';
import { bridgeBoardTaskSchema, bridgeBoardTaskUpdateSchema } from '$lib/modules/agent-room/contracts/schemas/taskSchemas.js';
import { portalService } from '$lib/modules/agent-room/application/services/PortalService.js';
import { usageService } from '$lib/modules/agent-room/application/services/UsageService.js';
import { buildUsageRoutingReport } from '$lib/modules/agent-room/domain/usage-routing.js';
import { z } from 'zod';
import {
  BridgeAskRequest,
  BridgeConnectRequest,
  BridgeDismissRequest,
  BridgeRecruitRequest,
  BridgeNoteEditRequest,
  BridgeNoteWriteRequest,
  BridgeNotifyRequest,
} from '$lib/modules/agent-room/interface/http/requests/BridgeRequests.js';

/**
 * Endpoints consumidos pela CLI `orkestrai` (autenticacao por token de
 * workspace, sem CSRF — ver hooks.server.ts csrfExcludePaths).
 */
export class BridgeController extends Controller {
  async listAgents(event: any) {
    try {
      const token = this.requireToken(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      const agents = await bridgeService.listAgents(workspace.id);
      const agentNodeId = String(event.url.searchParams.get('agentNodeId') ?? '');
      const notes = await bridgeService.notesForAgent(workspace.id, agentNodeId).catch(() => [] as string[]);
      const portals = agentNodeId
        ? await bridgeService.portalsForAgent(workspace.id, agentNodeId).catch(() => [] as Array<{ id: string; title: string; url: string }>)
        : [];
      return this.json({ data: { workspace: { id: workspace.id, name: workspace.name }, agents, notes, portals } });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao listar agentes.', 401);
    }
  }

  async usage(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      const nodes = await workspaceRepository.listNodes(workspace.id);
      const policy = nodes.find((node) => node.type === 'usage')?.payload ?? undefined;
      return this.json({ data: buildUsageRoutingReport(await usageService.getAll(false), policy) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao consultar uso dos providers.', 401);
    }
  }

  async ask(event: any) {
    try {
      const input = await BridgeAskRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const result = input.raw
        ? await bridgeService.askRaw(workspace.id, { to: input.to, message: input.message })
        : await bridgeService.ask(workspace.id, {
            to: input.to,
            message: input.message,
            from: input.from,
            timeoutMs: input.timeoutMs,
            signal: event.request.signal,
          });
      return this.json({ data: result });
    } catch (error) {
      return this.errorResponse(error, 'Falha no ask.');
    }
  }

  async readNote(event: any) {
    try {
      const token = this.requireToken(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      return this.json({ data: await bridgeService.readNote(workspace.id, event.params.nodeId) });
    } catch (error) {
      return this.errorResponse(error, 'Nota nao encontrada.', 404);
    }
  }

  async writeNote(event: any) {
    try {
      const input = await BridgeNoteWriteRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await bridgeService.writeNote(workspace.id, event.params.nodeId, input.content) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao escrever nota.');
    }
  }

  async createNote(event: any) {
    try {
      const input = bridgeNoteCreateSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await bridgeService.createNote(workspace.id, input) }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar nota.');
    }
  }

  async editNote(event: any) {
    try {
      const input = await BridgeNoteEditRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await bridgeService.editNote(workspace.id, event.params.nodeId, input.old, input.new) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao editar nota.');
    }
  }

  async notify(event: any) {
    try {
      const input = await BridgeNotifyRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await bridgeService.notify(workspace, input) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao notificar.');
    }
  }

  async recruit(event: any) {
    try {
      const input = await BridgeRecruitRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const result = await bridgeService.recruit(workspace.id, {
        from: input.from,
        title: input.title,
        provider: input.provider,
        role: input.role,
        x: input.x,
        y: input.y,
        replace: input.replace,
      });
      return this.json({ data: result }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao recrutar agente.');
    }
  }

  async dismiss(event: any) {
    try {
      const input = await BridgeDismissRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await bridgeService.dismiss(workspace.id, { from: input.from, target: input.target }) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao dispensar agente.');
    }
  }

  async connect(event: any) {
    try {
      const input = await BridgeConnectRequest.validate(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await bridgeService.connectNodes(workspace.id, { from: input.from, source: input.source, to: input.to }) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao conectar nos.');
    }
  }

  async reassign(event: any) {
    try {
      const input = bridgeReassignSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({
        data: await bridgeService.reassignRole(workspace.id, {
          from: input.from,
          target: input.target,
          role: input.role,
          prompt: input.prompt,
        }),
      });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao reatribuir papel.');
    }
  }

  async roleShow(event: any) {
    try {
      const token = this.requireToken(event);
      const name = event.url.searchParams.get('name');
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      if (name) {
        const role = await roleService.get(workspace.id, name);
        if (!role) throw new Error(`Responsabilidade "${name}" nao encontrada.`);
        return this.json({ data: role });
      }
      return this.json({ data: await roleService.list(workspace.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao ler responsabilidade.', 404);
    }
  }

  async roleWrite(event: any) {
    try {
      const input = bridgeRoleWriteSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await roleService.save(workspace.id, input) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao escrever responsabilidade.');
    }
  }

  async roleEdit(event: any) {
    try {
      const input = bridgeRoleEditSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await roleService.edit(workspace.id, input.name, input.old, input.new) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao editar responsabilidade.');
    }
  }

  async portal(event: any) {
    try {
      const input = z
        .object({
          token: z.string().trim().min(1).nullish(),
          nodeId: z.string().trim().min(1),
          action: z.enum(['navigate', 'eval', 'screenshot', 'dom']),
          args: z.record(z.string(), z.unknown()).default({}),
          timeoutMs: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
        })
        .parse(await event.request.json());
      await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const command = portalService.enqueue(input.nodeId, input.action, input.args);
      const result = await portalService.waitResult(command.id, input.timeoutMs);
      return this.json({ data: result }, result.ok ? 200 : 400);
    } catch (error) {
      return this.errorResponse(error, 'Falha na automacao do portal.');
    }
  }

  /** Cria um portal no canvas (o portal em si so abre URL depois, via `portal`). */
  async portalCreate(event: any) {
    try {
      const input = z
        .object({
          token: z.string().trim().min(1).nullish(),
          from: z.string().trim().min(1, 'Informe o agente maestro (from).'),
          url: z.string().trim().min(1, 'Informe a URL do portal.'),
          title: z.string().trim().nullish(),
          connect: z.string().trim().nullish(),
        })
        .parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const result = await bridgeService.createPortal(workspace.id, {
        from: input.from,
        url: input.url,
        title: input.title,
        connect: input.connect,
      });
      return this.json({ data: result }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar portal.');
    }
  }

  /** Token da ponte de um workspace (para a UI exibir/copiar). */
  async workspaceToken(event: any) {
    try {
      const token = await bridgeService.getOrCreateToken(event.params.id, event.url.origin);
      return this.json({ data: { token } });
    } catch (error) {
      return this.errorResponse(error, 'Workspace nao encontrado.', 404);
    }
  }

  // -- Quadro de tarefas (kanban) via bridge ----------------------------------

  private async assigneeNodeId(workspaceId: string, assignee?: string | null): Promise<string | null> {
    if (!assignee) return null;
    const agents = await bridgeService.listAgents(workspaceId);
    const normalized = assignee.trim().toLowerCase();
    const agent =
      agents.find((item) => item.nodeId === assignee) ??
      agents.find((item) => item.title.toLowerCase() === normalized) ??
      agents.find((item) => item.title.toLowerCase().includes(normalized));
    if (!agent) throw new Error(`Agente "${assignee}" nao encontrado para atribuir a tarefa.`);
    return agent.nodeId;
  }

  /**
   * Nota por id ou titulo (espelha assigneeNodeId): undefined = nao mexe,
   * null/'' = desvincula, string = vincula (id, titulo exato ou parcial).
   */
  private async noteNodeId(workspaceId: string, note?: string | null): Promise<string | null | undefined> {
    if (note === undefined) return undefined;
    if (note === null || note.trim() === '') return null;
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const notes = nodes.filter((node) => node.type === 'note');
    const normalized = note.trim().toLowerCase();
    const found =
      notes.find((node) => node.id === note) ??
      notes.find((node) => (node.title ?? '').toLowerCase() === normalized) ??
      notes.find((node) => (node.title ?? '').toLowerCase().includes(normalized));
    if (!found) throw new Error(`Nota "${note}" nao encontrada para vincular a tarefa.`);
    return found.id;
  }

  async taskList(event: any) {
    try {
      const token = this.requireToken(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      return this.json({ data: await taskBoardService.list(workspace.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao listar tarefas.', 401);
    }
  }

  async taskColumns(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      return this.json({ data: await boardColumnService.list(workspace.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao listar colunas.', 401);
    }
  }

  async taskCreate(event: any) {
    try {
      const input = bridgeBoardTaskSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const task = await taskBoardService.create(workspace.id, {
        title: input.title,
        description: input.description ?? null,
        assigneeNodeId: await this.assigneeNodeId(workspace.id, input.assignee),
        noteId: (await this.noteNodeId(workspace.id, input.note)) ?? null,
        createdBy: input.from ?? 'agente',
        status: input.status,
      });
      // O quadro aparece no canvas junto com a primeira tarefa.
      await bridgeService.ensureTasksBoard(workspace.id).catch(() => {});
      return this.json({ data: task }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar tarefa.');
    }
  }

  async taskUpdate(event: any) {
    try {
      const input = bridgeBoardTaskUpdateSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const task = await taskBoardService.update(workspace.id, event.params.taskId, {
        status: input.status,
        description: input.description,
        assigneeNodeId: input.assignee !== undefined ? await this.assigneeNodeId(workspace.id, input.assignee) : undefined,
        noteId: await this.noteNodeId(workspace.id, input.note),
        notifyCompletion: true,
      });
      return this.json({ data: task });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao atualizar tarefa.');
    }
  }

  /** Historico do quadro (concluidas + arquivadas) via bridge. */
  async taskHistory(event: any) {
    try {
      const token = this.requireToken(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      return this.json({ data: await taskBoardService.history(workspace.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao consultar o historico.', 401);
    }
  }

  // -- FS via bridge (orkestrai fs) --------------------------------------------

  async fsRead(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      const path = String(event.url.searchParams.get('path') ?? '');
      if (!path) throw new Error('Informe ?path=');
      return this.json({ data: await filesystemService.read(workspace.id, path) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao ler arquivo.');
    }
  }

  async fsWrite(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      const body = await event.request.json();
      return this.json({ data: await filesystemService.write(workspace.id, String(body.path ?? ''), String(body.content ?? '')) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao escrever arquivo.');
    }
  }

  async fsSearch(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      const query = String(event.url.searchParams.get('q') ?? '');
      return this.json({ data: await filesystemService.search(workspace.id, query, { byContent: event.url.searchParams.get('content') === '1' }) });
    } catch (error) {
      return this.errorResponse(error, 'Falha na busca.');
    }
  }

  /** Re-despacha a tarefa para o agente atribuido (orkestrai run <taskId>). */
  async taskDispatch(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      return this.json({ data: await taskBoardService.redispatch(workspace.id, event.params.taskId) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao despachar tarefa.');
    }
  }

  /** TTS sob demanda (orkestrai say): fala no desktop via broadcast do canvas. */
  async say(event: any) {
    try {
      const workspace = await bridgeService.resolveWorkspaceByToken(this.requireToken(event));
      const body = await event.request.json();
      const text = String(body.text ?? '').trim().slice(0, 500);
      if (!text) throw new Error('Informe o texto.');
      const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
      broadcast?.({ type: 'say', workspaceId: workspace.id, text });
      return this.json({ data: { said: true } });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao falar.');
    }
  }

  /** Arquiva uma tarefa concluida via bridge. */
  async taskArchive(event: any) {
    try {
      const token = this.tokenFrom(event, null);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      return this.json({ data: await taskBoardService.archive(workspace.id, event.params.taskId) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao arquivar tarefa.');
    }
  }

  /** Arquiva TODAS as concluidas via bridge (limpeza do quadro). */
  async taskArchiveDone(event: any) {
    try {
      const token = this.tokenFrom(event, null);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      return this.json({ data: await taskBoardService.archiveDone(workspace.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao arquivar concluidas.');
    }
  }

  // -- Andares (worktrees) via bridge ------------------------------------------

  async floorList(event: any) {
    try {
      const token = this.requireToken(event);
      const workspace = await bridgeService.resolveWorkspaceByToken(token);
      return this.json({ data: await floorService.list(workspace.id) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao listar andares.', 401);
    }
  }

  async floorCreate(event: any) {
    try {
      const input = bridgeFloorCreateSchema.parse(await event.request.json());
      const workspace = await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      const floor = await floorService.create(workspace.id, {
        name: input.name,
        branch: input.branch ?? undefined,
        existingBranch: input.existingBranch,
        cloneLayout: input.cloneLayout,
      });
      return this.json({ data: floor }, 201);
    } catch (error) {
      return this.errorResponse(error, 'Falha ao criar andar.');
    }
  }

  async floorPreview(event: any) {
    try {
      const token = this.requireToken(event);
      await bridgeService.resolveWorkspaceByToken(token);
      const target = event.url.searchParams.get('target') ?? undefined;
      return this.json({ data: await floorService.landingPreview(event.params.floorId, target) });
    } catch (error) {
      return this.errorResponse(error, 'Falha na previa de aterrissagem.');
    }
  }

  async floorLand(event: any) {
    try {
      const input = bridgeFloorLandSchema.parse(await event.request.json());
      await bridgeService.resolveWorkspaceByToken(this.tokenFrom(event, input.token));
      return this.json({ data: await floorService.land(event.params.floorId, input.targetBranch ?? undefined) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao aterrissar andar.');
    }
  }

  async floorRemove(event: any) {
    try {
      const token = this.requireToken(event);
      await bridgeService.resolveWorkspaceByToken(token);
      const deleteBranch = event.url.searchParams.get('deleteBranch') === 'true';
      return this.json({ data: await floorService.remove(event.params.floorId, deleteBranch) });
    } catch (error) {
      return this.errorResponse(error, 'Falha ao remover andar.');
    }
  }

  private requireToken(event: any): string {
    const header = event.request.headers.get('authorization');
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
    const fromQuery = event.url.searchParams.get('token');
    if (fromQuery) return fromQuery;
    throw new Error('Informe o token da ponte (Bearer ou ?token=).');
  }

  /** Token do corpo (CLI legada) com fallback para o header Authorization. */
  private tokenFrom(event: any, bodyToken?: string | null): string {
    return bodyToken ?? this.requireToken(event);
  }

  private errorResponse(error: unknown, fallback: string, status = 400) {
    return this.json({ error: error instanceof Error ? error.message : fallback }, status);
  }
}
