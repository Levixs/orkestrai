<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { Check, CircleCheck, CircleDashed, CircleX, Clock, Loader2, Play, Plus, Square, Trash2, UserCheck, Workflow } from '@lucide/svelte';
  import * as Select from '$lib/components/ui/select';
  import NodeShell from './NodeShell.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';

  type FlowStep = { kind: 'agent' | 'approval'; target?: string; prompt?: string };
  type FlowRunStep = { index: number; label: string; status: 'pending' | 'running' | 'waiting' | 'done' | 'error'; excerpt?: string };
  type FlowRun = { active: boolean; iteration: number; iterations: number; startedAt: string; steps: FlowRunStep[] };
  type FlowFinishedRun = { ok: boolean; error?: string; startedAt: string; finishedAt: string; steps: FlowRunStep[] };

  type FlowPayload = {
    steps?: FlowStep[];
    iterations?: number;
    run?: FlowRun | null;
    runs?: FlowFinishedRun[];
  };

  export type FlowNodeData = {
    title: string;
    workspaceId: string;
    payload: FlowPayload;
    onDelete: (id: string) => void;
    onPayloadChange: (id: string, partial: Record<string, unknown>) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    connections?: import('./NodeShell.svelte').NodeConnection[];
    onJumpToNode?: (nodeId: string) => void;
    onRemoveConnection?: (edgeId: string) => void;
    onRename?: (id: string, title: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: FlowNodeData }>();

  const steps = $derived(data.payload.steps ?? []);
  const iterations = $derived(data.payload.iterations ?? 1);
  const run = $derived(data.payload.run ?? null);
  const runs = $derived(data.payload.runs ?? []);

  let agents = $state<Array<{ id: string; title: string }>>([]);
  let flowInput = $state('');
  let busy = $state(false);

  async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
    try {
      const response = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      });
      const payload = await response.json();
      if (!response.ok || payload.error) return null;
      return payload.data as T;
    } catch {
      return null;
    }
  }

  async function loadAgents() {
    const nodeList = await api<Array<{ id: string; type: string; title: string | null }>>(`/api/agent-room/workspaces/${data.workspaceId}/nodes`);
    if (nodeList) agents = nodeList.filter((node) => node.type === 'terminal').map((node) => ({ id: node.id, title: node.title ?? 'terminal' }));
  }

  $effect(() => {
    void data.workspaceId;
    void loadAgents();
  });

  function patchPayload(partial: Record<string, unknown>) {
    data.onPayloadChange(id, partial);
  }

  function addStep(kind: 'agent' | 'approval') {
    const step: FlowStep = kind === 'approval' ? { kind } : { kind, target: agents[0]?.title ?? '', prompt: '{{input}}' };
    patchPayload({ steps: [...steps, step] });
  }

  function updateStep(index: number, patch: Partial<FlowStep>) {
    patchPayload({ steps: steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) });
  }

  function removeStep(index: number) {
    patchPayload({ steps: steps.filter((_, i) => i !== index) });
  }

  function moveStep(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    patchPayload({ steps: next });
  }

  async function startRun() {
    busy = true;
    await api(`/api/agent-room/workspaces/${data.workspaceId}/flows/run`, {
      method: 'POST',
      body: JSON.stringify({ nodeId: id, input: flowInput }),
    });
    flowInput = '';
    busy = false;
  }

  async function approveStep() {
    await api(`/api/agent-room/workspaces/${data.workspaceId}/flows/approve`, { method: 'POST', body: JSON.stringify({ nodeId: id }) });
  }

  async function stopRun() {
    await api(`/api/agent-room/workspaces/${data.workspaceId}/flows/stop`, { method: 'POST', body: JSON.stringify({ nodeId: id }) });
  }

  const stepIcon = (status: FlowRunStep['status']) =>
    status === 'done' ? CircleCheck : status === 'running' ? Loader2 : status === 'waiting' ? Clock : status === 'error' ? CircleX : CircleDashed;
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-flow"
  accent="#5b8def"
  minWidth={420}
  minHeight={300}
  onResize={data.onResize}
  titleText={data.title}
  onRename={data.onRename}
  connections={data.connections ?? []}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<Workflow size={13} />{/snippet}
  {#snippet title()}{data.title || 'Fluxo'}{/snippet}
  {#snippet actions()}
    <HeaderIconButton label="Remover fluxo" class="node-action-btn" danger side="left" onclick={() => data.onDelete(id)}>
      <Trash2 size={13} /></HeaderIconButton>
  {/snippet}

  <div class="flow-body nodrag nowheel">
    <div class="flow-steps">
      {#each steps as step, index (index)}
        {@const runStep = run?.steps?.[index]}
        <div class="flow-step" class:running={runStep?.status === 'running'} class:waiting={runStep?.status === 'waiting'}>
          <span class="flow-step-num">{index + 1}</span>
          {#if step.kind === 'approval'}
            <span class="flow-step-kind approval"><UserCheck size={11} /> aprovacao</span>
          {:else}
            <Select.Root type="single" value={step.target ?? ''} onValueChange={(value: string) => updateStep(index, { target: value })}>
              <Select.Trigger class="flow-step-target" data-slot="select-trigger">
                {step.target || 'agente?'}
              </Select.Trigger>
              <Select.Content>
                {#each agents as agent (agent.id)}
                  <Select.Item value={agent.title}>{agent.title}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {/if}
          <span class="flow-step-actions">
            <button class="flow-mini-btn" aria-label="Subir passo" onclick={() => moveStep(index, -1)}>↑</button>
            <button class="flow-mini-btn" aria-label="Descer passo" onclick={() => moveStep(index, 1)}>↓</button>
            <button class="flow-mini-btn danger" aria-label="Remover passo" onclick={() => removeStep(index)}>×</button>
          </span>
          {#if step.kind === 'agent'}
            <textarea
              class="flow-step-prompt"
              rows="2"
              value={step.prompt ?? ''}
              placeholder="Prompt do passo — {{input}} = saida do passo anterior"
              onchange={(event) => updateStep(index, { prompt: (event.target as HTMLTextAreaElement).value })}
            ></textarea>
          {/if}
          {#if runStep?.excerpt}
            <span class="flow-step-excerpt">{runStep.excerpt}</span>
          {/if}
        </div>
      {:else}
        <span class="flow-empty">Sem passos. Adicione agentes em sequencia — a saida de um vira a entrada do proximo.</span>
      {/each}
    </div>

    <div class="flow-add">
      <button class="flow-add-btn" onclick={() => addStep('agent')} disabled={!agents.length}><Plus size={12} /> Agente</button>
      <button class="flow-add-btn" onclick={() => addStep('approval')}><UserCheck size={12} /> Aprovacao</button>
      <label class="flow-iter">
        repetir
        <input
          type="number"
          min="1"
          max="5"
          value={iterations}
          onchange={(event) => patchPayload({ iterations: Math.min(5, Math.max(1, Number((event.target as HTMLInputElement).value) || 1)) })}
        />
        x
      </label>
    </div>

    <div class="flow-run">
      {#if run?.active}
        <div class="flow-run-status">
          <Loader2 size={12} class="flow-spin" />
          rodando passo {(run.steps.findIndex((step) => step.status === 'running' || step.status === 'waiting') + 1) || run.steps.length}/{run.steps.length}
          {run.iterations > 1 ? ` · rodada ${run.iteration}/${run.iterations}` : ''}
        </div>
        {#if run.steps.some((step) => step.status === 'waiting')}
          <button class="flow-approve-btn" onclick={approveStep}><Check size={12} /> Aprovar e continuar</button>
        {/if}
        <button class="flow-stop-btn" onclick={stopRun}><Square size={11} /> Parar</button>
      {:else}
        <input
          class="flow-input"
          bind:value={flowInput}
          placeholder="Entrada inicial do fluxo (opcional)"
          aria-label="Entrada inicial do fluxo"
        />
        <button class="flow-run-btn" disabled={busy || !steps.length} onclick={startRun}>
          <Play size={12} /> Rodar
        </button>
      {/if}
    </div>

    {#if runs.length}
      <div class="flow-history">
        {#each runs as pastRun (pastRun.startedAt)}
          <div class="flow-history-row" class:failed={!pastRun.ok}>
            {#if pastRun.ok}<CircleCheck size={11} />{:else}<CircleX size={11} />{/if}
            <span>{new Date(pastRun.finishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="flow-history-detail">{pastRun.ok ? `${pastRun.steps.filter((step) => step.status === 'done').length} passos ok` : (pastRun.error ?? 'falhou')}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</NodeShell>

<style>
  .flow-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 8px 10px;
    font-size: 11.5px;
    color: #c7c8d0;
    overflow-y: auto;
  }

  .flow-steps {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .flow-step {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.03);
  }

  .flow-step.running {
    border-color: rgba(125, 229, 255, 0.45);
  }

  .flow-step.waiting {
    border-color: rgba(255, 200, 87, 0.5);
  }

  .flow-step-num {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(91, 141, 239, 0.18);
    color: #7de5ff;
    font-size: 9.5px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .flow-step-kind.approval {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #ffc857;
    font-size: 10.5px;
  }

  .flow-step :global(.flow-step-target) {
    width: 100%;
    height: 24px;
    font-size: 11px;
    background: transparent;
    border: none;
    box-shadow: none;
    padding: 0 4px;
  }

  .flow-step-actions {
    display: inline-flex;
    gap: 2px;
  }

  .flow-mini-btn {
    border: none;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    border-radius: 4px;
    padding: 1px 4px;
    font-size: 11px;
  }

  .flow-mini-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .flow-mini-btn.danger:hover {
    color: #ff9c9f;
  }

  .flow-step-prompt {
    grid-column: 1 / -1;
    width: 100%;
    resize: vertical;
    background: rgba(13, 11, 46, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    color: #c9cad2;
    font-size: 10.5px;
    font-family: inherit;
    padding: 5px 7px;
    outline: none;
  }

  .flow-step-excerpt {
    grid-column: 1 / -1;
    font-size: 10px;
    color: #6d6d78;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .flow-empty {
    font-size: 11px;
    color: #6d6d78;
    padding: 6px 2px;
  }

  .flow-add {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .flow-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 7px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: #c7c8d0;
    font-size: 10.5px;
    cursor: pointer;
  }

  .flow-add-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.07);
  }

  .flow-add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .flow-iter {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    color: #8b8c96;
  }

  .flow-iter input {
    width: 40px;
    background: rgba(13, 11, 46, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #e6e6eb;
    font-size: 11px;
    padding: 2px 5px;
    text-align: center;
  }

  .flow-run {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .flow-input {
    flex: 1;
    min-width: 0;
    background: rgba(13, 11, 46, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 7px;
    color: #e6e6eb;
    font-size: 11px;
    padding: 5px 9px;
    outline: none;
  }

  .flow-run-btn,
  .flow-approve-btn,
  .flow-stop-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 7px;
    border: none;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .flow-run-btn {
    background: #5b8def;
    color: #fff;
  }

  .flow-run-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .flow-approve-btn {
    background: rgba(61, 214, 140, 0.18);
    color: #3dd68c;
    border: 1px solid rgba(61, 214, 140, 0.4);
  }

  .flow-stop-btn {
    background: rgba(229, 72, 77, 0.14);
    color: #ff9c9f;
    border: 1px solid rgba(229, 72, 77, 0.35);
  }

  .flow-run-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #7de5ff;
  }

  .flow-history {
    display: flex;
    flex-direction: column;
    gap: 3px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-top: 6px;
  }

  .flow-history-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #8ec98e;
  }

  .flow-history-row.failed {
    color: #ff9c9f;
  }

  .flow-history-detail {
    color: #6d6d78;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flow-history-row :global(svg),
  .flow-run-status :global(.flow-spin) {
    animation: none;
  }

  .flow-run-status :global(.flow-spin) {
    animation: flow-spin 1s linear infinite;
  }

  @keyframes flow-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flow-run-status :global(.flow-spin) {
      animation: none;
    }
  }
</style>
