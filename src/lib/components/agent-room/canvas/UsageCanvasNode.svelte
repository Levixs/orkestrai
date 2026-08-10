<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { Gauge, RefreshCw, Route, TriangleAlert, X } from '@lucide/svelte';
  import { Switch } from '$lib/components/ui/switch';
  import NodeShell from './NodeShell.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { localeState } from '$lib/i18n/locale.svelte.js';
  import { USAGE_REFRESH_INTERVAL_MS } from '$lib/modules/agent-room/domain/usage.js';
  import {
    buildUsageRoutingReport,
    normalizeUsageRoutingPolicy,
    type ProviderUsageStatus,
  } from '$lib/modules/agent-room/domain/usage-routing.js';
  import type { ProviderUsage, UsageWindow } from '$lib/modules/agent-room/application/services/UsageService.js';
  import type { UsageNodePayload } from '$lib/modules/agent-room/domain/types.js';

  export type UsageNodeData = {
    title: string;
    payload: UsageNodePayload;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onPayloadChange?: (id: string, partial: Record<string, unknown>) => void;
    connections?: import('./NodeShell.svelte').NodeConnection[];
    onJumpToNode?: (nodeId: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
    onRename?: (id: string, title: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: UsageNodeData }>();

  const PROVIDERS = [
    { id: 'claude', name: 'Claude', icon: '/images/claude.svg' },
    { id: 'codex', name: 'Codex', icon: '/images/codex.svg' },
    { id: 'kimi', name: 'Kimi', icon: '/images/kimi.svg' },
  ];

  let usages = $state<ProviderUsage[]>([]);
  let loading = $state(true);
  let lastFetchAt = $state<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  let clock = $state(0);

  const policy = $derived(normalizeUsageRoutingPolicy(data.payload));
  const report = $derived(buildUsageRoutingReport(usages, policy));

  async function refresh(force = false) {
    try {
      const response = await fetch(force ? '/api/agent-room/usage?refresh=1' : '/api/agent-room/usage');
      const payload = await response.json();
      usages = payload.data ?? [];
      lastFetchAt = new Date();
    } catch {
      // Mantem o ultimo snapshot; a proxima janela de refresh tenta de novo.
    } finally {
      loading = false;
    }
  }

  function persist(partial: Partial<UsageNodePayload>) {
    data.onPayloadChange?.(id, partial);
  }

  function changeSource(sourceProvider: string) {
    const fallbackProvider = sourceProvider === policy.fallbackProvider
      ? (sourceProvider === 'codex' ? 'claude' : 'codex')
      : policy.fallbackProvider;
    persist({ sourceProvider, fallbackProvider });
  }

  function changeFallback(fallbackProvider: string) {
    const sourceProvider = fallbackProvider === policy.sourceProvider
      ? (fallbackProvider === 'claude' ? 'codex' : 'claude')
      : policy.sourceProvider;
    persist({ sourceProvider, fallbackProvider });
  }

  function providerName(id: string): string {
    return PROVIDERS.find((provider) => provider.id === id)?.name ?? id;
  }

  function statusLabel(status: ProviderUsageStatus): string {
    if (status === 'available') return m['usage.status_available']();
    if (status === 'near_limit') return m['usage.status_near_limit']();
    if (status === 'exhausted') return m['usage.status_exhausted']();
    return m['usage.status_unavailable']();
  }

  function statusColor(status: ProviderUsageStatus): string {
    if (status === 'available') return 'var(--app-success)';
    if (status === 'near_limit') return 'var(--app-warning)';
    if (status === 'exhausted') return 'var(--app-danger)';
    return 'var(--app-text-muted)';
  }

  function windowLabel(window: UsageWindow): string {
    if (window.kind === '5h') return m['usage.window_5h']();
    if (window.kind === 'weekly') return m['usage.window_weekly']();
    if (window.kind === 'monthly') return m['usage.window_monthly']();
    return window.label;
  }

  function resetText(resetsAt: string | null): string {
    if (!resetsAt) return '';
    const diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return m['usage.resetting']();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return m['usage.reset_minutes']({ minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return m['usage.reset_hours']({ hours, minutes: String(minutes % 60).padStart(2, '0') });
    const locale = localeState.current === 'en' ? 'en-US' : localeState.current === 'es' ? 'es-MX' : 'pt-BR';
    const date = new Date(resetsAt);
    return m['usage.reset_at']({
      date: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date),
    });
  }

  function updatedText(): string {
    void clock;
    if (!lastFetchAt) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - lastFetchAt.getTime()) / 1000));
    return seconds < 5 ? m['usage.just_now']() : m['usage.seconds_ago']({ seconds });
  }

  onMount(() => {
    void refresh();
    timer = setInterval(() => void refresh(), USAGE_REFRESH_INTERVAL_MS);
    const ticker = setInterval(() => (clock += 1), 5_000);
    return () => {
      if (timer) clearInterval(timer);
      clearInterval(ticker);
    };
  });
