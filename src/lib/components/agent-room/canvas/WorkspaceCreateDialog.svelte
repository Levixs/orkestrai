<script lang="ts">
  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Form from '$lib/components/ui/form';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { FolderOpen } from '@lucide/svelte';
  import * as Select from '$lib/components/ui/select';
  import WorkspaceIcon from '../WorkspaceIcon.svelte';
  import { createWorkspaceSchema } from '$lib/modules/agent-room/contracts/schemas/workspaceSchemas.js';
  import type { Workspace } from '$lib/modules/agent-room/domain/types.js';
  import { onMount } from 'svelte';
  import * as m from '$lib/paraglide/messages.js';
  import { localeState } from '$lib/i18n/locale.svelte.js';
  import { getCsrfToken } from '@beeblock/svelar/http';

  type PresetSummary = { id: string; name: string; icon: string | null; description: string | null; agents: number };

  type Props = {
    open: boolean;
    initialPresetId?: string;
    onCreated: (workspace: Workspace) => void;
    onClose: () => void;
  };

  let { open, initialPresetId = '', onCreated, onClose }: Props = $props();

  let submitError = $state('');
  let presets = $state<PresetSummary[]>([]);
  let presetId = $state('');

  function csrfHeaders(extra: Record<string, string> = {}): HeadersInit {
    const token = getCsrfToken();
    return token ? { ...extra, 'X-CSRF-Token': token } : extra;
  }

  onMount(async () => {
    try {
      const response = await fetch(`/api/agent-room/presets?scope=all&locale=${encodeURIComponent(localeState.current)}`);
      presets = (await response.json()).data ?? [];
    } catch {
      presets = [];
    }
  });

  $effect(() => {
    if (open && initialPresetId) presetId = initialPresetId;
  });

  const desktop = typeof window !== 'undefined'
    ? (window as unknown as { orkestraiDesktop?: { pickDirectory: () => Promise<string | null> } }).orkestraiDesktop
    : undefined;

  // O adapter resolve 'zod/v3' pelo zod aninhado do superforms (4.x compat);
// nosso zod e 3.25 — os tipos divergem minimamente, entao normalizamos aqui.
const schema = createWorkspaceSchema as unknown as Parameters<typeof zod>[0];
const form = superForm(defaults(zod(schema)), {
    SPA: true,
    validators: zod(schema),
    async onUpdate({ form: f }) {
      if (!f.valid) return;
      submitError = '';
      try {
        let workspace: Workspace;
        if (presetId) {
          const applyResponse = await fetch(`/api/agent-room/presets/${presetId}/apply`, {
            method: 'POST',
            headers: csrfHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({ ...f.data, locale: localeState.current }),
          });
          const applyPayload = await applyResponse.json();
          if (!applyResponse.ok || applyPayload.error) throw new Error(applyPayload.error || m['dlg.preset_apply_error']());
          const workspaceResponse = await fetch(`/api/agent-room/workspaces/${applyPayload.data.workspaceId}`);
          const workspacePayload = await workspaceResponse.json();
          if (!workspaceResponse.ok || workspacePayload.error) throw new Error(workspacePayload.error || m['dlg.ws_create_error']());
          workspace = workspacePayload.data as Workspace;
        } else {
          const response = await fetch('/api/agent-room/workspaces', {
            method: 'POST',
            headers: csrfHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(f.data),
          });
          const payload = await response.json();
          if (!response.ok || payload.error) throw new Error(payload.error || m['dlg.ws_create_error']());
          workspace = payload.data as Workspace;
        }
        onCreated(workspace);
        onClose();
      } catch (error) {
        submitError = error instanceof Error ? error.message : m['dlg.ws_create_error']();
      }
    },
  });

  const { form: formData, enhance, errors } = form;

  async function pickDirectory() {
    if (!desktop) return;
    const dir = await desktop.pickDirectory();
    if (dir) $formData.workingDir = dir;
  }
</script>

<Dialog.Root {open} onOpenChange={(isOpen) => !isOpen && onClose()}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{m['dlg.new_ws_title']()}</Dialog.Title>
      <Dialog.Description>{m['dlg.new_ws_desc']()}</Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="space-y-4">
      <Form.Field {form} name="name">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>{m['dlg.name']()}</Form.Label>
            <Input {...props} bind:value={$formData.name} placeholder={m['ph.ws_name']()} />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="workingDir">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>{m['dlg.working_dir']()}</Form.Label>
            <div class="flex gap-2">
              <Input {...props} bind:value={$formData.workingDir} placeholder={m['ph.ws_dir']()} class="flex-1" />
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
        <Form.Description>{m['dlg.new_ws_dir_hint']()}</Form.Description>
        <Form.FieldErrors />
      </Form.Field>

      {#if presets.length}
        <div class="space-y-2">
          <span class="text-sm font-medium leading-none">{m['dlg.preset_start_label']()}</span>
          <Select.Root type="single" value={presetId} onValueChange={(value: string) => (presetId = value === '__none' ? '' : value)}>
            <Select.Trigger data-slot="select-trigger" class="w-full">
              {#if presetId}
                {@const preset = presets.find((item) => item.id === presetId)}
                <span class="preset-option">
                  <WorkspaceIcon name={preset?.icon} size={13} />
                  {preset?.name} ({m['dlg.preset_agents']({ count: String(preset?.agents ?? 0) })})
                </span>
              {:else}
                {m['dlg.preset_blank']()}
              {/if}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none">{m['dlg.preset_blank']()}</Select.Item>
              {#each presets as preset (preset.id)}
                <Select.Item value={preset.id}>
                  <span class="preset-option">
                    <WorkspaceIcon name={preset.icon} size={13} />
                    {preset.name} — {m['dlg.preset_agents']({ count: String(preset.agents) })}{preset.description ? ` · ${preset.description}` : ''}
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-xs text-muted-foreground">{m['dlg.preset_apply_hint']()}</p>
        </div>
      {/if}

      {#if submitError}
        <p class="text-sm text-destructive">{submitError}</p>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onClose}>{m['dlg.cancel']()}</Button>
        <Button type="submit">{m['dlg.create']()}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<style>
  .preset-option {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
</style>
