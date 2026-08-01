import { Action } from '@beeblock/svelar/actions';
import { agentRoomRepository } from '$lib/modules/agent-room/infrastructure/repositories/AgentRoomRepository.js';
import type { AgentTask } from '$lib/modules/agent-room/domain/types.js';
import { CreateBacklogFromLeaderPlanDto } from '$lib/modules/agent-room/application/dto/AgentRoomDtos.js';
import { AgentRoomPlanningService } from '$lib/modules/agent-room/application/services/AgentRoomPlanningService.js';

const planningService = new AgentRoomPlanningService();

export class CreateBacklogFromLeaderPlanAction extends Action<CreateBacklogFromLeaderPlanDto, AgentTask[]> {
  async execute(dto: CreateBacklogFromLeaderPlanDto): Promise<AgentTask[]> {
    const plannedTasks = planningService.parseBacklogPlan(dto.leaderOutput);
    if (!plannedTasks.length) {
      throw new Error('O lider nao retornou um backlog valido em JSON. Nenhuma task generica foi criada.');
    }

    const created: AgentTask[] = [];
    const replacementTask = dto.replacementTaskId ? await agentRoomRepository.getTask(dto.replacementTaskId) : null;

    for (const [index, plannedTask] of plannedTasks.entries()) {
      if (index === 0 && replacementTask && replacementTask.status !== 'done') {
        const updated = await agentRoomRepository.updateTask(replacementTask.id, {
          title: plannedTask.title,
          description: plannedTask.description,
          priority: plannedTask.priority,
          assigneeId: dto.defaultAssigneeId,
          blockedReason: null,
        });
        if (updated) {
          created.push(updated);
          await agentRoomRepository.addTaskEvent({
            conversationId: dto.conversationId,
            taskId: updated.id,
            type: 'task_planned',
            actorMemberId: dto.leader.id,
            content: `${dto.leader.title} substituiu a task generica por uma task real do backlog.`,
          });
        }
        continue;
      }

      const task = await agentRoomRepository.addTask({
        conversationId: dto.conversationId,
        title: plannedTask.title,
        description: plannedTask.description,
        status: 'backlog',
        priority: plannedTask.priority,
        assigneeId: dto.defaultAssigneeId,
        createdByMemberId: dto.leader.id,
      });
      created.push(task);
      await agentRoomRepository.addTaskEvent({
        conversationId: dto.conversationId,
        taskId: task.id,
        type: 'task_planned',
        actorMemberId: dto.leader.id,
        content: `${dto.leader.title} criou a task a partir do historico e do planejamento existente.`,
      });
    }

    return created;
  }
}
