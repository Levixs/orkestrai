import { describe, expect, it } from 'vitest';
import { SkillMarketService } from '$lib/modules/agent-room/application/services/SkillMarketService.js';

function fakeFetch(remoteSkills: Array<{ id: string; skillId: string; name?: string; source?: string; installs?: number }>): typeof fetch {
  return (async (url: string | URL) => {
    const href = String(url);
    if (href.includes('/api/search')) {
      return new Response(JSON.stringify({ skills: remoteSkills }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('SkillMarketService', () => {
  it('returns the curated catalog when the query is empty, without hitting the network', async () => {
    let called = false;
    const service = new SkillMarketService((async () => {
      called = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch);

    const results = await service.search('');

    expect(results.length).toBeGreaterThan(0);
    expect(results).toEqual(service.curated());
    expect(called).toBe(false);
  });

  it('merges curated results (first) with deduped remote results for a non-empty query', async () => {
    const curated = new SkillMarketService().curated();
    const overlapping = curated[0];
    const service = new SkillMarketService(
      fakeFetch([
        { id: overlapping.id, skillId: overlapping.skillId, name: overlapping.name, installs: 1 },
        { id: 'someone/repo/new-skill', skillId: 'new-skill', name: 'new-skill', source: 'someone/repo', installs: 42 },
      ])
    );

    const results = await service.search('design');

    const ids = results.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(overlapping.id);
    expect(ids).toContain('someone/repo/new-skill');
    expect(results[0].id).toBe(curated.filter((skill) => `${skill.name} ${skill.skillId} ${skill.source}`.toLowerCase().includes('design'))[0]?.id);
  });

  it('falls back to the curated matches when skills.sh is unreachable', async () => {
    const service = new SkillMarketService((async () => {
      throw new Error('network down');
    }) as typeof fetch);
    const expected = service.curated().filter((skill) => skill.skillId.includes('pdf'));

    const results = await service.search('pdf');

    expect(results).toEqual(expected);
    expect(results.length).toBeGreaterThan(0);
  });
});
