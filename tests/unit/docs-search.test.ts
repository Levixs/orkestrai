import { describe, expect, it } from 'vitest';
import { DOCS_EN } from '$lib/i18n/docs/en.js';
import { DOCS_ES } from '$lib/i18n/docs/es.js';
import { DOCS_PT } from '$lib/i18n/docs/pt-BR.js';
import { searchDocsCatalog } from '$lib/i18n/docs/search.js';

describe('global documentation search', () => {
  it('finds topics, use cases and changelog content with direct anchors', () => {
    const topic = searchDocsCatalog(DOCS_EN, 'WSL distribution', { quickstart: 'Quickstart', changelog: 'Changelog' });
    expect(topic.some((entry) => entry.hash === 'wsl-runtime')).toBe(true);

    const useCase = searchDocsCatalog(DOCS_EN, 'three complete UI directions', { quickstart: 'Quickstart', changelog: 'Changelog' });
    expect(useCase.some((entry) => entry.hash === 'usecase-ui-exploration')).toBe(true);

    const changelog = searchDocsCatalog(DOCS_EN, 'design_create_elements', { quickstart: 'Quickstart', changelog: 'Changelog' });
    expect(changelog.some((entry) => entry.hash === 'changelog')).toBe(true);
  });

  it('is accent insensitive in Portuguese and Spanish', () => {
    const portuguese = searchDocsCatalog(DOCS_PT, 'documentacao', { quickstart: 'Comece', changelog: 'Changelog' });
    expect(portuguese.length).toBeGreaterThan(0);

    const spanish = searchDocsCatalog(DOCS_ES, 'documentacion', { quickstart: 'Inicio', changelog: 'Cambios' });
    expect(spanish.length).toBeGreaterThan(0);
  });

  it('ranks title matches above body-only matches and respects the limit', () => {
    const results = searchDocsCatalog(DOCS_EN, 'agents', { quickstart: 'Quickstart', changelog: 'Changelog' }, 3);
    expect(results).toHaveLength(3);
    expect(results[0]?.title.toLowerCase()).toContain('agents');
  });
});
