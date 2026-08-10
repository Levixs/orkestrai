<script lang="ts">
  import { Bot, ChevronDown, CodeXml, Pin, Settings2 } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import ToolbarButton from './ToolbarButton.svelte';
  import { MAX_PINNED_AGENT_PROVIDERS } from '$lib/components/agent-room/provider-toolbar.js';
  import type { AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  type Props = {
    providers: AgentProviderInfo[];
    pinnedProviderIds: string[];
    activeProviderId: string | null;
    onSelect: (provider: AgentProviderInfo) => void;
    onTogglePin: (providerId: string, pinned: boolean) => void;
    onOpenProviderCenter: () => void;
  };

  let {
    providers,
    pinnedProviderIds,
    activeProviderId,
    onSelect,
    onTogglePin,
    onOpenProviderCenter,
  }: Props = $props();

  const pinnedProviderSet = $derived(new Set(pinnedProviderIds));
  const unpinnedProviderActive = $derived(
    activeProviderId !== null && !pinnedProviderSet.has(activeProviderId)
  );
  const pinnedProviders = $derived(
    pinnedProviderIds
      .map((id) => providers.find((provider) => provider.id === id))
      .filter((provider): provider is AgentProviderInfo => Boolean(provider?.installed))
  );

  const PROVIDER_ICONS: Record<string, string> = {
    claude: '/images/claude.svg',
    codex: '/images/codex.svg',
    kimi: '/images/kimi.svg',
  };
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class={`agents-trigger${unpinnedProviderActive ? ' active' : ''}`}
    aria-label={m['canvas.agents_menu_aria']()}
  >
    <Bot size={15} aria-hidden="true" />
    <span>{m['canvas.agents_menu']()}</span>
    <ChevronDown size={11} class="agents-chevron" aria-hidden="true" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content side="top" align="start" sideOffset={10} class="agents-menu-content">
    <DropdownMenu.Label>{m['canvas.agents_available']()}</DropdownMenu.Label>
    {#each providers as provider (provider.id)}
      <DropdownMenu.Item
        class="agent-menu-item"
        textValue={provider.displayName}
        onclick={() => provider.installed ? onSelect(provider) : onOpenProviderCenter()}
      >
        <span class="provider-menu-icon" aria-hidden="true">
          {#if PROVIDER_ICONS[provider.id]}
            <img src={PROVIDER_ICONS[provider.id]} width="16" height="16" alt="" />
          {:else}
            <CodeXml size={16} />
          {/if}
        </span>
        <span class="provider-menu-copy">
          <strong>{provider.displayName}</strong>
          <small>{provider.installed ? m['providers.detected']() : m['providers.not_detected']()}</small>
        </span>
        {#if !provider.installed}<Settings2 size={14} class="provider-setup-icon" aria-hidden="true" />{/if}
      </DropdownMenu.Item>
    {/each}
    <DropdownMenu.Separator />
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger>
        <Pin size={14} aria-hidden="true" />
        <span class="pin-provider-name">
          {m['canvas.agents_pinned']({ count: String(pinnedProviderIds.length), max: String(MAX_PINNED_AGENT_PROVIDERS) })}
        </span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent sideOffset={8} class="agent-pin-submenu">
        {#each providers as provider (provider.id)}
          <DropdownMenu.CheckboxItem
            checked={pinnedProviderSet.has(provider.id)}
            disabled={pinnedProviderIds.length >= MAX_PINNED_AGENT_PROVIDERS && !pinnedProviderSet.has(provider.id)}
            closeOnSelect={false}
            textValue={provider.displayName}
            onCheckedChange={(checked: boolean) => onTogglePin(provider.id, checked)}
          >
            <span class="pin-provider-name">{provider.displayName}</span>
          </DropdownMenu.CheckboxItem>
        {/each}
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
    <DropdownMenu.Separator />
    <DropdownMenu.Item onclick={onOpenProviderCenter}>
      <Settings2 size={15} aria-hidden="true" />
      {m['canvas.open_provider_center']()}
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

{#each pinnedProviders as provider (provider.id)}
  <ToolbarButton
    label={m['canvas.pinned_agent_tooltip']({ provider: provider.displayName })}
    active={activeProviderId === provider.id}
    onclick={() => onSelect(provider)}
  >
    {#if PROVIDER_ICONS[provider.id]}
      <img src={PROVIDER_ICONS[provider.id]} width="15" height="15" alt="" class="tool-icon" />
    {:else}
      <CodeXml size={15} class="tool-icon-svg" />
    {/if}
    {provider.displayName}
  </ToolbarButton>
{/each}

<style>
  :global(.agents-trigger) {
    position: relative;
    display: inline-grid;
    grid-template-columns: 15px auto 11px;
    grid-template-rows: 15px auto;
    align-items: center;
    justify-content: center;
    column-gap: 3px;
    row-gap: 3px;
    min-width: 64px;
    padding: 5px 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #c7c8d0;
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.1;
    cursor: pointer;
    touch-action: manipulation;
    flex-shrink: 0;
    transition: color 120ms ease, background 120ms ease;
  }

  :global(.agents-trigger > svg:first-child) {
    grid-column: 1 / 4;
    justify-self: center;
    color: #8b8c96;
  }

  :global(.agents-trigger > span) {
    grid-column: 1 / 3;
    justify-self: end;
  }

  :global(.agents-trigger .agents-chevron) {
    grid-column: 3;
    color: #777984;
    transition: transform 120ms ease;
  }

  :global(.agents-trigger[data-state='open'] .agents-chevron) {
    transform: rotate(180deg);
  }

  :global(.agents-trigger:hover),
  :global(.agents-trigger[data-state='open']),
  :global(.agents-trigger.active) {
    background: rgba(91, 141, 239, 0.2);
    color: #fff;
  }

  :global(.agents-trigger:focus-visible) {
    outline: 2px solid #7c9dff;
    outline-offset: 2px;
  }

  :global(.agents-trigger:hover > svg:first-child),
  :global(.agents-trigger[data-state='open'] > svg:first-child),
  :global(.agents-trigger.active > svg:first-child) {
    color: currentColor;
  }

  :global(.agents-menu-content) {
    width: min(300px, calc(100vw - 24px));
    max-height: min(560px, calc(100vh - 120px));
    padding: 6px;
    overscroll-behavior: contain;
  }

  :global(.agent-menu-item) {
    min-height: 44px;
    gap: 9px;
    padding: 6px 8px;
  }

  :global(.provider-menu-icon) {
    display: inline-flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: #aeb0ba;
    flex-shrink: 0;
  }

  :global(.provider-menu-icon img) {
    display: block;
  }

  :global(.provider-menu-copy) {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 1px;
  }

  :global(.provider-menu-copy strong) {
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.provider-menu-copy small) {
    color: #83858f;
    font-size: 10.5px;
  }

  :global(.provider-setup-icon) {
    color: #83858f;
  }

  :global(.pin-provider-name) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.agent-pin-submenu) {
    width: 210px;
    max-height: min(360px, calc(100vh - 24px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.agents-trigger),
    :global(.agents-trigger .agents-chevron) {
      transition: none;
    }
  }
</style>
