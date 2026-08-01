<script lang="ts">
  import { AlertTriangle, Bot, Cpu, UserRound } from '@lucide/svelte';
  import type { ChatMessage } from '$lib/modules/agent-room/domain/types.js';

  let { message }: { message: ChatMessage } = $props();

  const participantMeta: Record<string, { label: string; className: string; icon: typeof Bot }> = {
    user: { label: 'Usuario', className: 'message-user', icon: UserRound },
    codex: { label: 'Codex', className: 'message-codex', icon: Cpu },
    claude: { label: 'Claude', className: 'message-claude', icon: Bot },
    system: { label: 'Sistema', className: 'message-system', icon: AlertTriangle },
  };

  let meta = $derived(
    participantMeta[message.participant] ?? {
      label: message.participant,
      className: 'message-claude',
      icon: Bot,
    }
  );
  let Icon = $derived(meta.icon);
</script>

<article class={`message-bubble ${meta.className}`}>
  <header>
    <span class="message-avatar">
      <Icon size={15} />
    </span>
    <strong>{meta.label}</strong>
    <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
  </header>
  <p>{message.content}</p>
</article>
