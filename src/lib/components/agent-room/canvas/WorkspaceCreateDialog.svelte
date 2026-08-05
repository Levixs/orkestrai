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

  type PresetSummary = { id: string; name: string; icon: string | null; description: string | null; agents: number };

  type Props = {
    open: boolean;
    onCreated: (workspace: Workspace) => void;
    onClose: () => void;
  };

  let { open, onCreated, onClose }: Props = $props();

  let submitError = $state('');
  let presets = $state<PresetSummary[]>([]);
  let presetId = $state('');

  onMount(async () => {
    try {
      const response = await fetch('/api/agent-room/presets');
      presets = (await response.json()).data ?? [];
    } catch {
      presets = [];
    }
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
        const response = await fetch('/api/agent-room/workspaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(f.data),
        });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'Falha ao criar workspace.');
        const workspace = payload.data as Workspace;
        // Com preset selecionado: instancia o time no workspace recem-criado.
        if (presetId) {
          const applyResponse = await fetch(`/api/agent-room/presets/${presetId}/apply`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId: workspace.id }),
          });
          const applyPayload = await applyResponse.json();
          if (!applyResponse.ok || applyPayload.error) throw new Error(applyPayload.error || 'Falha ao aplicar o preset.');
        }
        onCreated(workspace);
        onClose();
      } catch (error) {
        submitError = error instanceof Error ? error.message : 'Falha ao criar workspace.';
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
      <Dialog.Title>Novo workspace</Dialog.Title>
      <Dialog.Description>Um workspace agrupa um diretorio de trabalho e o layout do canvas.</Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="space-y-4">
      <Form.Field {form} name="name">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Nome</Form.Label>
            <Input {...props} bind:value={$formData.name} placeholder="Nome" />
          {/snippet}
        </Form.Control>
        <Form.FieldErrors />
      </Form.Field>

      <Form.Field {form} name="workingDir">
        <Form.Control>
          {#snippet children({ props })}
            <Form.Label>Diretorio de trabalho</Form.Label>
            <div class="flex gap-2">
              <Input {...props} bind:value={$formData.workingDir} placeholder="Diretorio de trabalho" class="flex-1" />
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
        <Form.Description>Pasta raiz do projeto. Novos terminais abrem aqui.</Form.Description>
        <Form.FieldErrors />
      </Form.Field>

      {#if presets.length}
        <div class="space-y-2">
          <span class="text-sm font-medium leading-none">Comecar de um preset (opcional)</span>
          <Select.Root type="single" value={presetId} onValueChange={(value: string) => (presetId = value === '__none' ? '' : value)}>
            <Select.Trigger data-slot="select-trigger" class="w-full">
              {#if presetId}
                {@const preset = presets.find((item) => item.id === presetId)}
                <span class="preset-option">
                  <WorkspaceIcon name={preset?.icon} size={13} />
                  {preset?.name} ({preset?.agents} agentes)
                </span>
              {:else}
                Em branco
              {/if}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none">Em branco</Select.Item>
              {#each presets as preset (preset.id)}
                <Select.Item value={preset.id}>
                  <span class="preset-option">
                    <WorkspaceIcon name={preset.icon} size={13} />
                    {preset.name} — {preset.agents} agentes{preset.description ? ` · ${preset.description}` : ''}
                  </span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-xs text-muted-foreground">O preset instancia o time, as notas, as roles e as rotinas no workspace novo.</p>
        </div>
      {/if}

      {#if submitError}
        <p class="text-sm text-destructive">{submitError}</p>
      {/if}

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onClose}>Cancelar</Button>
        <Button type="submit">Criar</Button>
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
