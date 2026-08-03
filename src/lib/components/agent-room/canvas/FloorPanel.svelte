<script lang="ts">
  import IconAction from './IconAction.svelte';
  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import { Plane, Play, Trash2, X, Zap } from '@lucide/svelte';
  import { createFloorSchema } from '$lib/modules/agent-room/contracts/schemas/floorSchemas.js';
  import type { Floor, Workspace, WorkspaceHooks } from '$lib/modules/agent-room/domain/types.js';

  type Props = {
    workspace: Workspace;
    visibleFloorId: string | null;
    onSelectFloor: (floorId: string | null) => void;
    onClose: () => void;
    api: <T>(path: string, init?: RequestInit) => Promise<T>;
  };

  let { workspace, visibleFloorId, onSelectFloor, onClose, api }: Props = $props();

  // Cast por causa do zod aninhado do superforms (4.x) vs zod 3.25 do app.
  const schema = createFloorSchema as unknown as Parameters<typeof zod>[0];

  let floors = $state<Floor[]>([]);
  let errorMessage = $state('');
  let landingPreview = $state<{ floor: Floor; from: string; to: string; stat: string; conflicts: string[]; targetDirty: boolean } | null>(null);
  let hooks = $state<WorkspaceHooks>({});
  let showHooks = $state(false);
  let hooksText = $state({ setup: '', run: '', teardown: '' });

  const form = superForm(defaults({ name: '', branch: undefined, existingBranch: false, cloneLayout: false }, zod(schema)), {
    SPA: true,
    validators: zod(schema),
    async onUpdate({ form: f }) {
      if (!f.valid) return;
      errorMessage = '';
      try {
        await api(`/api/agent-room/workspaces/${workspace.id}/floors`, {
          method: 'POST',
          body: JSON.stringify({
            name: f.data.name,
            branch: f.data.branch || undefined,
            existingBranch: f.data.existingBranch,
            cloneLayout: f.data.cloneLayout,
          }),
        });
        $formData.name = '';
        $formData.branch = undefined;
        $formData.cloneLayout = false;
        await refresh();
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Falha ao criar andar.';
      }
    },
  });

  const { form: formData, enhance } = form;

  async function refresh() {
    floors = await api<Floor[]>(`/api/agent-room/workspaces/${workspace.id}/floors`);
  }

  async function loadHooks() {
    hooks = await api<WorkspaceHooks>(`/api/agent-room/workspaces/${workspace.id}/hooks`);
    hooksText = {
      setup: (hooks.setup ?? []).map((hook) => hook.command).join('\n'),
      run: (hooks.run ?? []).map((hook) => hook.command).join('\n'),
      teardown: (hooks.teardown ?? []).map((hook) => hook.command).join('\n'),
    };
  }

  async function removeFloor(floor: Floor, deleteBranch: boolean) {
    await api(`/api/agent-room/workspaces/${workspace.id}/floors/${floor.id}?deleteBranch=${deleteBranch}`, {
      method: 'DELETE',
    });
    if (visibleFloorId === floor.id) onSelectFloor(null);
    await refresh();
  }

  async function previewLanding(floor: Floor) {
    errorMessage = '';
    try {
      const preview = await api<{ from: string; to: string; stat: string; conflicts: string[]; targetDirty: boolean }>(
        `/api/agent-room/workspaces/${workspace.id}/floors/${floor.id}/preview`
      );
      landingPreview = { floor, ...preview };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha no preview.';
    }
  }

  async function confirmLanding() {
    if (!landingPreview) return;
    errorMessage = '';
    try {
      await api(`/api/agent-room/workspaces/${workspace.id}/floors/${landingPreview.floor.id}/land`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (visibleFloorId === landingPreview.floor.id) onSelectFloor(null);
      landingPreview = null;
      await refresh();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao aterrissar.';
    }
  }

  async function saveHooks() {
    const parse = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean).map((command) => ({ command }));
    await api(`/api/agent-room/workspaces/${workspace.id}/hooks`, {
      method: 'PUT',
      body: JSON.stringify({
        setup: parse(hooksText.setup),
        run: parse(hooksText.run),
        teardown: parse(hooksText.teardown),
        autoRunSetup: hooks.autoRunSetup ?? false,
      }),
    });
    showHooks = false;
  }

  async function runHooksNow(floor: Floor, kind: 'setup' | 'run' | 'teardown') {
    errorMessage = '';
    try {
      const results = await api<Array<{ command: string; ok: boolean }>>(
        `/api/agent-room/workspaces/${workspace.id}/floors/${floor.id}/hooks/run`,
        { method: 'POST', body: JSON.stringify({ kind }) }
      );
      const failed = results.filter((result) => !result.ok);
      if (failed.length) errorMessage = `${failed.length} hook(s) falharam.`;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao rodar hooks.';
    }
  }

  $effect(() => {
    refresh();
    loadHooks();
  });
</script>

