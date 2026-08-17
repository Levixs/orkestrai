<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Activity,
    AlertCircle,
    Check,
    CircleDashed,
    Clock3,
    Inbox,
    Layers,
    MessageSquareMore,
    RefreshCw,
    ShieldAlert,
    Users,
    WifiOff,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { retainUsageFeed, usageStore } from './usage-store.svelte.js';
  import type {
    AgentActivitySnapshot,
    AgentActivityState,
    AgentMessageDeliveryState,
    AgentMessageThread,
    ControlCenterSnapshot,
  } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  let {
    workspaceName,
    snapshot = null,
    loading = false,
    onRefresh,
  }: {
    workspaceName: string;
    snapshot?: ControlCenterSnapshot | null;
    loading?: boolean;
    onRefresh: () => void;
  } = $props();

  let now = $state(Date.now());

  const attentionCount = $derived(
    (snapshot?.counts.waiting_input ?? 0)
      + (snapshot?.counts.waiting_permission ?? 0)
      + (snapshot?.counts.blocked ?? 0)
      + (snapshot?.counts.error ?? 0),
  );

  const summary = $derived([
    { id: 'working', label: m['control_center.summary_working'](), count: snapshot?.counts.working ?? 0, icon: Activity, color: 'var(--app-success)' },
    { id: 'attention', label: m['control_center.summary_attention'](), count: attentionCount, icon: ShieldAlert, color: 'var(--app-warning)' },
    { id: 'idle', label: m['control_center.summary_idle'](), count: snapshot?.counts.idle ?? 0, icon: Clock3, color: 'var(--app-text-muted)' },
    { id: 'offline', label: m['control_center.summary_offline'](), count: snapshot?.counts.disconnected ?? 0, icon: WifiOff, color: 'var(--app-danger)' },
  ]);

  function stateLabel(state: AgentActivityState): string {
    if (state === 'starting') return m['control_center.state_starting']();
    if (state === 'working') return m['control_center.state_working']();
    if (state === 'waiting_input') return m['control_center.state_waiting_input']();
    if (state === 'waiting_permission') return m['control_center.state_waiting_permission']();
    if (state === 'blocked') return m['control_center.state_blocked']();
    if (state === 'idle') return m['control_center.state_idle']();
    if (state === 'done') return m['control_center.state_done']();
    if (state === 'error') return m['control_center.state_error']();
    return m['control_center.state_disconnected']();
  }

  function stateColor(state: AgentActivityState): string {
    if (state === 'working') return 'var(--app-success)';
    if (state === 'waiting_input' || state === 'waiting_permission') return 'var(--app-warning)';
    if (state === 'blocked' || state === 'error' || state === 'disconnected') return 'var(--app-danger)';
    if (state === 'done') return 'var(--app-accent)';
    return 'var(--app-text-muted)';
  }

  function deliveryLabel(state: AgentMessageDeliveryState): string {
    if (state === 'queued') return m['control_center.delivery_queued']();
    if (state === 'sent') return m['control_center.delivery_sent']();
    if (state === 'delivered') return m['control_center.delivery_delivered']();
    if (state === 'acknowledged') return m['control_center.delivery_acknowledged']();
    if (state === 'replied') return m['control_center.delivery_replied']();
    return m['control_center.delivery_failed']();
  }

  function elapsed(since: string): string {
    const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1_000));
    if (seconds < 60) return m['control_center.elapsed_seconds']({ count: seconds });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return m['control_center.elapsed_minutes']({ count: minutes });
    const hours = Math.floor(minutes / 60);
    return m['control_center.elapsed_hours']({ count: hours });
  }

  function usageFor(agent: AgentActivitySnapshot): string | null {
    const usage = usageStore.values.find((candidate) => candidate.provider === agent.provider);
    if (!usage || usage.error || usage.windows.length === 0) return null;
    const highest = [...usage.windows].sort((a, b) => b.usedPercent - a.usedPercent)[0];
    return `${highest.usedPercent}%`;
  }

  function actionLabel(agent: AgentActivitySnapshot): string {
    if (!agent.lastAction) return m['control_center.no_current_task']();
    const name = (key: string) => String(agent.lastActionData[key] ?? m['control_center.workspace_user']());
    if (agent.lastAction === 'system:message_received') return m['control_center.action_message_received']({ name: name('fromTitle') });
    if (agent.lastAction === 'system:message_replied') return m['control_center.action_message_replied']({ name: name('toTitle') });
    if (agent.lastAction === 'system:task_completed') return m['control_center.action_task_completed']({ title: name('taskTitle') });
    if (agent.lastAction === 'system:task_review') return m['control_center.action_task_review']({ title: name('taskTitle') });
    if (agent.lastAction === 'system:task_working') return m['control_center.action_task_working']({ title: name('taskTitle') });
    return agent.lastAction;
  }

  function sender(thread: AgentMessageThread): string {
    return thread.fromTitle ?? m['control_center.workspace_user']();
  }

  onMount(() => {
    onRefresh();
    const releaseUsage = retainUsageFeed();
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      releaseUsage();
      clearInterval(timer);
    };
  });
