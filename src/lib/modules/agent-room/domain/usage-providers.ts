export type UsageCollectorId = 'claude' | 'codex' | 'kimi';

export type UsageDiagnostic =
  | 'provider_cli_only'
  | 'admin_api_required'
  | 'enterprise_api_required'
  | 'model_provider_managed';

export type UsageProviderDefinition = {
  id: string;
  name: string;
  icon: string | null;
  collector: UsageCollectorId | null;
  diagnostic: UsageDiagnostic | null;
  helpUrl: string | null;
};

/** One catalog drives the API and every usage surface. */
export const USAGE_PROVIDERS: readonly UsageProviderDefinition[] = [
  { id: 'claude', name: 'Claude', icon: '/images/claude.svg', collector: 'claude', diagnostic: null, helpUrl: null },
  { id: 'codex', name: 'Codex', icon: '/images/codex.svg', collector: 'codex', diagnostic: null, helpUrl: null },
  { id: 'kimi', name: 'Kimi', icon: '/images/kimi.svg', collector: 'kimi', diagnostic: null, helpUrl: null },
  { id: 'antigravity', name: 'Antigravity', icon: '/images/antigravity.svg', collector: null, diagnostic: 'provider_cli_only', helpUrl: 'https://antigravity.google/docs/cli/credits' },
  { id: 'cursor', name: 'Cursor', icon: '/images/cursor.svg', collector: null, diagnostic: 'admin_api_required', helpUrl: 'https://cursor.com/docs/account/teams/admin-api' },
  { id: 'devin', name: 'Devin', icon: '/images/devin.svg', collector: null, diagnostic: 'enterprise_api_required', helpUrl: 'https://docs.devin.ai/use-cases/gallery/build-usage-dashboard' },
  { id: 'opencode', name: 'OpenCode', icon: '/images/opencode.svg', collector: null, diagnostic: 'model_provider_managed', helpUrl: 'https://dev.opencode.ai/docs/go/' },
  { id: 'cline', name: 'Cline', icon: '/images/cline.svg', collector: null, diagnostic: 'model_provider_managed', helpUrl: 'https://docs.cline.bot/getting-started/cline-provider' },
];

export const ROUTABLE_USAGE_PROVIDERS = USAGE_PROVIDERS.filter(
  (provider): provider is UsageProviderDefinition & { collector: UsageCollectorId } => provider.collector !== null,
);

export function usageProviderDefinition(providerId: string): UsageProviderDefinition {
  return USAGE_PROVIDERS.find((provider) => provider.id === providerId) ?? {
    id: providerId,
    name: providerId,
    icon: null,
    collector: null,
    diagnostic: null,
    helpUrl: null,
  };
}
