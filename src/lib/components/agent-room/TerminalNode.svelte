<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import { SearchAddon } from '@xterm/addon-search';
  import { Mic, Square, Volume2, VolumeX } from '@lucide/svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Select from '$lib/components/ui/select';
  import HeaderIconButton from './canvas/HeaderIconButton.svelte';
  import VoiceConfirmDialog from './VoiceConfirmDialog.svelte';
  import '@xterm/xterm/css/xterm.css';
  import { TERMINAL_THEMES, type TerminalThemeName } from './terminal-themes.js';
  import { DEFAULT_DICTATION_HOTKEY, comboLabel, matchesCombo } from './dictation-hotkey.js';
  import { appSettingsStore, getAppSettings } from './app-settings.svelte.js';
  import { blobToWav16k } from './audio-pcm.js';

  export type CreatePtyRequest = {
    command: string;
    args?: string[];
    cwd: string;
    env?: Record<string, string>;
  };

  type Props = {
    /** Se presente, anexa a uma sessao existente; senao cria uma nova. */
    sessionId?: string;
    createRequest?: CreatePtyRequest;
    /** Provider do agente (para rastrear o session-id da CLI). */
    provider?: string;
    /** Workspace do no (filtra eventos de broadcast, ex.: talking). */
    workspaceId?: string;
    /** Rotulos para a notificacao nativa de fim de sessao. */
    sessionLabel?: string;
    workspaceName?: string;
    onExit?: (exitCode: number) => void;
    onSessionCreated?: (sessionId: string) => void;
    /** Cmd/Ctrl+clique num caminho de arquivo detectado no output. */
    onOpenPath?: (path: string) => void;
    /** Sessao PTY nao existe mais (servidor reiniciou) — recriar/retomar. */
    onRespawn?: () => void;
    /** Session-id real da CLI descoberto (para resume exato). */
    onAgentSession?: (agentSessionId: string) => void;
    /** Edge conversando (bridge ask) — repassado pela pagina do canvas. */
    onTalking?: (payload: { from: string | null; to: string; talking: boolean }) => void;
    /** Resposta de um ask destinada a este no (para voz de volta, TTS). */
    onAgentReply?: (payload: { to: string; from: string | null; text: string }) => void;
    /** Voz de volta ativa + toggle (botao junto ao mic). */
    voiceOn?: boolean;
    onToggleVoice?: () => void;
    /** Tema do terminal (payload.theme). */
    themeName?: TerminalThemeName;
  };

  let { sessionId, createRequest, provider, workspaceId, sessionLabel, workspaceName, onExit, onSessionCreated, onOpenPath, onRespawn, onAgentSession, onTalking, onAgentReply, voiceOn = false, onToggleVoice, themeName = 'dark' }: Props = $props();

  let container: HTMLDivElement;
  let xtermInstance: Terminal | null = null;
  let terminalPaddingPx = $state(6);
  let statusMessage = $state('');
  let exited = $state<number | null>(null);
  let waiting = $state(false);

  // -- Ditado por voz (sidecar voice-stack: faster-whisper/Kokoro) ----------
  let dictating = $state(false);
  let transcribing = $state(false);
  let dictateLang = $state<'auto' | 'pt' | 'en'>('pt');
  let dictateError = $state('');
  let dictateStatus = $state('');
  let voiceConfirmOpen = $state(false);
  /** Atalho REATIVO da store global (mudanca em Configuracoes aplica na hora). */
  const dictateHotkey = $derived(appSettingsStore.values.dictationHotkey || DEFAULT_DICTATION_HOTKEY);
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let audioChunks: Blob[] = [];
  let sendInput: ((data: string) => void) | null = null;
  let recSeconds = $state(0);
  let recTimer: ReturnType<typeof setInterval> | null = null;

  function startRecTimer() {
    recSeconds = 0;
    recTimer = setInterval(() => (recSeconds += 1), 1_000);
  }

  function stopRecTimer() {
    if (recTimer) clearInterval(recTimer);
    recTimer = null;
    recSeconds = 0;
  }

  const dictationSupported = typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  function stopTracks() {
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  async function toggleDictation() {
    dictateError = '';
    if (dictating) {
      mediaRecorder?.stop();
      return;
    }
    if (transcribing) return;
    // 1o uso: confirma o download dos modelos (~2 GB) ANTES de gravar.
    if (appSettingsStore.values.voiceModelsConfirmed !== 'true') {
      voiceConfirmOpen = true;
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      dictateError = 'Sem acesso ao microfone. Verifique as permissoes do sistema.';
      return;
    }
    audioChunks = [];
    const recorder = new MediaRecorder(mediaStream);
    mediaRecorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    recorder.onstop = async () => {
      stopTracks();
      stopRecTimer();
      mediaRecorder = null;
      dictating = false;
      transcribing = true;
      dictateStatus = 'Transcrevendo...';
      try {
        const blob = new Blob(audioChunks, { type: recorder.mimeType || 'audio/webm' });
        // Decodifica no renderer: o backend embarcado espera WAV PCM16 16 kHz.
        const wav = await blobToWav16k(blob);
        const form = new FormData();
        form.append('file', wav, 'ditado.wav');
        if (dictateLang !== 'auto') form.append('language', dictateLang);
        const response = await fetch('/api/agent-room/voice/transcribe', { method: 'POST', body: form });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error) throw new Error(payload.error || `Erro ${response.status}`);
        const text = String(payload.data?.text ?? '').trim();
        if (text) sendInput?.(text);
        else dictateError = 'Nada foi transcrito. Tente falar mais perto do microfone.';
      } catch (error) {
        dictateError = error instanceof Error ? error.message : 'Erro no ditado.';
      } finally {
        transcribing = false;
        dictateStatus = '';
      }
    };
    recorder.start();
    dictating = true;
    startRecTimer();
  }

  let searchOpen = $state(false);
  let searchQuery = $state('');
  let searchAddon: SearchAddon | null = null;

  function handleDictateHotkey(event: KeyboardEvent) {
    if (matchesCombo(event, dictateHotkey)) {
      event.preventDefault();
      toggleDictation();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      searchOpen = !searchOpen;
      return;
    }
    if (event.key === 'Escape' && searchOpen) {
      searchOpen = false;
      searchAddon?.clearDecorations();
      return;
    }
    if (event.key === 'Enter' && searchOpen && searchQuery) {
      searchAddon?.findNext(searchQuery);
    }
  }

  export function isWaiting() {
    return waiting;
  }

  onMount(() => {
    let fontSize = 13;
    let fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme: TERMINAL_THEMES[themeName]?.theme ?? TERMINAL_THEMES.dark.theme,
      scrollback: 5000,
    });
    xtermInstance = terminal;

    (async () => {
      try {
        const settings = await getAppSettings(true);
        const nextSize = Number(settings.terminalFontSize) || 13;
        const nextFamily = settings.terminalFontFamily || fontFamily;
        terminalPaddingPx = Number(settings.terminalPadding ?? 6);
        terminal.options.fontSize = nextSize;
        terminal.options.fontFamily = nextFamily;
      } catch {
        // defaults
      }
    })();

    const fitAddon = new FitAddon();
    searchAddon = new SearchAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.open(container);
    fitAddon.fit();

    // Cmd/Ctrl+clique em caminhos de arquivo (ex.: src/index.ts:42, ./a/b.js).
    if (onOpenPath) {
      terminal.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
          const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
          if (!line) {
            callback(undefined);
            return;
          }
          const text = line.translateToString();
          const pattern = /(?:\.|~)?\/?(?:[\w.@+-]+\/)+[\w.@+-]+(?::\d+)?/g;
          const links = [];
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const raw = match[0];
            links.push({
              range: { start: { x: match.index + 1, y: bufferLineNumber }, end: { x: match.index + raw.length, y: bufferLineNumber } },
              text: raw,
              activate: (event: MouseEvent, linkText: string) => {
                if (event.metaKey || event.ctrlKey) {
                  onOpenPath(linkText.replace(/:\d+$/, ''));
                }
              },
            });
          }
          callback(links.length ? links : undefined);
        },
      });
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws/agent-room/pty`);

    const send = (payload: Record<string, unknown>) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    };

    socket.onopen = () => {
      if (sessionId) {
        send({ type: 'attach', sessionId });
      } else if (createRequest) {
        send({
          type: 'create',
          ...createRequest,
          provider,
          label: sessionLabel,
          workspace: workspaceName,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      } else {
        statusMessage = 'Nenhuma sessao informada.';
      }
    };

    let createdSessionId: string | undefined;
    const currentSessionId = () => createdSessionId ?? sessionId;

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      switch (message.type) {
        case 'created':
          createdSessionId = message.session.id;
          onSessionCreated?.(message.session.id);
          if (message.scrollback) terminal.write(message.scrollback);
          statusMessage = '';
          break;
        case 'attached':
          if (message.scrollback) terminal.write(message.scrollback);
          statusMessage = '';
          waiting = Boolean(message.session?.waiting);
          if (message.session?.exited) exited = message.session.exitCode ?? 0;
          break;
        case 'output':
          terminal.write(message.data);
          break;
        case 'attention':
          waiting = Boolean(message.waiting);
          break;
        case 'exit':
          waiting = false;
          exited = message.exitCode;
          onExit?.(message.exitCode);
          break;
        case 'agentSession':
          if (!message.sessionId || message.sessionId === currentSessionId()) {
            onAgentSession?.(String(message.agentSessionId));
          }
          break;
        case 'talking':
          if (!workspaceId || message.workspaceId === workspaceId) {
            onTalking?.({ from: message.from ?? null, to: String(message.to), talking: Boolean(message.talking) });
          }
          break;
        case 'agentReply':
          if (!workspaceId || message.workspaceId === workspaceId) {
            onAgentReply?.({ to: String(message.to), from: message.from ?? null, text: String(message.text ?? '') });
          }
          break;
        case 'killed':
          exited = -1;
          break;
        case 'error':
          if (sessionId && onRespawn && /Sessao PTY nao encontrada/i.test(String(message.message))) {
            statusMessage = '';
            onRespawn();
          } else {
            statusMessage = message.message;
          }
          break;
      }
    };

    socket.onerror = () => {
      statusMessage = 'Falha na conexao WebSocket com o servidor.';
    };

    socket.onclose = () => {
      if (exited === null) statusMessage = 'Conexao encerrada.';
    };

    terminal.onData((data) => send({ type: 'input', sessionId: currentSessionId(), data }));
    sendInput = (data) => send({ type: 'input', sessionId: currentSessionId(), data });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const id = currentSessionId();
      if (id) send({ type: 'resize', sessionId: id, cols: terminal.cols, rows: terminal.rows });
    });
    resizeObserver.observe(container);

    $effect(() => {
      terminal.options.theme = TERMINAL_THEMES[themeName]?.theme ?? TERMINAL_THEMES.dark.theme;
    });

    return () => {
      mediaRecorder?.stop();
      stopTracks();
      stopRecTimer();
      resizeObserver.disconnect();
      socket.close();
      terminal.dispose();
      xtermInstance = null;
    };
  });
</script>

<div
  class="terminal-node"
  tabindex="0"
  onkeydown={handleDictateHotkey}
  onclick={() => xtermInstance?.focus()}
  role="application"
>
  {#if waiting}
    <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span {...props} class="attention-dot" aria-label="Aguardando atencao"></span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="left">Aguardando atencao</Tooltip.Content>
      </Tooltip.Root>
  {/if}
  {#if dictationSupported}
    <div class="dictate-controls">
      {#if dictating}
        <span class="dictate-rec" aria-live="polite">● {recSeconds}s</span>
      {:else if transcribing}
        <span class="dictate-transcribing">Transcrevendo…</span>
      {/if}
      <Select.Root type="single" value={dictateLang} onValueChange={(value: string) => (dictateLang = value as 'auto' | 'pt' | 'en')} disabled={dictating || transcribing}>
        <Select.Trigger class="dictate-lang" aria-label="Idioma do ditado">
          {dictateLang === 'auto' ? 'Auto' : dictateLang.toUpperCase()}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="pt">PT</Select.Item>
          <Select.Item value="en">EN</Select.Item>
          <Select.Item value="auto">Auto</Select.Item>
        </Select.Content>
      </Select.Root>
      <HeaderIconButton
        label={dictating ? `Parar ditado (${comboLabel(dictateHotkey)})` : transcribing ? 'Transcrevendo...' : `Ditar (${comboLabel(dictateHotkey)})`}
        class="dictate-btn"
        side="left"
        active={dictating}
        onclick={toggleDictation}
      >
        {#if dictating}<Square size={11} />{:else}<Mic size={12} />{/if}
      </HeaderIconButton>
      <HeaderIconButton
        label={voiceOn ? 'Voz ativada: o agente fala as respostas em voz alta' : 'Ativar voz: o agente fala as respostas em voz alta'}
        class="dictate-btn"
        side="left"
        active={voiceOn}
        onclick={() => onToggleVoice?.()}
      >
        {#if voiceOn}<Volume2 size={12} />{:else}<VolumeX size={12} />{/if}
      </HeaderIconButton>
    </div>
  {/if}
  {#if searchOpen}
    <div class="terminal-search nodrag">
      <input
        bind:value={searchQuery}
        oninput={() => searchQuery && searchAddon?.findNext(searchQuery)}
        placeholder="Buscar no terminal... (Enter = proximo)"
        spellcheck="false"
      />
      <span class="search-hint">Esc fecha</span>
    </div>
  {/if}
  {#if dictateError}
    <p class="terminal-status">{dictateError}</p>
  {/if}
  {#if dictateStatus && !dictateError}
    <p class="terminal-status">{dictateStatus}</p>
  {/if}
  {#if statusMessage}
    <p class="terminal-status">{statusMessage}</p>
  {/if}
  {#if exited !== null}
    <p class="terminal-status">Processo finalizado (codigo {exited}).</p>
  {/if}
  <div class="terminal-container" bind:this={container} style:--terminal-padding="{terminalPaddingPx}px"></div>
  <VoiceConfirmDialog bind:open={voiceConfirmOpen} onConfirm={() => toggleDictation()} onCancel={() => {}} />
</div>

<style>
  .terminal-node {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #090820;
    border-radius: 8px;
    overflow: hidden;
  }

  .terminal-container {
    flex: 1;
    min-height: 0;
    padding: var(--terminal-padding, 6px);
  }

  .terminal-search {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 20;
    background: rgba(23, 23, 29, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 4px 8px;
  }

  .terminal-search input {
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 12px;
    width: 240px;
  }

  .search-hint {
    font-size: 10px;
    color: #6d6d78;
  }

  .dictate-controls {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    gap: 4px;
    z-index: 10;
    align-items: center;
  }

  :global(.dictate-lang) {
    height: 22px;
    min-height: 0;
    width: auto;
    gap: 2px;
    background: rgba(23, 23, 29, 0.9);
    border: 1px solid #2c2c36;
    border-radius: 6px;
    color: #9a9aa5;
    font-size: 10px;
    padding: 2px 6px;
    box-shadow: none;
  }

  :global(.dictate-btn) {
    border: 1px solid #2c2c36;
    background: rgba(23, 23, 29, 0.9);
    border-radius: 6px;
    color: #9a9aa5;
    font-size: 12px;
    cursor: pointer;
    padding: 2px 7px;
  }

  :global(.dictate-btn).active {
    color: #e5484d;
    border-color: #e5484d;
  }

  .dictate-rec {
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #e5484d;
    animation: rec-pulse 1.2s ease-in-out infinite;
  }

  .dictate-transcribing {
    font-size: 10px;
    color: #ffc857;
    animation: rec-pulse 1.2s ease-in-out infinite;
  }

  @keyframes rec-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }

  .attention-dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #e5484d;
    z-index: 10;
    box-shadow: 0 0 6px rgba(229, 72, 77, 0.8);
  }

  .terminal-status {
    margin: 0;
    padding: 6px 10px;
    font-size: 12px;
    color: #FFC857;
    background: rgba(226, 185, 61, 0.08);
  }
</style>
