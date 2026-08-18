import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { ApplyDesignOperationsDto, ReviewDesignDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { designReviewService } from '$lib/modules/agent-room/application/services/DesignReviewService.js';
import { designOperationSchema } from '$lib/modules/agent-room/contracts/schemas/designSchemas.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

const directories: string[] = [];

describe('DesignReviewService', () => {
  useSvelarTest({ refreshDatabase: true });

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('requires a real concept and records human approval for the exact revision', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orkestrai-design-review-'));
    directories.push(directory);
    const workspace = await workspaceRepository.createWorkspace({ name: 'Visual review', workingDir: directory });
    const node = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'design',
      title: 'Concept A',
      payload: {
        workflowKind: 'design-exploration',
        explorationWork: { phase: 'active', taskId: null, lastProgressAt: new Date().toISOString() },
        visualReview: { status: 'pending', revision: null, note: '', reviewedAt: null },
      },
    });
    const initial = await designDocumentService.get(workspace.id, node.id);
    await expect(designReviewService.review(new ReviewDesignDto(workspace.id, node.id, 'approved', 1, '')))
      .rejects.toThrow('design_review_revision_changed');

    const operations = Array.from({ length: 10 }, (_, index) => designOperationSchema.parse({
      kind: 'create',
      element: {
        pageId: initial.activePageId,
        parentId: null,
        type: index === 0 ? 'frame' : 'rectangle',
        name: index === 0 ? 'Desktop concept' : `Concept block ${index}`,
        x: index * 20,
        y: index * 20,
        width: index === 0 ? 1440 : 160,
        height: index === 0 ? 900 : 80,
      },
    }));
    const document = await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      initial.revision,
      operations,
      { kind: 'agent', id: 'designer', name: 'Designer', taskId: null },
      'Create visual concept',
    ));
    const result = await designReviewService.review(new ReviewDesignDto(
      workspace.id,
      node.id,
      'approved',
      document.revision,
      'Clear hierarchy and useful mobile direction.',
    ));

    expect(result.visualReview).toMatchObject({ status: 'approved', revision: document.revision });
    expect((await workspaceRepository.getNode(node.id))?.payload).toMatchObject({
      explorationWork: { phase: 'approved' },
      visualReview: { status: 'approved', revision: document.revision },
    });
  });
});
