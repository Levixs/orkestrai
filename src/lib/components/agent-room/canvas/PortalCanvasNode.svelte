<script lang="ts">
  import type { NodeProps } from '@xyflow/svelte';
  import { ArrowRight, Globe, X } from '@lucide/svelte';
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
    executeJavaScript: (code: string) => Promise<unknown>;
    capturePage: () => Promise<{ toDataURL: () => string }>;
  };

  let address = $state(data.payload.url ?? '');
  let frame: (WebviewElement | HTMLIFrameElement) | null = $state(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const isDesktop = typeof window !== 'undefined' && 'orkestraiDesktop' in window;

  async function postResult(commandId: string, ok: boolean, result?: unknown, error?: string) {
    await fetch(`/api/agent-room/workspaces/${data.workspaceId}/portal/${id}/commands/${commandId}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok, result, error }),
    }).catch(() => {});
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
          address = url;
          frame.src = url;
          data.onUrlChange?.(id, url);
          await postResult(command.id, true, { navigated: url });
          break;
        }
        case 'eval': {
          const result = await frame.executeJavaScript(String(command.args.js ?? ''));
          await postResult(command.id, true, result);
          break;
        }
        case 'dom': {
          const html = await frame.executeJavaScript('document.documentElement.outerHTML');
          await postResult(command.id, true, String(html).slice(0, 50_000));
          break;
        }
        case 'screenshot': {
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
    data.onUrlChange?.(id, url);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') navigate();
  }

  import { onMount } from 'svelte';

  onMount(() => {
    startPolling();
    return stopPolling;
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
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: #0D0B2E;
    color: #e6e6eb;
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
    color: #6d6d78;
    font-size: 12px;
    padding: 12px;
    background: #0D0B2E;
    height: 100%;
    margin: 0;
  }
</style>
