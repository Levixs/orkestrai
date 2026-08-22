import type { AgentActivity, AgentWorkstream, AgentWorkstreamStage, WorkstreamSnapshot } from '../../domain/types.js';
import { AgentCouncil } from '../../domain/models/AgentCouncil.js';
import { AgentCouncilPerspective } from '../../domain/models/AgentCouncilPerspective.js';
import { AgentReview } from '../../domain/models/AgentReview.js';
import { controlCenterRepository } from '../../infrastructure/repositories/ControlCenterRepository.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { boardColumnService } from './BoardColumnService.js';
import { floorService } from './FloorService.js';
import { gitService } from './GitService.js';
import { taskBoardService } from './TaskBoardService.js';

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function strings(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function stageFor(taskStatus: string, timeline: AgentActivity[], reviewStatuses: string[]): AgentWorkstreamStage {
  const latest = timeline.at(-1);
  if (taskStatus === 'done') return 'done';
  if (latest?.state === 'blocked' || latest?.state === 'error' || reviewStatuses.some((status) => status === 'changes_requested' || status === 'rejected')) return 'blocked';
  if (reviewStatuses.includes('pending')) return 'review';
  if (taskStatus !== 'todo') return 'active';
  return 'backlog';
}

export class WorkstreamService {
  async snapshot(workspaceId: string): Promise<WorkstreamSnapshot> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace not found.');
    const [tasks, columns, nodes, floors, activities, councilModels, reviewModels, git] = await Promise.all([
      taskBoardService.list(workspaceId),
      boardColumnService.list(workspaceId),
      workspaceRepository.listNodes(workspaceId, undefined, true),
      floorService.list(workspaceId),
      controlCenterRepository.listActivity(workspaceId),
      AgentCouncil.query().where('workspace_id', workspaceId).orderBy('updated_at', 'desc').get(),
      AgentReview.query().where('workspace_id', workspaceId).orderBy('updated_at', 'desc').get(),
      gitService.status(workspaceId).catch(() => ({ isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, head: null, revision: '', changes: [] })),
    ]);
    const columnsByKey = new Map(columns.map((column) => [column.key, column]));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const floorsById = new Map(floors.map((floor) => [floor.id, floor]));
    const councilsByTask = new Map<string, typeof councilModels>();
    const reviewsByTask = new Map<string, typeof reviewModels>();
    for (const council of councilModels) {
      const taskId = council.getAttribute('task_id') as string | null;
      if (taskId) councilsByTask.set(taskId, [...(councilsByTask.get(taskId) ?? []), council]);
    }
    for (const review of reviewModels) {
      const taskId = review.getAttribute('task_id') as string | null;
      if (taskId) reviewsByTask.set(taskId, [...(reviewsByTask.get(taskId) ?? []), review]);
    }
    const perspectiveRows = councilModels.length
      ? await AgentCouncilPerspective.query().whereIn('council_id', councilModels.map((model) => String(model.getAttribute('id')))).get()
      : [];
    const perspectivesByCouncil = new Map<string, typeof perspectiveRows>();
    for (const perspective of perspectiveRows) {
      const councilId = String(perspective.getAttribute('council_id'));
      perspectivesByCouncil.set(councilId, [...(perspectivesByCouncil.get(councilId) ?? []), perspective]);
    }

    const workstreams: AgentWorkstream[] = tasks.map((task) => {
      const taskActivities = activities.filter((activity) => activity.taskId === task.id);
      const councils = councilsByTask.get(task.id) ?? [];
      const reviews = reviewsByTask.get(task.id) ?? [];
      const paths = [...new Set(reviews.flatMap((review) => strings(review.getAttribute('selected_paths_json'))))];
      const assignee = task.assigneeNodeId ? nodesById.get(task.assigneeNodeId) ?? null : null;
      const floor = assignee?.floorId ? floorsById.get(assignee.floorId) ?? null : null;
      const column = columnsByKey.get(task.status);
      const councilRefs = councils.map((council) => {
        const id = String(council.getAttribute('id'));
        const perspectives = perspectivesByCouncil.get(id) ?? [];
        return {
          id,
          title: String(council.getAttribute('title')),
          status: String(council.getAttribute('status')),
          mode: String(council.getAttribute('mode')),
          completedPerspectives: perspectives.filter((item) => item.getAttribute('status') === 'completed').length,
          totalPerspectives: perspectives.length,
          updatedAt: iso(council.getAttribute('updated_at')),
        };
      });
      const reviewRefs = reviews.map((review) => ({
        id: String(review.getAttribute('id')),
        title: String(review.getAttribute('title')),
        status: String(review.getAttribute('status')),
        revision: String(review.getAttribute('revision')),
        selectedPaths: strings(review.getAttribute('selected_paths_json')),
        evidenceCount: strings(review.getAttribute('evidence_json')).length,
        testCount: strings(review.getAttribute('tests_json')).length,
        riskCount: strings(review.getAttribute('risks_json')).length,
        updatedAt: iso(review.getAttribute('updated_at')),
      }));
      const stage = stageFor(task.status, taskActivities, reviewRefs.map((review) => review.status));
      const updatedAt = [task.updatedAt, ...taskActivities.map((item) => item.createdAt), ...councilRefs.map((item) => item.updatedAt), ...reviewRefs.map((item) => item.updatedAt)]
        .sort().at(-1) ?? task.updatedAt;
      return {
        id: task.id,
        workspaceId,
        title: task.title,
        description: task.description,
        stage,
        taskStatus: task.status,
        taskStatusLabel: column?.name ?? column?.key ?? task.status,
        taskStatusColor: column?.color ?? '#7de5ff',
        assigneeNodeId: task.assigneeNodeId,
        assigneeTitle: task.assigneeTitle,
        floor: floor ? { id: floor.id, name: floor.name, branch: floor.branch } : null,
        councils: councilRefs,
        reviews: reviewRefs,
        git: {
          revision: git.revision || null,
          branch: git.branch,
          paths,
          changedPaths: [...new Set(git.changes.filter((change) => paths.includes(change.path)).map((change) => change.path))],
        },
        timeline: taskActivities,
        createdAt: task.createdAt,
        updatedAt,
      };
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const linkedTaskIds = new Set(tasks.map((task) => task.id));
    const linkedPaths = new Set(workstreams.flatMap((workstream) => workstream.git.paths));
    const counts: Record<AgentWorkstreamStage, number> = { backlog: 0, active: 0, review: 0, blocked: 0, done: 0 };
    for (const workstream of workstreams) counts[workstream.stage] += 1;
    return {
      workspaceId,
      taskBoardNodeId: nodes.find((node) => node.type === 'tasks' && !node.floorId)?.id ?? nodes.find((node) => node.type === 'tasks')?.id ?? null,
      workstreams,
      counts,
      unlinked: {
        councils: councilModels.filter((model) => !linkedTaskIds.has(String(model.getAttribute('task_id') ?? ''))).length,
        reviews: reviewModels.filter((model) => !linkedTaskIds.has(String(model.getAttribute('task_id') ?? ''))).length,
        activities: activities.filter((activity) => !activity.taskId || !linkedTaskIds.has(activity.taskId)).length,
        changedPaths: [...new Set(git.changes.filter((change) => !linkedPaths.has(change.path)).map((change) => change.path))],
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

export const workstreamService = new WorkstreamService();
