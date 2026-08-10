<script lang="ts">
  import { ChevronsUpDown } from '@lucide/svelte';
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';

  type ModelOption = { value: string; label: string };

  type Props = {
    value: string;
    options: ModelOption[];
    defaultLabel: string;
    searchPlaceholder: string;
    emptyLabel: string;
    ariaLabel: string;
    onValueChange: (value: string) => void;
    fieldProps?: Record<string, unknown>;
  };

  let { value, options, defaultLabel, searchPlaceholder, emptyLabel, ariaLabel, onValueChange, fieldProps = {} }: Props = $props();
  let open = $state(false);
  let query = $state('');

  const currentLabel = $derived(options.find((option) => option.value === value)?.label ?? (value || defaultLabel));

  function choose(next: string) {
    onValueChange(next === '__default__' ? '' : next);
    query = '';
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    {...fieldProps}
    class="model-trigger"
    role="combobox"
    aria-label={ariaLabel}
    aria-expanded={open}
  >
    <span>{currentLabel}</span>
    <ChevronsUpDown size={14} aria-hidden="true" />
  </Popover.Trigger>
  <Popover.Content align="start" class="model-popover p-0!">
    <Command.Root value={value || '__default__'}>
      <Command.Input bind:value={query} placeholder={searchPlaceholder} autofocus />
      <Command.List class="max-h-64">
        <Command.Empty>{emptyLabel}</Command.Empty>
        <Command.Item value="__default__" keywords={[defaultLabel]} onSelect={() => choose('__default__')}>
          {defaultLabel}
        </Command.Item>
        {#each options as option (option.value)}
          <Command.Item value={option.value} keywords={[option.label]} onSelect={() => choose(option.value)}>
            <span class="model-option">{option.label}</span>
          </Command.Item>
        {/each}
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>

<style>
  :global(.model-trigger) {
    display: flex;
    width: 100%;
    height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--input);
    border-radius: 8px;
    background: var(--background);
    padding: 0 10px;
    color: var(--foreground);
    font-size: 14px;
    text-align: left;
  }

  :global(.model-trigger:hover),
  :global(.model-trigger[aria-expanded='true']) {
    background: var(--muted);
  }

  :global(.model-trigger span),
  .model-option {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.model-trigger svg) {
    flex: none;
    color: var(--muted-foreground);
  }

  :global(.model-popover) {
    width: var(--bits-popover-anchor-width);
    min-width: 260px;
  }
</style>
