import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useSvelarTest } from '@beeblock/svelar/testing';
import { SkillMarketService, parseFrontmatter } from '$lib/modules/agent-room/application/services/SkillMarketService.js';
import { workspaceRepository } from '$lib/modules/agent-room/infrastructure/repositories/WorkspaceRepository.js';

function fakeFetch(routes: Record<string, unknown>) {
  return (async (url: string) => {
    const body = routes[url];
    if (!body) return { ok: false, status: 404, json: async () => ({}) } as Response;
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
}

const SEARCH_URL = 'https://skills.sh/api/search?q=typescript';
const DOWNLOAD_URL = 'https://skills.sh/api/download/vercel-labs/agent-skills/web-design-guidelines';

const SKILL_MD = `---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance.
---

# Web Interface Guidelines
`;

describe('SkillMarketService', () => {
  useSvelarTest({ refreshDatabase: true });

  it('sem busca devolve a curadoria completa, sem chamar a rede', async () => {
    let called = false;
    const service = new SkillMarketService((async () => {
      called = true;
      return { ok: false, status: 500, json: async () => ({}) } as Response;
    }) as typeof fetch);
    const results = await service.search('');
    expect(results.length).toBeGreaterThan(0);
    expect(results).toEqual(service.curated());
    expect(called).toBe(false);
  });

  it('com busca: curadoria filtrada primeiro + registry normalizado sem duplicar', async () => {
    const service = new SkillMarketService(fakeFetch({
      [SEARCH_URL]: {
        skills: [
          { id: 'someone/repo/typescript-strict-mode', skillId: 'typescript-strict-mode', name: 'typescript-strict-mode', installs: 509094, source: 'someone/repo' },
          { id: 'incompleto' },
        ],
      },
    }));
    const results = await service.search('typescript');
    // nenhuma skill curada bate com "typescript" — so o resultado do registry
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ skillId: 'typescript-strict-mode', source: 'someone/repo', installs: 509094 });
  });

  it('registry fora do ar: curadoria continua funcionando', async () => {
    const service = new SkillMarketService(fakeFetch({}));
    const results = await service.search('design');
    expect(results.length).toBeGreaterThan(0);
    expect(results).toEqual(service.curated().filter((skill) => `${skill.name} ${skill.skillId} ${skill.source}`.toLowerCase().includes('design')));
  });

  it('install grava em .claude/skills e .agents/skills, exclui do git e lista', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-skills-'));
    mkdirSync(join(dir, '.git', 'info'), { recursive: true });
    writeFileSync(join(dir, '.git', 'info', 'exclude'), '# base\n');
    const workspace = await workspaceRepository.createWorkspace({ name: 'skills', workingDir: dir });

    const service = new SkillMarketService(fakeFetch({
      [DOWNLOAD_URL]: { files: [{ path: 'SKILL.md', contents: SKILL_MD }, { path: 'refs/extra.md', contents: '# extra' }] },
    }));
    const installed = await service.install(workspace.id, { source: 'vercel-labs/agent-skills', skillId: 'web-design-guidelines' });

    expect(installed.name).toBe('web-design-guidelines');
    expect(installed.description).toContain('Web Interface Guidelines');
    expect(existsSync(join(dir, '.claude', 'skills', 'web-design-guidelines', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.agents', 'skills', 'web-design-guidelines', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'web-design-guidelines', 'refs', 'extra.md'))).toBe(true);
    expect(readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8')).toContain('.claude/skills/web-design-guidelines/');

    const listed = await service.listInstalled(workspace.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].skillId).toBe('web-design-guidelines');

    await service.uninstall(workspace.id, 'web-design-guidelines');
    expect(existsSync(join(dir, '.claude', 'skills', 'web-design-guidelines'))).toBe(false);
    expect(await service.listInstalled(workspace.id)).toHaveLength(0);
  });

  it('install rejeita source malformado', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orkestrai-skills-'));
    const workspace = await workspaceRepository.createWorkspace({ name: 'skills', workingDir: dir });
    const service = new SkillMarketService(fakeFetch({}));
    await expect(service.install(workspace.id, { source: 'sem-barra-dupla', skillId: 'x' })).rejects.toThrow('Source invalido');
  });
});

describe('parseFrontmatter', () => {
  it('extrai name e description', () => {
    expect(parseFrontmatter(SKILL_MD)).toEqual({
      name: 'web-design-guidelines',
      description: 'Review UI code for Web Interface Guidelines compliance.',
    });
  });

  it('sem frontmatter retorna vazio', () => {
    expect(parseFrontmatter('# so conteudo')).toEqual({ name: '', description: '' });
  });
});
