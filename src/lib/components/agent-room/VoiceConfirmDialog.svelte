<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { invalidateAppSettings } from './app-settings.svelte.js';

  type Props = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };

  let { open = $bindable(false), onConfirm, onCancel }: Props = $props();

  let saving = $state(false);

  async function confirm() {
    saving = true;
    try {
      // Persiste a confirmacao: o aviso aparece UMA vez por instalacao.
      await fetch('/api/agent-room/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voiceModelsConfirmed: 'true' }),
      });
      invalidateAppSettings();
    } catch {
      // segue mesmo sem persistir
    } finally {
      saving = false;
      open = false;
      onConfirm();
    }
  }

  function cancel() {
    open = false;
    onCancel();
  }
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Download de voz (~740 MB)</AlertDialog.Title>
      <AlertDialog.Description>
        Para o ditado e a fala funcionarem, o app precisa baixar ~740 MB uma
        unica vez. Depois disso tudo roda local e rapido.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <p class="model-note">Quer baixar agora e continuar?</p>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancel}>Agora nao</AlertDialog.Cancel>
      <AlertDialog.Action disabled={saving} onclick={confirm}>
        {saving ? 'Confirmando...' : 'Baixar e continuar'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  .model-note {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--foreground, #e6e6eb);
  }
</style>
