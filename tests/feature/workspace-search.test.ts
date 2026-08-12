import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { WorkspaceSearchDto } from '$lib/modules/agent-room/application/dto/WorkspaceSearchDto.js';
import { WorkspaceSearchService } from '$lib/modules/agent-room/application/services/WorkspaceSearchService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('WorkspaceSearchService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('returns cached indexed entities within 150 ms and indexes attachment references', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'search benchmark', workingDir: '/tmp' });
    for (let index = 0; index < 120; index += 1) {
      await workspaceRepository.createNode({
        workspaceId: workspace.id,
        type: 'note',
        title: `Reference note ${index}`,
        payload: index === 87
          ? {
              content: 'Indexed content',
              attachments: [{
                id: '00000000-0000-4000-8000-000000000087',
                kind: 'file',
                name: 'launch-research.pdf',
                path: '.orkestrai/attachments/launch-research.pdf',
                url: null,
                mimeType: 'application/pdf',
                size: 1_024,
              }],
            }
          : { content: `Ordinary content ${index}` },
      });
    }

    const service = new WorkspaceSearchService();
    const query = new WorkspaceSearchDto('launch-research', workspace.id, false, 60);
    await service.search(query);
    const startedAt = performance.now();
    const results = await service.search(query);
    const elapsedMs = performance.now() - startedAt;

    expect(results[0]).toMatchObject({ kind: 'note', title: 'Reference note 87' });
    expect(elapsedMs).toBeLessThan(150);
  });
});
