import { uuidv7 } from '@beeblock/svelar/support';
import type { CreateCouncilDto, DecideCouncilDto } from '../../application/dto/CouncilDto.js';
import type { CouncilLeaderRecommendation, CouncilPerspectiveOutput } from '../../contracts/schemas/council.schema.js';
import { AgentCouncil } from '../../domain/models/AgentCouncil.js';
import { AgentCouncilPerspective } from '../../domain/models/AgentCouncilPerspective.js';

export class CouncilRepository {
  async create(workspaceId: string, input: CreateCouncilDto): Promise<AgentCouncil> {
    const now = new Date().toISOString();
    const council = await AgentCouncil.create({
      id: uuidv7(),
      workspace_id: workspaceId,
      task_id: input.taskId,
      leader_node_id: input.leaderNodeId,
      title: input.title,
      objective: input.objective,
      mode: input.mode,
      criterion: input.criterion,
      custom_criterion: input.customCriterion,
      request_leader_recommendation: input.requestLeaderRecommendation,
      max_executions: input.maxExecutions,
      execution_count: 0,
      status: 'running',
      recommendation_json: null,
      recommendation_error: null,
      selected_perspective_id: null,
      decision_note: null,
      started_at: now,
      completed_at: null,
      decided_at: null,
      created_at: now,
      updated_at: now,
    });
    for (const perspective of input.perspectives) {
      await AgentCouncilPerspective.create({
        id: uuidv7(),
        council_id: council.getAttribute('id'),
        workspace_id: workspaceId,
        agent_node_id: perspective.agentNodeId,
        provider: '',
        model: null,
        approach: perspective.approach,
        status: 'pending',
        floor_id: null,
        artifact_path: null,
        output_json: null,
        usage_snapshot_json: null,
        raw_output: null,
        error: null,
        started_at: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      });
    }
    return council;
  }

  async list(workspaceId: string): Promise<AgentCouncil[]> {
    return AgentCouncil.query().where('workspace_id', workspaceId).orderBy('updated_at', 'desc').get();
  }

  async find(id: string): Promise<AgentCouncil | null> {
    return AgentCouncil.find(id);
  }

  async perspectives(councilId: string): Promise<AgentCouncilPerspective[]> {
    return AgentCouncilPerspective.query().where('council_id', councilId).orderBy('created_at', 'asc').get();
  }

  async beginPerspective(
    id: string,
    input: { provider: string; model: string | null; floorId: string | null; artifactPath: string | null; usageSnapshot: Record<string, unknown> | null },
  ): Promise<void> {
    await AgentCouncilPerspective.query().where('id', id).update({
      provider: input.provider,
      model: input.model,
      floor_id: input.floorId,
      artifact_path: input.artifactPath,
      usage_snapshot_json: input.usageSnapshot ? JSON.stringify(input.usageSnapshot) : null,
      status: 'running',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async completePerspective(id: string, output: CouncilPerspectiveOutput, rawOutput: string): Promise<void> {
    const now = new Date().toISOString();
    await AgentCouncilPerspective.query().where('id', id).update({
      output_json: JSON.stringify(output),
      raw_output: rawOutput.slice(0, 64_000),
      error: null,
      status: 'completed',
      completed_at: now,
      updated_at: now,
    });
  }

  async failPerspective(id: string, error: string, rawOutput = ''): Promise<void> {
    const now = new Date().toISOString();
    await AgentCouncilPerspective.query().where('id', id).update({
      raw_output: rawOutput.slice(0, 64_000) || null,
      error: error.slice(0, 4_000),
      status: 'failed',
      completed_at: now,
      updated_at: now,
    });
  }

  async finish(
    id: string,
    status: 'ready' | 'partial' | 'failed',
    executionCount: number,
    recommendation: CouncilLeaderRecommendation | null,
    recommendationError: string | null = null,
  ): Promise<void> {
    const now = new Date().toISOString();
    await AgentCouncil.query().where('id', id).update({
      status,
      execution_count: executionCount,
      recommendation_json: recommendation ? JSON.stringify(recommendation) : null,
      recommendation_error: recommendationError?.slice(0, 4_000) || null,
      completed_at: now,
      updated_at: now,
    });
  }

  async decide(id: string, input: DecideCouncilDto): Promise<AgentCouncil | null> {
    const council = await this.find(id);
    if (!council) return null;
    const now = new Date().toISOString();
    await council.update({
      status: input.status,
      selected_perspective_id: input.selectedPerspectiveId,
      decision_note: input.note,
      decided_at: now,
      updated_at: now,
    });
    return this.find(id);
  }

  async deleteWorkspaceHistory(workspaceId: string): Promise<void> {
    await AgentCouncilPerspective.query().where('workspace_id', workspaceId).delete();
    await AgentCouncil.query().where('workspace_id', workspaceId).delete();
  }
}

export const councilRepository = new CouncilRepository();
