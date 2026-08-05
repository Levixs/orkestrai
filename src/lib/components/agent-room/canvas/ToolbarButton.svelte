<script lang="ts">
  import * as Tooltip from '$lib/components/ui/tooltip';
  import type { Snippet } from 'svelte';

  type Props = {
    /** Texto do tooltip (obrigatorio — toda ferramenta explica o que faz). */
    label: string;
    active?: boolean;
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  };

  let { label, active = false, disabled = false, onclick, children }: Props = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <button {...props} class:active {disabled} {onclick}>
        {@render children()}
      </button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content side="top">{label}</Tooltip.Content>
</Tooltip.Root>
