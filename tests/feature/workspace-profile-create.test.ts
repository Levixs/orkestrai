import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { CreateCanvasNodeDto } from '$lib/modules/agent-room/application/dto/WorkspaceDtos.js';
import { providerProfileService } from '$lib/modules/agent-room/application/services/ProviderProfileService.js';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('WorkspaceService provider profile creation', () => {
  useSvelarTest({ refreshDatabase: true });
  afterEach(() => vi.restoreAllMocks());

  it('validates the provider/profile pair before persisting a terminal', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'profile validation', workingDir: '/tmp' });
    vi.spyOn(providerProfileService, 'assertCompatible').mockRejectedValue(new Error('profile mismatch'));

    await expect(workspaceService.createNode(new CreateCanvasNodeDto(
      workspace.id,
      'terminal',
      'Codex work',
      0,
      0,
      560,
      340,
      0,
      { command: 'codex', args: [], provider: 'codex', profileId: '018f0000-0000-7000-8000-000000000001' },
    ))).rejects.toThrow('profile mismatch');

    expect(await workspaceRepository.listNodes(workspace.id)).toEqual([]);
  });

  it('persists only the validated profile id and never resolved profile values', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'profile persistence', workingDir: '/tmp' });
    const validate = vi.spyOn(providerProfileService, 'assertCompatible').mockResolvedValue();

    const node = await workspaceService.createNode(new CreateCanvasNodeDto(
      workspace.id,
      'terminal',
      'Codex work',
      0,
      0,
      560,
      340,
      0,
      { command: 'codex', args: [], provider: 'codex', profileId: '018f0000-0000-7000-8000-000000000001' },
    ));

    expect(validate).toHaveBeenCalledWith('018f0000-0000-7000-8000-000000000001', 'codex');
    expect(node.payload).toMatchObject({
      provider: 'codex',
      profileId: '018f0000-0000-7000-8000-000000000001',
    });
    expect(JSON.stringify(node.payload)).not.toContain('token');
    expect(JSON.stringify(node.payload)).not.toContain('secret');
  });
});
