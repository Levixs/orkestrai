<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { Separator } from '$lib/components/ui/separator';
  import { TERMINAL_THEMES, TERMINAL_THEME_ORDER } from '$lib/components/agent-room/terminal-themes.js';

  let settings = $state<Record<string, string>>({});
  let saved = $state(false);

  onMount(async () => {
    document.documentElement.classList.add('dark');
    const response = await fetch('/api/agent-room/settings');
    const payload = await response.json();
    settings = payload.data ?? {};
  });

  async function save() {
    await fetch('/api/agent-room/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings),
    });
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  const SHORTCUTS: Array<[string, string]> = [
    ['Cmd/Ctrl+P', 'Paleta de comandos'],
    ['Cmd/Ctrl+Shift+A', 'Proximo agente com atencao'],
    ['Cmd/Ctrl+Shift+T', 'Organizar selecao em grade'],
    ['Cmd/Ctrl+G', 'Agrupar selecao'],
    ['Cmd/Ctrl+Shift+G', 'Desagrupar'],
    ['Cmd/Ctrl+Shift+!', 'Zoom para a selecao'],
    ['N', 'Nova nota'],
    ['L', 'Conectar selecionados'],
    ['Alt+1..9', 'Focar terminal por indice'],
    ['Alt+Espaco', 'Ditado por voz (terminal focado)'],
    ['Cmd/Ctrl+S', 'Salvar arquivo (editor)'],
    ['Backspace/Delete', 'Excluir no selecionado'],
  ];
</script>

<svelte:head>
  <title>Orkestrai — Configuracoes</title>
</svelte:head>

<main class="settings-page">
  <header class="settings-header">
    <Button variant="ghost" size="sm" href="/canvas">
      <ArrowLeft size={15} />
      Canvas
    </Button>
    <div>
      <h1>Configuracoes</h1>
      <p>Preferencias globais do app — aplicadas imediatamente ao salvar.</p>
    </div>
  </header>

  <section class="settings-section">
    <h2>Terminal</h2>
    <div class="field-row">
      <div class="field">
        <span class="field-label">Mostrar minimapa</span>
        <Select.Root type="single" value={settings.showMinimap} onValueChange={(value: string) => (settings = { ...settings, showMinimap: value })}>
          <Select.Trigger class="w-32" data-slot="select-trigger">
            {settings.showMinimap === 'true' ? 'Mostrar' : 'Ocultar'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="true">Mostrar</Select.Item>
            <Select.Item value="false">Ocultar</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
      <div class="field">
        <span class="field-label">Controles de zoom (+/-, lock)</span>
        <Select.Root type="single" value={settings.showControls} onValueChange={(value: string) => (settings = { ...settings, showControls: value })}>
          <Select.Trigger class="w-32" data-slot="select-trigger">
            {settings.showControls === 'true' ? 'Mostrar' : 'Ocultar'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="true">Mostrar</Select.Item>
            <Select.Item value="false">Ocultar</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </div>
    <div class="field">
      <span class="field-label">Tema padrao de novos terminais</span>
      <Select.Root type="single" value={settings.terminalTheme} onValueChange={(value: string) => (settings = { ...settings, terminalTheme: value })}>
        <Select.Trigger class="w-48" data-slot="select-trigger">
          {TERMINAL_THEMES[settings.terminalTheme as keyof typeof TERMINAL_THEMES]?.label ?? settings.terminalTheme}
        </Select.Trigger>
        <Select.Content>
          {#each TERMINAL_THEME_ORDER as theme}
            <Select.Item value={theme}>{TERMINAL_THEMES[theme].label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="field-label">Largura padrao (novo terminal)</span>
        <Input class="w-28" type="number" bind:value={settings.newTerminalWidth} />
      </div>
      <div class="field">
        <span class="field-label">Altura padrao</span>
        <Input class="w-28" type="number" bind:value={settings.newTerminalHeight} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="field-label">Largura padrao (nova nota)</span>
        <Input class="w-28" type="number" bind:value={settings.newNoteWidth} />
      </div>
      <div class="field">
        <span class="field-label">Altura padrao</span>
        <Input class="w-28" type="number" bind:value={settings.newNoteHeight} />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <span class="field-label">Tamanho da fonte (px)</span>
        <Input class="w-28" type="number" min="9" max="24" bind:value={settings.terminalFontSize} />
      </div>
      <div class="field" style="flex:1">
        <span class="field-label">Familia da fonte</span>
        <Input bind:value={settings.terminalFontFamily} placeholder="ui-monospace, Menlo, monospace" />
      </div>
      <div class="field">
        <span class="field-label">Padding</span>
        <Input class="w-28" type="number" min="0" max="24" bind:value={settings.terminalPadding} />
      </div>
    </div>
    <Button size="sm" onclick={save}>{saved ? 'Salvo!' : 'Salvar'}</Button>
  </section>

  <Separator />

  <section class="settings-section">
    <h2>Atalhos</h2>
    <table class="shortcuts">
      <tbody>
        {#each SHORTCUTS as [keys, description]}
          <tr>
            <td class="keys"><kbd>{keys}</kbd></td>
            <td>{description}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</main>

<style>
  .settings-page {
    min-height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
    padding: 28px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }

  .settings-page > * {
    width: min(680px, 100%);
  }

  .settings-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .settings-header h1 {
    font-size: 17px;
    margin: 0;
  }

  .settings-header p {
    margin: 0;
    font-size: 12px;
    color: #6d6d78;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    background: #1C1946;
    padding: 20px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .settings-section h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8b8c96;
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row {
    display: flex;
    gap: 16px;
  }

  .field-label {
    font-size: 12px;
    color: #8b8c96;
  }

  .shortcuts {
    font-size: 12px;
    border-collapse: collapse;
  }

  .shortcuts td {
    padding: 5px 10px 5px 0;
    color: #c7c8d0;
  }

  .shortcuts .keys {
    width: 180px;
  }

  kbd {
    background: #262155;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 11px;
  }
</style>
