<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { ArrowLeftRight, BadgeCheck, RotateCcw, SendHorizontal, SquareTerminal, Star, SwatchBook, X } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import type { AgentRole } from '$lib/modules/agent-room/application/services/RoleService.js';
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';
  import TerminalNode from '../TerminalNode.svelte';
  import VoiceConfirmDialog from '../VoiceConfirmDialog.svelte';
  import { getAppSettings } from '../app-settings.svelte.js';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import { voiceModelsReadyForUse } from '../voice-model-status.js';
  import { speakText } from '../voice-speech.js';
  import type { AgentProviderInfo, TerminalNodePayload } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  export type MentionTarget = { id: string; title: string; type: string };

  export type TerminalNodeData = {
    title: string;
    workingDir: string;
    workspaceId: string;
    payload: TerminalNodePayload;
    /** Avalia os args de resume do provider NA HORA do respawn. */
    resumeArgsFor?: () => string[] | null;
    /** Avalia os args de resume exato por session-id NA HORA do respawn. */
    exactResumeArgsFor?: (agentSessionId: string) => string[] | null;
    /** Template que reserva um id novo na CLI e elimina races entre agentes. */
    freshSessionArgsFor?: () => string[] | null;
    sessionStorageFor?: () => string | null;
    onAgentSessionFound?: (id: string, agentSessionId: string) => void;
    /** Promise da pagina: providers carregados (para o respawn nao correr a race). */
    providersReady?: Promise<void>;
    providers?: AgentProviderInfo[];
    onProviderChange?: (id: string, provider: string) => Promise<void>;
    onRoleChange?: (id: string, role: string | null) => void;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onSessionCreated: (id: string, sessionId: string, options: { resumed: boolean }) => void | Promise<void>;
    onToggleMaestro?: (id: string) => void;
    onOpenFile?: (path: string) => void;
    onCycleTheme?: (id: string) => void;
    onPayloadChange?: (id: string, partial: Record<string, unknown>) => void;
    onRename?: (id: string, title: string) => void;
    /** Nome do workspace (notificacao de fim de sessao). */
    workspaceName?: string;
    /** Edge conversando (broadcast da bridge) — vem da pagina do canvas. */
    onTalking?: (payload: { from: string | null; to: string; talking: boolean }) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: TerminalNodeData }>();

  // Quando a sessao morre (restart do app), recria com os args de resume do
  // provider para retomar o contexto da conversa anterior.
  let forceRespawn = $state(false);
  /** Session-id descoberto no momento do respawn (cobre o caso do watch ter
      expirado antes da primeira mensagem — Claude grava o jsonl so na 1a msg). */
  let respawnAgentSessionId = $state<string | null>(null);

  async function resolveRespawn() {
    const payload = data.payload as TerminalNodePayload & { provider?: string };
    // Espera os providers carregarem — sem eles o respawn sairia sem os args
    // de resume (race no restart do app: attach falha antes do status voltar).
    await (data.providersReady ?? Promise.resolve());
    if (!respawnAgentSessionId && payload.provider && !payload.agentSessionId) {
      try {
        const response = await fetch(
          `/api/agent-room/sessions/latest?provider=${encodeURIComponent(payload.provider)}&cwd=${encodeURIComponent(data.workingDir)}&workspaceId=${encodeURIComponent(data.workspaceId)}`
        );
        const result = await response.json();
        respawnAgentSessionId = result.data?.agentSessionId ?? null;
        if (respawnAgentSessionId) data.onAgentSessionFound?.(id, respawnAgentSessionId);
      } catch {
        // sem id: cai no resume generico do provider
      }
    }
    forceRespawn = true;
  }

  async function persistCreatedSession(sessionId: string) {
    const payload = data.payload as TerminalNodePayload;
    const resumed = forceRespawn || Boolean(payload.agentSessionId) || Boolean(payload.resumeRecovery);
    await data.onSessionCreated(id, sessionId, { resumed });
    // Mantem o terminal criador montado ate o payload persistido apontar para
    // a nova sessao; liberar antes reanexaria por um instante ao id antigo.
    forceRespawn = false;
  }

  // -- Recarregar terminal (reinicia a sessao COM o contexto) -------------------
  async function reloadTerminal() {
    await fetch(`/api/agent-room/workspaces/${data.workspaceId}/nodes/${id}/reload`, { method: 'POST' }).catch(() => {});
    // sessionId null no payload -> o no cai no caminho de criacao, que usa o
    // resume exato (agentSessionId permanece no payload).
    data.onPayloadChange?.(id, { sessionId: null });
  }

  // -- Role do terminal ---------------------------------------------------------
  let roles = $state<AgentRole[]>([]);
  let rolesLoaded = false;

  const currentRole = $derived((data.payload as TerminalNodePayload).role ?? null);
  /** Role exibida no header: curta (o nome completo fica no dropdown/aria). */
  const roleLabel = $derived(currentRole && currentRole.length > 24 ? `${currentRole.slice(0, 23).trimEnd()}…` : currentRole);
  const currentProvider = $derived((data.payload as TerminalNodePayload).provider ?? null);
  let switchingProvider = $state(false);
  let providerError = $state('');

  async function changeProvider(provider: string) {
    if (!provider || provider === currentProvider || switchingProvider) return;
    switchingProvider = true;
    providerError = '';
    try {
      forceRespawn = false;
      respawnAgentSessionId = null;
      await data.onProviderChange?.(id, provider);
    } catch {
      providerError = m['term.provider_switch_error']();
      setTimeout(() => (providerError = ''), 6_000);
    } finally {
      switchingProvider = false;
    }
  }

  async function loadRoles() {
    if (rolesLoaded) return;
    rolesLoaded = true;
    try {
      const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/roles`);
      const payload = await response.json();
      roles = payload.data ?? [];
    } catch {
      roles = [];
    }
  }

  async function assignRole(role: string | null) {
    data.onRoleChange?.(id, role);
    // Se ja tem sessao viva, injeta o prompt da role imediatamente.
    if (role && (data.payload as TerminalNodePayload).sessionId) {
      await fetch(`/api/agent-room/workspaces/${data.workspaceId}/roles/apply`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken()! } : {}),
        },
        body: JSON.stringify({ nodeId: id, mode: 'role' }),
      }).catch(() => {});
    }
  }

  // -- Composer com @mencoes ---------------------------------------------------
  let prompt = $state('');
  let mentionOpen = $state(false);
  let mentionFilter = $state('');
  let mentionTargets = $state<MentionTarget[]>([]);
  let promptInput: HTMLInputElement;

  const filteredMentions = $derived(
    mentionTargets.filter((target) => target.title.toLowerCase().includes(mentionFilter.toLowerCase())).slice(0, 8)
  );

  async function loadMentions() {
    if (mentionTargets.length) return;
    try {
      const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/nodes`);
      const payload = await response.json();
      mentionTargets = (payload.data ?? [])
        .filter((node: { id: string; type: string }) => node.id !== id && ['terminal', 'note', 'portal'].includes(node.type))
        .map((node: { id: string; type: string; title: string | null }) => ({
          id: node.id,
          title: node.title ?? node.type,
          type: node.type,
        }));
    } catch {
      mentionTargets = [];
    }
  }

  async function handlePromptInput() {
    const match = prompt.match(/@([\w .-]*)$/);
    if (match) {
      mentionFilter = match[1];
      mentionOpen = true;
      await loadMentions();
    } else {
      mentionOpen = false;
    }
  }

  function insertMention(target: MentionTarget) {
    prompt = prompt.replace(/@([\w .-]*)$/, `@${target.title} `);
    mentionOpen = false;
    promptInput?.focus();
  }

  async function sendPrompt() {
    const text = prompt.trim();
    if (!text) return;
    const sessionId = (data.payload as TerminalNodePayload).sessionId;
    if (!sessionId) return;
    prompt = '';
    await fetch(`/api/agent-room/workspaces/${data.workspaceId}/terminals/${id}/write`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(getCsrfToken() ? { 'X-CSRF-Token': getCsrfToken()! } : {}),
      },
      body: JSON.stringify({ data: `${text}\r` }),
    }).catch(() => {});
  }

  function handlePromptKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !mentionOpen) {
      event.preventDefault();
      sendPrompt();
      return;
    }
    if (event.key === 'Escape') {
      mentionOpen = false;
      return;
    }
    if (mentionOpen && event.key === 'Tab' && filteredMentions.length) {
      event.preventDefault();
      insertMention(filteredMentions[0]);
    }
  }

  // -- Voz de volta (TTS pt-BR) ------------------------------------------------
  /** Le respostas de asks destinadas a este no em voz alta (toggle no header). */
  let voiceOn = $state(false);
  let voiceError = $state('');
  let voiceConfirmOpen = $state(false);
  let checkingVoiceModels = false;

  async function toggleVoice() {
    if (voiceOn) {
      voiceOn = false;
      return;
    }
    if (checkingVoiceModels) return;
    checkingVoiceModels = true;
    try {
      if (!(await voiceModelsReadyForUse(await getAppSettings(true)))) {
        voiceConfirmOpen = true;
        return;
      }
      voiceOn = true;
    } catch {
      voiceError = m['voice.model_status_error']();
      setTimeout(() => (voiceError = ''), 6_000);
    } finally {
      checkingVoiceModels = false;
    }
  }

  function handleAgentReply(payload: { to: string; from: string | null; text: string }) {
    if (payload.to !== id || !voiceOn || !payload.text.trim()) return;
    voiceError = '';
    speakText(payload.text).catch((error) => {
      voiceError = error instanceof Error ? error.message : m['term.voice_error']();
      setTimeout(() => (voiceError = ''), 6_000);
    });
  }

  // Resume exato quando temos o session-id real da CLI; senao, fallback
  // para "a sessao mais recente do diretorio".
  const agentEnv = $derived({
    ...((data.payload as TerminalNodePayload).env ?? {}),
    ORKESTRAI_NODE_ID: id,
    ORKESTRAI_AGENT_TITLE: data.title,
  });
  const respawnRequest = $derived.by(() => {
    const payload = data.payload as TerminalNodePayload & { agentSessionId?: string };
    const exactId = payload.agentSessionId ?? respawnAgentSessionId;
    const exactArgs = exactId ? (data.exactResumeArgsFor?.(exactId) ?? null) : null;
    if (exactArgs) {
      return {
        command: data.payload.command ?? '',
        args: [...(data.payload.args ?? []), ...exactArgs],
        cwd: data.workingDir,
        env: agentEnv,
      };
    }
    const genericArgs = data.resumeArgsFor?.() ?? null;
    return {
      command: data.payload.command ?? '',
      args:
        genericArgs && genericArgs.length
          ? [...(data.payload.args ?? []), ...genericArgs]
          : (data.payload.args ?? []),
      freshSessionArgs: !exactId && (!genericArgs || genericArgs.length === 0)
        ? (data.freshSessionArgsFor?.() ?? undefined)
        : undefined,
      cwd: data.workingDir,
      env: agentEnv,
    };
  });

  /**
   * Request de criacao quando NAO ha sessao para attachar. Apos o Descarregar
   * (sessionId removido do payload), agentes com session-id conhecido voltam
   * COM resume — mesmo comportamento do restart do app. Agentes novinhos
   * (sem agentSessionId) e shells continuam nascendo limpos.
   */
  const createRequest = $derived.by(() => {
    const payload = data.payload as TerminalNodePayload & { provider?: string; agentSessionId?: string };
    if (forceRespawn || (payload.provider && payload.agentSessionId)) return respawnRequest;
    return {
      command: payload.command ?? '',
      args: payload.args ?? [],
      freshSessionArgs: data.freshSessionArgsFor?.() ?? undefined,
      cwd: data.workingDir,
      env: agentEnv,
    };
  });
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-terminal"
  accent="var(--app-accent)"
  minWidth={360}
  minHeight={220}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<SquareTerminal size={13} />{/snippet}
  {#snippet title()}{data.title}{/snippet}
  {#snippet actions()}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="node-action-btn" aria-label={m['term.provider_switch']()} disabled={switchingProvider}>
        <ArrowLeftRight size={13} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-48">
        <DropdownMenu.Label>{m['term.provider_switch']()}</DropdownMenu.Label>
        <DropdownMenu.Separator />
        {#each data.providers ?? [] as provider (provider.id)}
          <DropdownMenu.Item
            disabled={!provider.installed || provider.id === currentProvider}
            onclick={() => changeProvider(provider.id)}
          >
            <span class="provider-state" class:available={provider.installed}></span>
            <span class="min-w-0 flex-1 truncate">{provider.displayName}</span>
            {#if provider.id === currentProvider}<span class="text-[9px] text-[var(--app-text-muted)]">{m['term.provider_current']()}</span>{/if}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <DropdownMenu.Root onOpenChange={(open: boolean) => open && loadRoles()}>
      <DropdownMenu.Trigger class={currentRole ? 'role-trigger has-role' : 'role-trigger'} aria-label={currentRole ? m['term.role_label']({ role: currentRole }) : m['term.role_assign']()}>
        <BadgeCheck size={13} />
        {#if roleLabel}
          <span class="role-name">{roleLabel}</span>
        {/if}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-44">
        <DropdownMenu.Item onclick={() => assignRole(null)}>{m['term.role_none']()}</DropdownMenu.Item>
        <DropdownMenu.Separator />
        {#each roles as role (role.slug)}
          <DropdownMenu.Item onclick={() => assignRole(role.name)}>
            <span class="role-dot" style:background={role.color}></span>
            {role.name}
          </DropdownMenu.Item>
        {:else}
          <DropdownMenu.Item disabled>{m['term.role_empty']()}</DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <IconAction label={m['term.cycle_theme']()} onclick={() => data.onCycleTheme?.(id)}>
      <SwatchBook size={13} /></IconAction>
    <IconAction label={m['term.reload_tooltip']()} onclick={reloadTerminal}>
      <RotateCcw size={13} /></IconAction>
    <button
      class="node-action-btn"
      class:active={data.payload.maestro}
      aria-label={data.payload.maestro ? m['term.maestro_active']() : m['term.maestro_enable']()}
      onclick={() => data.onToggleMaestro?.(id)}
    >
      <Star size={13} fill={data.payload.maestro ? 'currentColor' : 'none'} />
    </button>
    <IconAction label={m['term.remove_terminal']()} danger onclick={() => data.onDelete(id)}>
      <X size={13} /></IconAction>
  {/snippet}

  {#if mentionOpen && filteredMentions.length}
    <div class="mention-pop nodrag">
      {#each filteredMentions as target (target.id)}
        <button class="mention-item" onclick={() => insertMention(target)}>
          <span class="mention-type">{target.type}</span>
          {target.title}
        </button>
      {/each}
    </div>
  {/if}

  <div class="terminal-body nodrag">
    {#if data.payload.sessionId && !forceRespawn}
      <TerminalNode
        sessionId={data.payload.sessionId}
        workspaceId={data.workspaceId}
        nodeId={id}
        sessionLabel={data.title}
        workspaceName={data.workspaceName}
        onOpenPath={(path) => data.onOpenFile?.(path)}
        themeName={data.payload.theme ?? 'dark'}
        provider={data.payload.provider}
        sessionStorage={data.sessionStorageFor?.() ?? undefined}
        onRespawn={resolveRespawn}
        onAgentSession={(agentSessionId) => data.onAgentSessionFound?.(id, agentSessionId)}
        onTalking={data.onTalking}
        onAgentReply={handleAgentReply}
        {voiceOn}
        onToggleVoice={toggleVoice}
      />
    {:else if data.payload.command}
      <TerminalNode
        {createRequest}
        workspaceId={data.workspaceId}
        nodeId={id}
        sessionLabel={data.title}
        workspaceName={data.workspaceName}
        onSessionCreated={persistCreatedSession}
        onOpenPath={(path) => data.onOpenFile?.(path)}
        themeName={data.payload.theme ?? 'dark'}
        provider={data.payload.provider}
        sessionStorage={data.sessionStorageFor?.() ?? undefined}
        onAgentSession={(agentSessionId) => data.onAgentSessionFound?.(id, agentSessionId)}
        onTalking={data.onTalking}
        onAgentReply={handleAgentReply}
        {voiceOn}
        onToggleVoice={toggleVoice}
      />
    {:else}
      <p class="terminal-empty">{m['term.no_command']()}</p>
    {/if}
  </div>
  {#if voiceError}
    <p class="voice-error">{voiceError}</p>
  {/if}
  {#if providerError}
    <p class="voice-error">{providerError}</p>
  {/if}
  <VoiceConfirmDialog bind:open={voiceConfirmOpen} onConfirm={() => (voiceOn = true)} onCancel={() => {}} />

  <div class="composer nodrag">
    <input
      bind:this={promptInput}
      bind:value={prompt}
      oninput={handlePromptInput}
      onkeydown={handlePromptKeydown}
      placeholder={m['ph.quick_prompt']()}
      spellcheck="false"
    />
    <button class="composer-send" aria-label={m['term.send']()} onclick={sendPrompt} disabled={!prompt.trim()}>
      <SendHorizontal size={13} />
    </button>
  </div>
</NodeShell>

<style>
  .terminal-body {
    flex: 1;
    min-height: 0;
  }

  .terminal-empty {
    color: var(--app-text-muted);
    font-size: 12px;
    padding: 10px;
  }

  .voice-error {
    margin: 0;
    padding: 4px 10px;
    font-size: 11px;
    color: var(--app-warning);
    background: color-mix(in srgb, var(--app-warning) 10%, transparent);
  }

  .composer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid var(--app-border);
    background: var(--app-surface);
  }

  .composer input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--app-text);
    font-size: 12px;
  }

  .composer-send {
    display: inline-flex;
    border: none;
    background: transparent;
    color: var(--app-text-muted);
    cursor: pointer;
    padding: 3px;
  }

  .composer-send:hover:not(:disabled) {
    color: var(--app-accent);
  }

  .composer-send:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .provider-state {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 999px;
    background: var(--app-text-muted);
  }

  .provider-state.available {
    background: var(--app-success);
  }

  .mention-pop {
    position: absolute;
    bottom: 44px;
    left: 10px;
    right: 10px;
    z-index: 30;
    background: var(--app-surface-raised);
    border: 1px solid var(--app-border);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  }

  .mention-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--app-text-soft);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .mention-item:hover {
    background: var(--app-border);
  }

  .mention-type {
    font-size: 9px;
    text-transform: uppercase;
    color: var(--app-text-muted);
    background: var(--app-border);
    border-radius: 4px;
    padding: 1px 5px;
  }

  .role-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: var(--app-text-muted);
    cursor: pointer;
    padding: 3px;
    border-radius: 6px;
  }

  .role-trigger:hover {
    background: var(--app-border);
    color: var(--app-text);
  }

  .role-trigger.has-role {
    color: var(--app-success);
  }

  .role-name {
    display: inline-block;
    font-size: 10px;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .role-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
  }
</style>
