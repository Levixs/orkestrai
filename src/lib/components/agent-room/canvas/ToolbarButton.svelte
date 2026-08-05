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

<style>
  /* Os estilos da toolbar vivem na pagina (escopo Svelte) — o botao deste
     componente precisa da propria copia, senao herda o estilo global. */
  button {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 5px 10px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: #c7c8d0;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.1;
    flex-shrink: 0;
    font-family: inherit;
  }

  button:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  button.active {
    background: rgba(91, 141, 239, 0.2);
    color: #fff;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  button :global(.tool-icon-svg) {
    color: #8b8c96;
  }

  button.active :global(.tool-icon-svg),
  button:hover :global(.tool-icon-svg) {
    color: currentColor;
  }
</style>

