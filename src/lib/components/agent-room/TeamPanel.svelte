<script lang="ts">
  import { Bot, Cpu, LoaderCircle, Plus, Save, Trash2 } from '@lucide/svelte';
  import type {
    AgentName,
    AgentModelOption,
    AgentProviderInfo,
    ModelEffort,
    TeamMember,
    TeamMemberCapability,
    TeamMemberRole,
  } from '$lib/modules/agent-room/domain/types.js';

  const DEFAULT_PROVIDERS: AgentProviderInfo[] = [
    { id: 'codex', displayName: 'Codex', supportsResume: false },
    { id: 'claude', displayName: 'Claude', supportsResume: false },
  ];

  let {
    members = [],
    modelOptions = { codex: [], claude: [] },
    providers = DEFAULT_PROVIDERS,
    busy = false,
    savingMemberId = null,
    onCreate,
    onUpdate,
    onDelete,
  }: {
    members: TeamMember[];
    modelOptions: Record<string, AgentModelOption[]>;
    providers?: AgentProviderInfo[];
    busy?: boolean;
    savingMemberId?: string | null;
    onCreate: () => void;
    onUpdate: (member: TeamMember) => void;
    onDelete: (member: TeamMember) => void;
  } = $props();

  const roles: TeamMemberRole[] = ['leader', 'engineer', 'tester', 'designer', 'documenter', 'custom'];
  const efforts: ModelEffort[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
  const capabilities: TeamMemberCapability[] = ['lead', 'implement', 'review', 'test', 'design', 'document'];

  function toggleCapability(member: TeamMember, capability: TeamMemberCapability) {
    member.capabilities = member.capabilities.includes(capability)
      ? member.capabilities.filter((item) => item !== capability)
      : [...member.capabilities, capability];
  }

  function changeProvider(member: TeamMember, provider: AgentName) {
    member.provider = provider;
    member.model = null;
  }

  function changeModel(member: TeamMember, value: string) {
    member.model = value || null;
  }

  function isSaving(member: TeamMember) {
    return savingMemberId === member.id;
  }
</script>

<section class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
  <header class="flex min-h-12 items-center justify-between gap-3 border-b border-[#eeeae1] px-3.5 py-3">
    <div>
      <strong class="block text-sm leading-tight">Time</strong>
      <span class="text-xs text-[#69665f]">Membros, modelos e guardrails</span>
    </div>
    <button
      class="inline-flex size-8 items-center justify-center rounded-lg border border-[#d6d2c8] bg-white text-[#202020]"
      type="button"
      onclick={onCreate}
      disabled={busy}
      aria-label="Adicionar membro"
    >
      <Plus size={15} />
    </button>
  </header>

  <div class="flex min-h-0 flex-col gap-2.5 overflow-auto p-2.5">
    {#each members as member}
      <article class="grid gap-2 rounded-lg border border-[#dedbd2] bg-[#faf9f5] p-2.5">
        <div class="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5">
          {#if member.provider === 'codex'}
            <Cpu size={15} />
          {:else}
            <Bot size={15} />
          {/if}
          <input
            class="min-h-8 min-w-0 rounded-lg border border-[#d6d2c8] bg-white px-2 text-xs text-[#202020] outline-none"
            bind:value={member.title}
            disabled={busy}
            aria-label="Titulo do membro"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="grid gap-1 text-[11px] font-bold text-[#625e56]">
            <span>Provider</span>
            <select
              class="min-h-8 rounded-lg border border-[#d6d2c8] bg-white px-2 text-xs text-[#202020] outline-none"
              value={member.provider}
              disabled={busy}
              onchange={(event) => changeProvider(member, event.currentTarget.value as AgentName)}
            >
              {#each providers as provider}
                <option value={provider.id}>{provider.displayName}</option>
              {/each}
            </select>
          </label>
          <label class="grid gap-1 text-[11px] font-bold text-[#625e56]">
            <span>Papel</span>
            <select
              class="min-h-8 rounded-lg border border-[#d6d2c8] bg-white px-2 text-xs text-[#202020] outline-none"
              bind:value={member.role}
              disabled={busy}
            >
              {#each roles as role}
                <option value={role}>{role}</option>
              {/each}
            </select>
          </label>
          <label class="grid gap-1 text-[11px] font-bold text-[#625e56]">
            <span>Model</span>
            <select
              class="min-h-8 rounded-lg border border-[#d6d2c8] bg-white px-2 text-xs text-[#202020] outline-none"
              value={member.model ?? ''}
              disabled={busy}
              onchange={(event) => changeModel(member, event.currentTarget.value)}
            >
              <option value="">default</option>
              {#each modelOptions[member.provider] ?? [] as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class="grid gap-1 text-[11px] font-bold text-[#625e56]">
            <span>Effort</span>
            <select
              class="min-h-8 rounded-lg border border-[#d6d2c8] bg-white px-2 text-xs text-[#202020] outline-none"
              bind:value={member.effort}
              disabled={busy}
            >
              {#each efforts as effort}
                <option value={effort}>{effort}</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="grid grid-cols-3 gap-1.5">
          {#each capabilities as capability}
            <label class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1 text-[11px] font-bold text-[#625e56]">
              <input
                type="checkbox"
                checked={member.capabilities.includes(capability)}
                disabled={busy}
                onchange={() => toggleCapability(member, capability)}
              />
              <span>{capability}</span>
            </label>
          {/each}
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1 text-[11px] font-bold text-[#625e56]">
            <input type="checkbox" bind:checked={member.canWrite} disabled={busy} />
            <span>Escrita</span>
          </label>
          <label class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1 text-[11px] font-bold text-[#625e56]">
            <input type="checkbox" bind:checked={member.participatesInLoop} disabled={busy} />
            <span>Loop</span>
          </label>
        </div>

        <textarea
          class="w-full resize-y rounded-lg border border-[#d6d2c8] bg-white p-2 text-xs text-[#202020] outline-none"
          bind:value={member.systemPrompt}
          disabled={busy}
          rows="3"
          aria-label="Prompt do membro"
        ></textarea>

        <footer class="flex gap-2">
          <button
            class="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-[#d6d2c8] bg-white px-2.5 text-xs font-bold text-[#202020]"
            type="button"
            onclick={() => onUpdate(member)}
            disabled={busy || isSaving(member)}
          >
            {#if isSaving(member)}
              <LoaderCircle class="animate-spin" size={14} />
              <span>Salvando</span>
            {:else}
              <Save size={14} />
              <span>Salvar</span>
            {/if}
          </button>
          <button
            class="inline-flex min-h-8 items-center justify-center rounded-lg border border-[#d6d2c8] bg-white px-2.5 text-xs font-bold text-[#202020]"
            type="button"
            onclick={() => onDelete(member)}
            disabled={busy || isSaving(member)}
            aria-label="Remover membro"
          >
            <Trash2 size={14} />
          </button>
        </footer>
      </article>
    {/each}
  </div>
</section>
