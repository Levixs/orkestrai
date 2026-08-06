<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { BadgeCheck, RotateCcw, SendHorizontal, SquareTerminal, Star, SwatchBook, X } from '@lucide/svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import type { AgentRole } from '$lib/modules/agent-room/application/services/RoleService.js';
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';
  import TerminalNode from '../TerminalNode.svelte';
  import VoiceConfirmDialog from '../VoiceConfirmDialog.svelte';
  import { getAppSettings } from '../app-settings.svelte.js';
  import { voiceModelsReadyForUse } from '../voice-model-status.js';
  import { speakText } from '../voice-speech.js';
  import type { TerminalNodePayload } from '$lib/modules/agent-room/domain/types.js';
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
    onAgentSessionFound?: (id: string, agentSessionId: string) => void;
    /** Promise da pagina: providers carregados (para o respawn nao correr a race). */
    providersReady?: Promise<void>;
    onRoleChange?: (id: string, role: string | null) => void;
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onSessionCreated: (id: string, sessionId: string) => void;
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeId: id }),
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
      headers: { 'content-type': 'application/json' },
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
  const agentEnv = $derived({ ORKESTRAI_NODE_ID: id, ORKESTRAI_AGENT_TITLE: data.title });
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
      cwd: data.workingDir,
      env: agentEnv,
    };
  });
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-terminal"
  accent="#7C4DFF"
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
        onSessionCreated={(sessionId) => {
          forceRespawn = false;
          data.onSessionCreated(id, sessionId);
        }}
        onOpenPath={(path) => data.onOpenFile?.(path)}
        themeName={data.payload.theme ?? 'dark'}
        provider={data.payload.provider}
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
    color: #6d6d78;
    font-size: 12px;
    padding: 10px;
  }

  .voice-error {
    margin: 0;
    padding: 4px 10px;
    font-size: 11px;
    color: #ffc857;
    background: rgba(226, 185, 61, 0.08);
  }

  .composer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    background: #1A1742;
  }

  .composer input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 12px;
  }

  .composer-send {
    display: inline-flex;
    border: none;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    padding: 3px;
  }

  .composer-send:hover:not(:disabled) {
    color: #7C4DFF;
  }

  .composer-send:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .mention-pop {
    position: absolute;
    bottom: 44px;
    left: 10px;
    right: 10px;
    z-index: 30;
    background: #262155;
    border: 1px solid rgba(255, 255, 255, 0.1);
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
    color: #d7d8de;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .mention-item:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .mention-type {
    font-size: 9px;
    text-transform: uppercase;
    color: #6d6d78;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    padding: 1px 5px;
  }

  .role-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    padding: 3px;
    border-radius: 6px;
  }

  .role-trigger:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #e6e6eb;
  }

  .role-trigger.has-role {
    color: #8ec98e;
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
