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
  import { FolderOpen } from '@lucide/svelte';
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
            <Form.Label>Icone (emoji)</Form.Label>
            <Input {...props} bind:value={$formData.icon} placeholder="📁" maxlength={4} />
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

      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onClose}>Cancelar</Button>
        <Button type="submit">Salvar</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
