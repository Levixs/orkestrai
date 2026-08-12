import { uuidv7 } from '@beeblock/svelar/support';
import { AgentBoardTask } from '../../domain/models/AgentBoardTask.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.ts';
import { boardColumnService } from './BoardColumnService.js';
import { nativeNotificationService } from './NativeNotificationService.js';
import { controlCenterService } from './ControlCenterService.js';
import { isRasterWorkspaceAttachment, type WorkspaceAttachment } from '../../domain/types.js';
import {
  MAX_WORKSPACE_ATTACHMENTS,
  workspaceAttachmentSchema,
} from '../../contracts/schemas/workspaceAttachmentSchemas.js';

export type BoardTask = {
  id: string;
  workspaceId: string;
  title: string;
  /** Corpo do cartao em markdown (descrição estilo Trello). */
  description: string | null;
  status: string;
  assigneeNodeId: string | null;
  assigneeTitle: string | null;
  imagePath: string | null;
  /** Todas as imagens de referência da tarefa (imagePath = primeira/capa). */
  images: string[];
  attachments: WorkspaceAttachment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Preenchido quando a tarefa foi arquivada (sai do quadro, fica no histórico). */
  archivedAt: string | null;
  /** Nota de spec vinculada (UMA por tarefa; a mesma nota pode servir N tarefas). */
  noteId: string | null;
  noteTitle: string | null;
  completionHandoff?: {
    status: 'queued' | 'leader_offline' | 'no_leader' | 'not_needed';
    leaderTitle: string | null;
  };
};

function imagesOf(model: AgentBoardTask): string[] {
  const raw = model.getAttribute('images_json') as string | null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string');
    } catch {
      // cai no legado
    }
  }
  const legacy = model.getAttribute('image_path') as string | null;
  return legacy ? [legacy] : [];
}

function normalizeImages(images: string[] | undefined): string[] {
  return [...new Set((images ?? []).map((image) => image.trim()).filter(Boolean))].slice(0, 6);
}

