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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function mapTask(model: AgentBoardTask, assigneeTitle: string | null = null): BoardTask {
  return {
    id: model.getAttribute('id'),
    workspaceId: model.getAttribute('workspace_id'),
    title: model.getAttribute('title'),
    status: model.getAttribute('status') as BoardTask['status'],
    assigneeNodeId: model.getAttribute('assignee_node_id'),
    assigneeTitle,
    imagePath: model.getAttribute('image_path'),
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
    const prompt = `[nova tarefa do quadro #${taskId.slice(0, 8)}] ${task.getAttribute('title')}\nQuando terminar, marque com: orkestrai task done ${taskId}\r`;
    ptySessionManager.write(session.id, prompt);
  }
}

export const taskBoardService = new TaskBoardService();
