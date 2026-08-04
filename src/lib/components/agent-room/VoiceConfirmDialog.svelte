<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Progress } from '$lib/components/ui/progress';
  import { invalidateAppSettings } from './app-settings.svelte.js';

  type Props = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };

  let { open = $bindable(false), onConfirm, onCancel }: Props = $props();

  type Phase = 'confirm' | 'downloading' | 'error';
  let phase = $state<Phase>('confirm');
  let percent = $state(0);
  let errorMessage = $state('');
  let poller: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (poller) clearInterval(poller);
    poller = null;
  }

  async function confirm() {
    phase = 'downloading';
    percent = 0;
    errorMessage = '';
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
    }
    // Dispara o download AGORA e acompanha o progresso.
    await fetch('/api/agent-room/voice/models', { method: 'POST' }).catch(() => {});
    stopPolling();
    poller = setInterval(async () => {
      try {
        const response = await fetch('/api/agent-room/voice/models');
        const status = (await response.json()).data;
        percent = status.percent ?? 0;
        if (status.error) {
          stopPolling();
          phase = 'error';
          errorMessage = status.error;
          return;
        }
        if (status.ready) {
          stopPolling();
          open = false;
          onConfirm();
        }
      } catch {
        // rede oscilando — tenta no proximo tick
      }
    }, 1_000);
  }

  function cancel() {
    stopPolling();
    open = false;
    onCancel();
  }

  function retry() {
    phase = 'confirm';
    errorMessage = '';
  }

  $effect(() => () => stopPolling());
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {#if phase === 'downloading'}Baixando o modelo de voz…
        {:else if phase === 'error'}Falha no download
        {:else}Download do modelo de voz (~740 MB){/if}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {#if phase === 'confirm'}
          Para o ditado e a fala funcionarem, o app precisa baixar o modelo de
          voz (whisper, ~740 MB) uma unica vez. Depois disso tudo roda local e
          rapido.
        {:else if phase === 'downloading'}
          Pode demorar alguns minutos dependendo da sua conexao. Voce pode
          deixar esta janela aberta acompanhando.
        {:else}
          Nao consegui baixar o modelo de voz.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if phase === 'downloading'}
      <div class="download-state">
        <Progress value={percent} max={100} />
        <span class="download-percent">{percent}%</span>
      </div>
    {:else if phase === 'error'}
      <p class="download-error">{errorMessage}</p>
    {/if}

    <AlertDialog.Footer>
      {#if phase === 'confirm'}
        <AlertDialog.Cancel onclick={cancel}>Agora nao</AlertDialog.Cancel>
        <AlertDialog.Action onclick={confirm}>Baixar e continuar</AlertDialog.Action>
      {:else if phase === 'error'}
        <AlertDialog.Cancel onclick={cancel}>Fechar</AlertDialog.Cancel>
        <AlertDialog.Action onclick={retry}>Tentar de novo</AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  .download-state {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 6px;
  }

  .download-state :global([data-slot='progress']) {
    flex: 1;
  }

  .download-percent {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground, #8b8c96);
    min-width: 36px;
    text-align: right;
  }

  .download-error {
    margin: 6px 0 0;
    font-size: 12px;
    color: #ff9c9f;
  }
</style>
