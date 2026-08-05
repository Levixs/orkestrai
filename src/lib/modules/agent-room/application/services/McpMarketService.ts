import { mcpService } from './McpService.js';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io';
const FETCH_TIMEOUT_MS = 12_000;

export type McpEnvVar = { key: string; label: string; help?: string; required?: boolean };

export type McpMarketEntry = {
  /** Nome sugerido no .mcp.json. */
  key: string;
  title: string;
  description: string;
  /** curadoria = receita testada pelo Orkestrai; registry = catalogo oficial MCP. */
  source: 'curadoria' | 'registry';
  category: string;
  official: boolean;
  homepage?: string;
  /** Servidor remoto (streamable-http) — instala com 1 clique, sem comando. */
  url?: string;
  command?: string;
  args?: string[];
  envs?: McpEnvVar[];
};

/**
 * Curadoria dos MCPs mais uteis (oficiais e populares), com receita de
 * instalacao pronta e campos de env explicados em linguagem simples.
 */
const CURATED: McpMarketEntry[] = [
  {
    key: 'deepwiki',
    title: 'DeepWiki (docs de qualquer repo)',
    description: 'Pergunte sobre a documentação e o código de qualquer repositório público, sem configurar nada.',
    source: 'curadoria',
    category: 'Desenvolvimento',
    official: true,
    homepage: 'https://deepwiki.com',
    url: 'https://mcp.deepwiki.com/mcp',
  },
  {
    key: 'vercel',
    title: 'Vercel',
    description: 'Projetos, deploys e logs da sua conta Vercel (login OAuth na primeira conexão).',
    source: 'curadoria',
    category: 'Nuvem',
    official: true,
    homepage: 'https://vercel.com/docs/mcp',
    url: 'https://mcp.vercel.com',
  },
  {
    key: 'github',
    title: 'GitHub',
    description: 'Issues, PRs, busca de código e workflows do GitHub direto nos agentes.',
    source: 'curadoria',
    category: 'Versão',
    official: true,
    homepage: 'https://github.com/settings/tokens',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envs: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'Token do GitHub (classic, escopo repo)', help: 'Crie em github.com/settings/tokens', required: true }],
  },
  {
    key: 'filesystem',
    title: 'Arquivos (filesystem)',
    description: 'Ler, criar e organizar arquivos e pastas do projeto com ferramentas dedicadas.',
    source: 'curadoria',
    category: 'Arquivos',
    official: true,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  },
  {
    key: 'memory',
    title: 'Memória persistente',
    description: 'Os agentes lembram de decisões e fatos entre sessões (grafo de conhecimento local).',
    source: 'curadoria',
    category: 'Memória',
    official: true,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    key: 'playwright',
    title: 'Playwright (browser)',
    description: 'Navegar, clicar, preencher e capturar telas de sites — automação web oficial.',
    source: 'curadoria',
    category: 'Web',
    official: true,
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
  },
  {
    key: 'context7',
    title: 'Context7 (docs de libs)',
    description: 'Documentação sempre atualizada de bibliotecas, por versão, no prompt do agente.',
    source: 'curadoria',
    category: 'Desenvolvimento',
    official: true,
    homepage: 'https://context7.com',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
  },
  {
    key: 'sqlite',
    title: 'SQLite',
    description: 'Consultar e editar bancos SQLite locais com SQL e análise de dados.',
    source: 'curadoria',
    category: 'Banco de dados',
    official: true,
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', './database.db'],
  },
  {
    key: 'postgres',
    title: 'PostgreSQL',
    description: 'Consultas SQL seguras (somente leitura) no seu banco Postgres.',
    source: 'curadoria',
    category: 'Banco de dados',
    official: true,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envs: [{ key: 'POSTGRES_CONNECTION_STRING', label: 'URL de conexão (postgresql://usuario:senha@host:5432/banco)', required: true }],
  },
  {
    key: 'brave-search',
    title: 'Busca Brave',
    description: 'Pesquisa na web e em notícias direto pelos agentes.',
    source: 'curadoria',
    category: 'Pesquisa',
    official: true,
    homepage: 'https://brave.com/search/api',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envs: [{ key: 'BRAVE_API_KEY', label: 'Chave da API Brave', help: 'Grátis em brave.com/search/api', required: true }],
  },
  {
    key: 'google-drive',
    title: 'Google Drive',
    description: 'Buscar e ler arquivos do seu Google Drive (planilhas, docs, PDFs).',
    source: 'curadoria',
    category: 'Nuvem',
    official: true,
    homepage: 'https://console.cloud.google.com',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envs: [{ key: 'GDRIVE_CREDENTIALS', label: 'JSON de credenciais OAuth do Google Cloud', help: 'Crie um OAuth Client em console.cloud.google.com', required: true }],
  },
  {
    key: 'gmail',
    title: 'Gmail',
    description: 'Ler, buscar e enviar e-mails da sua conta (login Google na primeira vez).',
    source: 'curadoria',
    category: 'Comunicação',
    official: false,
    command: 'npx',
    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
  },
  {
    key: 'figma',
    title: 'Figma',
    description: 'Ler layouts, componentes e estilos de arquivos Figma para gerar código fiel.',
    source: 'curadoria',
    category: 'Design',
    official: false,
    homepage: 'https://www.figma.com/developers/api',
    command: 'npx',
    args: ['-y', 'figma-developer-mcp', '--stdio'],
    envs: [{ key: 'FIGMA_API_KEY', label: 'Token de acesso pessoal do Figma', help: 'Perfil do Figma → Settings → Personal access tokens', required: true }],
  },
  {
    key: 'slack',
    title: 'Slack',
    description: 'Ler canais, postar mensagens e reagir no seu workspace Slack.',
    source: 'curadoria',
    category: 'Comunicação',
    official: true,
    homepage: 'https://api.slack.com/apps',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envs: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token (xoxb-...)', help: 'Crie o app em api.slack.com/apps', required: true },
      { key: 'SLACK_TEAM_ID', label: 'ID do workspace (T...)', required: true },
    ],
  },
  {
    key: 'sequential-thinking',
    title: 'Pensamento sequencial',
    description: 'Ajuda o agente a decompor problemas grandes em etapas revisáveis.',
    source: 'curadoria',
    category: 'Raciocínio',
    official: true,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
];

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mcp'
  );
}

