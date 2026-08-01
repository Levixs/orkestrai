<script lang="ts">
  import { Bot, CheckCheck, Cpu, GitCompare, MessagesSquare, Repeat2, Send, ShieldCheck, Users } from '@lucide/svelte';
  import type { AgentProviderInfo, AgentTarget, ConversationMode, ExecutionMode } from '$lib/modules/agent-room/domain/types.js';

  const DEFAULT_PROVIDERS: AgentProviderInfo[] = [
    { id: 'codex', displayName: 'Codex', supportsResume: false },
    { id: 'claude', displayName: 'Claude', supportsResume: false },
  ];

  let {
    mode = $bindable<Exclude<ConversationMode, 'project'>>('chat'),
    target = $bindable<AgentTarget>('codex'),
    allowWrites = $bindable(false),
    loopMaxRounds = $bindable(6),
    executionMode = $bindable<ExecutionMode>('sequential'),
    providers = DEFAULT_PROVIDERS,
    busy = false,
    onRun,
    onDebate,
    onLoop,
  }: {
    mode: Exclude<ConversationMode, 'project'>;
    target: AgentTarget;
    allowWrites: boolean;
    loopMaxRounds: number;
    executionMode: ExecutionMode;
    providers?: AgentProviderInfo[];
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

  const providerIcon = (id: string) => (id === 'codex' ? Cpu : Bot);

  const targets = $derived<Array<{ value: AgentTarget; label: string; icon: typeof Cpu }>>([
    ...providers.map((provider) => ({ value: provider.id, label: provider.displayName, icon: providerIcon(provider.id) })),
    { value: 'both', label: 'Sala 3 vias', icon: MessagesSquare },
    { value: 'codex_then_claude_review', label: 'Codex, Claude revisa', icon: GitCompare },
    { value: 'claude_then_codex_review', label: 'Claude, Codex revisa', icon: CheckCheck },
  ]);

  const loopRoundOptions = [3, 6, 9, 12];
  const executionModes: Array<{ value: ExecutionMode; label: string }> = [
    { value: 'sequential', label: 'Sequencial' },
    { value: 'parallel', label: 'Paralelo worktree' },
  ];
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

  <label class="loop-control">
    <span>Execucao</span>
    <select bind:value={executionMode} disabled={busy} aria-label="Modo de execucao">
      {#each executionModes as item}
        <option value={item.value}>{item.label}</option>
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
