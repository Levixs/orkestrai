<script lang="ts">
  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import { z } from 'zod';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import * as Select from '$lib/components/ui/select';
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
      runtimeKind: 'native' | 'wsl';
      wslDistribution: string | null;
      wslWorkingDir: string | null;
    }) => Promise<void>;
    onClose: () => void;
  };

  type EditWorkspaceFormData = {
    name: string;
    workingDir: string;
    icon: string | null;
    instructions: string | null;
    syncAgentInstructionFiles: boolean;
  };

  let { workspace, onSave, onClose }: Props = $props();

  let submitError = $state('');
  let presetState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let presetMessage = $state('');
  let runtimeKind = $state<'native' | 'wsl'>(workspace.runtimeKind);
  let wslDistribution = $state(workspace.wslDistribution ?? '');
  let wslWorkingDir = $state(workspace.wslWorkingDir ?? '');
  let wsl = $state<{ supported: boolean; distributions: Array<{ name: string }>; inferred: { distribution: string; linuxWorkingDir: string } | null; error: string | null }>({
    supported: false,
    distributions: [],
    inferred: null,
    error: null,
  });

  // -- Servidores MCP do workspace (.mcp.json) ---------------------------------
  type McpServer = { name: string; command: string; args: string[]; builtin: boolean };
  let mcps = $state<McpServer[]>([]);
  let mcpName = $state('');
  let mcpCommand = $state('');
  let mcpArgs = $state('');
  let mcpError = $state('');

  function mutationHeaders(json = false): Record<string, string> {
    const token = getCsrfToken();
    return {
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(token ? { 'X-CSRF-Token': token } : {}),
    };
  }

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
      headers: mutationHeaders(true),
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
    const response = await fetch(`/api/agent-room/workspaces/${workspace.id}/mcps?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: mutationHeaders(),
    });
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
        headers: mutationHeaders(true),
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
          const data = f.data as unknown as EditWorkspaceFormData;
          await onSave({
            name: data.name,
            workingDir: data.workingDir,
            icon: data.icon?.trim() || null,
            instructions: data.instructions?.trim() || null,
            syncAgentInstructionFiles: data.syncAgentInstructionFiles,
            runtimeKind,
            wslDistribution: wslDistribution.trim() || null,
            wslWorkingDir: wslWorkingDir.trim() || null,
          });
          onClose();
        } catch (error) {
          submitError = error instanceof Error ? error.message : m['dlg.ws_save_error']();
        }
      },
    }
  );

  const { form: formData, enhance } = form;

  onMount(() => {
    void loadMcps();
    void loadWslAvailability(workspace.workingDir);
  });

  async function loadWslAvailability(path = '') {
    try {
      const response = await fetch(`/api/agent-room/runtimes/wsl${path ? `?path=${encodeURIComponent(path)}` : ''}`);
      wsl = (await response.json()).data ?? wsl;
      if (wsl.inferred) {
        runtimeKind = 'wsl';
        wslDistribution ||= wsl.inferred.distribution;
        wslWorkingDir ||= wsl.inferred.linuxWorkingDir;
      }
    } catch {
      wsl = { supported: false, distributions: [], inferred: null, error: null };
    }
  }

  async function pickDirectory() {
    if (!desktop) return;
    const dir = await desktop.pickDirectory();
    if (dir) {
      $formData.workingDir = dir;
      await loadWslAvailability(dir);
      if (wsl.inferred) {
        runtimeKind = 'wsl';
        wslDistribution = wsl.inferred.distribution;
        wslWorkingDir = wsl.inferred.linuxWorkingDir;
      }
    }
  }
</script>

<Dialog.Root open onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content class="max-h-[min(90dvh,820px)] max-w-[calc(100%-1.5rem)]! grid-rows-[auto_minmax(0,1fr)] gap-0! overflow-hidden rounded-lg p-0! sm:max-w-2xl!">
    <Dialog.Header class="border-b border-border/60 px-5 py-4 pr-12">
      <Dialog.Title>{m['dlg.edit_ws_title']()}</Dialog.Title>
      <Dialog.Description class="text-pretty">{m['dlg.edit_ws_desc']()}</Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div class="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <Form.Field {form} name="name">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label>{m['dlg.name']()}</Form.Label>
                <Input {...props} bind:value={$formData.name} autocomplete="off" />
              {/snippet}
            </Form.Control>
            <Form.FieldErrors />
          </Form.Field>

          <Form.Field {form} name="workingDir">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label>{m['dlg.working_dir']()}</Form.Label>
                <div class="flex min-w-0 gap-2">
                  <Input {...props} bind:value={$formData.workingDir} autocomplete="off" class="min-w-0 flex-1" />
                  {#if desktop}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button {...props} type="button" variant="outline" size="icon" aria-label={m['dlg.pick_folder']()} onclick={pickDirectory}>
                            <FolderOpen size={15} aria-hidden="true" />
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
        </div>

        {#if wsl.supported}
          <section class="grid gap-4 rounded-md border border-border/70 bg-muted/20 p-3 sm:grid-cols-2">
            <div class="space-y-2">
              <span class="text-sm font-medium leading-none">{m['dlg.runtime_label']()}</span>
              <Select.Root type="single" value={runtimeKind} onValueChange={(value: string) => (runtimeKind = value === 'wsl' ? 'wsl' : 'native')}>
                <Select.Trigger class="w-full">
                  {runtimeKind === 'wsl' ? m['dlg.runtime_wsl']() : m['dlg.runtime_native']()}
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="native">{m['dlg.runtime_native']()}</Select.Item>
                  <Select.Item value="wsl">{m['dlg.runtime_wsl']()}</Select.Item>
                </Select.Content>
              </Select.Root>
              <p class="text-xs text-muted-foreground">{m['dlg.runtime_change_hint']()}</p>
            </div>

            {#if runtimeKind === 'wsl'}
              <div class="space-y-2">
                <span class="text-sm font-medium leading-none">{m['dlg.wsl_distribution']()}</span>
                <Select.Root type="single" value={wslDistribution} onValueChange={(value: string) => (wslDistribution = value)}>
                  <Select.Trigger class="w-full">
                    {wslDistribution || m['dlg.wsl_distribution_placeholder']()}
                  </Select.Trigger>
                  <Select.Content>
                    {#each wsl.distributions as distribution (distribution.name)}
                      <Select.Item value={distribution.name}>{distribution.name}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>

              <div class="space-y-2 sm:col-span-2">
                <label class="text-sm font-medium leading-none" for="wsl-working-dir">{m['dlg.wsl_working_dir']()}</label>
                <Input id="wsl-working-dir" bind:value={wslWorkingDir} placeholder="/home/user/project" autocomplete="off" />
                <p class="text-xs text-muted-foreground">{m['dlg.wsl_working_dir_hint']()}</p>
              </div>
              {#if !wsl.distributions.length}
                <p class="text-xs text-destructive sm:col-span-2" role="alert">{wsl.error || m['dlg.wsl_unavailable']()}</p>
              {/if}
            {/if}
          </section>
        {/if}

        <div class="space-y-2">
          <span class="text-sm font-medium leading-none">{m['dlg.ws_icon']()}</span>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(34px,1fr))] gap-1.5" role="radiogroup" aria-label={m['dlg.ws_icon']()}>
            {#each WORKSPACE_ICONS as option (option.name)}
              {@const OptionIcon = option.component}
              <button
                type="button"
                class={($formData.icon ?? null) === option.name
                  ? 'flex aspect-square items-center justify-center rounded-lg border border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-accent-contrast)] transition-[color,background-color,border-color] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                  : 'flex aspect-square items-center justify-center rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-text-muted)] transition-[color,background-color,border-color] hover:bg-[var(--app-surface-raised)] hover:text-[var(--app-text)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'}
                role="radio"
                aria-checked={($formData.icon ?? null) === option.name}
                aria-label={option.name}
                onclick={() => ($formData.icon = ($formData.icon ?? null) === option.name ? null : option.name)}
              >
                <OptionIcon size={15} aria-hidden="true" />
              </button>
            {/each}
          </div>
          {#if isLegacyEmojiIcon(typeof $formData.icon === 'string' ? $formData.icon : null)}
            <p class="m-0 text-[11px] text-[var(--app-text-muted)]">{m['dlg.icon_legacy_hint']({ icon: $formData.icon ?? '' })}</p>
          {/if}
        </div>

        <Form.Field {form} name="instructions">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>{m['dlg.agent_instructions']()}</Form.Label>
              <Textarea {...props} bind:value={$formData.instructions} rows={5} autocomplete="off" placeholder={m['ph.ws_instructions']()} />
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
          <p class="text-sm text-destructive" aria-live="polite">{submitError}</p>
        {/if}

        <section class="space-y-2 border-t border-border/60 pt-4">
          <div class="flex items-center gap-2">
            <Plug size={13} class="text-muted-foreground" aria-hidden="true" />
            <h3 class="text-sm font-medium">{m['dlg.mcp_title']()}</h3>
          </div>
          <p class="text-pretty text-xs text-muted-foreground">{m['dlg.mcp_desc']()}</p>
          {#if mcps.length}
            <ul class="space-y-1">
              {#each mcps as server (server.name)}
                <li class="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                  <span class="shrink-0 font-medium">{server.name}</span>
                  <span class="min-w-0 flex-1 truncate text-muted-foreground">{server.command} {server.args.join(' ')}</span>
                  {#if server.builtin}
                    <span class="shrink-0 text-[10px] text-emerald-500">{m['dlg.mcp_builtin']()}</span>
                  {:else}
                    <button type="button" class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={m['dlg.mcp_remove']({ name: server.name })} onclick={() => removeMcp(server.name)}>
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          <div class="grid gap-2 sm:grid-cols-2">
            <Input name="mcp-name" aria-label={m['ph.mcp_name']()} bind:value={mcpName} autocomplete="off" placeholder={m['ph.mcp_name']()} class="h-8 min-w-0 text-xs" />
            <Input name="mcp-command" aria-label={m['ph.mcp_command']()} bind:value={mcpCommand} autocomplete="off" placeholder={m['ph.mcp_command']()} class="h-8 min-w-0 text-xs" />
            <Input name="mcp-args" aria-label={m['ph.mcp_args']()} bind:value={mcpArgs} autocomplete="off" placeholder={m['ph.mcp_args']()} class="h-8 min-w-0 text-xs sm:col-span-2" />
            <Button type="button" variant="outline" size="sm" class="sm:col-start-2 sm:justify-self-end" disabled={!mcpName.trim() || !mcpCommand.trim()} onclick={addMcp}>
              {m['dlg.add']()}
            </Button>
          </div>
          {#if mcpError}
            <p class="text-xs text-destructive" aria-live="polite">{mcpError}</p>
          {/if}
        </section>

        <section class="space-y-2 border-t border-border/60 pt-4">
          <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-pretty text-xs text-muted-foreground">{m['dlg.preset_hint']()}</p>
            <Button type="button" variant="outline" size="sm" class="shrink-0" disabled={presetState === 'saving'} onclick={saveAsPreset}>
              {presetState === 'saving' ? m['dlg.saving']() : m['dlg.save_as_preset']()}
            </Button>
          </div>
          {#if presetMessage}
            <p class="text-xs {presetState === 'error' ? 'text-destructive' : 'text-emerald-500'}" aria-live="polite">{presetMessage}</p>
          {/if}
        </section>
      </div>

      <Dialog.Footer class="m-0! rounded-none rounded-b-lg border-t border-border/60 px-5 py-3">
        <Button type="button" variant="outline" onclick={onClose}>{m['dlg.cancel']()}</Button>
        <Button type="submit">{m['dlg.save']()}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
