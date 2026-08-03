<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { Separator } from '$lib/components/ui/separator';
  import { TERMINAL_THEMES, TERMINAL_THEME_ORDER } from '$lib/components/agent-room/terminal-themes.js';
  import { DEFAULT_DICTATION_HOTKEY, comboFromEvent, comboLabel } from '$lib/components/agent-room/dictation-hotkey.js';
  import { getAppSettings, invalidateAppSettings } from '$lib/components/agent-room/app-settings.svelte.js';

  let settings = $state<Record<string, string>>({});
  let saved = $state(false);
  let capturingHotkey = $state(false);

  const hotkeyLabel = $derived(comboLabel(settings.dictationHotkey || DEFAULT_DICTATION_HOTKEY));

  function captureHotkey(event: KeyboardEvent) {
    if (!capturingHotkey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      capturingHotkey = false;
      return;
    }
    const combo = comboFromEvent(event);
    if (!combo) return; // modificador puro — espera a tecla principal
    settings = { ...settings, dictationHotkey: combo };
    capturingHotkey = false;
  }

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
    // Invalida a store reativa: terminais aplicam o novo atalho na hora.
    invalidateAppSettings();
    await getAppSettings(true);
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  type VoiceHealth = { ok: boolean; url: string; detail?: string };
  let voiceHealth = $state<VoiceHealth | null>(null);
  let checkingVoice = $state(false);

  async function checkVoiceStack() {
    checkingVoice = true;
    try {
      // Salva antes de testar (a URL testada e a das settings salvas).
      await save();
      const response = await fetch('/api/agent-room/voice/health');
      voiceHealth = (await response.json()).data ?? null;
    } catch {
      voiceHealth = { ok: false, url: settings.voiceStackUrl ?? '', detail: 'falha na consulta' };
    } finally {
      checkingVoice = false;
    }
  }

  const SHORTCUTS = $derived<Array<[string, string]>>([
    ['Cmd/Ctrl+P', 'Paleta de comandos'],
    ['Cmd/Ctrl+Shift+A', 'Proximo agente com atencao'],
    ['Cmd/Ctrl+Shift+T', 'Organizar selecao em grade'],
    ['Cmd/Ctrl+G', 'Agrupar selecao'],
    ['Cmd/Ctrl+Shift+G', 'Desagrupar'],
    ['Cmd/Ctrl+Shift+!', 'Zoom para a selecao'],
    ['N', 'Nova nota'],
    ['L', 'Conectar selecionados'],
    ['Alt+1..9', 'Focar terminal por indice'],
    [hotkeyLabel, 'Ditado por voz (terminal focado)'],
    ['Cmd/Ctrl+S', 'Salvar arquivo (editor)'],
    ['Backspace/Delete', 'Excluir no selecionado'],
  ]);
</script>

<svelte:head>
  <title>Orkestrai — Configuracoes</title>
</svelte:head>

<svelte:window onkeydown={captureHotkey} />

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
    <h2>Ditado por voz</h2>
    <div class="field">
      <span class="field-label">Tecla de atalho (terminal focado)</span>
      <div class="hotkey-row">
        <Button
          variant="outline"
          size="sm"
          class={capturingHotkey ? 'hotkey-capture capturing' : 'hotkey-capture'}
          onclick={() => (capturingHotkey = true)}
        >
          {capturingHotkey ? 'Pressione as teclas... (Esc cancela)' : hotkeyLabel}
        </Button>
        {#if settings.dictationHotkey && settings.dictationHotkey !== DEFAULT_DICTATION_HOTKEY}
          <Button variant="ghost" size="sm" onclick={() => (settings = { ...settings, dictationHotkey: DEFAULT_DICTATION_HOTKEY })}>
            Restaurar padrao
          </Button>
        {/if}
      </div>
      <p class="field-hint">
        Transcricao 100% offline (whisper.cpp no navegador). No primeiro uso o modelo de ~57 MB e
        baixado uma unica vez e fica em cache. Se outro app do sistema usa o mesmo atalho global,
        escolha uma combinacao diferente aqui.
      </p>
    </div>
    <Button size="sm" onclick={save}>{saved ? 'Salvo!' : 'Salvar'}</Button>
  </section>

  <Separator />

  <section class="settings-section">
    <h2>Voz (sidecar voice-stack)</h2>
    <p class="field-hint">
      Ditado e voz de volta rodam no sidecar local (API compativel com OpenAI, STT
      faster-whisper + TTS Kokoro com vozes pt-BR). Suba com
      <code>cd voice-stack && docker compose up --build</code>.
    </p>
    <div class="field">
      <span class="field-label">URL do sidecar</span>
      <Input bind:value={settings.voiceStackUrl} placeholder="http://localhost:8000" />
    </div>
    <div class="field-row">
      <div class="field" style="flex:1">
        <span class="field-label">Modelo STT (transcricao)</span>
        <Input bind:value={settings.voiceSttModel} placeholder="whisper-large-v3-turbo" />
      </div>
      <div class="field">
        <span class="field-label">Voz TTS (respostas)</span>
        <Select.Root type="single" value={settings.voiceTtsVoice} onValueChange={(value: string) => (settings = { ...settings, voiceTtsVoice: value })}>
          <Select.Trigger class="w-40" data-slot="select-trigger">
            {settings.voiceTtsVoice ?? 'pf_dora'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="pf_dora">pf_dora (feminina)</Select.Item>
            <Select.Item value="pm_alex">pm_alex (masculina)</Select.Item>
            <Select.Item value="pm_santa">pm_santa (masculina)</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </div>
    <div class="hotkey-row">
      <Button variant="outline" size="sm" disabled={checkingVoice} onclick={checkVoiceStack}>
        {checkingVoice ? 'Testando...' : 'Testar conexao'}
      </Button>
      {#if voiceHealth}
        <span class="voice-status" class:ok={voiceHealth.ok}>
          {voiceHealth.ok ? `Sidecar no ar (${voiceHealth.url})${voiceHealth.detail ? ` — ${voiceHealth.detail}` : ''}` : `Fora do ar (${voiceHealth.url})${voiceHealth.detail ? ` — ${voiceHealth.detail}` : ''}`}
        </span>
      {/if}
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

  .field-hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.5;
    color: #6d6d78;
  }

  .hotkey-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .voice-status {
    font-size: 11px;
    color: #e5484d;
  }

  .voice-status.ok {
    color: #3dd68c;
  }

  .field-hint code {
    background: #262155;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
  }

  :global(.hotkey-capture) {
    min-width: 150px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  :global(.hotkey-capture.capturing) {
    border-color: #7c4dff;
    color: #b79cff;
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