<aside class="side-panel">
  <header class="panel-header">
    <h3>Andares</h3>
    <div class="panel-header-actions">
      <IconAction label="Hooks" onclick={() => (showHooks = !showHooks)}><Zap size={14} /></IconAction>
      <IconAction label="Fechar" onclick={onClose}><X size={14} /></IconAction>
    </div>
  </header>

  <button class="floor-item" class:active={visibleFloorId === null} onclick={() => onSelectFloor(null)}>
    Térreo
  </button>

  {#each floors as floor (floor.id)}
    <div class="floor-item" class:active={visibleFloorId === floor.id}>
      <button class="floor-open" onclick={() => onSelectFloor(floor.id)}>
        <strong>{floor.name}</strong>
        <small>{floor.branch}</small>
      </button>
      <div class="floor-actions">
        <IconAction label="Preview aterrissagem" onclick={() => previewLanding(floor)}><Plane size={13} /></IconAction>
        <IconAction label="Rodar hooks run" onclick={() => runHooksNow(floor, 'run')}><Play size={13} /></IconAction>
        <IconAction label="Excluir (manter branch)" onclick={() => removeFloor(floor, false)}><X size={13} /></IconAction>
        <IconAction label="Excluir (apagar branch)" danger onclick={() => removeFloor(floor, true)}><Trash2 size={13} /></IconAction>
      </div>
    </div>
  {/each}

  <form method="POST" use:enhance class="floor-form">
    <Form.Field {form} name="name">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Nome do andar</Form.Label>
          <Input {...props} bind:value={$formData.name} placeholder="Nome do andar" />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Form.Field {form} name="branch">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Branch (opcional)</Form.Label>
          <Input {...props} bind:value={$formData.branch} placeholder="orkestrai/meu-andar" />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Form.Field {form} name="cloneLayout">
      <Form.Control>
        {#snippet children({ props })}
          <div class="flex items-center gap-2">
            <Checkbox {...props} checked={$formData.cloneLayout} onCheckedChange={(value: boolean | 'indeterminate') => ($formData.cloneLayout = value === true)} />
            <Form.Label>Clonar layout do Térreo</Form.Label>
          </div>
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    {#if errorMessage}
      <p class="text-sm text-destructive">{errorMessage}</p>
    {/if}

    <Button type="submit" size="sm">Criar andar</Button>
  </form>

  {#if landingPreview}
    <div class="landing-preview">
      <h4>Aterrissar {landingPreview.floor.name}</h4>
      <p class="preview-route">{landingPreview.from} → {landingPreview.to}</p>
      {#if landingPreview.stat}
        <pre>{landingPreview.stat}</pre>
      {:else}
        <p class="muted">Sem diferenças.</p>
      {/if}
      {#if landingPreview.conflicts.length}
        <p class="conflict">Conflitos potenciais: {landingPreview.conflicts.join(', ')}</p>
      {/if}
      {#if landingPreview.targetDirty}
        <p class="conflict">O checkout principal tem alterações não commitadas.</p>
      {/if}
      <div class="preview-actions">
        <Button variant="outline" size="sm" onclick={() => (landingPreview = null)}>Cancelar</Button>
        <Button size="sm" onclick={confirmLanding} disabled={landingPreview.targetDirty}>Aterrissar</Button>
      </div>
    </div>
  {/if}

  {#if showHooks}
    <div class="hooks-editor">
      <h4>Hooks</h4>
      <label>Setup (ao criar andar)<Textarea bind:value={hooksText.setup} rows={2} /></label>
      <label>Run (botão play)<Textarea bind:value={hooksText.run} rows={2} /></label>
      <label>Teardown (ao excluir/aterrissar)<Textarea bind:value={hooksText.teardown} rows={2} /></label>
      <div class="flex items-center gap-2">
        <Checkbox checked={hooks.autoRunSetup ?? false} onCheckedChange={(value: boolean | 'indeterminate') => (hooks = { ...hooks, autoRunSetup: value === true })} />
        <span class="text-xs text-muted-foreground">Auto-run setup ao criar andar</span>
      </div>
      <Button size="sm" onclick={saveHooks}>Salvar hooks</Button>
    </div>
  {/if}
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

  .panel-header-actions {
    display: flex;
    gap: 2px;
  }

  .floor-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 7px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #e6e6eb;
    font-size: 12px;
  }

  .floor-item.active {
    background: rgba(255, 255, 255, 0.07);
  }

  .floor-open {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .floor-open small {
    color: #6d6d78;
  }

  .floor-actions {
    display: flex;
  }

  .floor-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    padding-top: 10px;
  }

  .landing-preview {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px;
    font-size: 11px;
    background: #1C1946;
  }

  .landing-preview h4 {
    margin: 0 0 4px;
  }

  .preview-route {
    color: #8b8c96;
    margin: 0 0 6px;
  }

  .landing-preview pre {
    font-size: 10px;
    overflow-x: auto;
    background: #0D0B2E;
    padding: 6px;
    border-radius: 6px;
  }

  .conflict {
    color: #ffb3b6;
  }

  .muted {
    color: #6d6d78;
  }

  .preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .hooks-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    padding-top: 10px;
  }

  .hooks-editor h4 {
    margin: 0;
    font-size: 12px;
  }

  .hooks-editor label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 10px;
    color: #8b8c96;
  }
</style>
