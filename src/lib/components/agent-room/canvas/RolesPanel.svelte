<script lang="ts">
  import HeaderIconButton from './HeaderIconButton.svelte';

  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import MarkdownView from '../MarkdownView.svelte';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Button } from '$lib/components/ui/button';
  import { Pencil, ScanSearch, Trash2, X } from '@lucide/svelte';
  import type { Workspace } from '$lib/modules/agent-room/domain/types.js';
  import type { AgentRole } from '$lib/modules/agent-room/application/services/RoleService.js';
  import * as m from '$lib/paraglide/messages.js';

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
    name: z.string().trim().min(1, m['roles.error_name_required']()),
    color: z.string().trim().default('#7C4DFF'),
    prompt: z.string().trim().min(1, m['roles.error_prompt_required']()),
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
        errorMessage = error instanceof Error ? error.message : m['roles.error_save']();
      }
    },
  });

  const { form: formData, enhance } = form;

  // Editor markdown: aba Escrever (textarea) x Preview (renderizado).
  let promptTab = $state<'edit' | 'preview'>('edit');

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
        ? m['roles.imported']({ count: result.imported })
        : m['roles.none_found']();
      await refresh();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : m['roles.error_discover']();
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
    <h3>{m['roles.title']()}</h3>
    <div class="panel-header-actions">
      <HeaderIconButton label={m['roles.discover']()} class="node-action-btn" side="left" onclick={discover}><ScanSearch size={14} /></HeaderIconButton>
      <HeaderIconButton label={m['roles.close']()} class="node-action-btn" side="left" onclick={onClose}><X size={14} /></HeaderIconButton>
    </div>
  </header>

  <p class="hint">
    {m['roles.hint_1']()}
    <code>.orkestrai/roles/</code> {m['roles.hint_2']()}
    <strong>markdown</strong> {m['roles.hint_3']()}
  </p>

  {#each roles as role (role.slug)}
    <div class="role-item" class:editing={editingSlug === role.slug}>
      <span class="role-color" style:background={role.color}></span>
      <div class="role-info">
        <strong>{role.name}</strong>
        <small>{role.slug} · {m['roles.char_count']({ count: role.prompt.length })}</small>
      </div>
      <HeaderIconButton label={m['roles.edit']()} class="node-action-btn" side="left" onclick={() => (editingSlug === role.slug ? cancelEdit() : startEdit(role))}><Pencil size={13} /></HeaderIconButton>
      <HeaderIconButton label={m['roles.delete']()} class="node-action-btn" danger side="left" onclick={() => remove(role)}><Trash2 size={13} /></HeaderIconButton>
    </div>
  {/each}
  {#if roles.length === 0}
    <p class="empty">{m['roles.empty']()}</p>
  {/if}

  {#if infoMessage}
    <p class="info">{infoMessage}</p>
  {/if}
  {#if errorMessage}
    <p class="text-sm text-destructive">{errorMessage}</p>
  {/if}

  <form method="POST" use:enhance class="role-form">
    {#if editingSlug}
      <p class="editing-hint">{m['roles.editing']({ slug: editingSlug })} — <button type="button" class="link-btn" onclick={cancelEdit}>{m['settings.cancel']()}</button></p>
    {/if}
    <Form.Field {form} name="name">
      <Form.Control>
        {#snippet children({ props })}
          <Form.Label>{m['roles.name_label']()}</Form.Label>
          <Input {...props} bind:value={$formData.name} placeholder={m['ph.role_name']()} />
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Form.Field {form} name="prompt">
      <Form.Control>
        {#snippet children({ props })}
          <div class="prompt-head">
            <Form.Label>{m['roles.prompt_label']()}</Form.Label>
            <div class="prompt-tabs" role="tablist">
              <button type="button" class:active={promptTab === 'edit'} role="tab" onclick={() => (promptTab = 'edit')}>{m['roles.tab_write']()}</button>
              <button type="button" class:active={promptTab === 'preview'} role="tab" onclick={() => (promptTab = 'preview')}>{m['roles.tab_preview']()}</button>
            </div>
          </div>
          {#if promptTab === 'edit'}
            <Textarea {...props} bind:value={$formData.prompt} rows={8} placeholder={m['roles.prompt_ph']()} />
          {:else}
            <div class="md-preview">
              {#if $formData.prompt.trim()}
                <MarkdownView content={$formData.prompt} />
              {:else}
                <span class="md-empty">{m['roles.preview_empty']()}</span>
              {/if}
            </div>
          {/if}
        {/snippet}
      </Form.Control>
      <Form.FieldErrors />
    </Form.Field>

    <Button type="submit" size="sm">{editingSlug ? m['settings.save']() : m['roles.save']()}</Button>
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

  .prompt-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .prompt-tabs {
    display: inline-flex;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    overflow: hidden;
  }

  .prompt-tabs button {
    border: none;
    background: transparent;
    color: #8b8c96;
    font-size: 10px;
    padding: 3px 10px;
    cursor: pointer;
  }

  .prompt-tabs button.active {
    background: rgba(124, 77, 255, 0.2);
    color: #e6e6eb;
  }

  .md-preview {
    min-height: 160px;
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.25);
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.55;
    color: #d7d8de;
  }

  .md-preview :global(h1), .md-preview :global(h2), .md-preview :global(h3) {
    color: #e6e6eb;
    font-size: 13px;
    margin: 10px 0 4px;
  }

  .md-preview :global(h1:first-child), .md-preview :global(h2:first-child), .md-preview :global(h3:first-child) {
    margin-top: 0;
  }

  .md-preview :global(p) { margin: 6px 0; }
  .md-preview :global(ul), .md-preview :global(ol) { padding-left: 18px; margin: 6px 0; }
  .md-preview :global(li) { margin: 2px 0; }

  .md-preview :global(code) {
    background: #262155;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 11px;
  }

  .md-preview :global(pre) {
    background: #0d0b2e;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px 10px;
    overflow-x: auto;
    margin: 8px 0;
  }

  .md-preview :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .md-preview :global(blockquote) {
    border-left: 3px solid #7c4dff;
    margin: 8px 0;
    padding: 2px 10px;
    color: #b7b8c4;
  }

  .md-preview :global(a) { color: #7de5ff; }
  .md-preview :global(strong) { color: #e6e6eb; }

  .md-empty {
    font-size: 11px;
    color: #6d6d78;
    font-style: italic;
  }
</style>
