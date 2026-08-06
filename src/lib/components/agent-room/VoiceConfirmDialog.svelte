<script lang="ts">
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Progress } from '$lib/components/ui/progress';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import { getAppSettings, invalidateAppSettings } from './app-settings.svelte.js';
  import * as m from '$lib/paraglide/messages.js';

  type Props = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };

  let { open = $bindable(false), onConfirm, onCancel }: Props = $props();

  type Phase = 'confirm' | 'downloading' | 'error';
  let phase = $state<Phase>('confirm');
  let percent = $state(0);
  let stage = $state('');
  let errorMessage = $state('');
  let freeBytes = $state<number | null>(null);
  let requiredBytes = $state(0);
  const insufficient = $derived(freeBytes !== null && requiredBytes > 0 && freeBytes < requiredBytes);
  let poller: ReturnType<typeof setInterval> | null = null;

  function formatGb(bytes: number): string {
    return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  }

  // Ao abrir na fase de confirmacao, ja consulta o espaco livre em disco.
  $effect(() => {
    if (!open || phase !== 'confirm' || freeBytes !== null) return;
    fetch('/api/agent-room/voice/models')
      .then((response) => response.json())
      .then((body) => {
        freeBytes = body.data.freeBytes ?? null;
        requiredBytes = body.data.requiredBytes ?? 0;
      })
      .catch(() => {});
  });

  function stopPolling() {
    if (poller) clearInterval(poller);
    poller = null;
  }

  function csrfHeaders(extra: Record<string, string> = {}): HeadersInit {
    const token = getCsrfToken();
    return token ? { ...extra, 'X-CSRF-Token': token } : extra;
  }

  async function markModelsConfirmed() {
    try {
      const response = await fetch('/api/agent-room/settings', {
        method: 'PUT',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ voiceModelsConfirmed: 'true' }),
      });
      if (!response.ok) return;
      invalidateAppSettings();
      await getAppSettings(true);
    } catch {
      // O status real dos arquivos continua permitindo o uso nesta sessao.
    }
  }

  async function confirm() {
    phase = 'downloading';
    percent = 0;
    errorMessage = '';
    // A confirmacao so e persistida quando os arquivos estiverem prontos.
    // Assim uma falha/cancelamento nunca deixa uma flag true sem modelos.
    try {
      const response = await fetch('/api/agent-room/voice/models', {
        method: 'POST',
        headers: csrfHeaders(),
      });
      if (!response.ok) throw new Error('download_start_failed');
    } catch {
      phase = 'error';
      errorMessage = m['voice.download_start_error']();
      return;
    }
    stopPolling();
    poller = setInterval(async () => {
      try {
        const response = await fetch('/api/agent-room/voice/models');
        const status = (await response.json()).data;
        percent = status.percent ?? 0;
        stage = status.stage ?? '';
        if (status.error) {
          stopPolling();
          phase = 'error';
          errorMessage = status.error;
          return;
        }
        if (status.ready) {
          stopPolling();
          await markModelsConfirmed();
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
        {#if phase === 'downloading'}{m['voice.downloading_title']()}
        {:else if phase === 'error'}{m['voice.download_failed_title']()}
        {:else}{m['voice.download_title']()}{/if}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {#if phase === 'confirm'}
          {m['voice.download_desc']()}
        {:else if phase === 'downloading'}
          {m['voice.downloading_desc']()}
        {:else}
          {m['voice.download_failed_desc']()}
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if phase === 'downloading'}
      <div class="download-state">
        <Progress value={percent} max={100} />
        <span class="download-percent">{percent}%</span>
      </div>
      {#if stage}
        <p class="download-stage">{stage}</p>
      {/if}
    {:else if phase === 'error'}
      <p class="download-error">{errorMessage}</p>
    {:else if insufficient}
      <p class="download-error">
        {m['voice.insufficient_space']({ free: formatGb(freeBytes ?? 0), required: formatGb(requiredBytes) })}
      </p>
    {/if}

    <AlertDialog.Footer>
      {#if phase === 'confirm'}
        <AlertDialog.Cancel onclick={cancel}>{m['voice.not_now']()}</AlertDialog.Cancel>
        <AlertDialog.Action disabled={insufficient} onclick={confirm}>{m['voice.download_continue']()}</AlertDialog.Action>
      {:else if phase === 'error'}
        <AlertDialog.Cancel onclick={cancel}>{m['onboarding.close']()}</AlertDialog.Cancel>
        <AlertDialog.Action onclick={retry}>{m['voice.retry']()}</AlertDialog.Action>
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

  .download-stage {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: var(--muted-foreground, #8b8c96);
  }

  .download-error {
    margin: 6px 0 0;
    font-size: 12px;
    color: #ff9c9f;
  }
</style>
