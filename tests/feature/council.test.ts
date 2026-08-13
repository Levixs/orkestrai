import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { CreateCouncilDto, DecideCouncilDto } from '$lib/modules/agent-room/application/dto/CouncilDto.js';
import { councilService, parseCouncilPerspectiveOutput } from '$lib/modules/agent-room/application/services/CouncilService.js';
import { createCouncilSchema } from '$lib/modules/agent-room/contracts/schemas/council.schema.js';
import { councilRepository } from '$lib/modules/agent-room/infrastructure/repositories/CouncilRepository.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const tempDirs: string[] = [];
const output = {
  proposal: 'Use the smallest coherent implementation.',
  evidence: ['The current service already owns the workflow.'],
  risks: ['A provider can be unavailable.'],
  tests: ['Run the focused service suite.'],
  divergences: ['Another perspective favors a larger abstraction.'],
  recommendation: 'Ship the bounded implementation.',
  confidence: 84,
};

describe('Council', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('enforces unique agents and an explicit execution budget', () => {
    const agentId = '00000000-0000-4000-8000-000000000001';
    const base = {
      title: 'Architecture choice',
      objective: 'Compare two implementation approaches before changing the code.',
      mode: 'advisory' as const,
      criterion: 'balanced' as const,
      requestLeaderRecommendation: true,
      maxExecutions: 2,
      perspectives: [
        { agentNodeId: agentId, approach: 'Minimal change' },
        { agentNodeId: agentId, approach: 'New abstraction' },
      ],
    };
    expect(createCouncilSchema.safeParse(base).success).toBe(false);
    expect(createCouncilSchema.safeParse({
      ...base,
      maxExecutions: 3,
      perspectives: [
        base.perspectives[0],
        { agentNodeId: '00000000-0000-4000-8000-000000000002', approach: 'New abstraction' },
      ],
    }).success).toBe(true);
  });

  it('parses strict JSON and fenced provider output without accepting prose-only results', () => {
    expect(parseCouncilPerspectiveOutput(JSON.stringify(output))).toEqual(output);
    expect(parseCouncilPerspectiveOutput(`Result:\n\`\`\`json\n${JSON.stringify(output)}\n\`\`\``)).toEqual(output);
    expect(() => parseCouncilPerspectiveOutput('I recommend the first option.')).toThrow('valid JSON');
    expect(() => parseCouncilPerspectiveOutput(JSON.stringify({ ...output, confidence: 120 }))).toThrow();
  });

  it('persists completed and failed perspectives as a partial, traceable council', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-council-'));
    tempDirs.push(dir);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Council test', workingDir: dir });
    const leader = await workspaceRepository.createNode({
      workspaceId: workspace.id, type: 'terminal', title: 'Leader',
      payload: { provider: 'claude', command: 'claude', maestro: true },
    });
    const reviewer = await workspaceRepository.createNode({
      workspaceId: workspace.id, type: 'terminal', title: 'Reviewer',
      payload: { provider: 'codex', command: 'codex' },
    });
    const input = createCouncilSchema.parse({
      title: 'Choose a path',
      objective: 'Compare the implementation paths and preserve their evidence.',
      leaderNodeId: leader.id,
      mode: 'advisory',
      criterion: 'risk',
      requestLeaderRecommendation: false,
      maxExecutions: 2,
      perspectives: [
        { agentNodeId: leader.id, approach: 'Operational simplicity' },
        { agentNodeId: reviewer.id, approach: 'Failure analysis' },
      ],
    });
    const council = await councilRepository.create(workspace.id, CreateCouncilDto.from(input));
    const perspectives = await councilRepository.perspectives(String(council.getAttribute('id')));
    await councilRepository.beginPerspective(String(perspectives[0].getAttribute('id')), {
      provider: 'claude', model: null, floorId: null, artifactPath: '.orkestrai/councils/a', usageSnapshot: null,
    });
    await councilRepository.completePerspective(String(perspectives[0].getAttribute('id')), output, JSON.stringify(output));
    await councilRepository.beginPerspective(String(perspectives[1].getAttribute('id')), {
      provider: 'codex', model: 'gpt-5.5', floorId: null, artifactPath: '.orkestrai/councils/b', usageSnapshot: null,
    });
    await councilRepository.failPerspective(String(perspectives[1].getAttribute('id')), 'Provider unavailable.');
    await councilRepository.finish(String(council.getAttribute('id')), 'partial', 2, null);

    const data = await councilService.get(workspace.id, String(council.getAttribute('id')));
    expect(data).toMatchObject({
      status: 'partial', executionCount: 2, leaderTitle: 'Leader', recommendation: null,
    });
    expect(data.perspectives.map((item) => item.status)).toEqual(['completed', 'failed']);
    expect(data.perspectives[0].output).toEqual(output);
    expect(data.perspectives[1].error).toBe('Provider unavailable.');
    await expect(councilService.landingPreview(workspace.id, data.id, data.perspectives[0].id))
      .rejects.toThrow('Advisory perspectives cannot be landed.');

    const rejected = await councilService.decide(workspace.id, data.id, DecideCouncilDto.from({
      status: 'rejected', selectedPerspectiveId: null, note: 'Need a safer option.',
    }));
    expect(rejected.status).toBe('rejected');
    const revised = await councilService.decide(workspace.id, data.id, DecideCouncilDto.from({
      status: 'selected', selectedPerspectiveId: data.perspectives[0].id, note: 'Evidence now accepted.',
    }));
    expect(revised).toMatchObject({
      status: 'selected', selectedPerspectiveId: data.perspectives[0].id, decisionNote: 'Evidence now accepted.',
    });

    await workspaceRepository.deleteWorkspace(workspace.id);
    expect(await councilRepository.find(data.id)).toBeNull();
    expect(await councilRepository.perspectives(data.id)).toEqual([]);
  });
});
