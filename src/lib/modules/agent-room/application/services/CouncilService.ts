import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ModelEffort } from '../../domain/types.js';
import type { CreateCouncilDto, DecideCouncilDto } from '../dto/CouncilDto.js';
import type {
  CouncilData,
  CouncilLeaderRecommendation,
  CouncilPerspectiveOutput,
  LandCouncilPerspectiveInput,
} from '../../contracts/schemas/council.schema.js';
import {
  councilLeaderRecommendationSchema,
  councilPerspectiveOutputSchema,
} from '../../contracts/schemas/council.schema.js';
import { AgentCouncil } from '../../domain/models/AgentCouncil.js';
import { AgentCouncilPerspective } from '../../domain/models/AgentCouncilPerspective.js';
import { hasAgentAdapter } from '../adapters/registry.js';
import { runAgentInWorkspace } from '../agents.js';
import { workspaceExecutionRuntime } from '../../infrastructure/WslRuntime.js';
import { councilRepository } from '../../infrastructure/repositories/CouncilRepository.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { CouncilResource } from '../../interface/http/resources/CouncilResource.js';
import { controlCenterService } from './ControlCenterService.js';
import { floorService } from './FloorService.js';
import { taskBoardService } from './TaskBoardService.js';
import { usageService } from './UsageService.js';

const execFileAsync = promisify(execFile);

function broadcast(workspaceId: string, councilId: string): void {
  const send = (globalThis as { __orkestraiBroadcast?: (payload: Record<string, unknown>) => void }).__orkestraiBroadcast;
  send?.({ type: 'councilChanged', workspaceId, councilId });
}

function jsonCandidate(content: string): unknown {
  const candidates = [content.trim()];
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fence) candidates.push(fence);
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(content.slice(first, last + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* try the next bounded candidate */ }
  }
  throw new Error('The provider did not return valid JSON.');
}

export function parseCouncilPerspectiveOutput(content: string): CouncilPerspectiveOutput {
  return councilPerspectiveOutputSchema.parse(jsonCandidate(content));
}

function criterionText(council: AgentCouncil): string {
  const criterion = String(council.getAttribute('criterion'));
  return criterion === 'custom'
    ? String(council.getAttribute('custom_criterion') || 'the stated objective')
    : criterion;
}

export class CouncilService {
  private readonly running = new Map<string, Promise<void>>();

