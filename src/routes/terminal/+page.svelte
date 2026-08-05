<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, SquareTerminal, X } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import TerminalNode, { type CreatePtyRequest } from '$lib/components/agent-room/TerminalNode.svelte';
  import type { AgentProviderInfo } from '$lib/modules/agent-room/domain/types.js';
  import * as m from '$lib/paraglide/messages.js';

  type TerminalInstance = {
    key: string;
    title: string;
    createRequest: CreatePtyRequest;
  };

  let providers = $state<AgentProviderInfo[]>([]);
  let terminals = $state<TerminalInstance[]>([]);
  let cwd = $state('');

  onMount(async () => {
    document.documentElement.classList.add('dark');
    const response = await fetch('/api/agent-room/status');
    const payload = await response.json();
    providers = payload.data?.providers ?? [];
  });

  function openShell() {
    const shell = navigator.platform.startsWith('Win') ? 'powershell.exe' : '/bin/zsh';
    addTerminal(m['termpage.shell_btn'](), { command: shell, cwd: cwd || '.' });
  }

  function openAgent(provider: AgentProviderInfo) {
    if (!provider.tui) return;
    addTerminal(provider.displayName, {
      command: provider.tui.command,
      args: provider.tui.args,
      cwd: cwd || '.',
    });
  }

  function addTerminal(title: string, createRequest: CreatePtyRequest) {
    terminals = [...terminals, { key: crypto.randomUUID(), title, createRequest }];
  }

  function closeTerminal(key: string) {
    terminals = terminals.filter((terminal) => terminal.key !== key);
  }
</script>

<svelte:head>
  <title>Orkestrai — {m['termpage.title']()}</title>
</svelte:head>

<main class="terminals-page">
  <header class="toolbar">
    <Button variant="ghost" size="sm" href="/canvas">
      <ArrowLeft size={15} />
      {m['termpage.back_canvas']()}
    </Button>
    <h1>{m['termpage.title']()}</h1>
    <Input class="cwd-input" bind:value={cwd} placeholder={m['ph.cwd_terminal']()} />
    <Button variant="secondary" size="sm" onclick={openShell}>{m['termpage.shell_btn']()}</Button>
    {#each providers as provider}
      <Button variant="secondary" size="sm" disabled={!provider.installed} onclick={() => openAgent(provider)}>
        {provider.displayName}
      </Button>
    {/each}
  </header>

  <section class="terminals-grid">
    {#each terminals as terminal (terminal.key)}
      <div class="terminal-card">
        <header>
          <span class="card-title">
            <SquareTerminal size={13} />
            <strong>{terminal.title}</strong>
          </span>
          <Button variant="ghost" size="icon" class="close" onclick={() => closeTerminal(terminal.key)}>
            <X size={14} />
          </Button>
        </header>
        <div class="terminal-body">
          <TerminalNode createRequest={terminal.createRequest} />
        </div>
      </div>
    {/each}
    {#if terminals.length === 0}
      <p class="empty">{m['termpage.empty']()}</p>
    {/if}
  </section>
</main>

<style>
  .terminals-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
    padding: 12px;
    gap: 12px;
    box-sizing: border-box;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .toolbar h1 {
    font-size: 15px;
    margin: 0 8px 0 0;
  }

  .toolbar :global(.cwd-input) {
    flex: 1;
    min-width: 220px;
  }

  .terminals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(560px, 1fr));
    gap: 12px;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .terminal-card {
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    overflow: hidden;
    min-height: 320px;
    background: #1C1946;
  }

  .terminal-card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: #262155;
    font-size: 12px;
  }

  .card-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .terminal-body {
    flex: 1;
    min-height: 0;
  }

  .empty {
    color: #6d6d78;
    font-size: 14px;
  }
</style>
