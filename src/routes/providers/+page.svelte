<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowLeft,
    BrainCircuit,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    CircleAlert,
    Copy,
    ExternalLink,
    MessageSquareText,
    MonitorCog,
    RefreshCw,
    ShieldCheck,
    SquareTerminal,
  } from '@lucide/svelte';
  import { toast } from '@beeblock/svelar/ui';
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import type { AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  type Filter = 'all' | 'ready' | 'setup';
  type Platform = 'darwin' | 'windows' | 'linux';

  let providers = $state<AgentProviderInfo[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let filter = $state<Filter>('all');
  let expandedProvider = $state<string | null>(null);
  let platform = $state<Platform>('linux');

  const readyCount = $derived(providers.filter((provider) => provider.installed).length);
  const visibleProviders = $derived(
    providers.filter((provider) =>
      filter === 'all' ? true : filter === 'ready' ? provider.installed : !provider.installed
    )
  );

  onMount(async () => {
    const userAgent = navigator.userAgent.toLowerCase();
    platform = userAgent.includes('mac')
      ? 'darwin'
      : userAgent.includes('win')
        ? 'windows'
        : 'linux';
    await loadProviders();
  });

  async function loadProviders(refresh = false) {
    if (refresh) refreshing = true;
    try {
      const response = await fetch('/api/agent-room/status', { cache: 'no-store' });
      const payload = await response.json();
      providers = payload.data?.providers ?? [];
    } catch {
      providers = [];
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  function platformName(): string {
    if (platform === 'darwin') return m['providers.platform_mac']();
    if (platform === 'windows') return m['providers.platform_windows']();
    return m['providers.platform_linux']();
  }

  function installCommand(provider: AgentProviderInfo): string | null {
    return provider.setup?.installCommands?.[platform] ?? null;
  }

  function versionLabel(provider: AgentProviderInfo): string | null {
    if (!provider.installed || !provider.detail) return null;
    const firstLine = provider.detail.split(/\r?\n/).find((line) => line.trim())?.trim();
    return firstLine ? firstLine.slice(0, 100) : null;
  }

  async function copyCommand(command: string) {
    await navigator.clipboard.writeText(command);
    toast.success(m['providers.copied']());
  }
</script>

<svelte:head>
  <title>Orkestrai — {m['providers.title']()}</title>
</svelte:head>

<main class="providers-page">
  <header class="page-header">
    <Button variant="ghost" size="sm" href="/canvas">
      <ArrowLeft size={15} aria-hidden="true" />
      {m['providers.back_canvas']()}
    </Button>
    <div class="header-titles">
      <h1>{m['providers.title']()}</h1>
      <p>{m['providers.subtitle']()}</p>
    </div>
    <span class="header-spacer"></span>
    <Button variant="outline" size="sm" disabled={refreshing} onclick={() => loadProviders(true)}>
      <RefreshCw size={14} class={refreshing ? 'provider-refresh-spin' : ''} aria-hidden="true" />
      {refreshing ? m['providers.refreshing']() : m['providers.refresh']()}
    </Button>
    <span class="h-full w-[60px] shrink-0" data-dictation-dock aria-hidden="true"></span>
  </header>

  <section class="overview" aria-label={m['providers.summary']({ ready: readyCount, total: providers.length })}>
    <div class="overview-copy">
      <span class="overview-icon"><MonitorCog size={18} aria-hidden="true" /></span>
      <div>
        <strong>{m['providers.summary']({ ready: readyCount, total: providers.length })}</strong>
        <p>{m['providers.local_note']()}</p>
      </div>
    </div>
    <div class="filters" role="group" aria-label={m['providers.title']()}>
      <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>{m['providers.filter_all']()}</button>
      <button class:active={filter === 'ready'} onclick={() => (filter = 'ready')}>{m['providers.filter_ready']()}</button>
      <button class:active={filter === 'setup'} onclick={() => (filter = 'setup')}>{m['providers.filter_setup']()}</button>
    </div>
  </section>

  {#if loading}
    <div class="provider-list" aria-hidden="true">
      {#each [0, 1, 2, 3] as item (item)}
        <Skeleton class="h-[132px] w-full rounded-lg bg-[var(--app-surface-raised)]" />
      {/each}
    </div>
  {:else if visibleProviders.length}
    <div class="provider-list">
      {#each visibleProviders as provider (provider.id)}
        {@const expanded = expandedProvider === provider.id}
        {@const command = installCommand(provider)}
        <article class="provider-row" class:available={provider.installed}>
          <div class="provider-main">
            <span class="provider-icon"><SquareTerminal size={18} aria-hidden="true" /></span>
            <div class="provider-copy">
              <div class="provider-title-row">
                <h2>{provider.displayName}</h2>
                <span class:ready={provider.installed} class="status-badge">
                  {#if provider.installed}<CheckCircle2 size={12} />{:else}<CircleAlert size={12} />{/if}
                  {provider.installed ? m['providers.detected']() : m['providers.not_detected']()}
                </span>
              </div>
              <p>{provider.installed ? m['providers.ready_description']() : m['providers.setup_description']()}</p>
              <div class="capabilities">
                {#if provider.supportsResume}
                  <span><MessageSquareText size={12} />{m['providers.cap_resume']()}</span>
                {/if}
                {#if provider.installed && provider.models?.length}
                  <span><SquareTerminal size={12} />{m['providers.cap_models']({ count: provider.models.length })}</span>
                {/if}
                {#if provider.efforts?.length}
                  <span><BrainCircuit size={12} />{m['providers.cap_effort']()}</span>
                {/if}
                {#if versionLabel(provider)}<span class="version">{versionLabel(provider)}</span>{/if}
              </div>
            </div>
            <div class="provider-actions">
              {#if provider.installed}
                <Button size="sm" href="/canvas">{m['providers.open_canvas']()}</Button>
              {/if}
              <Button
                variant="outline"
                size="sm"
                aria-expanded={expanded}
                onclick={() => (expandedProvider = expanded ? null : provider.id)}
              >
                {expanded ? m['providers.setup_close']() : m['providers.setup_open']()}
                {#if expanded}<ChevronUp size={13} />{:else}<ChevronDown size={13} />{/if}
              </Button>
            </div>
          </div>

          {#if expanded}
            <div class="setup-panel">
              <div class="setup-step">
                <span class="step-icon"><SquareTerminal size={15} /></span>
                <div class="step-copy">
                  <h3>{m['providers.install_title']()}</h3>
                  <p>{m['providers.install_intro']({ platform: platformName() })}</p>
                  {#if command}
                    <div class="command-row">
                      <code>{command}</code>
                      <button aria-label={m['providers.copy_command']()} title={m['providers.copy_command']()} onclick={() => copyCommand(command)}>
                        <Copy size={14} />
                      </button>
                    </div>
                  {:else}
                    <p class="setup-note">{m['providers.no_command']()}</p>
                  {/if}
                </div>
              </div>
              <div class="setup-step">
                <span class="step-icon"><ShieldCheck size={15} /></span>
                <div class="step-copy">
                  <h3>{m['providers.login_title']()}</h3>
                  <p>{m['providers.login_body']()}</p>
                </div>
              </div>
              <div class="setup-step">
                <span class="step-icon"><RefreshCw size={15} /></span>
                <div class="step-copy">
                  <h3>{m['providers.check_title']()}</h3>
                  <p>{m['providers.check_body']()}</p>
                </div>
              </div>
              {#if provider.setup?.docsUrl}
                <a class="guide-link" href={provider.setup.docsUrl} target="_blank" rel="noreferrer">
                  {m['providers.official_guide']()}<ExternalLink size={13} />
                </a>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {:else}
    <div class="empty-state"><SquareTerminal size={22} /><p>{m['providers.empty']()}</p></div>
  {/if}
</main>

<style>
  .providers-page {
    min-height: 100dvh;
    padding: 20px clamp(20px, 4vw, 64px) 64px;
    background: var(--app-page);
    color: var(--copy);
  }

  .page-header {
    width: min(1100px, 100%);
    min-height: 70px;
    margin: 0 auto 16px;
    display: flex;
    align-items: center;
    gap: 18px;
    border-bottom: 1px solid var(--line);
  }

  .header-titles { min-width: 0; }
  .header-titles h1 { margin: 0; font-family: 'Sora Variable', 'Sora', 'Inter Variable', 'Inter', sans-serif; font-size: 22px; font-weight: 650; }
  .header-titles p { margin: 5px 0 0; color: var(--copy-muted); font-size: 13px; line-height: 1.5; }
  .header-spacer { flex: 1; }

  .overview {
    width: min(1100px, 100%);
    margin: 0 auto 14px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface-subtle);
  }

  .overview-copy { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .overview-icon, .provider-icon, .step-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: var(--app-accent);
    background: var(--app-accent-soft);
  }
  .overview-icon { width: 36px; height: 36px; border-radius: 7px; }
  .overview strong { font-size: 13px; }
  .overview p { margin: 3px 0 0; color: var(--copy-muted); font-size: 11.5px; }

  .filters { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 7px; background: var(--app-surface-subtle); }
  .filters button { min-height: 30px; padding: 0 11px; border: 0; border-radius: 5px; background: transparent; color: var(--copy-muted); font: inherit; font-size: 11.5px; cursor: pointer; }
  .filters button:hover { color: var(--copy); }
  .filters button.active { background: var(--app-accent-soft); color: var(--app-accent); }

  .provider-list { width: min(1100px, 100%); margin: 0 auto; display: grid; gap: 9px; }
  .provider-row { border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--surface) 82%, transparent); overflow: hidden; transition: border-color 140ms ease, background-color 140ms ease; }
  .provider-row:hover { border-color: var(--line-strong); background: var(--surface); }
  .provider-row.available { border-color: color-mix(in srgb, var(--app-success) 36%, var(--line)); }
  .provider-main { min-height: 126px; padding: 18px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 14px; }
  .provider-icon { width: 38px; height: 38px; border-radius: 7px; }
  .provider-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
  .provider-copy h2 { margin: 0; font-size: 15px; font-weight: 650; }
  .provider-copy > p { max-width: 680px; margin: 7px 0 0; color: var(--copy-soft); font-size: 12.5px; line-height: 1.55; }
  .status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 999px; background: color-mix(in srgb, var(--app-warning) 12%, transparent); color: var(--app-warning); font-size: 10.5px; font-weight: 600; }
  .status-badge.ready { background: color-mix(in srgb, var(--app-success) 12%, transparent); color: var(--app-success); }
  .capabilities { min-height: 24px; margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .capabilities span { display: inline-flex; align-items: center; gap: 5px; padding: 4px 7px; border-radius: 5px; background: var(--app-surface-raised); color: var(--copy-muted); font-size: 10.5px; }
  .capabilities .version { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .provider-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }

  .setup-panel { position: relative; padding: 18px 18px 18px 70px; border-top: 1px solid var(--line); background: var(--app-surface-subtle); display: grid; gap: 15px; }
  .setup-step { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; }
  .step-icon { width: 28px; height: 28px; border-radius: 6px; }
  .step-copy h3 { margin: 1px 0 3px; font-size: 12px; font-weight: 650; }
  .step-copy p { margin: 0; color: var(--copy-muted); font-size: 11.5px; line-height: 1.55; }
  .setup-note { margin-top: 7px !important; color: var(--app-accent) !important; }
  .command-row { max-width: 700px; margin-top: 8px; display: grid; grid-template-columns: minmax(0, 1fr) 34px; border: 1px solid var(--line); border-radius: 6px; background: var(--app-page); overflow: hidden; }
  .command-row code { padding: 9px 11px; overflow-x: auto; color: var(--app-text-soft); font-size: 11px; white-space: nowrap; }
  .command-row button { border: 0; border-left: 1px solid var(--line); background: transparent; color: var(--copy-muted); cursor: pointer; }
  .command-row button:hover { color: var(--app-accent); background: var(--app-accent-soft); }
  .guide-link { position: absolute; right: 18px; bottom: 18px; display: inline-flex; align-items: center; gap: 6px; color: var(--app-accent); font-size: 11.5px; font-weight: 600; text-decoration: none; }
  .guide-link:hover { color: var(--app-accent); }

  .empty-state { width: min(1100px, 100%); min-height: 180px; margin: 0 auto; display: grid; place-items: center; align-content: center; gap: 8px; border: 1px dashed var(--line); border-radius: 8px; color: var(--copy-muted); }
  .empty-state p { margin: 0; font-size: 12px; }
  :global(.provider-refresh-spin) { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 760px) {
    .providers-page { padding: 18px 12px 40px; }
    .page-header { align-items: flex-start; flex-wrap: wrap; }
    .page-header > :global(a) { order: 0; }
    .header-titles { order: 2; width: 100%; }
    .header-spacer { display: none; }
    .page-header > :global(button) { margin-left: auto; }
    .overview { align-items: stretch; flex-direction: column; }
    .filters { align-self: stretch; }
    .filters button { flex: 1; }
    .provider-main { grid-template-columns: auto minmax(0, 1fr); }
    .provider-actions { grid-column: 1 / -1; justify-content: flex-start; padding-left: 52px; }
    .setup-panel { padding: 16px; padding-bottom: 52px; }
    .guide-link { left: 54px; right: auto; }
  }
</style>
