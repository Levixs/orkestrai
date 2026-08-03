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

function mapTask(model: AgentBoardTask, assigneeTitle: string | null = null): BoardTask {
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
    const rows = await AgentBoardTask.query().where('workspace_id', workspaceId).orderBy('created_at', 'asc').get();
    const nodes = await workspaceRepository.listNodes(workspaceId);
    const titles = new Map(nodes.map((node) => [node.id, node.title ?? node.type]));
    return rows.map((row) => {
      const assigneeId = row.getAttribute('assignee_node_id') as string | null;
      return mapTask(row, assigneeId ? (titles.get(assigneeId) ?? null) : null);
    });
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
    input: { title: string; assigneeNodeId?: string | null; createdBy?: string }
  ): Promise<BoardTask> {
    const title = input.title.trim();
    if (!title) throw new Error('Informe o titulo da tarefa.');
    const now = new Date().toISOString();
    const id = uuidv7();
    await AgentBoardTask.query().insert({
      id,
      workspace_id: workspaceId,
      title,
      status: input.assigneeNodeId ? 'doing' : 'todo',
      assignee_node_id: input.assigneeNodeId ?? null,
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
    return mapTask(task);
  }

  async update(
    workspaceId: string,
    taskId: string,
    input: { title?: string; status?: string; assigneeNodeId?: string | null; imagePath?: string | null }
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
    return mapTask(await this.requireTask(workspaceId, taskId));
  }

  async remove(workspaceId: string, taskId: string): Promise<boolean> {
    await this.requireTask(workspaceId, taskId);
    await AgentBoardTask.query().where('id', taskId).delete();
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