type RegistryServer = {
  server: {
    name: string;
    title?: string;
    description?: string;
    remotes?: Array<{ type: string; url: string }>;
    packages?: Array<{
      registryType: string;
      identifier: string;
      environmentVariables?: Array<{ name: string; description?: string; isRequired?: boolean }>;
    }>;
  };
  _meta?: { 'io.modelcontextprotocol.registry/official'?: { status?: string; isLatest?: boolean } };
};

/**
 * Marketplace de MCPs: curadoria local testada + busca no registry oficial
 * (registry.modelcontextprotocol.io). Instala no .mcp.json do workspace —
 * remotos com 1 clique (URL), locais com comando + envs explicados.
 */
export class McpMarketService {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  /** Curadoria filtrada + registry oficial (curadoria sempre primeiro). */
  async search(query: string): Promise<McpMarketEntry[]> {
    const q = query.trim().toLowerCase();
    const curated = CURATED.filter((entry) => !q || `${entry.title} ${entry.description} ${entry.key} ${entry.category}`.toLowerCase().includes(q));
    if (!q) return curated;
    try {
      const remote = await this.searchRegistry(q);
      const curatedKeys = new Set(curated.map((entry) => entry.key));
      return [...curated, ...remote.filter((entry) => !curatedKeys.has(entry.key))];
    } catch {
      return curated; // registry fora do ar: curadoria sempre funciona
    }
  }

  private async searchRegistry(query: string): Promise<McpMarketEntry[]> {
    const response = await this.fetchFn(`${REGISTRY_BASE}/v0/servers?search=${encodeURIComponent(query)}&limit=15`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
    const payload = (await response.json()) as { servers?: RegistryServer[] };
    const entries: McpMarketEntry[] = [];
    for (const item of payload.servers ?? []) {
      const server = item.server;
      if (!server?.name || item._meta?.['io.modelcontextprotocol.registry/official']?.status !== 'active') continue;
      const title = server.title?.trim() || server.name.split('/').at(-1) || server.name;
      const remote = server.remotes?.find((candidate) => candidate.type === 'streamable-http' || candidate.type === 'sse');
      const npmPackage = server.packages?.find((candidate) => candidate.registryType === 'npm');
      const pypiPackage = server.packages?.find((candidate) => candidate.registryType === 'pypi');
      const envs: McpEnvVar[] = (npmPackage ?? pypiPackage)?.environmentVariables?.map((env) => ({
        key: env.name,
        label: env.description?.trim() || env.name,
        required: Boolean(env.isRequired),
      })) ?? [];
      if (remote) {
        entries.push({
          key: slugify(title),
          title,
          description: server.description ?? '',
          source: 'registry',
          category: 'Registry oficial',
          official: true,
          url: remote.url,
        });
      } else if (npmPackage || pypiPackage) {
        const pkg = (npmPackage ?? pypiPackage)!;
        entries.push({
          key: slugify(title),
          title,
          description: server.description ?? '',
          source: 'registry',
          category: 'Registry oficial',
          official: true,
          command: npmPackage ? 'npx' : 'uvx',
          args: npmPackage ? ['-y', pkg.identifier] : [pkg.identifier],
          envs,
        });
      }
    }
    return entries;
  }

  /** Instala a entrada no .mcp.json do workspace (com os envs preenchidos). */
  async install(workspaceId: string, entry: McpMarketEntry, envValues: Record<string, string> = {}) {
    for (const env of entry.envs ?? []) {
      if (env.required && !String(envValues[env.key] ?? '').trim()) {
        throw new Error(`Preencha: ${env.label}`);
      }
    }
    return mcpService.add(workspaceId, {
      name: entry.key,
      url: entry.url,
      command: entry.command,
      args: entry.args,
      env: envValues,
    });
  }

  /** Catalogo de curadoria completo (para testes e listagem sem busca). */
  curated(): McpMarketEntry[] {
    return CURATED;
  }
}

export const mcpMarketService = new McpMarketService();
