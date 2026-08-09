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
  import * as m from '$lib/paraglide/messages.js';

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

  const EFFORT_LABELS: Record<string, string> = $derived({
    low: m['dlg.effort_low'](),
    medium: m['dlg.effort_medium'](),
    high: m['dlg.effort_high'](),
    xhigh: m['dlg.effort_xhigh'](),
    max: m['dlg.effort_max'](),
    ultra: m['dlg.effort_ultra'](),
  });

  const modelOptions = $derived(provider?.models ?? []);

  // Esforcos do modelo selecionado (quando informado); sem selecao, usa a
  // capacidade declarada pelo adapter. Providers sem effort ficam ocultos.
  const effortOptions = $derived.by(() => {
    if (!provider) return [];
    const selected = modelOptions.find((option) => option.value === ($formData?.model ?? ''));
    const efforts = selected?.efforts?.length ? selected.efforts : (provider.efforts ?? []);
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
      <Dialog.Title>{provider ? m['dlg.new_agent_title']({ provider: provider.displayName }) : m['dlg.new_terminal_title']()}</Dialog.Title>
      <Dialog.Description>
        {provider ? m['dlg.new_agent_desc']() : m['dlg.new_terminal_desc']()}
      </Dialog.Description>
    </Dialog.Header>

    <form method="POST" use:enhance class="space-y-4">
        <Form.Field {form} name="title">
          <Form.Control>
            {#snippet children({ props })}
              <Form.Label>{m['dlg.name']()}</Form.Label>
              <Input {...props} bind:value={$formData!.title} placeholder={m['ph.agent_title']()} autofocus />
            {/snippet}
          </Form.Control>
          <Form.FieldErrors />
        </Form.Field>

        {#if provider && modelOptions.length}
          <Form.Field {form} name="model">
            <Form.Control>
              {#snippet children({ props })}
                <Form.Label>{m['dlg.model']()}</Form.Label>
                <Select.Root type="single" value={$formData!.model || '__default__'} onValueChange={(value) => ($formData!.model = value === '__default__' ? '' : value)}>
                  <Select.Trigger {...props} class="w-full">
                    {$formData!.model ? (modelOptions.find((option) => option.value === $formData!.model)?.label ?? $formData!.model) : m['dlg.provider_default']()}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="__default__" label={m['dlg.provider_default']()} />
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
                <Form.Label>{m['dlg.effort_label']()}</Form.Label>
                <Select.Root type="single" value={$formData!.effort || '__default__'} onValueChange={(value) => ($formData!.effort = (value === '__default__' ? null : value) as AgentCreation['effort'])}>
                  <Select.Trigger {...props} class="w-full">
                    {$formData!.effort ? (EFFORT_LABELS[$formData!.effort] ?? $formData!.effort) : m['dlg.provider_default']()}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="__default__" label={m['dlg.provider_default']()} />
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
                    {m['dlg.leader_label']()}
                  </Label>
                </div>
              {/snippet}
            </Form.Control>
            <Form.Description>{m['dlg.leader_desc']()}</Form.Description>
            <Form.FieldErrors />
          </Form.Field>
        {/if}

        <Dialog.Footer>
          <Button type="button" variant="outline" onclick={onCancel}>{m['dlg.cancel']()}</Button>
          <Button type="submit">{m['dlg.create_agent']()}</Button>
        </Dialog.Footer>
      </form>
  </Dialog.Content>
</Dialog.Root>
