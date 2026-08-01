<script lang="ts">
  import { defaults, superForm } from 'sveltekit-superforms';
  import { zod } from 'sveltekit-superforms/adapters';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Form from '$lib/components/ui/form';
  import * as Select from '$lib/components/ui/select';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Label } from '$lib/components/ui/label';
  import { createAgentNodeSchema } from '$lib/modules/agent-room/contracts/schemas/schemas.js';
  import type { AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';

  export type AgentCreation = {
    title: string;
    model: string | null;
    effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra' | null;
    leader: boolean;
  };

  type Props = {
    open: boolean;
    /** Provider do agente (null = shell puro). */
    provider: AgentProviderInfo | null;
    /** Pre-marca "Lider" (primeiro agente do workspace — fluxo zero-config). */
    defaultLeader?: boolean;
    onConfirm: (creation: AgentCreation) => void;
    onCancel: () => void;
  };

  let { open, provider, defaultLeader = false, onConfirm, onCancel }: Props = $props();

  const EFFORT_LABELS: Record<string, string> = {
    low: 'Baixo',
    medium: 'Medio',
    high: 'Alto',
    xhigh: 'Altissimo',
    max: 'Maximo',
    ultra: 'Ultra',
  };

  const PROVIDER_EFFORTS: Record<string, string[]> = {
    claude: ['low', 'medium', 'high', 'xhigh', 'max'],
    codex: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  };

  const modelOptions = $derived(provider?.models ?? []);

  // Esforcos do modelo selecionado (a CLI informa por modelo); sem selecao,
  // usa os do provider. Kimi/OpenCode nao tem flag de effort — escondido.
  const effortOptions = $derived.by(() => {
    if (!provider || !(provider.id in PROVIDER_EFFORTS)) return [];
    const selected = modelOptions.find((option) => option.value === ($formData?.model ?? ''));
    const efforts = selected?.efforts?.length ? selected.efforts : PROVIDER_EFFORTS[provider.id];
    return efforts.map((value) => ({ value, label: EFFORT_LABELS[value] ?? value }));
  });
  const supportsEffort = $derived(effortOptions.length > 0);

  const schema = createAgentNodeSchema as unknown as Parameters<typeof zod>[0];

  const form = superForm(defaults(zod(schema)), {
    SPA: true,
    validators: zod(schema),
    async onUpdate({ form: f }) {
      if (!f.valid) return;
      onConfirm({
        title: f.data.title,
        model: f.data.model || null,
        effort: (f.data.effort as AgentCreation['effort']) ?? null,
        leader: Boolean(f.data.leader),
      });
    },
  });

  const { form: formData, enhance, errors } = form;

  // Preenche o nome padrao do provider a cada abertura do dialogo.
  let lastOpen = false;
  $effect(() => {
    if (open && !lastOpen) {
      formData.set({
        title: provider?.displayName ?? 'Shell',
        model: '',
        effort: null,
        leader: provider ? defaultLeader : false,
      });
    }
    lastOpen = open;
  });
</script>

<Dialog.Root {open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{provider ? `Novo agente — ${provider.displayName}` : 'Novo terminal'}</Dialog.Title>
      <Dialog.Description>
        {provider ? 'Nomeie a janela e escolha modelo, esforco e se ele lidera a equipe.' : 'Nomeie a janela do terminal.'}
      </Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="space-y-4">
        <Form.Field {form} name="title">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>Nome</Form.Label>
              <Input {...props} bind:value={$formData!.title} placeholder="Ex.: Backend, Reviewer, Ops..." autofocus />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors />
        </Form.Field>

        {#if provider && modelOptions.length}
          <Form.Field {form} name="model">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label>Modelo</Form.Label>
                <Select.Root type="single" value={$formData!.model || '__default__'} onValueChange={(value) => ($formData!.model = value === '__default__' ? '' : value)}>
                  <Select.Trigger {...props} class="w-full">
                    {$formData!.model ? (modelOptions.find((option) => option.value === $formData!.model)?.label ?? $formData!.model) : 'Padrao do provider'}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="__default__" label="Padrao do provider" />
                    {#each modelOptions as option (option.value)}
                      <Select.Item value={option.value} label={option.label} />
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/snippet}
            </Form.Control>
            <Form.FieldErrors />
          </Form.Field>
        {/if}

        {#if provider && supportsEffort}
          <Form.Field {form} name="effort">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label>Esforco de raciocinio</Form.Label>
                <Select.Root type="single" value={$formData!.effort || '__default__'} onValueChange={(value) => ($formData!.effort = (value === '__default__' ? null : value) as AgentCreation['effort'])}>
                  <Select.Trigger {...props} class="w-full">
                    {$formData!.effort ? (EFFORT_LABELS[$formData!.effort] ?? $formData!.effort) : 'Padrao do provider'}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="__default__" label="Padrao do provider" />
                    {#each effortOptions as option (option.value)}
                      <Select.Item value={option.value} label={option.label} />
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/snippet}
            </Form.Control>
            <Form.FieldErrors />
          </Form.Field>
        {/if}

        {#if provider}
          <Form.Field {form} name="leader">
            <Form.Control>
              {#snippet children({ props })}
                <div class="flex items-center gap-2">
                  <Checkbox {...props} checked={Boolean($formData!.leader)} onCheckedChange={(checked) => ($formData!.leader = checked === true)} />
                  <Label class="cursor-pointer" onclick={() => ($formData!.leader = !$formData!.leader)}>
                    Lider da equipe (Modo Maestro)
                  </Label>
                </div>
              {/snippet}
            </Form.Control>
            <Form.Description>O lider recruta e demite agentes sob demanda e distribui tarefas das notas.</Form.Description>
            <Form.FieldErrors />
          </Form.Field>
        {/if}

        <Dialog.Footer>
          <Button type="button" variant="outline" onclick={onCancel}>Cancelar</Button>
          <Button type="submit">Criar agente</Button>
        </Dialog.Footer>
      </form>
  </Dialog.Content>
</Dialog.Root>
