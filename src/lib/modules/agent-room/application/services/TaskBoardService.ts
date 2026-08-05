import { uuidv7 } from '@beeblock/svelar/support';
import { AgentBoardTask } from '../../domain/models/AgentBoardTask.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '../../infrastructure/pty/PtySessionManager.ts';

export type BoardTask = {
  id: string;
  workspaceId: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  assigneeNodeId: string | null;
  assigneeTitle: string | null;
  imagePath: string | null;
  /** Todas as imagens de referencia da tarefa (imagePath = primeira/capa). */
  images: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Preenchido quando a tarefa foi arquivada (sai do quadro, fica no historico). */
  archivedAt: string | null;
  /** Nota de spec vinculada (UMA por tarefa; a mesma nota pode servir N tarefas). */
  noteId: string | null;
  noteTitle: string | null;
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

function mapTask(model: AgentBoardTask, assigneeTitle: string | null = null, noteTitle: string | null = null): BoardTask {
  const images = imagesOf(model);
  return {
    id: model.getAttribute('id'),
    workspaceId: model.getAttribute('workspace_id'),
    title: model.getAttribute('title'),
    status: model.getAttribute('status') as BoardTask['status'],
    assigneeNodeId: model.getAttribute('assignee_node_id'),
    assigneeTitle,
    imagePath: model.getAttribute('image_path') ?? images[0] ?? null,
    images,
    createdBy: model.getAttribute('created_by'),
    createdAt: String(model.getAttribute('created_at')),
    updatedAt: String(model.getAttribute('updated_at')),
    archivedAt: model.getAttribute('archived_at') ?? null,
    noteId: model.getAttribute('note_node_id') ?? null,
    noteTitle,
  };
}

const VALID_STATUS = new Set(['todo', 'doing', 'done']);

/**
 * Quadro de tarefas do workspace (kanban): o usuario ou o lider (via bridge)
 * cria tarefas, atribui a um agente e o agente recebe o prompt na hora no
 * seu terminal — e o "loop continuo": tarefa atribuida dispara trabalho.
 */
/** Avisa o canvas para recarregar o workspace (via broadcast WS global). */
function notifyWorkspaceChanged(workspaceId: string) {
  const broadcast = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
  broadcast?.({ type: 'workspaceChanged', workspaceId });
}

export class TaskBoardService {
  async list(workspaceId: string): Promise<BoardTask[]> {
    // Quadro: so tarefas NAO arquivadas (arquivadas vivem em history()).
    const rows = await AgentBoardTask.query().where('workspace_id', workspaceId).whereNull('archived_at').orderBy('created_at', 'asc').get();
    // includeArchived: notas arquivadas junto com a tarefa ainda resolvem o titulo.
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const titles = new Map(nodes.map((node) => [node.id, node.title ?? node.type]));
    return rows.map((row) => {
      const assigneeId = row.getAttribute('assignee_node_id') as string | null;
      const noteId = row.getAttribute('note_node_id') as string | null;
      return mapTask(row, assigneeId ? (titles.get(assigneeId) ?? null) : null, noteId ? (titles.get(noteId) ?? null) : null);
    });
  }

  /**
   * Historico do workspace: tarefas concluidas e/ou arquivadas, da mais
   * recente para a mais antiga. E o "o que foi feito" do projeto — o lider
   * (ou o usuario) arquiva para limpar o quadro sem perder o registro.
   */
  async history(workspaceId: string, limit = 200): Promise<BoardTask[]> {
    // done ainda no quadro + tudo que ja foi arquivado (qualquer status).
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

  /** Arquiva uma tarefa concluida (sai do quadro, fica no historico). */
  async archive(workspaceId: string, taskId: string): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    if (task.getAttribute('status') !== 'done') throw new Error('So da para arquivar tarefa concluida (done).');
    await AgentBoardTask.query().where('id', taskId).update({ archived_at: new Date().toISOString() });
    await this.hideOrphanLinkedNotes(workspaceId, [task.getAttribute('note_node_id') as string | null]);
    notifyWorkspaceChanged(workspaceId);
    return this.mapWithTitles(await this.requireTask(workspaceId, taskId));
  }

  /** Arquiva TODAS as tarefas concluidas do quadro de uma vez. */
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
   * Nota vinculada so sai do canvas quando NENHUMA tarefa viva (nao arquivada)
   * aponta para ela — a mesma spec pode cobrir varias tarefas (1:N).
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

  /** Resolve titulos (responsavel + nota) para retornos pontuais. */
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
      throw new Error('Nota nao encontrada neste workspace (vincule um no do tipo nota).');
    }
  }

  private async requireTask(workspaceId: string, taskId: string): Promise<AgentBoardTask> {
    const model = await AgentBoardTask.find(taskId);
    if (!model || model.getAttribute('workspace_id') !== workspaceId) {
      throw new Error('Tarefa nao encontrada neste workspace.');
    }
    return model;
  }

  async create(
    workspaceId: string,
    input: { title: string; assigneeNodeId?: string | null; createdBy?: string; noteId?: string | null }
  ): Promise<BoardTask> {
    const title = input.title.trim();
    if (!title) throw new Error('Informe o titulo da tarefa.');
    if (input.noteId) await this.requireNote(workspaceId, input.noteId);
    const now = new Date().toISOString();
    const id = uuidv7();
    await AgentBoardTask.query().insert({
      id,
      workspace_id: workspaceId,
      title,
      status: input.assigneeNodeId ? 'doing' : 'todo',
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
    // Task criada por humano (UI): avisa o lider — ele decide a coordenacao.
    // (Tasks da propria ponte/agentes nao ecoam de volta.)
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
    input: { title?: string; status?: string; assigneeNodeId?: string | null; imagePath?: string | null; noteId?: string | null }
  ): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error('Informe o titulo da tarefa.');
      patch.title = title;
    }
    if (input.status !== undefined) {
      if (!VALID_STATUS.has(input.status)) throw new Error('Status invalido (todo/doing/done).');
      patch.status = input.status;
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
    return this.mapWithTitles(await this.requireTask(workspaceId, taskId));
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

  /** Anexa uma imagem de referencia a tarefa (primeira vira a capa). */
  async attachImage(workspaceId: string, taskId: string, path: string): Promise<BoardTask> {
    const task = await this.requireTask(workspaceId, taskId);
    const images = imagesOf(task);
    if (!path || images.includes(path)) throw new Error('Imagem invalida ou ja anexada.');
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

  /**
   * Aviso ao lider (maestro) no terminal dele: uma task nova entrou no quadro.
   * Sem responsavel = precisa de acao (distribuir); com responsavel = FYI.
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
    const title = task.getAttribute('title');
    const hint = assigned
      ? `O usuario atribuiu direto para um agente — acompanhe com: orkestrai task list`
      : `SEM responsavel. Distribua: orkestrai task assign ${taskId} "<Agente>" (ou coordene como achar melhor)`;
    ptySessionManager.writeWithSubmit(session.id, `[nova tarefa no quadro #${taskId.slice(0, 8)}] "${title}". ${hint}`);
  }

  /**
   * Re-despacho: injeta o prompt da tarefa de novo no terminal do agente
   * atribuido (orkestrai run <taskId>) — util para re-tentar ou re-briefar.
   */
  async redispatch(workspaceId: string, taskId: string): Promise<{ dispatched: boolean }> {
    const task = await this.requireTask(workspaceId, taskId);
    if (!task.getAttribute('assignee_node_id')) throw new Error('Tarefa sem responsavel para despachar.');
    await this.dispatch(workspaceId, taskId);
    return { dispatched: true };
  }

  /**
   * Despacho automatico: injeta o prompt da tarefa no terminal do agente
   * atribuido (se a sessao estiver viva). E o gatilho do "loop continuo".
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
    const images = imagesOf(task);
    const imagesNote = images.length ? `\nImagens de referencia: ${images.join(', ')}` : '';
    // Texto e Enter separados — ver writeWithSubmit (composer do Codex).
    const prompt = `[nova tarefa do quadro #${taskId.slice(0, 8)}] ${task.getAttribute('title')}${imagesNote}\nQuando terminar, marque com: orkestrai task done ${taskId}`;
    ptySessionManager.writeWithSubmit(session.id, prompt);
  }
}

export const taskBoardService = new TaskBoardService();
