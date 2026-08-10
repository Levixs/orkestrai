<script lang="ts">
  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import { FolderOpen, Plug, Trash2 } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { isLegacyEmojiIcon, WORKSPACE_ICONS } from '../workspace-icons.js';
  import type { Workspace } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  type Props = {
    workspace: Workspace;
    onSave: (changes: {
      name: string;
      workingDir: string;
      icon: string | null;
      instructions: string | null;
      syncAgentInstructionFiles: boolean;
    }) => Promise<void>;
    onClose: () => void;
  };

  let { workspace, onSave, onClose }: Props = $props();

  let submitError = $state('');
  let presetState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let presetMessage = $state('');

  // -- Servidores MCP do workspace (.mcp.json) ---------------------------------
  type McpServer = { name: string; command: string; args: string[]; builtin: boolean };
  let mcps = $state<McpServer[]>([]);
  let mcpName = $state('');
  let mcpCommand = $state('');
  let mcpArgs = $state('');
  let mcpError = $state('');

  async function loadMcps() {
    try {
      const response = await fetch(`/api/agent-room/workspaces/${workspace.id}/mcps`);
      mcps = (await response.json()).data ?? [];
    } catch {
      mcps = [];
    }
  }

  async function addMcp() {
    mcpError = '';
    const response = await fetch(`/api/agent-room/workspaces/${workspace.id}/mcps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: mcpName, command: mcpCommand, args: mcpArgs }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      mcpError = payload.error || m['dlg.edit_mcp_add_error']();
      return;
    }
    mcps = payload.data;
    mcpName = '';
    mcpCommand = '';
    mcpArgs = '';
  }

  async function removeMcp(name: string) {
    const response = await fetch(`/api/agent-room/workspaces/${workspace.id}/mcps?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    const payload = await response.json();
    if (payload.data) mcps = payload.data;
  }

  /** Snapshot do workspace atual como preset reutilizavel (time, layout, roles...). */
  async function saveAsPreset() {
    presetState = 'saving';
    presetMessage = '';
    try {
      const response = await fetch('/api/agent-room/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, name: workspace.name, icon: workspace.icon }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || m['dlg.preset_save_error']());
      presetState = 'saved';
      presetMessage = m['dlg.preset_saved']({ name: payload.data.name });
    } catch (error) {
      presetState = 'error';
      presetMessage = error instanceof Error ? error.message : m['dlg.preset_save_error']();
    }
  }

  const desktop = typeof window !== 'undefined'
    ? (window as unknown as { orkestraiDesktop?: { pickDirectory: () => Promise<string | null> } }).orkestraiDesktop
    : undefined;

  // Variante do schema compartilhado com todos os campos presentes (o form
  // sempre envia o estado completo do workspace).
  const editWorkspaceFormSchema = z.object({
    name: z.string().trim().min(1, m['dlg.ws_name_required']()),
    workingDir: z.string().trim().min(1, m['dlg.ws_dir_required']()),
    icon: z.string().trim().nullable(),
    instructions: z.string().trim().nullable(),
    syncAgentInstructionFiles: z.boolean(),
  });
  // Cast por causa do zod aninhado do superforms (4.x) vs zod 3.25 do app.
  const schema = editWorkspaceFormSchema as unknown as Parameters<typeof zod>[0];

  const form = superForm(
    defaults(
      {
        name: workspace.name,
        workingDir: workspace.workingDir,
        icon: workspace.icon ?? null,
        instructions: workspace.instructions ?? null,
        syncAgentInstructionFiles: workspace.syncAgentInstructionFiles,
      },
      zod(schema)
    ),
    {
      SPA: true,
      validators: zod(schema),
      async onUpdate({ form: f }) {
        if (!f.valid) return;
        submitError = '';
        try {
          await onSave({
            name: f.data.name,
            workingDir: f.data.workingDir,
            icon: f.data.icon?.trim() || null,
            instructions: f.data.instructions?.trim() || null,
            syncAgentInstructionFiles: f.data.syncAgentInstructionFiles,
          });
          onClose();
        } catch (error) {
          submitError = error instanceof Error ? error.message : m['dlg.ws_save_error']();
        }
      },
    }
  );

  const { form: formData, enhance } = form;

  onMount(loadMcps);

  async function pickDirectory() {
    if (!desktop) return;
    const dir = await desktop.pickDirectory();
    if (dir) $formData.workingDir = dir;
  }
</script>

<Dialog.Root open onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{m['dlg.edit_ws_title']()}</Dialog.Title>
      <Dialog.Description>{m['dlg.edit_ws_desc']()}</Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="space-y-4">
      <Form.Field {form} name="name">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>{m['dlg.name']()}</Form.Label>
            <Input {...props} bind:value={$formData.name} />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="workingDir">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>{m['dlg.working_dir']()}</Form.Label>
            <div class="flex gap-2">
              <Input {...props} bind:value={$formData.workingDir} class="flex-1" />
              {#if desktop}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button {...props} type="button" variant="outline" size="icon" aria-label={m['dlg.pick_folder']()} onclick={pickDirectory}>
                        <FolderOpen size={15} />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top">{m['dlg.pick_folder']()}</Tooltip.Content>
                </Tooltip.Root>
              {/if}
            </div>
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <div class="field">
        <span class="text-sm font-medium leading-none">{m['dlg.ws_icon']()}</span>
        <div class="icon-picker" role="radiogroup" aria-label={m['dlg.ws_icon']()}>
          {#each WORKSPACE_ICONS as option (option.name)}
            {@const OptionIcon = option.component}
            <button
              type="button"
              class="icon-option"
              class:selected={($formData.icon ?? null) === option.name}
              role="radio"
              aria-checked={($formData.icon ?? null) === option.name}
              aria-label={option.name}
              onclick={() => ($formData.icon = ($formData.icon ?? null) === option.name ? null : option.name)}
            >
              <OptionIcon size={15} />
            </button>
          {/each}
        </div>
        {#if isLegacyEmojiIcon($formData.icon)}
          <p class="icon-legacy-hint">{m['dlg.icon_legacy_hint']({ icon: $formData.icon ?? '' })}</p>
        {/if}
      </div>

      <Form.Field {form} name="instructions">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>{m['dlg.agent_instructions']()}</Form.Label>
            <Textarea {...props} bind:value={$formData.instructions} rows={5} placeholder={m['ph.ws_instructions']()} />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="syncAgentInstructionFiles">
        <Form.Control>
          {#snippet children({ props })}
            <div class="flex items-center gap-2">
              <Checkbox {...props} checked={$formData.syncAgentInstructionFiles} onCheckedChange={(value: boolean | 'indeterminate') => ($formData.syncAgentInstructionFiles = value === true)} />
              <Form.Label>{m['dlg.sync_instruction_files']()}</Form.Label>
            </div>
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      {#if submitError}
        <p class="text-sm text-destructive">{submitError}</p>
      {/if}

      <div class="rounded-lg border border-border/60 p-3 space-y-2">
        <div class="flex items-center gap-2">
          <Plug size={13} class="text-muted-foreground" />
          <span class="text-sm font-medium">{m['dlg.mcp_title']()}</span>
        </div>
        <p class="text-xs text-muted-foreground">
          {m['dlg.mcp_desc']()}
        </p>
        {#if mcps.length}
          <ul class="space-y-1">
            {#each mcps as server (server.name)}
              <li class="flex items-center gap-2 text-xs rounded-md bg-muted/40 px-2 py-1.5">
                <span class="font-medium">{server.name}</span>
                <span class="text-muted-foreground truncate flex-1">{server.command} {server.args.join(' ')}</span>
                {#if server.builtin}
                  <span class="text-[10px] text-emerald-400">{m['dlg.mcp_builtin']()}</span>
                {:else}
                  <button type="button" class="text-muted-foreground hover:text-destructive" aria-label={m['dlg.mcp_remove']({ name: server.name })} onclick={() => removeMcp(server.name)}>
                    <Trash2 size={12} />
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        <div class="flex gap-2">
          <Input bind:value={mcpName} placeholder={m['ph.mcp_name']()} class="w-28 h-8 text-xs" />
          <Input bind:value={mcpCommand} placeholder={m['ph.mcp_command']()} class="w-40 h-8 text-xs" />
          <Input bind:value={mcpArgs} placeholder={m['ph.mcp_args']()} class="flex-1 h-8 text-xs" />
          <Button type="button" variant="outline" size="sm" disabled={!mcpName.trim() || !mcpCommand.trim()} onclick={addMcp}>
            {m['dlg.add']()}
          </Button>
        </div>
        {#if mcpError}
          <p class="text-xs text-destructive">{mcpError}</p>
        {/if}
      </div>

      <div class="rounded-lg border border-border/60 p-3 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-muted-foreground">
            {m['dlg.preset_hint']()}
          </p>
          <Button type="button" variant="outline" size="sm" disabled={presetState === 'saving'} onclick={saveAsPreset}>
            {presetState === 'saving' ? m['dlg.saving']() : m['dlg.save_as_preset']()}
          </Button>
        </div>
        {#if presetMessage}
          <p class="text-xs {presetState === 'error' ? 'text-destructive' : 'text-emerald-400'}">{presetMessage}</p>
        {/if}
      </div>

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onClose}>{m['dlg.cancel']()}</Button>
        <Button type="submit">{m['dlg.save']()}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  .icon-picker {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
  }

  .icon-option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    border-radius: 8px;
    border: 1px solid var(--app-border);
    background: transparent;
    color: var(--app-text-muted);
    cursor: pointer;
    transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
  }

  .icon-option:hover {
    color: var(--app-text);
    background: var(--app-border);
  }

  .icon-option.selected {
    color: #fff;
    border-color: rgba(91, 141, 239, 0.6);
    background: rgba(91, 141, 239, 0.18);
  }

  .icon-legacy-hint {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--app-text-muted);
  }
</style>
