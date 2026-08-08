<script lang="ts">
  /**
   * Notificador global de atualizacoes do app desktop (Electron).
   * O download e automatico e em background; quando termina, pergunta se
   * reinicia para instalar. Em erro (ex.: mac sem assinatura de codigo),
   * oferece o download manual na pagina de releases.
   */
  import { onMount } from 'svelte';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Button } from '$lib/components/ui/button';
  import * as m from '$lib/paraglide/messages.js';

  const RELEASES_URL = 'https://github.com/beeblock/orkestrai/releases/latest';

  type UpdatePayload =
    | { status: 'idle' }
    | { status: 'checking' }
    | { status: 'available'; version: string }
    | { status: 'manual'; version: string }
    | { status: 'downloading'; percent: number }
    | { status: 'downloaded'; version: string }
    | { status: 'none' }
    | { status: 'check-error'; message: string }
    | { status: 'error'; message: string };

  type DesktopBridge = {
    onUpdate?: (callback: (payload: UpdatePayload) => void) => () => void;
    updateState?: () => Promise<UpdatePayload>;
    installUpdate?: () => Promise<void>;
    openExternal?: (url: string) => Promise<void>;
  };

  let status = $state<UpdatePayload['status'] | null>(null);
  let version = $state('');
  let percent = $state(0);
  let dialogOpen = $state(false);
  let failed = $state(false);
  let plannedManualUpdate = $state(false);

  onMount(() => {
    const desktop = (window as unknown as { orkestraiDesktop?: DesktopBridge }).orkestraiDesktop;
    if (!desktop?.onUpdate) return;
    let active = true;
    const apply = (payload: UpdatePayload) => {
      status = payload.status;
      if (payload.status === 'available') version = payload.version;
      if (payload.status === 'downloading') percent = payload.percent;
      if (payload.status === 'downloaded') {
        version = payload.version;
        failed = false;
        plannedManualUpdate = false;
        dialogOpen = true;
      }
      if (payload.status === 'manual') {
        version = payload.version;
        failed = false;
        plannedManualUpdate = true;
        dialogOpen = true;
      }
      if (payload.status === 'error') {
        // Falha na troca automatica: oferece download manual em vez de insistir.
        failed = true;
        plannedManualUpdate = false;
        dialogOpen = true;
      }
    };
    const unsubscribe = desktop.onUpdate(apply);
    void desktop.updateState?.().then((payload) => {
      if (active) apply(payload);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  });

  function install() {
    dialogOpen = false;
    const desktop = (window as unknown as { orkestraiDesktop?: DesktopBridge }).orkestraiDesktop;
    void desktop?.installUpdate?.();
  }

  function downloadManually() {
    dialogOpen = false;
    const desktop = (window as unknown as { orkestraiDesktop?: DesktopBridge }).orkestraiDesktop;
    void desktop?.openExternal?.(RELEASES_URL);
  }
</script>

{#if status === 'downloading'}
  <div class="update-progress" role="status">
    <span class="update-progress-label">{m['update.downloading']({ percent })}</span>
    <span class="update-progress-bar"><span class="update-progress-fill" style:width="{percent}%"></span></span>
  </div>
{/if}

<AlertDialog.Root bind:open={dialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{failed || plannedManualUpdate ? m['update.manual_title']() : m['update.ready_title']()}</AlertDialog.Title>
      <AlertDialog.Description>
        {#if plannedManualUpdate}
          {m['update.manual_unsigned_desc']({ version })}
        {:else if failed}
          {m['update.manual_desc']()}
        {:else}
          {m['update.ready_desc']({ version })}
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{m['update.later']()}</AlertDialog.Cancel>
      {#if failed || plannedManualUpdate}
        <Button size="sm" onclick={downloadManually}>{m['update.download_site']()}</Button>
      {:else}
        <Button size="sm" onclick={install}>{m['update.restart']()}</Button>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<style>
  .update-progress {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: #1a1742;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    min-width: 200px;
  }

  .update-progress-label {
    font-size: 11.5px;
    color: #a9aab3;
    font-variant-numeric: tabular-nums;
  }

  .update-progress-bar {
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .update-progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: #5b8def;
    transition: width 200ms ease;
  }
</style>
