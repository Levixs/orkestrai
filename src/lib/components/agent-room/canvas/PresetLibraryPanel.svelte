<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Select from '$lib/components/ui/select';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import WorkspaceIcon from '../WorkspaceIcon.svelte';
  import { localeState } from '$lib/i18n/locale.svelte.js';
  import { ArrowRight, Library, Plus, Search, Sparkles, X } from '@lucide/svelte';
  import * as m from '$lib/paraglide/messages.js';

  type PresetSummary = {
    id: string;
    name: string;
    icon: string | null;
    description: string | null;
    agents: number;
    builtin: boolean;
    category: 'product' | 'frontend' | 'backend' | 'creative' | 'growth' | 'orkestrai' | 'custom';
  };

  type Props = {
    workspaceId?: string | null;
    onCreateWorkspace: (presetId: string) => void;
    onApplied: () => void | Promise<void>;
    onClose: () => void;
    api: <T>(path: string, init?: RequestInit) => Promise<T>;
  };

  let { workspaceId, onCreateWorkspace, onApplied, onClose, api }: Props = $props();
  let presets = $state<PresetSummary[]>([]);
  let query = $state('');
  let category = $state<'all' | PresetSummary['category']>('all');
  let pendingPreset = $state<PresetSummary | null>(null);
  let applying = $state(false);
  let errorMessage = $state('');

  const filtered = $derived(
    presets.filter((preset) => {
      const matchesCategory = category === 'all' || preset.category === category;
      const needle = query.trim().toLocaleLowerCase(localeState.current);
      const matchesQuery = !needle || `${preset.name} ${preset.description ?? ''}`.toLocaleLowerCase(localeState.current).includes(needle);
      return matchesCategory && matchesQuery;
    })
  );

  function categoryLabel(value: typeof category): string {
    if (value === 'product') return m['preset.category_product']();
    if (value === 'frontend') return m['preset.category_frontend']();
    if (value === 'backend') return m['preset.category_backend']();
    if (value === 'creative') return m['preset.category_creative']();
    if (value === 'growth') return m['preset.category_growth']();
    if (value === 'orkestrai') return m['preset.category_orkestrai']();
    if (value === 'custom') return m['preset.category_custom']();
    return m['preset.category_all']();
  }

  async function refresh() {
    errorMessage = '';
    try {
      presets = await api<PresetSummary[]>(`/api/agent-room/presets?scope=all&locale=${encodeURIComponent(localeState.current)}`);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : m['preset.error_load']();
    }
  }

  async function applyToCurrent() {
    if (!pendingPreset || !workspaceId || applying) return;
    applying = true;
    errorMessage = '';
    try {
      await api(`/api/agent-room/presets/${pendingPreset.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ workspaceId, locale: localeState.current }),
      });
      pendingPreset = null;
      await onApplied();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : m['preset.error_apply']();
    } finally {
      applying = false;
    }
  }

  $effect(() => {
    localeState.current;
    void refresh();
  });
</script>

<aside class="flex h-full w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#12102f] text-zinc-100 shadow-[-18px_0_50px_rgba(3,2,18,0.22)]" data-tour="preset-library">
  <header class="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4">
    <div class="min-w-0">
      <div class="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
        <Sparkles size={12} />
        {m['preset.eyebrow']()}
      </div>
      <h3 class="m-0 text-base font-semibold text-white">{m['preset.title']()}</h3>
      <p class="mt-1 text-xs leading-5 text-zinc-400">{m['preset.subtitle']()}</p>
    </div>
    <Button variant="ghost" size="icon-sm" aria-label={m['preset.close']()} onclick={onClose} class="shrink-0 text-zinc-400 hover:text-white">
      <X size={15} />
    </Button>
  </header>

  <div class="grid gap-2 border-b border-white/10 p-4">
    <label class="relative">
      <Search class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
      <Input bind:value={query} aria-label={m['preset.search_aria']()} placeholder={m['preset.search_placeholder']()} class="border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-zinc-600" />
    </label>
    <Select.Root type="single" value={category} onValueChange={(value: string) => (category = value as typeof category)}>
      <Select.Trigger class="w-full border-white/10 bg-white/[0.04] text-zinc-200">
        {categoryLabel(category)}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">{m['preset.category_all']()}</Select.Item>
        <Select.Item value="product">{m['preset.category_product']()}</Select.Item>
        <Select.Item value="frontend">{m['preset.category_frontend']()}</Select.Item>
        <Select.Item value="backend">{m['preset.category_backend']()}</Select.Item>
        <Select.Item value="creative">{m['preset.category_creative']()}</Select.Item>
        <Select.Item value="growth">{m['preset.category_growth']()}</Select.Item>
        <Select.Item value="orkestrai">{m['preset.category_orkestrai']()}</Select.Item>
        <Select.Item value="custom">{m['preset.category_custom']()}</Select.Item>
      </Select.Content>
    </Select.Root>
  </div>

  <div class="flex-1 space-y-3 overflow-y-auto p-4">
    {#if errorMessage}
      <p class="rounded-md border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">{errorMessage}</p>
    {/if}
    {#each filtered as preset (preset.id)}
      <article class="rounded-md border border-white/10 bg-white/[0.035] p-3 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.055]">
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-md border border-white/10 bg-[var(--app-surface)] text-cyan-200">
            <WorkspaceIcon name={preset.icon} size={17} />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="m-0 text-sm font-semibold text-white">{preset.name}</h4>
              <Badge variant={preset.builtin ? 'secondary' : 'outline'} class="h-5 rounded px-1.5 text-[9px] uppercase tracking-normal">
                {preset.builtin ? m['preset.builtin']() : m['preset.custom']()}
              </Badge>
            </div>
            <p class="mt-1 text-[11px] leading-4 text-zinc-400">{preset.description ?? m['preset.no_description']()}</p>
            <p class="mt-2 text-[10px] font-medium text-zinc-500">{m['preset.agent_count']({ count: preset.agents })} · {categoryLabel(preset.category)}</p>
          </div>
        </div>
        <div class="mt-3 grid {workspaceId ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'} gap-2">
          <Button size="sm" class="justify-between" onclick={() => onCreateWorkspace(preset.id)}>
            {m['preset.new_workspace']()}
            <ArrowRight size={14} />
          </Button>
          {#if workspaceId}
            <Button variant="outline" size="icon-sm" aria-label={m['preset.add_current_named']({ name: preset.name })} onclick={() => (pendingPreset = preset)}>
              <Plus size={14} />
            </Button>
          {/if}
        </div>
      </article>
    {:else}
      <div class="grid min-h-40 place-items-center px-8 text-center text-xs leading-5 text-zinc-500">
        <div><Library class="mx-auto mb-3" size={24} />{m['preset.empty']()}</div>
      </div>
    {/each}
  </div>
</aside>

<AlertDialog.Root open={pendingPreset !== null} onOpenChange={(open) => !open && !applying && (pendingPreset = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{m['preset.apply_title']()}</AlertDialog.Title>
      <AlertDialog.Description>{m['preset.apply_description']({ name: pendingPreset?.name ?? '' })}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={applying}>{m['settings.cancel']()}</AlertDialog.Cancel>
      <AlertDialog.Action disabled={applying} onclick={applyToCurrent}>
        {applying ? m['preset.applying']() : m['preset.apply_action']()}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
