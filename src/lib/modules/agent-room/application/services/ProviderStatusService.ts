/**
 * Status publico dos providers (paginas Statuspage.io — mesmo formato de API
 * pra Claude, OpenAI/Codex, Moonshot/Kimi, Cursor, GitHub/Copilot e Devin).
 * Um so fetch generico parametrizado pela URL, em vez de um servico por
 * provider. OpenCode, Cursor CLI, Cline e Antigravity nao tem pagina publica
 * de status conhecida, entao ficam sem indicador (nao e um gap deste service,
 * e a realidade externa).
 */
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 180_000;

export type ProviderStatusIndicator = 'none' | 'minor' | 'major' | 'critical';

export type ProviderStatus = {
  indicator: ProviderStatusIndicator;
  description: string;
  incidents: Array<{ name: string; shortlink: string }>;
  /** false quando o fetch falhou/expirou — o indicador cai pra 'none' por
      padrao (nao alarma o usuario), mas o caller pode distinguir "checado,
      tudo bem" de "nao deu pra checar" em vez de tratar os dois como iguais. */
  checked: boolean;
  checkedAt: string;
};

export type ProviderStatusSource = {
  /** Endpoint /api/v2/summary.json da pagina Statuspage.io do provider. */
  apiUrl: string;
  /** URL publica da pagina de status, pro link "ver detalhes". */
  pageUrl: string;
};

export const PROVIDER_STATUS_SOURCES: Record<string, ProviderStatusSource> = {
  claude: { apiUrl: 'https://status.claude.com/api/v2/summary.json', pageUrl: 'https://status.claude.com' },
  codex: { apiUrl: 'https://status.openai.com/api/v2/summary.json', pageUrl: 'https://status.openai.com' },
  kimi: { apiUrl: 'https://status.moonshot.cn/api/v2/summary.json', pageUrl: 'https://status.moonshot.cn' },
  cursor: { apiUrl: 'https://status.cursor.com/api/v2/summary.json', pageUrl: 'https://status.cursor.com' },
  copilot: { apiUrl: 'https://www.githubstatus.com/api/v2/summary.json', pageUrl: 'https://www.githubstatus.com' },
  devin: { apiUrl: 'https://www.devinstatus.com/api/v2/summary.json', pageUrl: 'https://www.devinstatus.com' },
};

const UNKNOWN: ProviderStatus = { indicator: 'none', description: '', incidents: [], checked: false, checkedAt: new Date(0).toISOString() };

export class ProviderStatusService {
  private cache = new Map<string, { at: number; status: ProviderStatus }>();

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly ttlMs = CACHE_TTL_MS,
  ) {}

  /** Cache server-side por provider: a Central de Providers pode ser aberta
      por varios workspaces/abas ao mesmo tempo — sem isso cada abertura
      bateria de novo nas 6 paginas de status externas. */
  async getStatus(providerId: string, forceRefresh = false): Promise<ProviderStatus> {
    const source = PROVIDER_STATUS_SOURCES[providerId];
    if (!source) return UNKNOWN;
    const cached = this.cache.get(providerId);
    if (!forceRefresh && cached && Date.now() - cached.at < this.ttlMs) return cached.status;
    const status = await this.fetch(source.apiUrl);
    this.cache.set(providerId, { at: Date.now(), status });
    return status;
  }

  private async fetch(apiUrl: string): Promise<ProviderStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetchFn(apiUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`${apiUrl} respondeu ${response.status}`);
      const payload = await response.json() as { status?: { indicator?: string; description?: string }; incidents?: Array<{ name: string; shortlink: string }> };
      return {
        indicator: (payload.status?.indicator ?? 'none') as ProviderStatusIndicator,
        description: payload.status?.description ?? 'All Systems Operational',
        incidents: (payload.incidents ?? []).map((incident) => ({ name: incident.name, shortlink: incident.shortlink })),
        checked: true,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      // Pagina de status fora do ar/inacessivel/expirou: nao alarma o
      // usuario, so esconde o indicador (mesmo efeito visual de "tudo
      // operacional"), mas `checked: false` preserva a distincao internamente.
      return { ...UNKNOWN, checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const providerStatusService = new ProviderStatusService();
