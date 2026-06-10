<script lang="ts">
  import { LoaderCircle } from '@lucide/svelte';
  import type { ChatMessage } from '$lib/modules/agent-room/domain/types.js';
  import MessageBubble from './MessageBubble.svelte';

  let { messages, busy = false }: { messages: ChatMessage[]; busy?: boolean } = $props();
</script>

<section class="chat-stream" aria-live="polite">
  {#if messages.length === 0}
    <div class="empty-state">
      <strong>Nenhuma mensagem ainda</strong>
      <span>Crie contexto e escolha como os agentes devem responder.</span>
    </div>
  {:else}
    {#each messages as message (message.id)}
      <MessageBubble {message} />
    {/each}
  {/if}

  {#if busy}
    <div class="running-indicator">
      <LoaderCircle size={16} />
      <span>Agente em execucao</span>
    </div>
  {/if}
</section>
