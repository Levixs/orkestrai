<script lang="ts">
  import { ChevronsUpDown } from '@lucide/svelte';
  import { tick } from 'svelte';
  import { Button } from '$lib/components/ui/button';
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
  let triggerRef = $state<HTMLButtonElement>(null!);

  const currentLabel = $derived(options.find((option) => option.value === value)?.label ?? (value || defaultLabel));

  async function choose(next: string) {
    onValueChange(next === '__default__' ? '' : next);
    open = false;
    await tick();
    triggerRef.focus();
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger bind:ref={triggerRef}>
    {#snippet child({ props })}
      <Button
        {...fieldProps}
        {...props}
        variant="outline"
        class="w-full min-w-0 justify-between"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{currentLabel}</span>
        <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    side="bottom"
    align="start"
    sideOffset={6}
    collisionPadding={12}
    avoidCollisions={false}
    class="w-(--bits-popover-anchor-width) min-w-[min(260px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-hidden p-0!"
  >
    <Command.Root value={value || '__default__'} class="h-auto min-w-0">
      <Command.Input placeholder={searchPlaceholder} autofocus />
      <Command.List>
        <Command.Empty>{emptyLabel}</Command.Empty>
        <Command.Group value="models">
          <Command.Item value="__default__" keywords={[defaultLabel]} onSelect={() => choose('__default__')}>
            {defaultLabel}
          </Command.Item>
          {#each options as option (option.value)}
            <Command.Item value={option.value} keywords={[option.label]} onSelect={() => choose(option.value)}>
              <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{option.label}</span>
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
