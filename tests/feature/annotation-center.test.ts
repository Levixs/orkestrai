import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { uuidv7 } from '@beeblock/svelar/support';
import { annotationCenterService } from '$lib/modules/agent-room/application/services/AnnotationCenterService.js';
import { reviewCenterService } from '$lib/modules/agent-room/application/services/ReviewCenterService.js';
import { CreateAgentReviewCommentDto, CreateAgentReviewDto } from '$lib/modules/agent-room/application/dto/AgentReviewDto.js';
import { ApplyDesignOperationsDto } from '$lib/modules/agent-room/application/dto/DesignDtos.js';
import { designDocumentService } from '$lib/modules/agent-room/application/services/DesignDocumentService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('AnnotationCenterService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('projects code comments with source revision and stale state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-annotations-'));
    execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 'annotations@orkestrai.local'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'Annotation Test'], { cwd: dir });
    writeFileSync(join(dir, 'app.ts'), 'export const value = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
    const workspace = await workspaceRepository.createWorkspace({ name: 'Annotations', workingDir: dir });
    writeFileSync(join(dir, 'app.ts'), 'export const value = 2;\n');
    const review = await reviewCenterService.create(workspace.id, new CreateAgentReviewDto('API review', null, null, null, ['app.ts'], [], [], []));
    await reviewCenterService.addComment(workspace.id, review.id, new CreateAgentReviewCommentDto('app.ts', 1, 'modified', 'Keep this contract backward compatible.', null));

    let snapshot = await annotationCenterService.snapshot(workspace.id);
    expect(snapshot.counts).toMatchObject({ open: 1, code: 1, design: 0 });
    expect(snapshot.annotations[0]).toMatchObject({ kind: 'code', targetTitle: 'API review', targetDetail: 'app.ts:1', stale: false });

    writeFileSync(join(dir, 'app.ts'), 'export const value = 3;\n');
    snapshot = await annotationCenterService.snapshot(workspace.id);
    expect(snapshot.annotations[0].stale).toBe(true);
  });

  it('projects native Design threads without duplicating their state', async () => {
    const workspace = await workspaceRepository.createWorkspace({ name: 'Design annotations', workingDir: mkdtempSync(join(tmpdir(), 'orkestrai-design-annotations-')) });
    const node = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'design', title: 'Checkout', payload: {} });
    const document = await designDocumentService.get(workspace.id, node.id);
    const commentId = uuidv7();
    await designDocumentService.apply(new ApplyDesignOperationsDto(
      workspace.id,
      node.id,
      document.revision,
      [{
        kind: 'add-design-comment',
        comment: {
          id: commentId, pageId: document.activePageId, elementId: null, x: 20, y: 30, status: 'open',
          messages: [{ id: uuidv7(), author: { kind: 'agent', id: 'reviewer', name: 'Design Reviewer', color: '#2563eb' }, body: 'Increase the contrast.', mentions: [], createdAt: new Date().toISOString() }],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), resolvedAt: null, resolvedBy: null,
        },
      }],
      { kind: 'user', id: null, name: null, taskId: null },
      'Add review feedback',
    ));

    const snapshot = await annotationCenterService.snapshot(workspace.id);
    expect(snapshot.counts).toMatchObject({ open: 1, code: 0, design: 1 });
    expect(snapshot.annotations[0]).toMatchObject({ id: `design:${node.id}:${commentId}`, kind: 'design', targetTitle: 'Checkout', authorTitle: 'Design Reviewer', revision: '1' });
  });
});
