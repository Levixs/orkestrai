import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { CreateAgentReviewCommentDto, CreateAgentReviewDto, DecideAgentReviewDto } from '$lib/modules/agent-room/application/dto/AgentReviewDto.js';
import { reviewCenterService } from '$lib/modules/agent-room/application/services/ReviewCenterService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orkestrai-review-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'review@orkestrai.local'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Review Test'], { cwd: dir });
  writeFileSync(join(dir, 'app.ts'), 'export const version = 1;\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: dir });
  return dir;
}

describe('ReviewCenterService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('persiste contexto, comentarios por linha e marca contexto antigo apos mudanca', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'review', workingDir: dir });
    const agent = await workspaceRepository.createNode({
      workspaceId: workspace.id,
      type: 'terminal',
      title: 'Reviewer',
      payload: { provider: 'codex', role: 'Reviewer' },
    });
    writeFileSync(join(dir, 'app.ts'), 'export const version = 2;\n');

    const review = await reviewCenterService.create(workspace.id, new CreateAgentReviewDto(
      'Review version update',
      'Confirm the version migration.',
      null,
      agent.id,
      ['app.ts'],
      ['Screenshot attached'],
      ['npm test'],
      ['Backward compatibility'],
    ));
    const commented = await reviewCenterService.addComment(workspace.id, review.id, new CreateAgentReviewCommentDto(
      'app.ts', 1, 'modified', 'Confirm consumers accept version 2.', null,
    ));
    expect(commented.comments[0]).toMatchObject({ filePath: 'app.ts', lineNumber: 1, stale: false, status: 'open' });

    writeFileSync(join(dir, 'app.ts'), 'export const version = 3;\n');
    const refreshed = await reviewCenterService.snapshot(workspace.id);
    expect(refreshed.reviews[0].comments[0].stale).toBe(true);
    expect(refreshed.reviews[0]).toMatchObject({ assigneeTitle: 'Reviewer', evidence: ['Screenshot attached'], tests: ['npm test'] });
  });

  it('salva solicitacao de alteracoes mesmo com agente offline', async () => {
    const dir = makeRepo();
    const workspace = await workspaceRepository.createWorkspace({ name: 'offline-review', workingDir: dir });
    const agent = await workspaceRepository.createNode({ workspaceId: workspace.id, type: 'terminal', title: 'Offline agent' });
    writeFileSync(join(dir, 'app.ts'), 'export const version = 2;\n');
    const review = await reviewCenterService.create(workspace.id, new CreateAgentReviewDto(
      'Offline handoff', null, null, agent.id, ['app.ts'], [], [], [],
    ));

    const decision = await reviewCenterService.decide(
      workspace.id,
      review.id,
      new DecideAgentReviewDto('changes_requested', 'Add a regression test.'),
    );
    expect(decision.review).toMatchObject({ status: 'changes_requested', decisionNote: 'Add a regression test.' });
    expect(decision.feedback?.delivered).toBe(false);
    expect((await reviewCenterService.snapshot(workspace.id)).reviews[0].status).toBe('changes_requested');
  });
});
