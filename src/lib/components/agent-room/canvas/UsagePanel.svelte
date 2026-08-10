<script lang="ts">
  import { onMount } from 'svelte';
  import { PanelTopOpen, RefreshCw, TriangleAlert, X } from '@lucide/svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import * as m from '$lib/paraglide/messages.js';
  import { localeState } from '$lib/i18n/locale.svelte.js';
  import { USAGE_REFRESH_INTERVAL_MS } from '$lib/modules/agent-room/domain/usage.js';
  import type { ProviderUsage, UsageWindow } from '$lib/modules/agent-room/application/services/UsageService.js';

  type Props = {
    onClose: () => void;
    onAddToCanvas?: () => void;
  };

  let { onClose, onAddToCanvas }: Props = $props();

  const PROVIDERS: Record<string, { name: string; icon: string }> = {
    claude: { name: 'Claude', icon: '/images/claude.svg' },
    codex: { name: 'Codex', icon: '/images/codex.svg' },
    kimi: { name: 'Kimi', icon: '/images/kimi.svg' },
  };

  let usages = $state<ProviderUsage[]>([]);
  let loading = $state(true);
  let lastFetchAt = $state<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh(force = false) {
    try {
      const response = await fetch(force ? '/api/agent-room/usage?refresh=1' : '/api/agent-room/usage');
      const payload = await response.json();
      usages = payload.data ?? [];
      lastFetchAt = new Date();
    } catch {
      // mantem o ultimo estado; proxima tentativa no intervalo automatico
    } finally {
      loading = false;
    }
  }

  function barColor(percent: number): string {
    if (percent >= 85) return 'var(--app-danger)';
    if (percent >= 60) return 'var(--app-warning)';
    return 'var(--app-success)';
  }

  function resetText(resetsAt: string | null): string {
    if (!resetsAt) return '';
    const target = new Date(resetsAt).getTime();
    const diffMs = target - Date.now();
    if (diffMs <= 0) return m['usage.resetting']();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return m['usage.reset_minutes']({ minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return m['usage.reset_hours']({ hours, minutes: String(minutes % 60).padStart(2, '0') });
    const locale = localeState.current === 'en' ? 'en-US' : localeState.current === 'es' ? 'es-MX' : 'pt-BR';
    const date = new Date(resetsAt);
    return m['usage.reset_at']({
      date: date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
      time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    });
  }

  function updatedText(): string {
    void clock;
    if (!lastFetchAt) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - lastFetchAt.getTime()) / 1000));
    return seconds < 5 ? m['usage.just_now']() : m['usage.seconds_ago']({ seconds });
  }

  /** Labels das janelas vem do backend fixos em pt-BR; aqui localizamos por kind. */
  function windowLabel(win: UsageWindow): string {
    if (win.kind === '5h') return m['usage.window_5h']();
    if (win.kind === 'weekly') return m['usage.window_weekly']();
    if (win.kind === 'monthly') return m['usage.window_monthly']();
    return win.label;
  }

  // Tick de 5s so para re-renderizar os textos relativos (reseta em / ha Xs).
  let clock = $state(0);

  onMount(() => {
    refresh();
    timer = setInterval(() => void refresh(), USAGE_REFRESH_INTERVAL_MS);
    const ticker = setInterval(() => (clock += 1), 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      clearInterval(ticker);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
</script>

<aside class="usage-panel">
  <header class="panel-header">
    <h3>{m['usage.title']()}</h3>
    <div class="panel-actions">
      {#if onAddToCanvas}
        <HeaderIconButton label={m['usage.add_canvas']()} class="node-action-btn" side="left" onclick={onAddToCanvas}>
          <PanelTopOpen size={13} />
        </HeaderIconButton>
      {/if}
      <HeaderIconButton label={m['usage.refresh']()} class="node-action-btn" side="left" onclick={() => void refresh(true)}>
        <RefreshCw size={13} />
      </HeaderIconButton>
      <HeaderIconButton label={m['usage.close']()} class="node-action-btn" side="left" onclick={onClose}>
        <X size={13} />
      </HeaderIconButton>
    </div>
  </header>

  {#if loading && !usages.length}
    {#each [0, 1, 2] as index (index)}
      <section class="usage-card usage-skeleton" aria-hidden="true">
        <div class="usage-card-header">
          <Skeleton class="h-4 w-4 rounded-full bg-white/8" />
          <Skeleton class="h-3.5 w-20 bg-white/8" />
        </div>
        <Skeleton class="h-2.5 w-full bg-white/8" />
        <Skeleton class="h-2.5 w-3/4 bg-white/8" />
      </section>
    {/each}
  {/if}

  {#each usages as usage (usage.provider)}
    {@const meta = PROVIDERS[usage.provider] ?? { name: usage.provider, icon: '' }}
    <section class="usage-card">
      <div class="usage-card-header">
        {#if meta.icon}<img src={meta.icon} width="18" height="18" alt="" class="provider-icon" />{/if}
        <span class="provider-name">{meta.name}</span>
        {#if usage.plan}<span class="plan-badge">{usage.plan}</span>{/if}
      </div>

      {#if usage.error}
        <p class="usage-error"><TriangleAlert size={12} /> {usage.error}</p>
      {:else if !usage.windows.length}
        <p class="hint">{m['usage.no_windows']()}</p>
      {:else}
        {#each usage.windows as win (win.kind)}
          <div class="window-row">
            <div class="window-top">
              <span class="window-label">{windowLabel(win)}</span>
              <span class="window-percent" style:color={barColor(win.usedPercent)}>{win.usedPercent}%</span>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill"
                style:width="{win.usedPercent}%"
                style:background={barColor(win.usedPercent)}
              ></div>
            </div>
            {#if win.resetsAt}<span class="window-reset">{resetText(win.resetsAt)}</span>{/if}
          </div>
        {/each}
      {/if}
    </section>
  {/each}

  {#if lastFetchAt}
    <footer class="panel-footer">{m['usage.updated']({ when: updatedText() })} · {m['usage.refresh_interval']()}</footer>
  {/if}
</aside>

<style>
  .usage-panel {
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid var(--app-border);
    background: var(--app-sidebar);
    padding: 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-text-muted);
  }

  .panel-actions {
    display: flex;
    gap: 4px;
  }
  .usage-skeleton {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .usage-card {

    border: 1px solid var(--app-border);
    border-radius: 10px;
    padding: 10px;
    background: var(--app-surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .usage-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .provider-icon {
    border-radius: 4px;
  }

  .provider-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text);
  }

  .plan-badge {
    margin-left: auto;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-accent);
    background: color-mix(in srgb, var(--app-accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-accent) 35%, transparent);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .window-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .window-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .window-label {
    font-size: 11px;
    color: var(--app-text-muted);
  }

  .window-percent {
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .bar-track {
    height: 6px;
    border-radius: 999px;
    background: var(--app-border);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 600ms ease;
  }

  .window-reset {
    font-size: 10px;
    color: var(--app-text-muted);
  }

  .usage-error {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--app-warning);
  }

  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--app-text-muted);
  }

  .panel-footer {
    margin-top: auto;
    font-size: 10px;
    color: var(--app-text-muted);
    text-align: center;
  }
</style>
