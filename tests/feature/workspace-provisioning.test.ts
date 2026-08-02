import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { workspaceService } from '$lib/modules/agent-room/application/services/WorkspaceService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

describe('WorkspaceService — provisionamento da ponte', () => {
  useSvelarTest({ refreshDatabase: true });

  it('provisiona skill e token ao criar o workspace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-prov-new-'));
    const workspace = await workspaceService.create({ name: 'novo', workingDir: dir, icon: null, instructions: null });

    expect(workspace.id).toBeTruthy();
    expect(existsSync(join(dir, '.orkestrai', 'workspace.json'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'orkestrai', 'SKILL.md'))).toBe(true);
  });

  it('repara skill e token ao abrir workspace antigo (sem provisionamento)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-prov-old-'));
    // Criado direto no repositorio: simula workspace de versao antiga do app.
    const workspace = await workspaceRepository.createWorkspace({ name: 'antigo', workingDir: dir });
    expect(existsSync(join(dir, '.orkestrai', 'workspace.json'))).toBe(false);

    await workspaceService.get(workspace.id);

    expect(existsSync(join(dir, '.orkestrai', 'workspace.json'))).toBe(true);
    const skillPath = join(dir, '.claude', 'skills', 'orkestrai', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const skill = readFileSync(skillPath, 'utf8');
    expect(skill).toContain('Modo Maestro');
    expect(skill).toContain('ORKESTRAI_NODE_ID');

    const config = JSON.parse(readFileSync(join(dir, '.orkestrai', 'workspace.json'), 'utf8'));
    expect(config.token).toBeTruthy();
  });

  it('atualiza skill com conteudo antigo ao abrir o workspace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-prov-stale-'));
    const workspace = await workspaceService.create({ name: 'stale', workingDir: dir, icon: null, instructions: null });
    // Envelhece a skill (simula template de versao anterior).
    const skillPath = join(dir, '.claude', 'skills', 'orkestrai', 'SKILL.md');
    const { writeFileSync: write, mkdirSync: mkdir } = await import('node:fs');
    mkdir(join(dir, '.claude', 'skills', 'orkestrai'), { recursive: true });
    write(skillPath, '---\nname: orkestrai-bridge\n---\nskill antiga\n');

    const staleService = new (await import('$lib/modules/agent-room/application/services/WorkspaceService.js')).WorkspaceService();
    await staleService.get(workspace.id);

    const skill = readFileSync(skillPath, 'utf8');
    expect(skill).toContain('Modo Maestro');
    expect(skill).not.toContain('skill antiga');
  });
});
