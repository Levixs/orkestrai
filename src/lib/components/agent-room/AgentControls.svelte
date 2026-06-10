<script lang="ts">
  import { Bot, CheckCheck, Cpu, GitCompare, MessagesSquare, Repeat2, Send, ShieldCheck, Users } from '@lucide/svelte';
  import type { AgentTarget, ConversationMode } from '$lib/modules/agent-room/domain/types.js';

  let {
    mode = $bindable<Exclude<ConversationMode, 'project'>>('chat'),
    target = $bindable<AgentTarget>('codex'),
    allowWrites = $bindable(false),
    loopMaxRounds = $bindable(6),
    busy = false,
    onRun,
    onDebate,
    onLoop,
  }: {
    mode: Exclude<ConversationMode, 'project'>;
    target: AgentTarget;
    allowWrites: boolean;
    loopMaxRounds: number;
    busy?: boolean;
    onRun: () => void;
    onDebate: () => void;
    onLoop: () => void;
  } = $props();

  const modes: Array<{ value: Exclude<ConversationMode, 'project'>; label: string }> = [
    { value: 'chat', label: 'Chat' },
    { value: 'plan', label: 'Planejar' },
    { value: 'implement', label: 'Implementar' },
    { value: 'review', label: 'Revisar' },
  ];

  const targets: Array<{ value: AgentTarget; label: string; icon: typeof Cpu }> = [
    { value: 'codex', label: 'Codex', icon: Cpu },
    { value: 'claude', label: 'Claude', icon: Bot },
    { value: 'both', label: 'Sala 3 vias', icon: MessagesSquare },
    { value: 'codex_then_claude_review', label: 'Codex, Claude revisa', icon: GitCompare },
    { value: 'claude_then_codex_review', label: 'Claude, Codex revisa', icon: CheckCheck },
  ];

  const loopRoundOptions = [3, 6, 9, 12];
</script>

<section class="control-panel">
  <div class="segmented" aria-label="Modo">
    {#each modes as item}
      <button class:active={mode === item.value} type="button" onclick={() => (mode = item.value)}>
        {item.label}
      </button>
    {/each}
  </div>

  <div class="target-grid">
    {#each targets as item}
      {@const Icon = item.icon}
      <button class:active={target === item.value} type="button" onclick={() => (target = item.value)}>
        <Icon size={15} />
        <span>{item.label}</span>
      </button>
    {/each}
  </div>

  <label class="write-toggle">
    <input type="checkbox" bind:checked={allowWrites} />
    <span><ShieldCheck size={15} /> Full access no projeto</span>
  </label>

  <label class="loop-control">
    <span>Rodadas</span>
    <select bind:value={loopMaxRounds} disabled={busy} aria-label="Rodadas do loop">
      {#each loopRoundOptions as rounds}
        <option value={rounds}>{rounds}</option>
      {/each}
    </select>
  </label>

  <div class="control-actions">
    <button class="primary-action" type="button" onclick={onRun} disabled={busy}>
      <Send size={16} />
      <span>Enviar</span>
    </button>
    <button class="secondary-action" type="button" onclick={onDebate} disabled={busy}>
      <Users size={16} />
      <span>Debater</span>
    </button>
    <button class="secondary-action" type="button" onclick={onLoop} disabled={busy}>
      <Repeat2 size={16} />
      <span>Loop</span>
    </button>
  </div>
</section>