function attachmentsOf(model: AgentBoardTask): WorkspaceAttachment[] {
  const raw = model.getAttribute('attachments_json') as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = workspaceAttachmentSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function normalizeAttachments(attachments: WorkspaceAttachment[] | undefined): WorkspaceAttachment[] {
  const unique = new Map<string, WorkspaceAttachment>();
  for (const attachment of attachments ?? []) {
    const validated = workspaceAttachmentSchema.parse(attachment);
    unique.set(validated.id, validated);
  }
  return [...unique.values()].slice(0, MAX_WORKSPACE_ATTACHMENTS);
}

function taskBrief(task: AgentBoardTask): string {
  const description = String(task.getAttribute('description') ?? '').trim();
  const images = imagesOf(task);
  const attachments = attachmentsOf(task);
  const imageList = images.length ? images.map((image) => `- ${image}`).join('\n') : '(nenhuma imagem anexada)';
  const attachmentList = attachments.length
    ? attachments.map((attachment) => `- ${attachment.name}: ${attachment.path ?? attachment.url}`).join('\n')
    : '(nenhum arquivo ou link anexado)';
  return [
    `Título: ${task.getAttribute('title')}`,
    `Descrição:\n${description || '(sem descrição)'}`,
    `Imagens de referência:\n${imageList}`,
    `Arquivos e links:\n${attachmentList}`,
  ].join('\n');
}

function mapTask(model: AgentBoardTask, assigneeTitle: string | null = null, noteTitle: string | null = null): BoardTask {
  const images = imagesOf(model);
  return {
    id: model.getAttribute('id'),
    workspaceId: model.getAttribute('workspace_id'),
    title: model.getAttribute('title'),
    description: model.getAttribute('description') ?? null,
    status: model.getAttribute('status') as BoardTask['status'],
    assigneeNodeId: model.getAttribute('assignee_node_id'),
    assigneeTitle,
    imagePath: model.getAttribute('image_path') ?? images[0] ?? null,
    images,
    attachments: attachmentsOf(model),
    createdBy: model.getAttribute('created_by'),
    createdAt: String(model.getAttribute('created_at')),
    updatedAt: String(model.getAttribute('updated_at')),
    archivedAt: model.getAttribute('archived_at') ?? null,
    noteId: model.getAttribute('note_node_id') ?? null,
    noteTitle,
  };
}

/**
 * Quadro de tarefas do workspace (kanban): o usuário ou o líder (via bridge)
 * cria tarefas, atribui a um agente e o agente recebe o prompt na hora no
 * seu terminal — é o "loop contínuo": tarefa atribuída dispara trabalho.
 */
/** Avisa o canvas para recarregar o workspace (via broadcast WS global). */
function notifyWorkspaceChanged(workspaceId: string) {
  const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
  broadcast?.({ type: 'workspaceChanged', workspaceId });
}

export class TaskBoardService {
  async list(workspaceId: string): Promise<BoardTask[]> {
    // Quadro: só tarefas NAO arquivadas (arquivadas vivem em history()).
    const rows = await AgentBoardTask.query().where('workspace_id', workspaceId).whereNull('archived_at').orderBy('created_at', 'asc').get();
    // includeArchived: notas arquivadas junto com a tarefa ainda resolvem o título.
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const titles = new Map(nodes.map((node) => [node.id, node.title ?? node.type]));
    return rows.map((row) => {
      const assigneeId = row.getAttribute('assignee_node_id') as string | null;
      const noteId = row.getAttribute('note_node_id') as string | null;
      return mapTask(row, assigneeId ? (titles.get(assigneeId) ?? null) : null, noteId ? (titles.get(noteId) ?? null) : null);
    });
  }

  /**
   * Histórico do workspace: tarefas concluídas e/ou arquivadas, da mais
   * recente para a mais antiga. E o "o que foi feito" do projeto — o líder
   * (ou o usuário) arquiva para limpar o quadro sem perder o registro.
   */
  async history(workspaceId: string, limit = 200): Promise<BoardTask[]> {
    // done ainda no quadro + tudo que já foi arquivado (qualquer status).
    const [done, archived] = await Promise.all([
      AgentBoardTask.query().where('workspace_id', workspaceId).where('status', 'done').whereNull('archived_at').get(),
      AgentBoardTask.query().where('workspace_id', workspaceId).whereNotNull('archived_at').get(),
    ]);
    const rows = [...done, ...archived]
      .sort((a, b) => String(b.getAttribute('updated_at')).localeCompare(String(a.getAttribute('updated_at'))))
      .slice(0, limit);
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const titles = new Map(nodes.map((node) => [node.id, node.title ?? node.type]));
    return rows.map((row) => {
      const assigneeId = row.getAttribute('assignee_node_id') as string | null;
      const noteId = row.getAttribute('note_node_id') as string | null;
      return mapTask(row, assigneeId ? (titles.get(assigneeId) ?? null) : null, noteId ? (titles.get(noteId) ?? null) : null);
    });
  }

  /** Arquiva uma tarefa concluída (sai do quadro, fica no histórico). */
  async archive(workspaceId: string, taskId: string): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    if (task.getAttribute('status') !== 'done') throw new Error('Só dá para arquivar tarefa concluída (done).');
    await AgentBoardTask.query().where('id', taskId).update({ archived_at: new Date().toISOString() });
    await this.hideOrphanLinkedNotes(workspaceId, [task.getAttribute('note_node_id') as string | null]);
    notifyWorkspaceChanged(workspaceId);
    return this.mapWithTitles(await this.requireTask(workspaceId, taskId));
  }

  /** Arquiva TODAS as tarefas concluídas do quadro de uma vez. */
  async archiveDone(workspaceId: string): Promise<{ archived: number }> {
    const done = await AgentBoardTask.query()
      .where('workspace_id', workspaceId)
      .where('status', 'done')
      .whereNull('archived_at')
      .get();
    const now = new Date().toISOString();
    for (const task of done) {
      await AgentBoardTask.query().where('id', task.getAttribute('id')).update({ archived_at: now });
    }
    await this.hideOrphanLinkedNotes(
      workspaceId,
      done.map((task) => task.getAttribute('note_node_id') as string | null)
    );
    if (done.length) notifyWorkspaceChanged(workspaceId);
    return { archived: done.length };
  }

  /**
   * Nota vinculada só sai do canvas quando NENHUMA tarefa viva (não arquivada)
   * aponta para ela — a mesma spec pode cobrir várias tarefas (1:N).
   */
  private async hideOrphanLinkedNotes(workspaceId: string, noteIds: Array<string | null>): Promise<void> {
    for (const noteId of new Set(noteIds.filter((id): id is string => Boolean(id)))) {
      const liveRefs = await AgentBoardTask.query()
        .where('workspace_id', workspaceId)
        .where('note_node_id', noteId)
        .whereNull('archived_at')
        .get();
      if (liveRefs.length === 0) await workspaceRepository.archiveNode(noteId);
    }
  }

  /** Resolve títulos (responsável + nota) para retornos pontuais. */
  private async mapWithTitles(model: AgentBoardTask): Promise<BoardTask> {
    const assigneeId = model.getAttribute('assignee_node_id') as string | null;
    const noteId = model.getAttribute('note_node_id') as string | null;
    const [assignee, note] = await Promise.all([
      assigneeId ? workspaceRepository.getNode(assigneeId) : null,
      noteId ? workspaceRepository.getNode(noteId) : null,
    ]);
    return mapTask(model, assignee?.title ?? null, note?.title ?? null);
  }

  private async requireNote(workspaceId: string, noteId: string): Promise<void> {
    const node = await workspaceRepository.getNode(noteId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'note') {
      throw new Error('Nota não encontrada neste workspace (vincule um nó do tipo nota).');
    }
  }

  private async requireTask(workspaceId: string, taskId: string): Promise<AgentBoardTask> {
    const model = await AgentBoardTask.find(taskId);
    if (!model || model.getAttribute('workspace_id') !== workspaceId) {
      throw new Error('Tarefa não encontrada neste workspace.');
    }
    return model;
  }

  async create(
    workspaceId: string,
    input: {
      title: string;
      description?: string | null;
      images?: string[];
      attachments?: WorkspaceAttachment[];
      assigneeNodeId?: string | null;
      createdBy?: string;
      noteId?: string | null;
      status?: string;
    }
  ): Promise<BoardTask> {
    const title = input.title.trim();
    if (!title) throw new Error('Informe o título da tarefa.');
    if (input.noteId) await this.requireNote(workspaceId, input.noteId);
    const now = new Date().toISOString();
    const id = uuidv7();
    const images = normalizeImages(input.images);
    const attachments = normalizeAttachments(input.attachments);
    for (const attachment of attachments) {
      if (attachment.path && isRasterWorkspaceAttachment(attachment) && images.length < 6) {
        images.push(attachment.path);
      }
    }
    const status = input.status
      ? await boardColumnService.resolveKey(workspaceId, input.status)
      : input.assigneeNodeId ? 'doing' : 'todo';
    await AgentBoardTask.query().insert({
      id,
      workspace_id: workspaceId,
      title,
      description: input.description?.trim() || null,
      image_path: images[0] ?? null,
      images_json: images.length ? JSON.stringify(images) : null,
      attachments_json: attachments.length ? JSON.stringify(attachments) : null,
      status,
      assignee_node_id: input.assigneeNodeId ?? null,
      note_node_id: input.noteId ?? null,
      created_by: input.createdBy ?? 'user',
      created_at: now,
      updated_at: now,
    });
    const task = await this.requireTask(workspaceId, id);
    if (input.assigneeNodeId) {
      await this.dispatch(workspaceId, id).catch(() => {});
    }
    // Task criada por humano (UI): avisa o líder — ele decide a coordenacao.
    // (Tasks da propria ponte/agentes não ecoam de volta.)
    const createdBy = input.createdBy ?? 'user';
    if (createdBy === 'user') {
      await this.notifyLeader(workspaceId, id, Boolean(input.assigneeNodeId)).catch(() => {});
    }
    notifyWorkspaceChanged(workspaceId);
    return this.mapWithTitles(task);
  }

  async update(
    workspaceId: string,
    taskId: string,
    input: { title?: string; description?: string | null; status?: string; assigneeNodeId?: string | null; imagePath?: string | null; noteId?: string | null; notifyCompletion?: boolean; completedBy?: string | null }
  ): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const wasDone = task.getAttribute('status') === 'done';
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error('Informe o título da tarefa.');
      patch.title = title;
    }
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }
    if (input.status !== undefined) {
      patch.status = await boardColumnService.resolveKey(workspaceId, input.status);
    }
    if (input.imagePath !== undefined) {
      patch.image_path = input.imagePath;
    }
    if (input.noteId !== undefined) {
      if (input.noteId) await this.requireNote(workspaceId, input.noteId);
      patch.note_node_id = input.noteId;
    }
    let assignedNow = false;
    if (input.assigneeNodeId !== undefined) {
      assignedNow = Boolean(input.assigneeNodeId) && input.assigneeNodeId !== task.getAttribute('assignee_node_id');
      patch.assignee_node_id = input.assigneeNodeId;
      if (assignedNow && input.status === undefined) patch.status = 'doing';
    }
    await AgentBoardTask.query().where('id', taskId).update(patch);
    if (assignedNow) {
      await this.dispatch(workspaceId, taskId).catch(() => {});
    }
    notifyWorkspaceChanged(workspaceId);
    const updated = await this.mapWithTitles(await this.requireTask(workspaceId, taskId));
    if (!wasDone && updated.status === 'done' && updated.assigneeNodeId) {
      await controlCenterService.recordActivity({
        workspaceId,
        nodeId: updated.assigneeNodeId,
        state: 'done',
        action: 'system:task_completed',
        taskId: updated.id,
        metadata: { taskTitle: updated.title },
      });
    }
    let completionHandoff: BoardTask['completionHandoff'];
    if (input.notifyCompletion && !wasDone && updated.status === 'done') {
      const workspace = await workspaceRepository.getWorkspace(workspaceId);
      if (workspace) {
        await nativeNotificationService.send(workspace, {
          kind: 'task',
          title: updated.title,
          message: updated.assigneeTitle ? `@${updated.assigneeTitle}` : '',
        });
      }
      completionHandoff = await this.notifyLeaderCompletion(workspaceId, updated, input.completedBy ?? null);
    }
    return completionHandoff ? { ...updated, completionHandoff } : updated;
  }

  async remove(workspaceId: string, taskId: string): Promise<boolean> {
    const task = await this.requireTask(workspaceId, taskId);
    const noteId = task.getAttribute('note_node_id') as string | null;
    await AgentBoardTask.query().where('id', taskId).delete();
    // Apagar a tarefa apaga a nota vinculada JUNTO — desde que nenhuma outra
    // tarefa use a mesma nota (1:N: a spec vive enquanto tiver tarefa).
    if (noteId) {
      const remaining = await AgentBoardTask.query().where('workspace_id', workspaceId).where('note_node_id', noteId).get();
      if (remaining.length === 0) await workspaceRepository.deleteNode(noteId);
    }
    notifyWorkspaceChanged(workspaceId);
    return true;
  }

  /** Anexa uma imagem de referência à tarefa (a primeira vira a capa). */
  async attachImage(workspaceId: string, taskId: string, path: string): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const images = imagesOf(task);
    if (!path || images.includes(path)) throw new Error('Imagem inválida ou já anexada.');
    images.push(path);
    await AgentBoardTask.query().where('id', taskId).update({
      images_json: JSON.stringify(images),
      image_path: images[0] ?? null,
      updated_at: new Date().toISOString(),
    });
    notifyWorkspaceChanged(workspaceId);
    return mapTask(await this.requireTask(workspaceId, taskId));
  }

  /** Remove uma imagem da tarefa (recalcula a capa). */
  async detachImage(workspaceId: string, taskId: string, path: string): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const images = imagesOf(task).filter((item) => item !== path);
    await AgentBoardTask.query().where('id', taskId).update({
      images_json: JSON.stringify(images),
      image_path: images[0] ?? null,
      updated_at: new Date().toISOString(),
    });
    notifyWorkspaceChanged(workspaceId);
    return mapTask(await this.requireTask(workspaceId, taskId));
  }

  async attachAttachment(workspaceId: string, taskId: string, attachment: WorkspaceAttachment): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const validatedAttachment = workspaceAttachmentSchema.parse(attachment);
    const attachments = attachmentsOf(task);
    if (attachments.some((item) => item.id === validatedAttachment.id)) throw new Error('Attachment already exists on this task.');
    if (attachments.length >= MAX_WORKSPACE_ATTACHMENTS) throw new Error(`A task supports up to ${MAX_WORKSPACE_ATTACHMENTS} attachments.`);
    attachments.push(validatedAttachment);

    const images = imagesOf(task);
    if (
      validatedAttachment.path
      && isRasterWorkspaceAttachment(validatedAttachment)
      && !images.includes(validatedAttachment.path)
      && images.length < 6
    ) images.push(validatedAttachment.path);

    await AgentBoardTask.query().where('id', taskId).update({
      attachments_json: JSON.stringify(attachments),
      images_json: images.length ? JSON.stringify(images) : null,
      image_path: images[0] ?? null,
      updated_at: new Date().toISOString(),
    });
    notifyWorkspaceChanged(workspaceId);
    return this.mapWithTitles(await this.requireTask(workspaceId, taskId));
  }

  async detachAttachment(workspaceId: string, taskId: string, attachmentId: string): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const removed = attachmentsOf(task).find((attachment) => attachment.id === attachmentId);
    const attachments = attachmentsOf(task).filter((attachment) => attachment.id !== attachmentId);
    const images = removed?.path ? imagesOf(task).filter((path) => path !== removed.path) : imagesOf(task);
    await AgentBoardTask.query().where('id', taskId).update({
      attachments_json: attachments.length ? JSON.stringify(attachments) : null,
      images_json: images.length ? JSON.stringify(images) : null,
      image_path: images[0] ?? null,
      updated_at: new Date().toISOString(),
    });
    notifyWorkspaceChanged(workspaceId);
    return this.mapWithTitles(await this.requireTask(workspaceId, taskId));
  }

  /**
   * Aviso ao líder (maestro) no terminal dele: uma task nova entrou no quadro.
   * Sem responsável = precisa de ação (distribuir); com responsável = FYI.
   */
  private async notifyLeader(workspaceId: string, taskId: string, assigned: boolean): Promise<void> {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    const leader = nodes.find(
      (node) => node.type === 'terminal' && Boolean((node.payload as { maestro?: boolean }).maestro)
    );
    if (!leader) return;
    const sessionId = (leader.payload as { sessionId?: string }).sessionId;
    const session = sessionId ? ptySessionManager.get(sessionId) : null;
    if (!session || session.exited) return;
    const task = await this.requireTask(workspaceId, taskId);
    const hint = assigned
      ? `O usuário atribuiu direto para um agente — acompanhe com: orkestrai task list`
      : `SEM responsável. Distribua: orkestrai task assign ${taskId} "<Agente>" (ou coordene como achar melhor)`;
    await ptySessionManager.writeWithSubmit(
      session.id,
      `[nova tarefa no quadro #${taskId.slice(0, 8)}]\n${taskBrief(task)}\n${hint}`,
    );
  }

  /**
   * Task completion is an asynchronous handoff to the leader. The PTY delivery
   * queue waits for any human draft instead of mixing both messages.
   */
  private async notifyLeaderCompletion(
    workspaceId: string,
    task: BoardTask,
    completedBy: string | null,
  ): Promise<NonNullable<BoardTask['completionHandoff']>> {
    const nodes = await workspaceRepository.listNodes(workspaceId);
    const leader = nodes.find(
      (node) => node.type === 'terminal' && Boolean((node.payload as { maestro?: boolean }).maestro)
    );
    if (!leader) return { status: 'no_leader', leaderTitle: null };

    const completer = nodes.find((node) =>
      node.id === (task.assigneeNodeId ?? completedBy) ||
      (completedBy != null && node.title?.toLowerCase() === completedBy.toLowerCase())
    );
    if (completer?.id === leader.id || completedBy === leader.id) {
      return { status: 'not_needed', leaderTitle: leader.title ?? 'Lider' };
    }

    const sessionId = (leader.payload as { sessionId?: string }).sessionId;
    const session = sessionId ? ptySessionManager.get(sessionId) : null;
    if (!session || session.exited) {
      return { status: 'leader_offline', leaderTitle: leader.title ?? 'Lider' };
    }

    const author = completer?.title ?? task.assigneeTitle ?? completedBy ?? 'agente';
    const content =
      `[tarefa concluida no quadro #${task.id.slice(0, 8)}] Titulo: ${task.title}. Concluida por: ${author}. ` +
      'Verifique o resultado e o quadro agora; se estiver correto, integre o andar quando houver e distribua o proximo trabalho. ' +
      'Use orkestrai task list e orkestrai ask para qualquer confirmacao necessaria.';
    const messageId = uuidv7();
    await controlCenterService.recordDelivery({
      messageId,
      workspaceId,
      fromNodeId: completer?.id ?? null,
      toNodeId: leader.id,
      state: 'queued',
      content,
      metadata: { kind: 'task_completion', taskId: task.id },
    });
    await controlCenterService.recordDelivery({
      messageId,
      workspaceId,
      fromNodeId: completer?.id ?? null,
      toNodeId: leader.id,
      state: 'sent',
      content,
      metadata: { kind: 'task_completion', taskId: task.id },
    });
    const delivery = ptySessionManager.queueWithSubmit(
      session.id,
      content,
    );
    void delivery.submitted
      .then(async () => {
        await controlCenterService.recordDelivery({
          messageId,
          workspaceId,
          fromNodeId: completer?.id ?? null,
          toNodeId: leader.id,
          state: 'delivered',
          content,
          metadata: { kind: 'task_completion', taskId: task.id },
        });
        await controlCenterService.recordActivity({
          workspaceId,
          nodeId: leader.id,
          state: 'working',
          action: 'system:task_review',
          taskId: task.id,
          metadata: { taskTitle: task.title },
        });
      })
      .catch(async (error) => {
        await controlCenterService.recordDelivery({
          messageId,
          workspaceId,
          fromNodeId: completer?.id ?? null,
          toNodeId: leader.id,
          state: 'failed',
          content,
          error: error instanceof Error ? error.message : String(error),
          metadata: { kind: 'task_completion', taskId: task.id },
        });
      });
    return { status: 'queued', leaderTitle: leader.title ?? 'Lider' };
  }

  /**
   * Re-despacho: injeta o prompt da tarefa de novo no terminal do agente
   * atribuido (orkestrai run <taskId>) — útil para re-tentar ou re-briefar.
   */
  async redispatch(workspaceId: string, taskId: string): Promise<{ dispatched: boolean }> {
    const task = await this.requireTask(workspaceId, taskId);
    if (!task.getAttribute('assignee_node_id')) throw new Error('Tarefa sem responsável para despachar.');
    await this.dispatch(workspaceId, taskId);
    return { dispatched: true };
  }

  /**
   * Despacho automatico: injeta o prompt da tarefa no terminal do agente
   * atribuido (se a sessão estiver viva). E o gatilho do "loop continuo".
   */
  private async dispatch(workspaceId: string, taskId: string): Promise<void> {
    const task = await this.requireTask(workspaceId, taskId);
    const assigneeNodeId = task.getAttribute('assignee_node_id');
    if (!assigneeNodeId) return;
    const node = await workspaceRepository.getNode(assigneeNodeId);
    if (!node || node.workspaceId !== workspaceId || node.type !== 'terminal') return;
    const sessionId = (node.payload as { sessionId?: string }).sessionId;
    const session = sessionId ? ptySessionManager.get(sessionId) : null;
    if (!session || session.exited) return;
    // Texto e Enter separados — ver writeWithSubmit (composer do Codex).
    const prompt = `[nova tarefa do quadro #${taskId.slice(0, 8)}]\n${taskBrief(task)}\nQuando terminar, marque com: orkestrai task done ${taskId}`;
    await ptySessionManager.writeWithSubmit(session.id, prompt);
    await controlCenterService.recordActivity({
      workspaceId,
      nodeId: node.id,
      state: 'working',
      action: 'system:task_working',
      taskId,
      metadata: { taskTitle: task.getAttribute('title') },
    });
  }
}

export const taskBoardService = new TaskBoardService();
