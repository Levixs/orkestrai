/** Estrutura do catalogo de conteudo da pagina /docs (por locale). */
export interface DocsSection {
  id: string;
  title: string;
  body: string;
}

export interface DocsUseCase {
  id: string;
  title: string;
  body: string;
  tags: string[];
}

export interface ChangelogEntry {
  date: string;
  items: string[];
}

export interface DocsCatalog {
  quickstart: string[];
  sections: DocsSection[];
  useCases: DocsUseCase[];
  changelog: ChangelogEntry[];
}
