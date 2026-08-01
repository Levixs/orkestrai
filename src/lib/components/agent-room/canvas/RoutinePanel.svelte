<script lang="ts">
  import IconAction from './IconAction.svelte';
  import HeaderIconButton from './HeaderIconButton.svelte';
  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import { Clock, Pause, Pencil, Play, Trash2, X, Zap } from '@lucide/svelte';
  import { createRoutineSchema } from '$lib/modules/agent-room/contracts/schemas/floorSchemas.js';
  import type { Routine, Workspace } from '$lib/modules/agent-room/domain/types.js';

  type Props = {
    workspace: Workspace;
    terminals: Array<{ id: string; title: string }>;
    onClose: () => void;
    api: <T>(path: string, init?: RequestInit) => Promise<T>;
  };

  let { workspace, terminals, onClose, api }: Props = $props();

  const schema = createRoutineSchema as unknown as Parameters<typeof zod>[0];

  let routines = $state<Routine[]>([]);
  let historyFor = $state<{ id: string; runs: Array<{ ranAt: string; ok: boolean; detail: string }> } | null>(null);
  let submitError = $state('');
  /** Id da rotina em edicao (null = criando nova). */
  let editingId = $state<string | null>(null);

  const form = superForm(defaults({ targetNodeId: '', prompt: '', intervalMinutes: null }, zod(schema)), {
    SPA: true,
    validators: zod(schema),
    async onUpdate({ form: f }) {
      if (!f.valid) return;
      submitError = '';
      try {
        if (editingId) {
          await api(`/api/agent-room/workspaces/${workspace.id}/routines/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(f.data),
          });
          editingId = null;
        } else {
          await api(`/api/agent-room/workspaces/${workspace.id}/routines`, {
            method: 'POST',
            body: JSON.stringify(f.data),
          });
        }
        $formData.prompt = '';
        $formData.intervalMinutes = null;
        await refresh();
      } catch (error) {
        submitError = error instanceof Error ? error.message : 'Falha ao salvar rotina.';
      }
    },
  });

  const { form: formData, enhance } = form;

  function startEdit(routine: Routine) {
    editingId = routine.id;
    $formData.targetNodeId = routine.targetNodeId;
    $formData.prompt = routine.prompt;
    $formData.intervalMinutes = routine.intervalMinutes ?? null;
  }

  function cancelEdit() {
    editingId = null;
    $formData.prompt = '';
    $formData.intervalMinutes = null;
  }

  async function refresh() {
    routines = await api<Routine[]>(`/api/agent-room/workspaces/${workspace.id}/routines`);
  }

  async function toggle(routine: Routine) {
    await api(`/api/agent-room/workspaces/${workspace.id}/routines/${routine.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !routine.enabled }),
    });
    await refresh();
  }

  async function runNow(routine: Routine) {
    await api(`/api/agent-room/workspaces/${workspace.id}/routines/${routine.id}/run`, { method: 'POST' });
    await refresh();
  }

  async function remove(routine: Routine) {
    await api(`/api/agent-room/workspaces/${workspace.id}/routines/${routine.id}`, { method: 'DELETE' });
    await refresh();
  }

  async function showHistory(routine: Routine) {
    const runs = await api<Array<{ ranAt: string; ok: boolean; detail: string }>>(
      `/api/agent-room/workspaces/${workspace.id}/routines/${routine.id}/history`
    );
    historyFor = { id: routine.id, runs };
  }

  function terminalTitle(id: string) {
    return terminals.find((terminal) => terminal.id === id)?.title ?? id.slice(0, 8);
  }

  $effect(() => {
    refresh();
  });
</script>

<aside class="side-panel">
  <header class="panel-header">
    <h3>Rotinas</h3>
    <IconAction label="Fechar" onclick={onClose}><X size={14} /></IconAction>
  </header>

  {#each routines as routine (routine.id)}
    <div class="routine-item" class:disabled={!routine.enabled}>
      <div class="routine-info">
        <strong>{terminalTitle(routine.targetNodeId)}</strong>
        <small>
          {routine.intervalMinutes ? `a cada ${routine.intervalMinutes}min` : 'execucao unica'}
          · {routine.runCount}x
        </small>
        <p class="routine-prompt">{routine.prompt.split('\n')[0].replace(/^&&\s*/, '')}</p>
      </div>
      <div class="routine-actions">
        <HeaderIconButton label={routine.enabled ? 'Desativar' : 'Ativar'} class="node-action-btn" side="left" onclick={() => toggle(routine)}>
          {#if routine.enabled}<Pause size={13} />{:else}<Play size={13} />{/if}
        </HeaderIconButton>
        <IconAction label="Editar" onclick={() => (editingId === routine.id ? cancelEdit() : startEdit(routine))}><Pencil size={13} /></IconAction>
        <IconAction label="Rodar agora" onclick={() => runNow(routine)}><Zap size={13} /></IconAction>
        <IconAction label="Historico" onclick={() => showHistory(routine)}><Clock size={13} /></IconAction>
        <IconAction label="Excluir" danger onclick={() => remove(routine)}><Trash2 size={13} /></IconAction>
      </div>
      {#if historyFor?.id === routine.id}
        <ul class="history">
          {#each historyFor.runs as run}
            <li class:failed={!run.ok}>
              {new Date(run.ranAt).toLocaleString()} — {run.detail}
            </li>
          {:else}
            <li>Sem execucoes ainda.</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/each}
  {#if routines.length === 0}
    <p class="empty">Nenhuma rotina. Agende prompts para seus agentes.</p>
  {/if}

  <form method="POST" use:enhance class="routine-form">
    <Form.Field {form} name="targetNodeId">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Terminal alvo</Form.Label>
          <Select.Root
            type="single"
            value={$formData.targetNodeId as string | undefined}
            onValueChange={(value: string) => ($formData.targetNodeId = value)}
          >
            <Select.Trigger class="w-full" {...props}>
              {$formData.targetNodeId ? terminalTitle(String($formData.targetNodeId)) : 'Selecione o terminal'}
            </Select.Trigger>
            <Select.Content>
              {#each terminals as terminal}
                <Select.Item value={terminal.id}>{terminal.title}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Form.Field {form} name="prompt">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Prompt</Form.Label>
          <Textarea {...props} bind:value={$formData.prompt} placeholder="Prompt (&& na linha para etapas)" rows={3} />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Form.Field {form} name="intervalMinutes">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Intervalo (minutos, vazio = unica)</Form.Label>
          <Input {...props} type="number" min="1" bind:value={$formData.intervalMinutes} />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    {#if submitError}
      <p class="text-sm text-destructive">{submitError}</p>
    {/if}

    {#if editingId}
      <p class="editing-hint">Editando rotina — <button type="button" class="link-btn" onclick={cancelEdit}>cancelar</button></p>
    {/if}
    <Button type="submit" size="sm">{editingId ? 'Salvar alteracoes' : 'Criar rotina'}</Button>
  </form>
</aside>

<style>
  .side-panel {
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.07);
    background: #151238;
    padding: 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8b8c96;
  }

  .routine-item {
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    padding: 8px;
    font-size: 12px;
    background: #1C1946;
  }

  .routine-item.disabled {
    opacity: 0.5;
  }

  .routine-info small {
    color: #6d6d78;
    display: block;
  }

  .routine-prompt {
    margin: 4px 0 0;
    font-size: 11px;
    color: #8b8c96;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .routine-actions {
    display: flex;
    gap: 2px;
    margin-top: 6px;
  }

  .history {
    list-style: none;
    margin: 6px 0 0;
    padding: 6px;
    background: #0D0B2E;
    border-radius: 6px;
    font-size: 10px;
    color: #8b8c96;
    max-height: 120px;
    overflow-y: auto;
  }

  .history li.failed {
    color: #ffb3b6;
  }

  .empty {
    color: #6d6d78;
    font-size: 11px;
  }

  .routine-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    padding-top: 10px;
  }
  .editing-hint {
    margin: 0;
    font-size: 11px;
    color: #FFC857;
  }

  .link-btn {
    border: none;
    background: transparent;
    color: #7DE5FF;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
    text-decoration: underline;
  }
</style>
