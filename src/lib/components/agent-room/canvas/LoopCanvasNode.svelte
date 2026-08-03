<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { Users, X as XIcon, Plus, Trash2, Play, Square, Repeat } from '@lucide/svelte';
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import type { TeamMember, TeamMemberRole, AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';

  export type LoopNodeData = {
    title: string;
    workspaceId: string;
    payload: { conversationId?: string; objective?: string };
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onPayloadChange?: (id: string, partial: Record<string, unknown>) => void;
  };

  type LogEntry = { kind: string; text: string };
  type LoopTask = { id: string; title: string; status: 'backlog' | 'in_progress' | 'testing' | 'done'; assigneeId?: string | null };

  let { id, data, selected } = $props<NodeProps & { data: LoopNodeData }>();

  let objective = $state(data.payload.objective ?? '');
  let maxRounds = $state(4);
  let allowWrites = $state(false);
  let running = $state(false);
  let teamOpen = $state(false);
  let teamMembers = $state<TeamMember[]>([]);
  let providers = $state<AgentProviderInfo[]>([]);
  let newMember = $state({ title: '', provider: 'claude', role: 'engineer' as TeamMemberRole, canWrite: true, systemPrompt: '' });
  let teamError = $state('');
  let log = $state<LogEntry[]>([]);
  let abortController: AbortController | null = null;
  let logEl: HTMLDivElement;
  let tasks = $state<LoopTask[]>([]);

  const KANBAN_COLUMNS: Array<{ status: LoopTask['status']; label: string }> = [
    { status: 'backlog', label: 'Backlog' },
    { status: 'in_progress', label: 'Fazendo' },
    { status: 'testing', label: 'Revisao' },
    { status: 'done', label: 'Pronto' },
  ];

  async function refreshTasks() {
    if (!data.payload.conversationId) return;
    try {
      tasks = await teamApi<LoopTask[]>(`/api/agent-room/conversations/${data.payload.conversationId}/tasks`);
    } catch {
      // conversa ainda nao existe
    }
  }

  function pushLog(kind: string, text: string) {
    log = [...log.slice(-300), { kind, text }];
    queueMicrotask(() => {
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    });
  }

  async function ensureConversation(): Promise<string> {
    if (data.payload.conversationId) return data.payload.conversationId;
    const response = await fetch('/api/agent-room/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `Loop: ${(objective || 'time').slice(0, 40)}`, mode: 'implement' }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'Falha ao criar conversa do loop.');
    data.onPayloadChange?.(id, { conversationId: payload.data.id });
    return payload.data.id;
  }

  async function runLoop() {
    if (!objective.trim() || running) return;
    running = true;
    log = [];
    abortController = new AbortController();
    pushLog('system', `Iniciando loop (max ${maxRounds} rodadas, writes ${allowWrites ? 'on' : 'off'})...`);

    try {
      const conversationId = await ensureConversation();
      await refreshTasks();
      const response = await fetch(`/api/agent-room/conversations/${conversationId}/loop/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: objective, mode: 'implement', allowWrites, maxRounds }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Falha no loop (HTTP ${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleEvent(JSON.parse(line));
          } catch {
            // linha parcial
          }
        }
      }
      pushLog('system', 'Loop finalizado.');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        pushLog('system', 'Loop interrompido pelo usuario.');
      } else {
        pushLog('error', error instanceof Error ? error.message : 'Falha no loop.');
      }
    } finally {
      running = false;
      abortController = null;
    }
  }

  function handleEvent(event: Record<string, unknown>) {
    const type = String(event.type ?? '');
    switch (type) {
      case 'run_started':
        pushLog('agent', `▶ ${event.memberTitle ?? event.agent} iniciou`);
        break;
      case 'agent_output':
        pushLog('output', String(event.text ?? '').slice(0, 400));
        break;
      case 'run_finished':
        pushLog('agent', `■ ${event.memberTitle ?? event.agent} finalizou (${event.exitCode ?? '?'})`);
        break;
      case 'round_started':
        pushLog('round', `— Rodada ${event.round} —`);
        break;
      case 'tasks_updated': {
        const updated = (event.tasks as LoopTask[] | undefined) ?? [];
        tasks = updated;
        pushLog('tasks', updated.map((task) => `[${task.status}] ${task.title}`).join(' | '));
        break;
      }
      case 'loop_finished':
        pushLog('system', `Status: ${event.status ?? 'done'}`);
        break;
      case 'error':
        pushLog('error', String(event.message ?? event.text ?? 'erro'));
        break;
      case 'done':
        pushLog('system', 'Concluido.');
        break;
      default:
        if (event.text) pushLog('output', String(event.text).slice(0, 300));
    }
  }

  function stopLoop() {
    abortController?.abort();
  }

  async function teamApi<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'Falha na API.');
    return payload.data as T;
  }

  async function openTeam() {
    teamError = '';
    teamOpen = !teamOpen;
    if (!teamOpen) return;
    try {
      if (providers.length === 0) {
        const status = await teamApi<{ providers: AgentProviderInfo[] }>('/api/agent-room/status');
        providers = status.providers ?? [];
      }
      const conversationId = await ensureConversation();
      teamMembers = await teamApi<TeamMember[]>(`/api/agent-room/conversations/${conversationId}/team`);
    } catch (error) {
      teamError = error instanceof Error ? error.message : 'Falha ao carregar o time.';
    }
  }

  async function addMember() {
    teamError = '';
    try {
      const conversationId = await ensureConversation();
      const member = await teamApi<TeamMember>(`/api/agent-room/conversations/${conversationId}/team`, {
        method: 'POST',
        body: JSON.stringify({
          title: newMember.title,
          provider: newMember.provider,
          role: newMember.role,
          canWrite: newMember.canWrite,
          participatesInLoop: true,
          systemPrompt: newMember.systemPrompt,
        }),
      });
      teamMembers = [...teamMembers, member];
      newMember = { title: '', provider: newMember.provider, role: 'engineer', canWrite: true, systemPrompt: '' };
    } catch (error) {
      teamError = error instanceof Error ? error.message : 'Falha ao adicionar membro.';
    }
  }

  async function removeMember(member: TeamMember) {
    teamError = '';
    try {
      const conversationId = await ensureConversation();
      await teamApi(`/api/agent-room/conversations/${conversationId}/team/${member.id}`, { method: 'DELETE' });
      teamMembers = teamMembers.filter((item) => item.id !== member.id);
    } catch (error) {
      teamError = error instanceof Error ? error.message : 'Falha ao remover membro.';
    }
  }
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-loop"
  accent="#8ec98e"
  minWidth={380}
  minHeight={280}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<Repeat size={13} />{/snippet}
  {#snippet title()}{data.title || 'Loop Ralph'}{/snippet}
  {#snippet actions()}
    <HeaderIconButton label="Time de agentes" class="node-action-btn" side="top" active={teamOpen} onclick={openTeam}>
      <Users size={13} />
    </HeaderIconButton>
    {#if running}
      <IconAction label="Parar" danger onclick={stopLoop}><Square size={13} /></IconAction>
    {:else}
      <HeaderIconButton label="Rodar" class="node-action-btn" side="top" onclick={runLoop} disabled={!objective.trim()}>
        <span style="color:#8ec98e;display:inline-flex"><Play size={13} /></span>
      </HeaderIconButton>
    {/if}
    <IconAction label="Remover" danger onclick={() => data.onDelete(id)}><XIcon size={13} /></IconAction>
  {/snippet}

  <div class="loop-config nodrag">
    <textarea
      bind:value={objective}
      onchange={() => data.onPayloadChange?.(id, { objective })}
      placeholder="Objetivo do loop (lider planeja, engenheiro implementa, tester revisa)..."
      rows="2"
      disabled={running}
    ></textarea>
    <div class="loop-options">
      <label>Rodadas <input type="number" bind:value={maxRounds} min="1" max="12" disabled={running} /></label>
      <label class="checkbox"><input type="checkbox" bind:checked={allowWrites} disabled={running} /> full access</label>
    </div>
  </div>

  {#if teamOpen}
    <div class="team-panel nodrag nowheel">
      <p class="team-hint">O lider precisa de capability "lead", o implementador de "implement" e o revisor de "review"/"test" — o papel define isso automaticamente.</p>
      {#each teamMembers as member (member.id)}
        <div class="member-row">
          <span class="member-title">{member.title}</span>
          <span class="member-meta">{member.provider} · {member.role}{member.canWrite ? ' · escreve' : ''}</span>
          <IconAction label="Remover" danger onclick={() => removeMember(member)}>
            <Trash2 size={12} /></IconAction>
        </div>
      {/each}
      <form class="member-form" onsubmit={(event) => { event.preventDefault(); addMember(); }}>
        <input bind:value={newMember.title} placeholder="Titulo (ex.: Revisor)" required />
        <div class="member-form-row">
          <select bind:value={newMember.provider}>
            {#each providers as provider}
              <option value={provider.id} disabled={!provider.installed}>{provider.displayName}</option>
            {/each}
          </select>
          <select bind:value={newMember.role}>
            <option value="leader">lider</option>
            <option value="engineer">engenheiro</option>
            <option value="tester">tester</option>
            <option value="designer">designer</option>
            <option value="documenter">documentador</option>
            <option value="custom">custom</option>
          </select>
        </div>
        <textarea bind:value={newMember.systemPrompt} placeholder="System prompt (opcional — papel gera um padrao)" rows="2"></textarea>
        <label class="checkbox">
          <input type="checkbox" bind:checked={newMember.canWrite} />
          Pode escrever arquivos
        </label>
        <button type="submit" class="add-member"><Plus size={12} /> Adicionar agente</button>
      </form>
      {#if teamError}
        <p class="team-error">{teamError}</p>
      {/if}
    </div>
  {/if}

  {#if tasks.length}
    <div class="kanban nodrag">
      {#each KANBAN_COLUMNS as column}
        <div class="kanban-column">
          <span class="kanban-label">{column.label}</span>
          {#each tasks.filter((task) => task.status === column.status) as task (task.id)}
            <span class="kanban-card">{task.title}</span>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  <div class="loop-log nodrag nowheel" bind:this={logEl}>
    {#each log as entry, index (index)}
      <p class={`log-${entry.kind}`}>{entry.text}</p>
    {/each}
    {#if log.length === 0}
      <p class="log-empty">Defina o objetivo e rode o loop.</p>
    {/if}
  </div>
</NodeShell>

<style>
  .canvas-loop {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    border: 1px solid #2c2c36;
    border-radius: 10px;
    background: #0D0B2E;
    overflow: hidden;
  }

  .canvas-loop.selected {
    border-color: #7C4DFF;
  }

  .loop-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    background: #1A1742;
    font-size: 12px;
    color: #e6e6eb;
    cursor: grab;
  }

  .header-actions {
    display: flex;
    gap: 2px;
  }

  .icon-btn {
    border: none;
    background: transparent;
    color: #9a9aa5;
    cursor: pointer;
    font-size: 13px;
    padding: 1px 4px;
  }

  .icon-btn.run {
    color: #8ec98e;
  }

  .icon-btn.stop {
    color: #e5484d;
  }

  .icon-btn.danger:hover {
    color: #e5484d;
  }

  .icon-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .loop-config {
    padding: 6px 8px;
    border-bottom: 1px solid #1e1e26;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .loop-config textarea {
    resize: none;
    border: 1px solid #2c2c36;
    border-radius: 6px;
    background: #0D0B2E;
    color: #e6e6eb;
    font-size: 12px;
    padding: 6px;
    font-family: inherit;
  }

  .loop-options {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #9a9aa5;
  }

  .loop-options input[type='number'] {
    width: 48px;
    background: #0D0B2E;
    border: 1px solid #2c2c36;
    border-radius: 5px;
    color: #e6e6eb;
    padding: 2px 5px;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .loop-log {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 8px;
    font-family: ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.5;
  }

  .loop-log p {
    margin: 0 0 2px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .log-agent {
    color: #7DE5FF;
  }

  .log-round {
    color: #FFC857;
    font-weight: 600;
  }

  .log-tasks {
    color: #9a9aa5;
  }

  .log-output {
    color: #b9b9c2;
  }

  .log-error {
    color: #ffb3b6;
  }

  .log-system {
    color: #8ec98e;
  }

  .log-empty {
    color: #6d6d78;
  }

  .kanban {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid #1e1e26;
  }

  .kanban-column {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .kanban-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6d6d78;
  }

  .kanban-card {
    font-size: 10px;
    padding: 4px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: #d5d5dc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-panel {
    max-height: 240px;
    overflow-y: auto;
    padding: 8px;
    border-bottom: 1px solid #1e1e26;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .team-hint {
    margin: 0;
    font-size: 10px;
    color: #6d6d78;
    line-height: 1.4;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 4px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
  }

  .member-title {
    font-weight: 600;
    color: #e6e6eb;
  }

  .member-meta {
    flex: 1;
    color: #6d6d78;
    font-size: 10px;
  }

  .member-form {
    display: flex;
    flex-direction: column;
    gap: 5px;
    border-top: 1px solid #1e1e26;
    padding-top: 6px;
  }

  .member-form input,
  .member-form select,
  .member-form textarea {
    padding: 5px 7px;
    border-radius: 6px;
    border: 1px solid #2c2c36;
    background: #0D0B2E;
    color: #e6e6eb;
    font-size: 11px;
    font-family: inherit;
  }

  .member-form-row {
    display: flex;
    gap: 5px;
  }

  .member-form-row select {
    flex: 1;
  }

  .add-member {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px;
    border: none;
    border-radius: 6px;
    background: #7C4DFF;
    color: #fff;
    font-size: 11px;
    cursor: pointer;
  }

  .team-error {
    margin: 0;
    font-size: 10px;
    color: #ffb3b6;
  }
</style>
