import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCS_PT } from '$lib/i18n/docs/pt-BR.js';
import { TOURS_PT } from '$lib/components/agent-room/tours/catalog/pt-BR.js';

const UNACCENTED_WORDS = [
  'acao',
  'aprovacao',
  'atencao',
  'atualizacao',
  'codigo',
  'conexao',
  'conexoes',
  'conteudo',
  'descricao',
  'diretorio',
  'espaco',
  'execucao',
  'historico',
  'icone',
  'instrucoes',
  'lider',
  'memoria',
  'nao',
  'opcao',
  'opcoes',
  'pagina',
  'padrao',
  'permissoes',
  'possivel',
  'proxima',
  'proximo',
  'raciocinio',
  'referencia',
  'repositorio',
  'responsavel',
  'revisao',
  'selecao',
  'sequencia',
  'sessao',
  'titulo',
  'traducao',
  'usuario',
  'util',
  'versao',
  'voce',
];

const unaccentedPattern = new RegExp(`\\b(${UNACCENTED_WORDS.join('|')})s?\\b`, 'i');
const metadataKeys = new Set(['id', 'kind', 'icon', 'provider', 'nodeType']);

function visibleStrings(value: unknown, key = ''): string[] {
  if (metadataKeys.has(key)) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => visibleStrings(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, child]) => visibleStrings(child, childKey));
  }
  return [];
}

describe('qualidade do catálogo pt-BR', () => {
  it('não contém palavras frequentes sem os acentos do idioma', () => {
    const messages = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')) as Record<string, string>;
    const strings = [...Object.values(messages), ...visibleStrings(DOCS_PT), ...visibleStrings(TOURS_PT)];
    const offenders = strings.filter((text) => unaccentedPattern.test(text.replace(/\[[A-Z_ -]+\]/g, '')));

    expect(offenders).toEqual([]);
  });
});
