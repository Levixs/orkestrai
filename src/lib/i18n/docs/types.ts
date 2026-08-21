export interface DocsCodeSnippet {
  id: string;
  title: string;
  code: string;
}

export interface DocsExample {
  id: string;
  title: string;
  description: string;
  snippets: DocsCodeSnippet[];
}

/** Estrutura do catalogo de conteudo da pagina /docs (por locale). */
export interface DocsSection {
  id: string;
  title: string;
  body: string;
  bullets?: string[];
  examples?: DocsExample[];
}

export interface DocsUseCase {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

export interface ChangelogEntry {
  date: string;
  title?: string;
  summary?: string;
  items: string[];
}

export interface DocsCatalog {
  quickstart: string[];
  sections: DocsSection[];
  useCases: DocsUseCase[];
  changelog: ChangelogEntry[];
}
