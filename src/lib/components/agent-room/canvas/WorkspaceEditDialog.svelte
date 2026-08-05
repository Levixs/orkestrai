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
      mcpError = payload.error || 'Falha ao adicionar.';
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
      if (!response.ok || payload.error) throw new Error(payload.error || 'Falha ao salvar preset.');
      presetState = 'saved';
      presetMessage = `Preset "${payload.data.name}" salvo — aparece ao criar um workspace novo.`;
    } catch (error) {
      presetState = 'error';
      presetMessage = error instanceof Error ? error.message : 'Falha ao salvar preset.';
    }
  }

  const desktop = typeof window !== 'undefined'
    ? (window as unknown as { orkestraiDesktop?: { pickDirectory: () => Promise<string | null> } }).orkestraiDesktop
    : undefined;

  // Variante do schema compartilhado com todos os campos presentes (o form
  // sempre envia o estado completo do workspace).
  const editWorkspaceFormSchema = z.object({
    name: z.string().trim().min(1, 'Informe o nome do workspace.'),
    workingDir: z.string().trim().min(1, 'Informe o diretorio de trabalho.'),
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
          submitError = error instanceof Error ? error.message : 'Falha ao salvar workspace.';
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
      <Dialog.Title>Editar workspace</Dialog.Title>
      <Dialog.Description>Diretorio, icone e instrucoes injetadas nos agentes (AGENTS.md/CLAUDE.md).</Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="space-y-4">
      <Form.Field {form} name="name">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Nome</Form.Label>
            <Input {...props} bind:value={$formData.name} />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="workingDir">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Diretorio de trabalho</Form.Label>
            <div class="flex gap-2">
              <Input {...props} bind:value={$formData.workingDir} class="flex-1" />
              {#if desktop}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button {...props} type="button" variant="outline" size="icon" aria-label="Escolher pasta" onclick={pickDirectory}>
                        <FolderOpen size={15} />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top">Escolher pasta</Tooltip.Content>
                </Tooltip.Root>
              {/if}
            </div>
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="icon">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Icone do workspace</Form.Label>
            <div class="icon-picker" role="radiogroup" aria-label="Icone do workspace">
              {#each WORKSPACE_ICONS as option (option.name)}
                {@const OptionIcon = option.component}
                <button
                  {...props}
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
              <p class="icon-legacy-hint">Icone antigo (emoji {$formData.icon}) mantido — escolha um novo acima para trocar.</p>
            {/if}
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="instructions">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Instrucoes dos agentes (AGENTS.md)</Form.Label>
            <Textarea {...props} bind:value={$formData.instructions} rows={5} placeholder="Convencoes do projeto, contexto, instrucoes recorrentes..." />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="syncAgentInstructionFiles">
        <Form.Control>
          {#snippet children({ props })}
            <div class="flex items-center gap-2">
              <Checkbox {...props} checked={$formData.syncAgentInstructionFiles} onCheckedChange={(value: boolean | 'indeterminate') => ($formData.syncAgentInstructionFiles = value === true)} />
              <Form.Label>Manter CLAUDE.md e AGENTS.md sincronizados</Form.Label>
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
          <span class="text-sm font-medium">Servidores MCP (.mcp.json)</span>
        </div>
        <p class="text-xs text-muted-foreground">
          Tools externas para os agentes deste workspace (Claude Code, Kimi... leem da raiz do projeto).
        </p>
        {#if mcps.length}
          <ul class="space-y-1">
            {#each mcps as server (server.name)}
              <li class="flex items-center gap-2 text-xs rounded-md bg-muted/40 px-2 py-1.5">
                <span class="font-medium">{server.name}</span>
                <span class="text-muted-foreground truncate flex-1">{server.command} {server.args.join(' ')}</span>
                {#if server.builtin}
                  <span class="text-[10px] text-emerald-400">da ponte</span>
                {:else}
                  <button type="button" class="text-muted-foreground hover:text-destructive" aria-label={`Remover ${server.name}`} onclick={() => removeMcp(server.name)}>
                    <Trash2 size={12} />
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        <div class="flex gap-2">
          <Input bind:value={mcpName} placeholder="nome" class="w-28 h-8 text-xs" />
          <Input bind:value={mcpCommand} placeholder="comando (npx, node, uvx)" class="w-40 h-8 text-xs" />
          <Input bind:value={mcpArgs} placeholder="args (ex.: -y @mcp/fs ./data)" class="flex-1 h-8 text-xs" />
          <Button type="button" variant="outline" size="sm" disabled={!mcpName.trim() || !mcpCommand.trim()} onclick={addMcp}>
            Adicionar
          </Button>
        </div>
        {#if mcpError}
          <p class="text-xs text-destructive">{mcpError}</p>
        {/if}
      </div>

      <div class="rounded-lg border border-border/60 p-3 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-muted-foreground">
            Guarde este time (agentes, layout, notas, roles, rotinas) como preset reutilizavel.
          </p>
          <Button type="button" variant="outline" size="sm" disabled={presetState === 'saving'} onclick={saveAsPreset}>
            {presetState === 'saving' ? 'Salvando...' : 'Salvar como preset'}
          </Button>
        </div>
        {#if presetMessage}
          <p class="text-xs {presetState === 'error' ? 'text-destructive' : 'text-emerald-400'}">{presetMessage}</p>
        {/if}
      </div>

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onClose}>Cancelar</Button>
        <Button type="submit">Salvar</Button>
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
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
    transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
  }

  .icon-option:hover {
    color: #e6e6eb;
    background: rgba(255, 255, 255, 0.06);
  }

  .icon-option.selected {
    color: #fff;
    border-color: rgba(91, 141, 239, 0.6);
    background: rgba(91, 141, 239, 0.18);
  }

  .icon-legacy-hint {
    margin: 4px 0 0;
    font-size: 11px;
    color: #6d6d78;
  }
</style>
