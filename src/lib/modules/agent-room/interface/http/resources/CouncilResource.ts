import { Resource } from '@beeblock/svelar/routing';
import type {
  CouncilData,
  CouncilLeaderRecommendation,
  CouncilPerspectiveData,
  CouncilPerspectiveOutput,
  CouncilPerspectiveStatus,
  CouncilStatus,
  CouncilMode,
  CouncilCriterion,
} from '$lib/modules/agent-room/contracts/schemas/council.schema.js';
import { councilLeaderRecommendationSchema, councilPerspectiveOutputSchema } from '$lib/modules/agent-room/contracts/schemas/council.schema.js';
import type { AgentCouncil } from '$lib/modules/agent-room/domain/models/AgentCouncil.js';
import type { AgentCouncilPerspective } from '$lib/modules/agent-room/domain/models/AgentCouncilPerspective.js';

function iso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function parsed<T>(value: unknown, schema: { safeParse(input: unknown): { success: boolean; data?: T } }): T | null {
  if (!value) return null;
  try {
    const result = schema.safeParse(JSON.parse(String(value)));
    return result.success ? result.data ?? null : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const result = JSON.parse(String(value));
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  } catch {
    return null;
  }
}

export class CouncilResource extends Resource<AgentCouncil, CouncilData> {
  constructor(
    data: AgentCouncil,
    private readonly perspectiveModels: AgentCouncilPerspective[],
    private readonly nodeTitles: Map<string, string>,
    private readonly taskTitle: string | null,
    private readonly floorNames: Map<string, string>,
  ) {
    super(data);
  }

  toJSON(): CouncilData {
    const perspectives: CouncilPerspectiveData[] = this.perspectiveModels.map((model) => ({
      id: String(model.getAttribute('id')),
      councilId: String(model.getAttribute('council_id')),
      agentNodeId: String(model.getAttribute('agent_node_id')),
      agentTitle: this.nodeTitles.get(String(model.getAttribute('agent_node_id'))) ?? 'Agent',
      provider: String(model.getAttribute('provider') || ''),
      model: model.getAttribute('model') ?? null,
      approach: String(model.getAttribute('approach') || ''),
      status: model.getAttribute('status') as CouncilPerspectiveStatus,
      floorId: model.getAttribute('floor_id') ?? null,
      floorName: model.getAttribute('floor_id')
        ? this.floorNames.get(String(model.getAttribute('floor_id'))) ?? null
        : null,
      artifactPath: model.getAttribute('artifact_path') ?? null,
      output: parsed<CouncilPerspectiveOutput>(model.getAttribute('output_json'), councilPerspectiveOutputSchema),
      usageSnapshot: record(model.getAttribute('usage_snapshot_json')),
      error: model.getAttribute('error') ?? null,
      startedAt: iso(model.getAttribute('started_at')),
      completedAt: iso(model.getAttribute('completed_at')),
    }));
    return {
      id: String(this.data.getAttribute('id')),
      workspaceId: String(this.data.getAttribute('workspace_id')),
      taskId: this.data.getAttribute('task_id') ?? null,
      taskTitle: this.taskTitle,
      leaderNodeId: this.data.getAttribute('leader_node_id') ?? null,
      leaderTitle: this.data.getAttribute('leader_node_id')
        ? this.nodeTitles.get(String(this.data.getAttribute('leader_node_id'))) ?? null
        : null,
      title: String(this.data.getAttribute('title')),
      objective: String(this.data.getAttribute('objective')),
      mode: this.data.getAttribute('mode') as CouncilMode,
      criterion: this.data.getAttribute('criterion') as CouncilCriterion,
      customCriterion: this.data.getAttribute('custom_criterion') ?? null,
      requestLeaderRecommendation: Boolean(this.data.getAttribute('request_leader_recommendation')),
      maxExecutions: Number(this.data.getAttribute('max_executions')),
      executionCount: Number(this.data.getAttribute('execution_count')),
      status: this.data.getAttribute('status') as CouncilStatus,
      recommendation: parsed<CouncilLeaderRecommendation>(this.data.getAttribute('recommendation_json'), councilLeaderRecommendationSchema),
      recommendationError: this.data.getAttribute('recommendation_error') ?? null,
      selectedPerspectiveId: this.data.getAttribute('selected_perspective_id') ?? null,
      decisionNote: this.data.getAttribute('decision_note') ?? null,
      perspectives,
      startedAt: iso(this.data.getAttribute('started_at')) ?? '',
      completedAt: iso(this.data.getAttribute('completed_at')),
      decidedAt: iso(this.data.getAttribute('decided_at')),
      createdAt: iso(this.data.getAttribute('created_at')) ?? '',
      updatedAt: iso(this.data.getAttribute('updated_at')) ?? '',
    };
  }
}
