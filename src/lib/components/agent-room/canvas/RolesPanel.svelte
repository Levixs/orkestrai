<script lang="ts">
  import HeaderIconButton from './HeaderIconButton.svelte';

  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Button } from '$lib/components/ui/button';
  import { Pencil, ScanSearch, Trash2, X } from '@lucide/svelte';
  import type { Workspace } from '$lib/modules/agent-room/domain/types.js';
  import type { AgentRole } from '$lib/modules/agent-room/application/services/RoleService.js';

  type Props = {
    workspace: Workspace;
    onClose: () => void;
    api: <T>(path: string, init?: RequestInit) => Promise<T>;
  };

  let { workspace, onClose, api }: Props = $props();

  let roles = $state<AgentRole[]>([]);
  let errorMessage = $state('');
  let infoMessage = $state('');
  /** Slug da role em edicao (null = criando nova). */
  let editingSlug = $state<string | null>(null);

  const roleFormSchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome.'),
    color: z.string().trim().default('#7C4DFF'),
    prompt: z.string().trim().min(1, 'Informe as instrucoes.'),
  });
  // Cast por causa do zod aninhado do superforms (4.x) vs zod 3.25 do app.
  const schema = roleFormSchema as unknown as Parameters<typeof zod>[0];

  const form = superForm(defaults({ name: '', color: '#7C4DFF', prompt: '' }, zod(schema)), {
    SPA: true,
    validators: zod(schema),
    async onUpdate({ form: f }) {
      if (!f.valid) return;
      errorMessage = '';
      try {
        // Renomear muda o slug: remove a antiga antes de salvar a nova.
        if (editingSlug) {
          const currentSlug = f.data.name.trim().toLowerCase().replace(/\s+/g, '-');
          if (currentSlug !== editingSlug) {
            await api(`/api/agent-room/workspaces/${workspace.id}/roles/${editingSlug}`, { method: 'DELETE' }).catch(() => {});
          }
        }
        await api(`/api/agent-room/workspaces/${workspace.id}/roles`, {
          method: 'POST',
          body: JSON.stringify(f.data),
        });
        $formData.name = '';
        $formData.prompt = '';
        editingSlug = null;
        await refresh();
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Falha ao salvar.';
      }
    },
  });

  const { form: formData, enhance } = form;

  function startEdit(role: AgentRole) {
    editingSlug = role.slug;
    $formData.name = role.name;
    $formData.color = role.color;
    $formData.prompt = role.prompt;
  }

  function cancelEdit() {
    editingSlug = null;
    $formData.name = '';
    $formData.color = '#7C4DFF';
    $formData.prompt = '';
  }

  async function refresh() {
    roles = await api<AgentRole[]>(`/api/agent-room/workspaces/${workspace.id}/roles`);
  }

  async function discover() {
    errorMessage = '';
    infoMessage = '';
    try {
      const result = await api<{ imported: number; roles: AgentRole[] }>(
        `/api/agent-room/workspaces/${workspace.id}/roles/discover`,
        { method: 'POST' }
      );
      infoMessage = result.imported
        ? `${result.imported} responsabilidade(s) importada(s).`
        : 'Nenhuma role.json nova encontrada no repositorio.';
      await refresh();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao descobrir.';
    }
  }

  async function remove(role: AgentRole) {
    await api(`/api/agent-room/workspaces/${workspace.id}/roles/${role.slug}`, { method: 'DELETE' });
    await refresh();
  }

  $effect(() => {
    refresh();
  });
</script>

<aside class="side-panel">
  <header class="panel-header">
    <h3>Responsabilidades</h3>
    <div class="panel-header-actions">
      <HeaderIconButton label="Descobrir no repositorio" class="node-action-btn" side="left" onclick={discover}><ScanSearch size={14} /></HeaderIconButton>
      <HeaderIconButton label="Fechar" class="node-action-btn" side="left" onclick={onClose}><X size={14} /></HeaderIconButton>
    </div>
  </header>

  <p class="hint">
    Roles sao conjuntos de instrucoes injetados no inicio do agente. Ficam em
    <code>.orkestrai/roles/</code> e viajam com o repositorio.
  </p>

  {#each roles as role (role.slug)}
    <div class="role-item" class:editing={editingSlug === role.slug}>
      <span class="role-color" style:background={role.color}></span>
      <div class="role-info">
        <strong>{role.name}</strong>
        <small>{role.slug} · {role.prompt.length} chars</small>
      </div>
      <HeaderIconButton label="Editar" class="node-action-btn" side="left" onclick={() => (editingSlug === role.slug ? cancelEdit() : startEdit(role))}><Pencil size={13} /></HeaderIconButton>
      <HeaderIconButton label="Excluir" class="node-action-btn" danger side="left" onclick={() => remove(role)}><Trash2 size={13} /></HeaderIconButton>
    </div>
  {/each}
  {#if roles.length === 0}
    <p class="empty">Nenhuma responsabilidade. Crie ou descubra no repositorio.</p>
  {/if}

  {#if infoMessage}
    <p class="info">{infoMessage}</p>
  {/if}
  {#if errorMessage}
    <p class="text-sm text-destructive">{errorMessage}</p>
  {/if}

  <form method="POST" use:enhance class="role-form">
    {#if editingSlug}
      <p class="editing-hint">Editando “{editingSlug}” — <button type="button" class="link-btn" onclick={cancelEdit}>cancelar</button></p>
    {/if}
    <Form.Field {form} name="name">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Nome</Form.Label>
          <Input {...props} bind:value={$formData.name} placeholder="Revisor" />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Form.Field {form} name="prompt">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>Instrucoes</Form.Label>
          <Textarea {...props} bind:value={$formData.prompt} rows={4} placeholder="Voce revisa codigo com foco em seguranca e clareza..." />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Button type="submit" size="sm">{editingSlug ? 'Salvar alteracoes' : 'Salvar responsabilidade'}</Button>
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

  .panel-header-actions {
    display: flex;
    gap: 2px;
  }

  .hint {
    margin: 0;
    font-size: 10px;
    color: #6d6d78;
    line-height: 1.5;
  }

  .role-item {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    padding: 8px;
    background: #1C1946;
  }

  .role-color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .role-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .role-info small {
    color: #6d6d78;
    font-size: 10px;
  }

  .empty {
    color: #6d6d78;
    font-size: 11px;
  }

  .info {
    color: #8ec98e;
    font-size: 11px;
  }

  .role-form {
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

  .role-item.editing {
    border-color: rgba(91, 141, 239, 0.5);
  }
</style>