</script>

<NodeShell
  {id}
  {selected}
  accent="var(--app-warning)"
  minWidth={380}
  minHeight={300}
  onResize={data.onResize}
  connections={data.connections}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
  titleText={data.title}
  onRename={data.onRename}
  class="canvas-usage"
>
  {#snippet icon()}<Gauge size={14} />{/snippet}
  {#snippet title()}{data.title}{/snippet}
  {#snippet actions()}
    <HeaderIconButton label={m['usage.refresh']()} class="node-action-btn" side="left" onclick={() => void refresh(true)}>
      <RefreshCw size={12} class={loading ? 'spin' : undefined} />
    </HeaderIconButton>
    <HeaderIconButton label={m['settings.delete']()} class="node-action-btn danger" side="left" onclick={() => data.onDelete(id)}>
      <X size={12} />
    </HeaderIconButton>
  {/snippet}

  <div class="usage-node-body nodrag nowheel">
    <div class="provider-list" aria-live="polite">
      {#if loading && !report.providers.length}
        {#each PROVIDERS as provider (provider.id)}
          <div class="provider-row loading-row">
            <span class="loading-dot"></span>
            <span class="loading-line"></span>
          </div>
        {/each}
      {/if}

      {#each report.providers as provider (provider.provider)}
        {@const meta = PROVIDERS.find((item) => item.id === provider.provider)}
        <section class="provider-row">
          <div class="provider-head">
            {#if meta}<img src={meta.icon} width="18" height="18" alt="" />{/if}
            <strong>{meta?.name ?? provider.provider}</strong>
            {#if provider.plan}<span class="plan">{provider.plan}</span>{/if}
            <span class="status" style:color={statusColor(provider.status)}>{statusLabel(provider.status)}</span>
          </div>
          {#if provider.error}
            <p class="provider-error"><TriangleAlert size={11} aria-hidden="true" /> {provider.error}</p>
          {:else}
            <div class="windows">
              {#each provider.windows as window (window.kind)}
                <div class="window">
                  <div class="window-label">
                    <span>{windowLabel(window)}</span>
                    <strong>{window.usedPercent}%</strong>
                  </div>
                  <div class="bar" aria-label={`${windowLabel(window)} ${window.usedPercent}%`}>
                    <span style:width={`${window.usedPercent}%`} style:background={statusColor(provider.status)}></span>
                  </div>
                  {#if window.resetsAt}<small>{resetText(window.resetsAt)}</small>{/if}
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/each}
    </div>

    <section class="routing-policy">
      <header>
        <div class="routing-title"><Route size={13} aria-hidden="true" /><strong>{m['usage.routing_title']()}</strong></div>
        <label class="routing-toggle">
          <span>{m['usage.routing_enabled']()}</span>
          <Switch checked={policy.enabled} onCheckedChange={(enabled: boolean) => persist({ enabled })} />
        </label>
      </header>

      <div class="routing-fields" class:disabled={!policy.enabled}>
        <label>
          <span>{m['usage.routing_source']()}</span>
          <select value={policy.sourceProvider} onchange={(event) => changeSource(event.currentTarget.value)}>
            {#each PROVIDERS as provider (provider.id)}<option value={provider.id}>{provider.name}</option>{/each}
          </select>
        </label>
        <span class="route-arrow" aria-hidden="true">→</span>
        <label>
          <span>{m['usage.routing_fallback']()}</span>
          <select value={policy.fallbackProvider} onchange={(event) => changeFallback(event.currentTarget.value)}>
            {#each PROVIDERS as provider (provider.id)}<option value={provider.id}>{provider.name}</option>{/each}
          </select>
        </label>
        <label class="threshold-field">
          <span>{m['usage.routing_threshold']({ percent: policy.thresholdPercent })}</span>
          <input
            type="range"
            min="50"
            max="100"
            step="5"
            value={policy.thresholdPercent}
            aria-label={m['usage.routing_threshold']({ percent: policy.thresholdPercent })}
            onchange={(event) => persist({ thresholdPercent: Number(event.currentTarget.value) })}
          />
        </label>
      </div>

      {#if policy.enabled}
        <p class:recommendation={report.shouldFallback} class="routing-result">
          {#if report.shouldFallback}
            {m['usage.routing_recommendation']({ source: providerName(policy.sourceProvider), fallback: providerName(report.recommendedProvider ?? policy.fallbackProvider) })}
          {:else}
            {m['usage.routing_healthy']({ source: providerName(policy.sourceProvider) })}
          {/if}
        </p>
      {/if}
    </section>

    {#if lastFetchAt}<footer>{m['usage.updated']({ when: updatedText() })} · {m['usage.refresh_interval']()}</footer>{/if}
  </div>
</NodeShell>

<style>
  .usage-node-body {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
    overflow: auto;
    padding: 10px;
    color: var(--app-text);
  }

  .provider-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    border-block: 1px solid var(--app-border);
  }

  .provider-row {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    padding: 9px;
    border-bottom: 1px solid var(--app-border);
  }

  .provider-head,
  .window-label,
  .routing-policy header,
  .routing-title,
  .routing-toggle,
  .routing-fields {
    display: flex;
    align-items: center;
  }

  .provider-head {
    gap: 7px;
    min-width: 0;
  }

  .provider-head img {
    border-radius: 4px;
  }

  .provider-head strong {
    font-size: 12px;
  }

  .plan {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9px;
    color: var(--app-text-muted);
  }

  .status {
    margin-left: auto;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .windows {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .window {
    display: grid;
    gap: 3px;
  }

  .window-label {
    justify-content: space-between;
    font-size: 10px;
    color: var(--app-text-muted);
  }

  .window-label strong {
    color: var(--app-text-soft);
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--app-surface-raised);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width 400ms ease;
  }

  .window small {
    font-size: 9px;
    color: var(--app-text-muted);
  }

  .provider-error {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin: 0;
    color: var(--app-warning);
    font-size: 10px;
    line-height: 1.4;
    text-wrap: pretty;
  }

  .routing-policy {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 2px;
  }

  .routing-policy header {
    justify-content: space-between;
    gap: 10px;
  }

  .routing-title,
  .routing-toggle {
    gap: 6px;
  }

  .routing-title {
    color: var(--app-text-soft);
    font-size: 11px;
  }

  .routing-toggle {
    font-size: 10px;
    color: var(--app-text-muted);
  }

  .routing-fields {
    display: grid;
    grid-template-columns: minmax(92px, 1fr) auto minmax(92px, 1fr) minmax(140px, 1.25fr);
    gap: 8px;
  }

  .routing-fields.disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .routing-fields label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  .routing-fields label > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9px;
    color: var(--app-text-muted);
  }

  .routing-fields select {
    width: 100%;
    min-width: 0;
    height: 27px;
    border: 1px solid var(--app-border);
    border-radius: 6px;
    background: var(--app-surface-subtle);
    color: var(--app-text);
    padding: 0 6px;
    font-size: 10px;
  }

  .route-arrow {
    align-self: end;
    padding-bottom: 6px;
    color: var(--app-text-muted);
  }

  .threshold-field input {
    width: 100%;
    accent-color: var(--app-accent);
  }

  .routing-result {
    margin: 0;
    padding: 7px 9px;
    border-left: 2px solid var(--app-success);
    background: color-mix(in srgb, var(--app-success) 8%, transparent);
    color: var(--app-text-soft);
    font-size: 10px;
    line-height: 1.45;
  }

  .routing-result.recommendation {
    border-left-color: var(--app-warning);
    background: color-mix(in srgb, var(--app-warning) 9%, transparent);
    color: var(--app-warning);
  }

  footer {
    margin-top: auto;
    text-align: right;
    font-size: 9px;
    color: var(--app-text-muted);
  }

  .loading-row {
    flex-direction: row;
    align-items: center;
  }

  .loading-dot,
  .loading-line {
    display: block;
    background: var(--app-surface-raised);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .loading-dot {
    width: 18px;
    height: 18px;
    border-radius: 4px;
  }

  .loading-line {
    width: 80px;
    height: 8px;
    border-radius: 3px;
  }

  :global(.spin) {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 50% { opacity: 0.45; } }

  @media (max-width: 520px) {
    .routing-fields {
      grid-template-columns: 1fr auto 1fr;
    }

    .threshold-field {
      grid-column: 1 / -1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar span,
    .loading-dot,
    .loading-line,
    :global(.spin) {
      animation: none;
      transition: none;
    }
  }
</style>