</script>

<section class="control-center grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--app-canvas)]" data-testid="control-center-view">
  <header class="border-b border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-4">
    <div class="flex min-w-0 items-start gap-3">
      <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[6px] border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-accent)]">
        <Activity size={17} aria-hidden="true" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-sm font-semibold text-[var(--app-text)]">{m['control_center.title']()}</h2>
        <p class="mt-0.5 truncate text-[11px] text-[var(--app-text-muted)]">{workspaceName} · {m['control_center.subtitle']()}</p>
      </div>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label={m['control_center.refresh']()} onclick={onRefresh} disabled={loading}>
              <RefreshCw size={14} class={loading ? 'animate-spin' : ''} />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{m['control_center.refresh']()}</Tooltip.Content>
      </Tooltip.Root>
    </div>

    <div class="control-summary mt-4 grid gap-px overflow-hidden rounded-[6px] border border-[var(--app-border)] bg-[var(--app-border)]" aria-label={m['control_center.summary_aria']()}>
      {#each summary as metric (metric.id)}
        <div class="flex min-w-0 items-center gap-2 bg-[var(--app-surface)] px-3 py-2.5">
          <span style:color={metric.color}><metric.icon size={14} aria-hidden="true" /></span>
          <div class="min-w-0">
            <div class="text-sm font-semibold tabular-nums text-[var(--app-text)]">{metric.count}</div>
            <div class="truncate text-[9px] font-medium uppercase text-[var(--app-text-muted)]">{metric.label}</div>
          </div>
        </div>
      {/each}
    </div>
  </header>

  {#if loading && !snapshot}
    <div class="control-body grid min-h-0">
      <div class="control-agents space-y-3 p-4">
        {#each [0, 1, 2, 3] as row (row)}<Skeleton class="h-20 w-full bg-[var(--app-surface-raised)]" />{/each}
      </div>
      <div class="space-y-3 p-4">
        {#each [0, 1, 2] as row (row)}<Skeleton class="h-24 w-full bg-[var(--app-surface-raised)]" />{/each}
      </div>
    </div>
  {:else}
    <div class="control-body grid min-h-0 overflow-hidden">
      <section class="control-agents min-h-0 overflow-y-auto" aria-labelledby="control-center-agents">
        <div class="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-4">
          <Users size={13} class="text-[var(--app-text-muted)]" aria-hidden="true" />
          <h3 id="control-center-agents" class="text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['control_center.agents']()}</h3>
          <span class="ml-auto text-[10px] tabular-nums text-[var(--app-text-muted)]">{snapshot?.agents.length ?? 0}</span>
        </div>
        {#if snapshot?.agents.length}
          <div class="divide-y divide-[var(--app-border)]">
            {#each snapshot.agents as agent (agent.nodeId)}
              <article class="grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors hover:bg-[var(--app-surface-subtle)]">
                <span class="relative mt-1 size-2.5 shrink-0 rounded-full border-2 border-[var(--app-surface)]" style:background={stateColor(agent.state)}>
                  {#if agent.state === 'working'}<span class="absolute inset-[-4px] animate-ping rounded-full opacity-20" style:background={stateColor(agent.state)}></span>{/if}
                </span>
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-2">
                    <h4 class="truncate text-xs font-semibold text-[var(--app-text)]">{agent.title}</h4>
                    <span class="shrink-0 rounded-[3px] bg-[var(--app-surface-raised)] px-1.5 py-0.5 text-[9px] text-[var(--app-text-muted)]">{agent.provider ?? m['control_center.shell']()}</span>
                    {#if agent.floorName}<span class="inline-flex min-w-0 items-center gap-1 rounded-[3px] bg-[var(--app-surface-raised)] px-1.5 py-0.5 text-[9px] text-[var(--app-text-muted)]"><Layers size={9} class="shrink-0" /><span class="truncate">{agent.floorName}</span></span>{/if}
                    {#if agent.role}<span class="min-w-0 truncate text-[9px] text-[var(--app-text-muted)]">{agent.role}</span>{/if}
                  </div>
                  <p class="mt-1 truncate text-[11px] text-[var(--app-text-soft)]">{agent.currentTask?.title ?? actionLabel(agent)}</p>
                  <div class="mt-1.5 flex min-w-0 items-center gap-2 text-[9px] text-[var(--app-text-muted)]">
                    <span class="font-medium" style:color={stateColor(agent.state)}>{stateLabel(agent.state)}</span>
                    <span>·</span>
                    <span>{elapsed(agent.stateSince)}</span>
                    {#if agent.currentTask}<span class="truncate">· #{agent.currentTask.id.slice(0, 8)} · {agent.currentTask.status}</span>{/if}
                  </div>
                </div>
                <div class="flex flex-col items-end gap-1 text-[9px] text-[var(--app-text-muted)]">
                  {#if usageFor(agent)}<span class="font-semibold tabular-nums text-[var(--app-text-soft)]">{usageFor(agent)}</span>{/if}
                  <span>{m['control_center.provider_usage']()}</span>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="grid min-h-56 place-items-center p-8 text-center">
            <div><CircleDashed size={24} class="mx-auto text-[var(--app-text-muted)]" /><p class="mt-2 text-xs text-[var(--app-text-muted)]">{m['control_center.no_agents']()}</p></div>
          </div>
        {/if}
      </section>

      <section class="min-h-0 overflow-y-auto" aria-labelledby="control-center-inbox">
        <div class="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-subtle)] px-4">
          <Inbox size={13} class="text-[var(--app-text-muted)]" aria-hidden="true" />
          <h3 id="control-center-inbox" class="text-[10px] font-semibold uppercase text-[var(--app-text-muted)]">{m['control_center.inbox']()}</h3>
          <span class="ml-auto text-[10px] tabular-nums text-[var(--app-text-muted)]">{snapshot?.communications.length ?? 0}</span>
        </div>
        {#if snapshot?.communications.length}
          <div class="divide-y divide-[var(--app-border)]">
            {#each snapshot.communications as thread (thread.messageId)}
              <article class="px-4 py-3 transition-colors hover:bg-[var(--app-surface-subtle)]">
                <div class="flex min-w-0 items-center gap-2">
                  {#if thread.state === 'replied'}<Check size={13} class="shrink-0 text-[var(--app-success)]" />
                  {:else if thread.state === 'failed'}<AlertCircle size={13} class="shrink-0 text-[var(--app-danger)]" />
                  {:else}<MessageSquareMore size={13} class="shrink-0 text-[var(--app-accent)]" />{/if}
                  <span class="truncate text-[10px] font-semibold text-[var(--app-text)]">{sender(thread)} → {thread.toTitle}</span>
                  <span class={`ml-auto shrink-0 rounded-[3px] px-1.5 py-0.5 text-[8px] font-semibold uppercase ${thread.state === 'failed' ? 'bg-[color-mix(in_srgb,var(--app-danger)_14%,transparent)] text-[var(--app-danger)]' : 'bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]'}`}>{deliveryLabel(thread.state)}</span>
                </div>
                <p class="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--app-text-soft)]">{thread.content}</p>
                {#if thread.reply}<p class="mt-2 border-l-2 border-[var(--app-success)] pl-2 text-[10px] leading-4 text-[var(--app-text-muted)]">{thread.reply}</p>{/if}
                {#if thread.error}<p class="mt-2 text-[9px] text-[var(--app-danger)]">{thread.error}</p>{/if}
                <div class="mt-2 flex items-center gap-1" aria-label={m['control_center.delivery_history']()}>
                  {#each thread.events as event, index (event.id)}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}<span {...props} class={`size-1.5 rounded-full ${event.state === 'failed' ? 'bg-[var(--app-danger)]' : event.state === 'replied' ? 'bg-[var(--app-success)]' : 'bg-[var(--app-accent)]'}`}></span>{/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content>{deliveryLabel(event.state)}</Tooltip.Content>
                    </Tooltip.Root>
                    {#if index < thread.events.length - 1}<span class="h-px w-3 bg-[var(--app-border-strong)]"></span>{/if}
                  {/each}
                  <span class="ml-auto text-[8px] tabular-nums text-[var(--app-text-muted)]">#{thread.messageId.slice(0, 8)}</span>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <div class="grid min-h-56 place-items-center p-8 text-center">
            <div><Inbox size={24} class="mx-auto text-[var(--app-text-muted)]" /><p class="mt-2 text-xs text-[var(--app-text-muted)]">{m['control_center.no_messages']()}</p></div>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .control-center {
    container-type: inline-size;
  }

  .control-summary {
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  }

  .control-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .control-agents {
    border-bottom: 1px solid var(--app-border);
  }

  @container (min-width: 820px) {
    .control-body {
      grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
    }

    .control-agents {
      border-right: 1px solid var(--app-border);
      border-bottom: 0;
    }
  }
</style>
