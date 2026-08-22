import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { CreateHuddleDto, ContributeHuddleTurnDto, CreateHuddleTaskDto, UpdateHuddleDto } from '$lib/modules/agent-room/application/dto/HuddleDtos.js';
import { huddleService } from '$lib/modules/agent-room/application/services/HuddleService.js';
import { workstreamService } from '$lib/modules/agent-room/application/services/WorkstreamService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('HuddleService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('persists a bounded transcript and links its delivery task to the workstream', async () => {
    const workspace = await workspaceRepository.createWorkspace({
      name: 'Huddle room',
      workingDir: '/tmp/huddle-room',
    });
    const leader = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Release lead',
      payload: { provider: 'codex', isMaestro: true },
    });
    const engineer = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Release engineer',
      payload: { provider: 'claude' },
    });

    const huddle = await huddleService.create(
      workspace.id,
      CreateHuddleDto.from({
        title: 'Release readiness',
        agenda: 'Review blockers and decide the release gate.',
        agentNodeIds: [leader.id, engineer.id],
        facilitatorNodeId: leader.id,
      }),
      { kind: 'user', id: 'local-user', name: 'Owner' },
    );

    expect(huddle).toMatchObject({
      status: 'active',
      facilitatorNodeId: leader.id,
    });
    expect(huddle.participants.map((participant) => participant.displayName)).toEqual(['Owner', 'Release lead', 'Release engineer']);
    await expect(
      huddleService.create(
        workspace.id,
        CreateHuddleDto.from({
          title: 'Second room',
          agentNodeIds: [leader.id],
        }),
        { kind: 'user', id: 'local-user', name: 'Owner' },
      ),
    ).rejects.toThrow('HUDDLE_ALREADY_ACTIVE');

    const withTurn = await huddleService.contribute(
      workspace.id,
      huddle.id,
      engineer.id,
      ContributeHuddleTurnDto.from({
        text: 'All focused tests pass; packaging is the remaining gate.',
      }),
    );
    expect(withTurn.turns).toHaveLength(1);
    expect(withTurn.turns[0]).toMatchObject({
      speakerId: engineer.id,
      state: 'completed',
    });

    const task = await huddleService.createTask(workspace.id, huddle.id, CreateHuddleTaskDto.from({ title: 'Finish release packaging' }));
    await huddleService.update(workspace.id, huddle.id, UpdateHuddleDto.from({ operation: 'end' }));
    const snapshot = await huddleService.snapshot(workspace.id, huddle.id);
    expect(snapshot.selected).toMatchObject({
      status: 'ended',
      linkedTaskId: task.id,
    });
    expect(snapshot.selected?.turns[0].text).toContain('packaging');

    const workstreams = await workstreamService.snapshot(workspace.id);
    expect(workstreams.workstreams[0].huddles).toEqual([
      expect.objectContaining({
        id: huddle.id,
        title: 'Release readiness',
        participantCount: 3,
        turnCount: 1,
      }),
    ]);
    expect(await workspaceRepository.deleteWorkspace(workspace.id)).toBe(true);
  });
});
