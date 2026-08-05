import { describe, expect, it } from 'vitest';
import { DOCS_PT } from '$lib/i18n/docs/pt-BR.js';
import { DOCS_EN } from '$lib/i18n/docs/en.js';
import { DOCS_ES } from '$lib/i18n/docs/es.js';

const CATALOGS = { 'pt-BR': DOCS_PT, en: DOCS_EN, es: DOCS_ES };

describe('catalogo de docs (integridade i18n)', () => {
  it('todos os idiomas tem as mesmas secoes e casos de uso (ids e ordem)', () => {
    const sectionIds = DOCS_PT.sections.map((section) => section.id);
    const useCaseIds = DOCS_PT.useCases.map((useCase) => useCase.id);
    for (const catalog of [DOCS_EN, DOCS_ES]) {
      expect(catalog.sections.map((section) => section.id)).toEqual(sectionIds);
      expect(catalog.useCases.map((useCase) => useCase.id)).toEqual(useCaseIds);
      expect(catalog.quickstart.length).toBe(DOCS_PT.quickstart.length);
    }
  });

  it('changelog tem o mesmo numero de entradas e itens em todos os idiomas', () => {
    for (const catalog of [DOCS_EN, DOCS_ES]) {
      expect(catalog.changelog.length).toBe(DOCS_PT.changelog.length);
      for (let i = 0; i < DOCS_PT.changelog.length; i += 1) {
        expect(catalog.changelog[i].items.length).toBe(DOCS_PT.changelog[i].items.length);
      }
    }
  });

  it('nenhum texto fica vazio em nenhum idioma', () => {
    for (const catalog of Object.values(CATALOGS)) {
      for (const section of catalog.sections) {
        expect(section.title.trim().length).toBeGreaterThan(2);
        expect(section.body.trim().length).toBeGreaterThan(20);
      }
      for (const useCase of catalog.useCases) {
        expect(useCase.title.trim().length).toBeGreaterThan(2);
        expect(useCase.body.trim().length).toBeGreaterThan(20);
        expect(useCase.tags.length).toBeGreaterThan(0);
      }
      for (const step of catalog.quickstart) expect(step.trim().length).toBeGreaterThan(10);
    }
  });
});
