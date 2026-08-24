import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { agentSessionService } from '$lib/modules/agent-room/application/services/AgentSessionService.js';
import { providerProfileService } from '$lib/modules/agent-room/application/services/ProviderProfileService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';
import { ptySessionManager } from '$lib/modules/agent-room/infrastructure/pty/PtySessionManager.ts';

describe('AgentSessionService provider profiles', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => vi.restoreAllMocks());

  it('injects resolved profile values only into the spawned process', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'runtime profile', workingDir: '/tmp' });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Profile runtime',
      payload: {
        command: '/bin/cat',
        provider: 'codex',
        profileId: 'profile-1',
        env: { SAFE_VALUE: 'kept' },
      },
    });
    vi.spyOn(providerProfileService, 'resolveEnv').mockResolvedValue({ TEST_PROFILE_SECRET: 'runtime-only' });
    const create = vi.spyOn(ptySessionManager, 'create');

    const ensured = await agentSessionService.ensure(workspace.id, node.id);

    expect(create.mock.calls[0][0].env).toMatchObject({
      SAFE_VALUE: 'kept',
      TEST_PROFILE_SECRET: 'runtime-only',
      ORKESTRAI_NODE_ID: node.id,
    });
    expect(create.mock.calls[0][0].forwardEnvToWsl).toEqual(['TEST_PROFILE_SECRET']);
    const persisted = await workspaceRepository.getNode(node.id);
    expect(JSON.stringify(persisted?.payload)).not.toContain('runtime-only');
    ptySessionManager.kill(ensured.sessionId);
  });
});
