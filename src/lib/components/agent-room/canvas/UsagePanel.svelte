<script lang="ts">
  import { onMount } from 'svelte';
  import { RefreshCw, TriangleAlert, X } from '@lucide/svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import type { ProviderUsage, UsageWindow } from '$lib/modules/agent-room/application/services/UsageService.js';

  type Props = {
    onClose: () => void;
  };

  let { onClose }: Props = $props();

  const PROVIDERS: Record<string, { name: string; icon: string }> = {
    claude: { name: 'Claude', icon: '/images/claude.svg' },
    codex: { name: 'Codex', icon: '/images/codex.svg' },
    kimi: { name: 'Kimi', icon: '/images/kimi.svg' },
  };

  const REFRESH_MS = 60_000;

  let usages = $state<ProviderUsage[]>([]);
  let loading = $state(true);
  let lastFetchAt = $state<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    try {
      const response = await fetch('/api/agent-room/usage');
      const payload = await response.json();
      usages = payload.data ?? [];
      lastFetchAt = new Date();
    } catch {
      // mantem o ultimo estado; proxima tentativa em REFRESH_MS
    } finally {
      loading = false;
    }
  }

  function barColor(percent: number): string {
    if (percent >= 85) return '#e5484d';
    if (percent >= 60) return '#ffc857';
    return '#3dd68c';
  }

  function resetText(resetsAt: string | null): string {
    if (!resetsAt) return '';
    const target = new Date(resetsAt).getTime();
    const diffMs = target - Date.now();
    if (diffMs <= 0) return 'resetando...';
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `reseta em ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `reseta em ${hours}h${String(minutes % 60).padStart(2, '0')}m`;
    const date = new Date(resetsAt);
    return `reseta ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function updatedText(): string {
    if (!lastFetchAt) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - lastFetchAt.getTime()) / 1000));
    return seconds < 5 ? 'agora mesmo' : `ha ${seconds}s`;
  }

  // Tick de 5s so para re-renderizar os textos relativos (reseta em / ha Xs).
  let clock = $state(0);
  void clock;

  onMount(() => {
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
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
    <h3>Uso dos providers</h3>
    <div class="panel-actions">
      <HeaderIconButton label="Atualizar agora" class="node-action-btn" side="left" onclick={refresh}>
        <RefreshCw size={13} />
      </HeaderIconButton>
      <HeaderIconButton label="Fechar" class="node-action-btn" side="left" onclick={onClose}>
        <X size={13} />
      </HeaderIconButton>
    </div>
  </header>

  {#if loading && !usages.length}
    <p class="hint">Consultando os providers...</p>
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
        <p class="hint">Sem janelas de uso reportadas.</p>
      {:else}
        {#each usage.windows as win (win.kind)}
          <div class="window-row">
            <div class="window-top">
              <span class="window-label">{win.label}</span>
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
    <footer class="panel-footer">Atualizado {updatedText()} · a cada 60s</footer>
  {/if}
</aside>

<style>
  .usage-panel {
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.07);
    background: #151238;
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
    color: #8b8c96;
  }

  .panel-actions {
    display: flex;
    gap: 4px;
  }

  .usage-card {
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    padding: 10px;
    background: #1C1946;
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
    color: #e6e6eb;
  }

  .plan-badge {
    margin-left: auto;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #b79cff;
    background: rgba(124, 77, 255, 0.15);
    border: 1px solid rgba(124, 77, 255, 0.35);
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
    color: #8b8c96;
  }

  .window-percent {
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .bar-track {
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 600ms ease;
  }

  .window-reset {
    font-size: 10px;
    color: #6d6d78;
  }

  .usage-error {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: #ffc857;
  }

  .hint {
    margin: 0;
    font-size: 11px;
    color: #6d6d78;
  }

  .panel-footer {
    margin-top: auto;
    font-size: 10px;
    color: #55556a;
    text-align: center;
  }
</style>
