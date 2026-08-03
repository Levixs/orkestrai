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
      <AlertDialog.Title>Download dos modelos de voz (~2 GB)</AlertDialog.Title>
      <AlertDialog.Description>
        Na primeira vez, o sidecar de voz baixa os modelos para o volume do Docker:
      </AlertDialog.Description>
    </AlertDialog.Header>
    <ul class="model-list">
      <li><strong>~1,6 GB</strong> — transcricao (faster-whisper large-v3-turbo)</li>
      <li><strong>~350 MB</strong> — vozes pt-BR (Kokoro TTS)</li>
      <li><strong>~1,2 GB</strong> — STT alternativo (Parakeet, se usado)</li>
    </ul>
    <p class="model-note">
      E um download unico — depois fica tudo em cache e as chamadas sao locais e
      rapidas. Quer continuar agora?
    </p>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={cancel}>Agora nao</AlertDialog.Cancel>
      <AlertDialog.Action disabled={saving} onclick={confirm}>
        {saving ? 'Confirmando...' : 'Baixar e continuar'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  .model-list {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: var(--muted-foreground, #8b8c96);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .model-note {
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--foreground, #e6e6eb);
  }
</style>
