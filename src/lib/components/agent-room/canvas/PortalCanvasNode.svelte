<script lang="ts">
  import { onMount } from 'svelte';
  import type { NodeProps } from '@xyflow/svelte';
  import { ArrowRight, Globe, X } from '@lucide/svelte';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import NodeShell from './NodeShell.svelte';
  import IconAction from './IconAction.svelte';
  import * as m from '$lib/paraglide/messages.js';

  export type PortalNodeData = {
    title: string;
    workspaceId: string;
    payload: { url?: string };
    onDelete: (id: string) => void;
    onResize?: (id: string, params: { x: number; y: number; width: number; height: number }) => void;
    onUrlChange?: (id: string, url: string) => void;
  };

  let { id, data, selected } = $props<NodeProps & { data: PortalNodeData }>();

  type WebviewElement = HTMLElement & {
    src: string;
    loadURL: (url: string) => Promise<void>;
    executeJavaScript: (code: string) => Promise<unknown>;
    capturePage: () => Promise<{ toDataURL: () => string }>;
  };

  type WebviewLoadFailure = Event & {
    errorCode?: number;
    errorDescription?: string;
    validatedURL?: string;
    isMainFrame?: boolean;
  };

  let address = $state(data.payload.url ?? '');
  let frame: (WebviewElement | HTMLIFrameElement) | null = $state(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let portalReady = false;
  let portalError = '';
  const readyWaiters = new Set<{ resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  const isDesktop = typeof window !== 'undefined' && 'orkestraiDesktop' in window;

  async function postResult(commandId: string, ok: boolean, result?: unknown, error?: string) {
    const csrf = getCsrfToken();
    await fetch(`/api/agent-room/workspaces/${data.workspaceId}/portal/${id}/commands/${commandId}/result`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ ok, result, error }),
    }).catch(() => {});
  }

  function targetUrl() {
    return address.trim() || String(data.payload.url ?? '').trim();
  }

  function clearRetry() {
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = null;
  }

  function markReady() {
    portalReady = true;
    portalError = '';
    clearRetry();
    for (const waiter of readyWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    readyWaiters.clear();
  }

  function retryLoad() {
    const url = targetUrl();
    if (!url || !frame || !('loadURL' in frame)) return;
    void frame.loadURL(url).catch((error) => {
      portalError = error instanceof Error ? error.message : String(error);
    });
  }

  function markUnavailable(detail: string) {
    portalReady = false;
    portalError = detail;
    if (!retryTimer && targetUrl()) {
      retryTimer = setInterval(retryLoad, 3_000);
    }
  }

  function waitUntilReady(timeoutMs = 25_000): Promise<void> {
    if (portalReady) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          readyWaiters.delete(waiter);
          reject(new Error(`Portal indisponível em ${targetUrl() || 'URL vazia'}: ${portalError || 'a página não terminou de carregar'}.`));
        }, timeoutMs),
      };
      readyWaiters.add(waiter);
      retryLoad();
    });
  }

  async function verifyLoadedPage(webview: WebviewElement) {
    try {
      const href = String(await webview.executeJavaScript('location.href') ?? '');
      if (href && href !== 'about:blank' && !href.startsWith('chrome-error:')) markReady();
      else if (targetUrl()) markUnavailable(href.startsWith('chrome-error:') ? 'o servidor ainda não respondeu' : 'a página ainda está vazia');
    } catch {
      markUnavailable('a página ainda não está pronta');
    }
  }

  async function executeCommand(command: { id: string; action: string; args: Record<string, unknown> }) {
    if (!frame || !('executeJavaScript' in frame)) {
      await postResult(command.id, false, undefined, 'Portal sem webview (precisa do app desktop).');
      return;
    }
    try {
      switch (command.action) {
        case 'navigate': {
          const url = String(command.args.url ?? '');
          portalReady = false;
          address = url;
          data.onUrlChange?.(id, url);
          try {
            await frame.loadURL(url);
          } catch {
            await waitUntilReady();
          }
          await waitUntilReady();
          await postResult(command.id, true, { navigated: url });
          break;
        }
        case 'eval': {
          await waitUntilReady();
          const result = await frame.executeJavaScript(String(command.args.js ?? ''));
          await postResult(command.id, true, result);
          break;
        }
        case 'dom': {
          await waitUntilReady();
          const html = await frame.executeJavaScript('document.documentElement.outerHTML');
          await postResult(command.id, true, String(html).slice(0, 50_000));
          break;
        }
        case 'screenshot': {
          await waitUntilReady();
          const image = await frame.capturePage();
          await postResult(command.id, true, { dataUrl: image.toDataURL().slice(0, 200_000) });
          break;
        }
        default:
          await postResult(command.id, false, undefined, `Acao desconhecida: ${command.action}`);
      }
    } catch (error) {
      await postResult(command.id, false, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  function startPolling() {
    if (pollTimer || !isDesktop) return;
    pollTimer = setInterval(async () => {
      const response = await fetch(`/api/agent-room/workspaces/${data.workspaceId}/portal/${id}/commands`);
      const payload = await response.json().catch(() => ({ data: [] }));
      for (const command of payload.data ?? []) {
        await executeCommand(command);
      }
    }, 2_000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function navigate() {
    let url = address.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    address = url;
    portalReady = false;
    data.onUrlChange?.(id, url);
    if (frame && 'loadURL' in frame) retryLoad();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') navigate();
  }

  $effect(() => {
    const webview = frame;
    if (!webview || !('executeJavaScript' in webview)) return;

    const handleFinish = () => void verifyLoadedPage(webview);
    const handleFailure = (event: Event) => {
      const failure = event as WebviewLoadFailure;
      if (failure.isMainFrame === false || failure.errorCode === -3) return;
      markUnavailable(failure.errorDescription || `falha ao carregar ${failure.validatedURL || targetUrl()}`);
    };
    webview.addEventListener('did-finish-load', handleFinish);
    webview.addEventListener('did-fail-load', handleFailure);

    void verifyLoadedPage(webview);

    return () => {
      webview.removeEventListener('did-finish-load', handleFinish);
      webview.removeEventListener('did-fail-load', handleFailure);
    };
  });

  onMount(() => {
    startPolling();
    return () => {
      stopPolling();
      clearRetry();
      for (const waiter of readyWaiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Portal fechado antes de concluir o carregamento.'));
      }
      readyWaiters.clear();
    };
  });
</script>

<NodeShell
  {id}
  {selected}
  class="canvas-portal"
  accent="#c084fc"
  minWidth={360}
  minHeight={260}
  onResize={data.onResize}
  connections={data.connections ?? []}
  titleText={data.title}
  onRename={data.onRename}
  onJumpToNode={data.onJumpToNode}
  onRemoveConnection={data.onRemoveConnection}
>
  {#snippet icon()}<Globe size={13} />{/snippet}
  {#snippet title()}
    <input
      class="portal-address nodrag"
      bind:value={address}
      onkeydown={handleKeydown}
      placeholder="https://..."
      spellcheck="false"
    />
  {/snippet}
  {#snippet actions()}
    <IconAction label={m['portal.navigate']()} onclick={navigate}><ArrowRight size={13} /></IconAction>
    <IconAction label={m['portal.close']()} danger onclick={() => data.onDelete(id)}><X size={13} /></IconAction>
  {/snippet}

  <div class="portal-body nodrag nowheel">
    {#if data.payload.url}
      {#if isDesktop}
        <webview bind:this={frame} src={data.payload.url} class="portal-frame" websecurity="no" allowpopups></webview>
      {:else}
        <iframe bind:this={frame} src={data.payload.url} title={data.title || m['portal.default_title']()} class="portal-frame"></iframe>
      {/if}
    {:else}
      <p class="portal-empty">{m['portal.empty']()}</p>
    {/if}
  </div>
</NodeShell>

<style>
  .portal-address {
    flex: 1;
    width: 100%;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--app-border);
    background: var(--app-canvas);
    color: var(--app-text);
    font-size: 12px;
    font-weight: 400;
  }

  .portal-body {
    flex: 1;
    min-height: 0;
    background: #fff;
  }

  .portal-frame {
    width: 100%;
    height: 100%;
    border: none;
    display: flex;
  }

  .portal-empty {
    color: var(--app-text-muted);
    font-size: 12px;
    padding: 12px;
    background: var(--app-canvas);
    height: 100%;
    margin: 0;
  }
</style>
