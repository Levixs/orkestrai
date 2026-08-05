<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Check, Keyboard, Layers, Mic, Pencil, RefreshCw, SquareTerminal, Trash2, Volume2 } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { TERMINAL_THEMES, TERMINAL_THEME_ORDER } from '$lib/components/agent-room/terminal-themes.js';
  import { DEFAULT_DICTATION_HOTKEY, comboFromEvent, comboLabel } from '$lib/components/agent-room/dictation-hotkey.js';
  import { getAppSettings, invalidateAppSettings } from '$lib/components/agent-room/app-settings.svelte.js';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';

  let settings = $state<Record<string, string>>({});
  let loaded = $state(false);
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
    loaded = true;
    await refreshModelStatus();
    await loadPresets();
    if (desktop?.appVersion) appVersion = await desktop.appVersion().catch(() => '');
    // Feedback da checagem manual: "ja esta na versao mais recente".
    desktop?.onUpdate?.((payload) => {
      if (payload.status === 'none' && checkingUpdate === false && updateMessage.startsWith('Verificando')) {
        updateMessage = 'Voce esta na versao mais recente.';
      }
    });
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
  let modelBytes = $state<number | null>(null);
  let confirmDeleteModels = $state(false);
  let deletingModels = $state(false);

  // -- Presets de equipe -------------------------------------------------------
  type Preset = { id: string; name: string; icon: string | null; description: string | null; agents: number };
  let presets = $state<Preset[]>([]);
  let editingPresetId = $state<string | null>(null);
  let presetDraft = $state('');
  let deletingPreset = $state<Preset | null>(null);

  async function loadPresets() {
    try {
      const response = await fetch('/api/agent-room/presets');
      presets = (await response.json()).data ?? [];
    } catch {
      presets = [];
    }
  }

  function startPresetRename(preset: Preset) {
    editingPresetId = preset.id;
    presetDraft = preset.name;
  }

  async function renamePreset(preset: Preset) {
    const name = presetDraft.trim();
    editingPresetId = null;
    if (!name || name === preset.name) return;
    await fetch(`/api/agent-room/presets/${preset.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await loadPresets();
  }

  async function deletePreset() {
    if (!deletingPreset) return;
    await fetch(`/api/agent-room/presets/${deletingPreset.id}`, { method: 'DELETE' });
    deletingPreset = null;
    await loadPresets();
  }
  type DesktopBridge = {
    appVersion?: () => Promise<string>;
    checkForUpdates?: () => Promise<{ status: string; message?: string }>;
    onUpdate?: (callback: (payload: { status: string }) => void) => () => void;
  };
  const desktop =
    typeof window !== 'undefined'
      ? (window as unknown as { orkestraiDesktop?: DesktopBridge }).orkestraiDesktop
      : undefined;
  let appVersion = $state('');
  let checkingUpdate = $state(false);
  let updateMessage = $state('');

  async function checkUpdates() {
    if (!desktop?.checkForUpdates) return;
    checkingUpdate = true;
    updateMessage = '';
    try {
      const result = await desktop.checkForUpdates();
      if (result.status === 'unsupported') updateMessage = 'Atualizacao automatica so existe no app instalado.';
      else if (result.status === 'error') updateMessage = 'Nao consegui verificar agora — tente mais tarde.';
      else updateMessage = 'Verificando... se houver versao nova, o download comeca sozinho.';
    } finally {
      checkingUpdate = false;
    }
  }

  async function refreshModelStatus() {
    try {
      const response = await fetch('/api/agent-room/voice/models');
      const status = (await response.json()).data;
      modelBytes = status.ready ? (status.bytes ?? 0) : 0;
    } catch {
      modelBytes = null;
    }
  }

  async function deleteModels() {
    deletingModels = true;
    try {
      await fetch('/api/agent-room/voice/models', { method: 'DELETE' });
      invalidateAppSettings();
      await getAppSettings(true);
      modelBytes = 0;
      voiceHealth = null;
    } finally {
      deletingModels = false;
      confirmDeleteModels = false;
    }
  }

  function formatMb(bytes: number) {
    return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
  }

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
      <ArrowLeft size={15} aria-hidden="true" />
      Canvas
    </Button>
    <div class="header-titles">
      <h1>Configuracoes</h1>
      <p>Preferencias globais do app — aplicadas imediatamente ao salvar.</p>
    </div>
    <span class="header-spacer"></span>
    <Button size="sm" onclick={save} class="save-btn">
      {#if saved}<Check size={14} aria-hidden="true" />Salvo!{:else}Salvar alteracoes{/if}
    </Button>
  </header>

  {#if !loaded}
    {#each [0, 1, 2] as index (index)}
      <section class="settings-section" aria-hidden="true">
        <div class="section-skeleton-head">
          <Skeleton class="h-[30px] w-[30px] rounded-[9px] bg-white/8" />
          <div class="section-skeleton-titles">
            <Skeleton class="h-4 w-32 bg-white/8" />
            <Skeleton class="h-3 w-52 bg-white/8" />
          </div>
        </div>
        <div class="grid-fields">
          <Skeleton class="h-9 w-full bg-white/8" />
          <Skeleton class="h-9 w-full bg-white/8" />
          <Skeleton class="h-9 w-full bg-white/8" />
        </div>
      </section>
    {/each}
  {:else}
  <section class="settings-section">
    <header class="section-head">
      <span class="icon-chip"><SquareTerminal size={15} aria-hidden="true" /></span>
      <div class="section-titles">
        <h2>Terminal</h2>
        <p>Minimapa, controles do canvas, tema e dimensoes padrao dos nos.</p>
      </div>
    </header>

    <div class="grid-fields">
      <div class="field">
        <span class="field-label">Minimapa do canvas</span>
        <Select.Root type="single" value={settings.showMinimap} onValueChange={(value: string) => (settings = { ...settings, showMinimap: value })}>
          <Select.Trigger data-slot="select-trigger">
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
          <Select.Trigger data-slot="select-trigger">
            {settings.showControls === 'true' ? 'Mostrar' : 'Ocultar'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="true">Mostrar</Select.Item>
            <Select.Item value="false">Ocultar</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
      <div class="field">
        <span class="field-label">Tema de novos terminais</span>
        <Select.Root type="single" value={settings.terminalTheme} onValueChange={(value: string) => (settings = { ...settings, terminalTheme: value })}>
          <Select.Trigger data-slot="select-trigger">
            {TERMINAL_THEMES[settings.terminalTheme as keyof typeof TERMINAL_THEMES]?.label ?? settings.terminalTheme}
          </Select.Trigger>
          <Select.Content>
            {#each TERMINAL_THEME_ORDER as theme}
              <Select.Item value={theme}>{TERMINAL_THEMES[theme].label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <div class="grid-fields">
      <div class="field">
        <span class="field-label">Tamanho da fonte (px)</span>
        <Input type="number" min="9" max="24" bind:value={settings.terminalFontSize} />
      </div>
      <div class="field span-2">
        <span class="field-label">Familia da fonte</span>
        <Input bind:value={settings.terminalFontFamily} placeholder="ui-monospace, Menlo, monospace" />
      </div>
      <div class="field">
        <span class="field-label">Padding</span>
        <Input type="number" min="0" max="24" bind:value={settings.terminalPadding} />
      </div>
    </div>

    <div class="grid-fields">
      <div class="field">
        <span class="field-label">Largura do terminal (px)</span>
        <Input type="number" bind:value={settings.newTerminalWidth} />
      </div>
      <div class="field">
        <span class="field-label">Altura do terminal (px)</span>
        <Input type="number" bind:value={settings.newTerminalHeight} />
      </div>
      <div class="field">
        <span class="field-label">Largura da nota (px)</span>
        <Input type="number" bind:value={settings.newNoteWidth} />
      </div>
      <div class="field">
        <span class="field-label">Altura da nota (px)</span>
        <Input type="number" bind:value={settings.newNoteHeight} />
      </div>
    </div>
  </section>

  <section class="settings-section">
    <header class="section-head">
      <span class="icon-chip"><Mic size={15} aria-hidden="true" /></span>
      <div class="section-titles">
        <h2>Ditado por voz</h2>
        <p>Atalho que transcreve sua fala direto no terminal focado.</p>
      </div>
    </header>

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
        Transcricao 100% offline, roda local no app. Na primeira vez o app baixa o modelo de
        voz (~790 MB) uma unica vez — pergunta antes. Se outro app do sistema usa o mesmo
        atalho global, escolha uma combinacao diferente aqui.
      </p>
    </div>
  </section>

  <section class="settings-section">
    <header class="section-head">
      <span class="icon-chip"><Volume2 size={15} aria-hidden="true" /></span>
      <div class="section-titles">
        <h2>Voz (ditado e fala pt-BR)</h2>
        <p>Motor local por padrao; servico externo como opcao avancada.</p>
      </div>
    </header>

    <div class="grid-fields">
      <div class="field">
        <span class="field-label">Motor de voz</span>
        <Select.Root type="single" value={settings.voiceBackend ?? 'embedded'} onValueChange={(value: string) => (settings = { ...settings, voiceBackend: value })}>
          <Select.Trigger data-slot="select-trigger">
            {(settings.voiceBackend ?? 'embedded') === 'embedded' ? 'Local (recomendado)' : 'Servico externo (Docker)'}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="embedded">Local (recomendado)</Select.Item>
            <Select.Item value="sidecar">Servico externo (Docker)</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
      <div class="field">
        <span class="field-label">Voz das respostas</span>
        <Select.Root type="single" value={settings.voiceTtsVoice} onValueChange={(value: string) => (settings = { ...settings, voiceTtsVoice: value })}>
          <Select.Trigger data-slot="select-trigger">
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

    {#if (settings.voiceBackend ?? 'embedded') === 'sidecar'}
      <div class="grid-fields">
        <div class="field">
          <span class="field-label">URL do sidecar</span>
          <Input bind:value={settings.voiceStackUrl} placeholder="http://localhost:8000" />
        </div>
        <div class="field">
          <span class="field-label">Modelo STT (sidecar)</span>
          <Input bind:value={settings.voiceSttModel} placeholder="whisper-large-v3-turbo" />
        </div>
      </div>
    {/if}

    <div class="hotkey-row">
      <Button variant="outline" size="sm" disabled={checkingVoice} onclick={checkVoiceStack}>
        {checkingVoice ? 'Testando...' : 'Testar conexao'}
      </Button>
      {#if voiceHealth}
        <span class="status-pill" class:ok={voiceHealth.ok}>
          <span class="status-dot"></span>
          {voiceHealth.ok ? `${voiceHealth.url === 'embedded' ? 'Motor local ativo' : `Sidecar no ar (${voiceHealth.url})`}${voiceHealth.detail ? ` — ${voiceHealth.detail}` : ''}` : `Fora do ar (${voiceHealth.url})${voiceHealth.detail ? ` — ${voiceHealth.detail}` : ''}`}
        </span>
      {/if}
    </div>

    {#if modelBytes !== null && modelBytes > 0}
      <div class="model-card">
        <div class="model-info">
          <span class="field-label">Modelo de voz baixado</span>
          <strong class="model-size">{formatMb(modelBytes)}</strong>
        </div>
        <Button variant="outline" size="sm" onclick={() => (confirmDeleteModels = true)}>
          Apagar modelo (liberar espaco)
        </Button>
      </div>
    {/if}

    <p class="field-hint">
      Na primeira vez o app baixa o modelo de voz (whisper, ~790 MB) uma unica vez —
      pergunta antes. Depois disso tudo roda local.
    </p>
  </section>

  <AlertDialog.Root bind:open={confirmDeleteModels}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Apagar o modelo de voz?</AlertDialog.Title>
        <AlertDialog.Description>
          Isso libera {modelBytes ? formatMb(modelBytes) : 'espaco'} de disco. Ditado e fala
          param ate voce baixar de novo (o app pergunta antes de baixar).
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel onclick={() => (confirmDeleteModels = false)}>Cancelar</AlertDialog.Cancel>
        <AlertDialog.Action disabled={deletingModels} onclick={deleteModels}>
          {deletingModels ? 'Apagando...' : 'Apagar'}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>

  <section class="settings-section">
    <header class="section-head">
      <span class="icon-chip"><Keyboard size={15} aria-hidden="true" /></span>
      <div class="section-titles">
        <h2>Atalhos</h2>
        <p>Referencia rapida dos atalhos do canvas e dos terminais.</p>
      </div>
    </header>
    <div class="shortcuts-grid">
      {#each SHORTCUTS as [keys, description]}
        <div class="shortcut-row">
          <kbd>{keys}</kbd>
          <span class="shortcut-desc">{description}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="settings-section">
    <header class="section-head">
      <span class="icon-chip"><Layers size={15} aria-hidden="true" /></span>
      <div class="section-titles">
        <h2>Presets de equipe</h2>
        <p>Templates salvos dos seus workspaces — aparecem ao criar um workspace novo.</p>
      </div>
    </header>
    {#if presets.length === 0}
      <p class="field-hint">Nenhum preset ainda. Monte um time no canvas e use "Salvar como preset" no editor do workspace.</p>
    {:else}
      <ul class="preset-list">
        {#each presets as preset (preset.id)}
          <li class="preset-row">
            <span class="preset-icon">{preset.icon ?? '📦'}</span>
            {#if editingPresetId === preset.id}
              <input
                class="preset-rename"
                bind:value={presetDraft}
                aria-label="Renomear preset"
                onkeydown={(event) => {
                  if (event.key === 'Enter') renamePreset(preset);
                  if (event.key === 'Escape') editingPresetId = null;
                }}
                onblur={() => renamePreset(preset)}
              />
            {:else}
              <span class="preset-name">{preset.name}</span>
            {/if}
            <span class="preset-meta">{preset.agents} agentes{preset.description ? ` · ${preset.description}` : ''}</span>
            <button class="preset-action" aria-label={`Renomear ${preset.name}`} onclick={() => startPresetRename(preset)}>
              <Pencil size={12} />
            </button>
            <button class="preset-action danger" aria-label={`Apagar ${preset.name}`} onclick={() => (deletingPreset = preset)}>
              <Trash2 size={12} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <AlertDialog.Root open={deletingPreset !== null} onOpenChange={(isOpen) => !isOpen && (deletingPreset = null)}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Apagar preset</AlertDialog.Title>
        <AlertDialog.Description>
          Apagar o preset "{deletingPreset?.name}"? Workspaces ja criados com ele nao mudam nada.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Cancelar</AlertDialog.Cancel>
        <AlertDialog.Action onclick={deletePreset}>Apagar</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>

  <section class="settings-section">
    <header class="section-head">
      <span class="icon-chip"><RefreshCw size={15} aria-hidden="true" /></span>
      <div class="section-titles">
        <h2>Atualizacoes</h2>
        <p>O app busca versao nova sozinho (no boot e a cada 6h) e instala na troca — seus dados ficam intactos.</p>
      </div>
    </header>
    <div class="hotkey-row">
      <span class="field-label">Versao instalada: <strong class="model-size">{appVersion || '—'}</strong></span>
      {#if desktop?.checkForUpdates}
        <Button variant="outline" size="sm" disabled={checkingUpdate} onclick={checkUpdates}>
          {checkingUpdate ? 'Verificando...' : 'Verificar agora'}
        </Button>
      {/if}
    </div>
    {#if updateMessage}
      <p class="field-hint">{updateMessage}</p>
    {/if}
  </section>
  {/if}
</main>

<style>
  .settings-page {
    min-height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
    padding: 24px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    align-items: center;
    -webkit-font-smoothing: antialiased;
  }

  .settings-page > * {
    width: min(760px, 100%);
  }

  /* ---- Cabecalho fixo com o Salvar sempre a mao ------------------------ */
  .settings-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0 14px;
    background: linear-gradient(180deg, #0D0B2E 78%, transparent);
  }

  .header-titles h1 {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
  }

  .header-titles p {
    margin: 1px 0 0;
    font-size: 12px;
    color: #8b8c96;
  }

  .header-spacer {
    flex: 1;
  }

  :global(.save-btn) {
    min-width: 132px;
    transition: transform 120ms ease;
  }

  :global(.save-btn:active) {
    transform: scale(0.97);
  }

  /* ---- Secoes como cartoes (mesma linguagem da pagina Como usar) ------- */
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    background: #1A1742;
    padding: 18px 20px 20px;
    transition: border-color 160ms ease;
  }

  .settings-section:hover {
    border-color: rgba(255, 255, 255, 0.11);
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: rgba(91, 141, 239, 0.12);
    color: #7DE5FF;
    flex-shrink: 0;
  }

  .section-titles h2 {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    letter-spacing: -0.005em;
    margin: 0;
    color: #e6e6eb;
  }

  .section-titles p {
    margin: 1px 0 0;
    font-size: 12px;
    color: #8b8c96;
  }

  .section-skeleton-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .section-skeleton-titles {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ---- Presets ------------------------------------------------------------ */
  .preset-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preset-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(13, 11, 46, 0.55);
  }

  .preset-icon {
    flex-shrink: 0;
  }

  .preset-name {
    font-size: 12.5px;
    font-weight: 500;
    color: #e6e6eb;
  }

  .preset-meta {
    flex: 1;
    font-size: 11px;
    color: #6d6d78;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preset-rename {
    font-size: 12.5px;
    background: #262155;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: #e6e6eb;
    padding: 3px 8px;
    outline: none;
  }

  .preset-action {
    display: inline-flex;
    padding: 4px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: #8b8c96;
    cursor: pointer;
  }

  .preset-action:hover {
    color: #e6e6eb;
    background: rgba(255, 255, 255, 0.07);
  }

  .preset-action.danger:hover {
    color: #ff9c9f;
  }

  /* ---- Campos em grade responsiva --------------------------------------- */
  .grid-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 14px 16px;
  }

  .span-2 {
    grid-column: span 2;
  }

  @media (max-width: 560px) {
    .span-2 {
      grid-column: span 1;
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field-label {
    font-size: 12px;
    font-weight: 500;
    color: #a9aab3;
  }

  .field-hint {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.6;
    color: #6d6d78;
    text-wrap: pretty;
  }

  .hotkey-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  :global(.hotkey-capture) {
    min-width: 150px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums;
  }

  :global(.hotkey-capture.capturing) {
    border-color: #7c4dff;
    color: #b79cff;
  }

  /* ---- Status da voz em pildula ---------------------------------------- */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    color: #ff9c9f;
    background: rgba(229, 72, 77, 0.1);
  }

  .status-pill.ok {
    color: #3dd68c;
    background: rgba(61, 214, 140, 0.1);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  /* ---- Cartao interno do modelo (raio concentrico: 14 - 6 = 8+) -------- */
  .model-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(13, 11, 46, 0.55);
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .model-size {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #e6e6eb;
  }

  /* ---- Atalhos em grade ------------------------------------------------- */
  .shortcuts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 9px 24px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  kbd {
    flex-shrink: 0;
    min-width: 44px;
    text-align: center;
    background: #262155;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-bottom-width: 2px;
    border-radius: 6px;
    padding: 3px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: #c9cad2;
  }

  .shortcut-desc {
    font-size: 12px;
    color: #a9aab3;
    text-wrap: pretty;
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-section,
    :global(.save-btn) {
      transition: none;
    }
  }
</style>