  async start(workspaceId: string, input: CreateCouncilDto): Promise<CouncilData> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace not found.');
    const nodes = await workspaceRepository.listNodes(workspaceId, null);
    const terminals = new Map(nodes.filter((node) => node.type === 'terminal').map((node) => [node.id, node]));
    for (const perspective of input.perspectives) {
      const node = terminals.get(perspective.agentNodeId);
      const provider = String((node?.payload as { provider?: string } | undefined)?.provider ?? '');
      if (!node) throw new Error('A selected council agent does not belong to this workspace.');
      if (!provider || !hasAgentAdapter(provider)) throw new Error(`${node.title ?? 'Agent'} does not have a supported provider.`);
    }
    if (input.taskId && !(await taskBoardService.list(workspaceId)).some((task) => task.id === input.taskId)) {
      throw new Error('The selected task was not found in this workspace.');
    }
    if (input.requestLeaderRecommendation) {
      const leader = input.leaderNodeId ? terminals.get(input.leaderNodeId) : null;
      if (!leader || !(leader.payload as { maestro?: boolean }).maestro) {
        throw new Error('Select the workspace leader for the recommendation.');
      }
    }
    const council = await councilRepository.create(workspaceId, input);
    const result = await this.present(council);
    queueMicrotask(() => void this.execute(String(council.getAttribute('id'))));
    broadcast(workspaceId, result.id);
    return result;
  }

  async execute(councilId: string): Promise<void> {
    const existing = this.running.get(councilId);
    if (existing) return existing;
    const execution = this.run(councilId)
      .catch(async (error) => {
        const council = await councilRepository.find(councilId).catch(() => null);
        if (council?.getAttribute('status') === 'running') {
          await councilRepository.finish(
            councilId,
            'failed',
            0,
            null,
            error instanceof Error ? error.message : String(error),
          ).catch(() => undefined);
          broadcast(String(council.getAttribute('workspace_id')), councilId);
        }
      })
      .finally(() => this.running.delete(councilId));
    this.running.set(councilId, execution);
    return execution;
  }

  private async run(councilId: string): Promise<void> {
    const council = await councilRepository.find(councilId);
    if (!council || council.getAttribute('status') !== 'running') return;
    const workspaceId = String(council.getAttribute('workspace_id'));
    const perspectives = await councilRepository.perspectives(councilId);
    await Promise.all(
      perspectives
        .filter((perspective) => ['pending', 'running'].includes(String(perspective.getAttribute('status'))))
        .map((perspective) => this.runPerspective(council, perspective)),
    );

    const completed = (await councilRepository.perspectives(councilId))
      .filter((perspective) => perspective.getAttribute('status') === 'completed');
    let executionCount = perspectives.length;
    let recommendation: CouncilLeaderRecommendation | null = null;
    let recommendationError: string | null = null;
    if (Boolean(council.getAttribute('request_leader_recommendation'))) {
      executionCount += 1;
      try {
        recommendation = await this.runLeaderRecommendation(council, completed);
      } catch (error) {
        recommendationError = error instanceof Error ? error.message : String(error);
      }
    }

    const status = completed.length === 0
      ? 'failed'
      : completed.length === perspectives.length && !recommendationError ? 'ready' : 'partial';
    await councilRepository.finish(councilId, status, executionCount, recommendation, recommendationError);
    broadcast(workspaceId, councilId);
  }

  private async runPerspective(council: AgentCouncil, perspective: AgentCouncilPerspective): Promise<void> {
    const workspaceId = String(council.getAttribute('workspace_id'));
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    const node = await workspaceRepository.getNode(String(perspective.getAttribute('agent_node_id')));
    if (!workspace || !node || node.workspaceId !== workspaceId || node.type !== 'terminal') {
      await councilRepository.failPerspective(String(perspective.getAttribute('id')), 'The selected agent is no longer available.');
      return;
    }
    const payload = node.payload as { provider?: string; model?: string; effort?: string };
    const provider = String(payload.provider ?? '');
    const model = payload.model ? String(payload.model) : null;
    let floorId = perspective.getAttribute('floor_id') as string | null;
    let artifactPath = perspective.getAttribute('artifact_path') as string | null;
    let runPath = workspace.workingDir;
    let began = false;
    let rawOutput = '';
    try {
      const isRepo = await this.isGitRepository(workspace.workingDir);
      if (isRepo) {
        const existingFloor = floorId ? await floorService.get(floorId) : null;
        const floor = existingFloor ?? await floorService.create(workspaceId, {
          name: `Council ${String(council.getAttribute('id')).slice(0, 8)} ${String(perspective.getAttribute('id')).slice(0, 8)}`,
          cloneLayout: false,
        });
        floorId = floor.id;
        runPath = floor.path;
      } else {
        artifactPath ??= join(
          workspace.workingDir,
          '.orkestrai',
          'councils',
          String(council.getAttribute('id')),
          String(perspective.getAttribute('id')),
        );
        await mkdir(artifactPath, { recursive: true });
        runPath = artifactPath;
      }
      const usage = ['claude', 'codex', 'kimi'].includes(provider)
        ? await usageService.getUsage(provider, false)
        : null;
      await councilRepository.beginPerspective(String(perspective.getAttribute('id')), {
        provider, model, floorId, artifactPath, usageSnapshot: usage as unknown as Record<string, unknown> | null,
      });
      began = true;
      await controlCenterService.recordActivity({
        workspaceId, nodeId: node.id, state: 'working', action: 'system:council_perspective',
        taskId: council.getAttribute('task_id') ?? null,
        metadata: { councilId: council.getAttribute('id'), perspectiveId: perspective.getAttribute('id') },
      });
      broadcast(workspaceId, String(council.getAttribute('id')));

      const result = await runAgentInWorkspace({
        agent: provider,
        memberId: node.id,
        memberTitle: node.title ?? 'Agent',
        taskId: council.getAttribute('task_id') ?? undefined,
        model,
        effort: (payload.effort as ModelEffort | undefined) ?? null,
        prompt: await this.perspectivePrompt(council, perspective, node.title ?? 'Agent'),
        workingDirectory: runPath,
        mode: council.getAttribute('mode') === 'implementation' ? 'implement' : 'plan',
        allowWrites: council.getAttribute('mode') === 'implementation',
      }, workspace.workingDir, { runtime: workspaceExecutionRuntime(workspace) });
      rawOutput = result.rawOutput ?? result.content;
      if (result.error) throw new Error(result.error);
      const output = parseCouncilPerspectiveOutput(result.content);
      await councilRepository.completePerspective(String(perspective.getAttribute('id')), output, rawOutput);
      await controlCenterService.recordActivity({
        workspaceId, nodeId: node.id, state: 'done', action: 'system:council_perspective_done',
        taskId: council.getAttribute('task_id') ?? null,
        metadata: { councilId: council.getAttribute('id'), perspectiveId: perspective.getAttribute('id') },
      });
    } catch (error) {
      if (!began) {
        await councilRepository.beginPerspective(String(perspective.getAttribute('id')), {
          provider, model, floorId, artifactPath, usageSnapshot: null,
        }).catch(() => undefined);
      }
      await councilRepository.failPerspective(
        String(perspective.getAttribute('id')),
        error instanceof Error ? error.message : String(error),
        rawOutput,
      );
      await controlCenterService.recordActivity({
        workspaceId, nodeId: node.id, state: 'error', action: 'system:council_perspective_failed',
        taskId: council.getAttribute('task_id') ?? null,
        metadata: { councilId: council.getAttribute('id'), perspectiveId: perspective.getAttribute('id') },
      }).catch(() => undefined);
    } finally {
      broadcast(workspaceId, String(council.getAttribute('id')));
    }
  }

  private async perspectivePrompt(council: AgentCouncil, perspective: AgentCouncilPerspective, agentTitle: string): Promise<string> {
    const taskId = council.getAttribute('task_id') as string | null;
    const task = taskId
      ? (await taskBoardService.list(String(council.getAttribute('workspace_id')))).find((item) => item.id === taskId)
      : null;
    const mode = String(council.getAttribute('mode'));
    return [
      'You are contributing one independent perspective to an Orkestrai Council.',
      `Council: ${council.getAttribute('title')}`,
      `Objective: ${council.getAttribute('objective')}`,
      task ? `Task context:\nTitle: ${task.title}\nDescription: ${task.description || '(none)'}\nAttachments: ${task.attachments.map((item) => item.path ?? item.url ?? item.name).join(', ') || '(none)'}` : '',
      `Decision criterion: ${criterionText(council)}`,
      `Your identity: ${agentTitle}`,
      `Assigned approach: ${perspective.getAttribute('approach') || 'Use your strongest independent approach.'}`,
      mode === 'implementation'
        ? 'You may implement a bounded prototype in this isolated execution directory. Commit every intended change to this floor branch before returning. Do not merge, push, or modify the main checkout.'
        : 'This is advisory. Inspect what is needed, but do not modify files.',
      'Return only one JSON object with exactly these keys:',
      '{"proposal":"...","evidence":["..."],"risks":["..."],"tests":["..."],"divergences":["..."],"recommendation":"...","confidence":0}',
      'Evidence must distinguish verified facts from assumptions. Tests must state what was actually run or what still needs to run. Confidence is an integer from 0 to 100.',
    ].filter(Boolean).join('\n\n');
  }

  private async runLeaderRecommendation(
    council: AgentCouncil,
    perspectives: AgentCouncilPerspective[],
  ): Promise<CouncilLeaderRecommendation> {
    if (!perspectives.length) throw new Error('No completed perspective is available for leader synthesis.');
    const workspaceId = String(council.getAttribute('workspace_id'));
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    const leaderId = council.getAttribute('leader_node_id') as string | null;
    const leader = leaderId ? await workspaceRepository.getNode(leaderId) : null;
    if (!workspace || !leader || leader.workspaceId !== workspaceId || leader.type !== 'terminal') {
      throw new Error('The workspace leader is no longer available.');
    }
    const payload = leader.payload as { provider?: string; model?: string; effort?: string };
    const provider = String(payload.provider ?? '');
    if (!hasAgentAdapter(provider)) throw new Error('The leader provider is not supported.');
    const items = perspectives.map((item) => ({
      id: String(item.getAttribute('id')),
      agentNodeId: String(item.getAttribute('agent_node_id')),
      output: JSON.parse(String(item.getAttribute('output_json'))),
    }));
    const synthesisPath = join(workspace.workingDir, '.orkestrai', 'councils', String(council.getAttribute('id')), 'leader-synthesis');
    await mkdir(synthesisPath, { recursive: true });
    await controlCenterService.recordActivity({
      workspaceId, nodeId: leader.id, state: 'working', action: 'system:council_synthesis',
      taskId: council.getAttribute('task_id') ?? null,
      metadata: { councilId: council.getAttribute('id') },
    });
    const result = await runAgentInWorkspace({
      agent: provider,
      memberId: leader.id,
      memberTitle: leader.title ?? 'Leader',
      model: payload.model ? String(payload.model) : null,
      effort: (payload.effort as ModelEffort | undefined) ?? null,
      prompt: [
        'You are the leader synthesizing an Orkestrai Council. Do not modify files.',
        `Objective: ${council.getAttribute('objective')}`,
        `Decision criterion: ${criterionText(council)}`,
        `Perspectives: ${JSON.stringify(items)}`,
        'Compare evidence, risks, tests, cost implications, and disagreements. Recommend one perspective id only when justified.',
        'Return only JSON: {"perspectiveId":"uuid or null","recommendation":"...","rationale":["..."],"divergences":["..."],"consensus":"strong|partial|none"}',
      ].join('\n\n'),
      workingDirectory: synthesisPath,
      mode: 'plan',
      allowWrites: false,
    }, workspace.workingDir, { runtime: workspaceExecutionRuntime(workspace) });
    if (result.error) throw new Error(result.error);
    const parsed = councilLeaderRecommendationSchema.parse(jsonCandidate(result.content));
    if (parsed.perspectiveId && !items.some((item) => item.id === parsed.perspectiveId)) {
      throw new Error('The leader recommendation referenced an unknown perspective.');
    }
    await controlCenterService.recordActivity({
      workspaceId, nodeId: leader.id, state: 'done', action: 'system:council_synthesis_done',
      taskId: council.getAttribute('task_id') ?? null,
      metadata: { councilId: council.getAttribute('id') },
    });
    return parsed;
  }

  async snapshot(workspaceId: string) {
    const [councils, nodes, tasks, usage] = await Promise.all([
      this.list(workspaceId),
      workspaceRepository.listNodes(workspaceId, null),
      taskBoardService.list(workspaceId),
      usageService.getAll(false),
    ]);
    const agents = nodes.filter((node) => node.type === 'terminal').map((node) => ({
      id: node.id,
      title: node.title ?? 'Agent',
      provider: String((node.payload as { provider?: string }).provider ?? ''),
      model: (node.payload as { model?: string }).model ?? null,
      role: (node.payload as { role?: string }).role ?? null,
      maestro: Boolean((node.payload as { maestro?: boolean }).maestro),
    })).filter((agent) => hasAgentAdapter(agent.provider));
    for (const council of councils.filter((item) => item.status === 'running')) {
      queueMicrotask(() => void this.execute(council.id));
    }
    return { councils, agents, tasks, usage };
  }

  async list(workspaceId: string): Promise<CouncilData[]> {
    const councils = await councilRepository.list(workspaceId);
    return Promise.all(councils.map((council) => this.present(council)));
  }

  async get(workspaceId: string, councilId: string): Promise<CouncilData> {
    const council = await councilRepository.find(councilId);
    if (!council || council.getAttribute('workspace_id') !== workspaceId) throw new Error('Council not found.');
    return this.present(council);
  }

  async decide(workspaceId: string, councilId: string, input: DecideCouncilDto): Promise<CouncilData> {
    const council = await councilRepository.find(councilId);
    if (!council || council.getAttribute('workspace_id') !== workspaceId) throw new Error('Council not found.');
    if (!['ready', 'partial', 'selected', 'consensus_requested', 'rejected'].includes(String(council.getAttribute('status')))) {
      throw new Error('Wait for the council executions before recording a decision.');
    }
    if (input.selectedPerspectiveId) {
      const perspective = (await councilRepository.perspectives(councilId))
        .find((item) => item.getAttribute('id') === input.selectedPerspectiveId);
      if (!perspective || perspective.getAttribute('status') !== 'completed') {
        throw new Error('Select a completed perspective from this council.');
      }
    }
    const updated = await councilRepository.decide(councilId, input);
    broadcast(workspaceId, councilId);
    return this.present(updated!);
  }

  async landingPreview(workspaceId: string, councilId: string, perspectiveId: string, targetBranch?: string) {
    const { council, perspective } = await this.requirePerspective(workspaceId, councilId, perspectiveId);
    if (council.getAttribute('mode') !== 'implementation') {
      throw new Error('Advisory perspectives cannot be landed.');
    }
    const floorId = perspective.getAttribute('floor_id') as string | null;
    if (!floorId) throw new Error('This perspective has no Git floor to land.');
    return floorService.landingPreview(floorId, targetBranch);
  }

  async land(
    workspaceId: string,
    councilId: string,
    perspectiveId: string,
    input: LandCouncilPerspectiveInput,
  ) {
    const council = await councilRepository.find(councilId);
    if (!council || council.getAttribute('workspace_id') !== workspaceId) throw new Error('Council not found.');
    if (council.getAttribute('mode') !== 'implementation') throw new Error('Advisory perspectives cannot be landed.');
    if (council.getAttribute('status') !== 'selected' || council.getAttribute('selected_perspective_id') !== perspectiveId) {
      throw new Error('Select this perspective as the human decision before landing it.');
    }
    const { perspective } = await this.requirePerspective(workspaceId, councilId, perspectiveId);
    const floorId = perspective.getAttribute('floor_id') as string | null;
    if (!floorId) throw new Error('This perspective has no Git floor to land.');
    const preview = await floorService.landingPreview(floorId, input.targetBranch);
    if (preview.targetDirty) throw new Error('The target checkout has uncommitted changes.');
    if (preview.conflicts.length) throw new Error(`Resolve landing conflicts first: ${preview.conflicts.join(', ')}.`);
    return floorService.land(floorId, input.targetBranch);
  }

  private async requirePerspective(workspaceId: string, councilId: string, perspectiveId: string) {
    const council = await councilRepository.find(councilId);
    if (!council || council.getAttribute('workspace_id') !== workspaceId) throw new Error('Council not found.');
    const perspective = (await councilRepository.perspectives(councilId))
      .find((item) => item.getAttribute('id') === perspectiveId);
    if (!perspective || perspective.getAttribute('status') !== 'completed') throw new Error('Completed perspective not found.');
    return { council, perspective };
  }

  private async present(council: AgentCouncil): Promise<CouncilData> {
    const workspaceId = String(council.getAttribute('workspace_id'));
    const [perspectives, nodes, tasks, floors] = await Promise.all([
      councilRepository.perspectives(String(council.getAttribute('id'))),
      workspaceRepository.listNodes(workspaceId, undefined, true),
      taskBoardService.list(workspaceId),
      floorService.list(workspaceId),
    ]);
    const titles = new Map(nodes.map((node) => [node.id, node.title ?? node.type]));
    const floorNames = new Map(floors.map((floor) => [floor.id, floor.name]));
    const taskId = council.getAttribute('task_id') as string | null;
    const taskTitle = taskId ? tasks.find((task) => task.id === taskId)?.title ?? null : null;
    return new CouncilResource(council, perspectives, titles, taskTitle, floorNames).toJSON();
  }

  private async isGitRepository(path: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: path, timeout: 10_000 });
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }
}

export const councilService = new CouncilService();
