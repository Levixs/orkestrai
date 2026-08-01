<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  type Props = {
    label: string;
    danger?: boolean;
    active?: boolean;
    disabled?: boolean;
    onclick: (event: MouseEvent) => void;
    children: Snippet;
  };

  let { label, danger = false, active = false, disabled = false, onclick, children }: Props = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        aria-label={label}
        class="node-action-btn"
        class:danger
        class:active
        {disabled}
        onclick={(event) => {
          event.stopPropagation();
          onclick(event);
        }}
      >
        {@render children()}
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content side="top">{label}</Tooltip.Content>
</Tooltip.Root>
