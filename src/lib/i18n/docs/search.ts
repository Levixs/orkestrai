import type { DocsCatalog, DocsSection } from './types.js';

export type DocsSearchEntry = {
  id: string;
  title: string;
  preview: string;
  hash: string;
  score: number;
};

export type DocsSearchLabels = {
  quickstart: string;
  changelog: string;
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function preview(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  return compact.length > 420 ? `${compact.slice(0, 417)}...` : compact;
}

function relevance(title: string, searchable: string, query: string): number {
  const normalizedTitle = normalize(title);
  if (normalizedTitle === query) return 1_100;
  if (normalizedTitle.startsWith(query)) return 900;
  if (normalizedTitle.includes(query)) return 700;
  return searchable.includes(query) ? 500 : 0;
}

export function docsSectionSearchText(section: DocsSection): string {
  return [
    section.body,
    ...(section.bullets ?? []),
    ...(section.examples ?? []).flatMap((example) => [
      example.title,
      example.description,
      ...example.snippets.flatMap((snippet) => [snippet.title, snippet.code]),
    ]),
  ].join(' ');
}

export function searchDocsCatalog(
  catalog: DocsCatalog,
  rawQuery: string,
  labels: DocsSearchLabels,
  limit = 24,
): DocsSearchEntry[] {
  const query = normalize(rawQuery.trim());
  if (!query) return [];

  const candidates = [
    {
      id: 'quickstart',
      title: labels.quickstart,
      body: catalog.quickstart.join(' '),
      extra: '',
      hash: 'comece',
    },
    ...catalog.sections.map((section) => ({
      id: `section:${section.id}`,
      title: section.title,
      body: docsSectionSearchText(section),
      extra: '',
      hash: section.id,
    })),
    ...catalog.useCases.map((useCase) => ({
      id: `usecase:${useCase.id}`,
      title: useCase.title,
      body: useCase.body,
      extra: useCase.tags.join(' '),
      hash: `usecase-${useCase.id}`,
    })),
    ...catalog.changelog.map((entry, index) => ({
      id: `changelog:${index}`,
      title: `${labels.changelog} · ${entry.date}`,
      body: entry.items.join(' '),
      extra: entry.date,
      hash: 'changelog',
    })),
  ];

  return candidates
    .map((candidate) => {
      const searchable = normalize(`${candidate.title} ${candidate.body} ${candidate.extra}`);
      return {
        id: candidate.id,
        title: candidate.title,
        preview: preview(candidate.body),
        hash: candidate.hash,
        score: relevance(candidate.title, searchable, query),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
