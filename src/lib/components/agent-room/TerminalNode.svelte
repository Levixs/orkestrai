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
  import { cleanSpeechText, normalizeSpeechText } from './voice-cleanup.js';
  import { speakText } from './voice-speech.js';
  import {
    LEADER_DICTATION_COMMAND,
    LEADER_DICTATION_STATE,
    type LeaderDictationCommandDetail,
    type LeaderDictationStateDetail,
    type LeaderDictationStatus,
  } from './leader-dictation.js';
  import * as m from '$lib/paraglide/messages.js';

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
    /** Id do no no canvas (para o endpoint de resposta do transcrito). */
    nodeId?: string;
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

  let { sessionId, createRequest, provider, workspaceId, nodeId, sessionLabel, workspaceName, onExit, onSessionCreated, onOpenPath, onRespawn, onAgentSession, onTalking, onAgentReply, voiceOn = false, onToggleVoice, themeName = 'dark' }: Props = $props();

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

  function reportDictationState(status: LeaderDictationStatus) {
    if (!nodeId || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<LeaderDictationStateDetail>(LEADER_DICTATION_STATE, {
      detail: { nodeId, status },
    }));
  }

  // -- Voz de volta quando EU dito (ciclo conversa: dito -> ouco a resposta) --
  // A captura NAO arma no ditado: arma so quando o texto e SUBMETIDO (Enter),
  // senao o eco do texto digitado/redraw do TUI dispara a fala sem resposta.
  let captureAfterDictation = false;
  let pendingDictation = false;
  let lastSpoken = '';
  let captureBuf = '';
  let speakTimer: ReturnType<typeof setTimeout> | null = null;


  function scheduleSpeakFromCapture() {
    if (speakTimer) clearTimeout(speakTimer);
    speakTimer = setTimeout(async () => {
      captureAfterDictation = false;
      speakTimer = null;
      // Fonte 1: transcrito da CLI (JSONL limpo — resposta COMPLETA, sem TUI).
      // Fonte 2 (fallback): raspagem da tela (quando nao ha session-id ainda).
      const text = (await transcriptReplyText()) ?? cleanSpeechText(captureBuf);
      captureBuf = '';
      if (!text || !voiceOn) return;
      if (text === lastSpoken) return; // ja falou exatamente isso — nao repete
      lastSpoken = text;
      try {
        const response = await fetch('/api/agent-room/voice/speak', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        // Se o play falhar, revoga aqui — senao o blob vaza na memoria do renderer.
        await audio.play().catch(() => URL.revokeObjectURL(url));
      } catch {
        // voz indisponivel — segue em texto
      }
    }, 5_000);
  }

  /** Ultima resposta do agente pelo transcrito da CLI (null = usar raspagem). */
  async function transcriptReplyText(): Promise<string | null> {
    if (!workspaceId || !nodeId) return null;
    try {
      const response = await fetch(`/api/agent-room/voice/reply?workspaceId=${encodeURIComponent(workspaceId)}&nodeId=${encodeURIComponent(nodeId)}`);
      const payload = await response.json().catch(() => null);
      const text = String(payload?.data?.text ?? '').trim();
      return text ? normalizeSpeechText(text) : null;
    } catch {
      return null;
    }
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
      dictateError = m['voice.mic_denied']();
      reportDictationState('idle');
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
      reportDictationState('transcribing');
      dictateStatus = m['voice.transcribing']();
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
        if (text) {
          sendInput?.(text);
          // Ciclo conversa: marca que ha um ditado aguardando Enter. A captura
          // da resposta arma SOMENTE no submit (ver terminal.onData abaixo) —
          // sem Enter, nada e falado.
          if (voiceOn && provider) pendingDictation = true;
        } else dictateError = m['voice.nothing_transcribed']();
      } catch (error) {
        dictateError = error instanceof Error ? error.message : m['voice.dictation_error']();
      } finally {
        transcribing = false;
        dictateStatus = '';
        reportDictationState('idle');
      }
    };
    recorder.start();
    dictating = true;
    reportDictationState('recording');
    pendingDictation = false; // so o ditado mais recente conta
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
    let socket: WebSocket;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const handleLeaderDictation = (event: Event) => {
      const detail = (event as CustomEvent<LeaderDictationCommandDetail>).detail;
      if (!nodeId || detail?.nodeId !== nodeId) return;
      void toggleDictation();
    };
    window.addEventListener(LEADER_DICTATION_COMMAND, handleLeaderDictation);

    const send = (payload: Record<string, unknown>) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    };

    const handleOpen = () => {
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
        statusMessage = m['term.no_session']();
      }
    };

    let createdSessionId: string | undefined;
    const currentSessionId = () => createdSessionId ?? sessionId;

    const handleMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data));
      switch (message.type) {
        case 'created':
          createdSessionId = message.session.id;
          onSessionCreated?.(message.session.id);
          if (message.scrollback) terminal.write(message.scrollback);
          statusMessage = '';
          reconnectAttempts = 0;
          break;
        case 'attached':
          if (message.scrollback) terminal.write(message.scrollback);
          statusMessage = '';
          reconnectAttempts = 0;
          waiting = Boolean(message.session?.waiting);
          if (message.session?.exited) exited = message.session.exitCode ?? 0;
          break;
        case 'output':
          terminal.write(message.data);
          if (captureAfterDictation) {
            captureBuf = (captureBuf + String(message.data)).slice(-32_000);
            scheduleSpeakFromCapture();
          }
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
        case 'say':
          // orkestrai say: TTS sob demanda no desktop (falha silenciosa sem modelo).
          if ((!workspaceId || message.workspaceId === workspaceId) && typeof message.text === 'string' && message.text.trim()) {
            speakText(String(message.text)).catch(() => {});
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

    const handleError = () => {
      statusMessage = m['term.ws_error']();
    };

    const handleClose = () => {
      if (exited !== null || disposed) return;
      // Suspensao/hibernacao derruba a conexao (Windows em sleep): tenta
      // re-attach com backoff. Se a sessao PTY morreu junto, o 'error' do
      // attach aciona o respawn com resume (o contexto volta sozinho).
      if (reconnectAttempts >= 6) {
        statusMessage = m['term.connection_closed']();
        return;
      }
      reconnectAttempts += 1;
      statusMessage = m['term.reconnecting']({ attempt: reconnectAttempts });
      reconnectTimer = setTimeout(connect, 2_000 * reconnectAttempts);
    };

    function connect() {
      socket = new WebSocket(`${protocol}://${location.host}/ws/agent-room/pty`);
      socket.onopen = handleOpen;
      socket.onmessage = handleMessage;
      socket.onerror = handleError;
      socket.onclose = handleClose;
    }
    connect();

    terminal.onData((data) => {
      send({ type: 'input', sessionId: currentSessionId(), data });
      // Enter depois de um ditado: agora sim arma a captura da resposta.
      if (pendingDictation && data.includes('\r')) {
        pendingDictation = false;
        captureAfterDictation = true;
        captureBuf = '';
        scheduleSpeakFromCapture();
      }
    });
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
      disposed = true;
      window.removeEventListener(LEADER_DICTATION_COMMAND, handleLeaderDictation);
      reportDictationState('idle');
      const activeRecorder = mediaRecorder;
      if (activeRecorder && activeRecorder.state !== 'inactive') {
        activeRecorder.onstop = null;
        activeRecorder.stop();
      }
      mediaRecorder = null;
      dictating = false;
      transcribing = false;
      stopTracks();
      stopRecTimer();
      if (speakTimer) clearTimeout(speakTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      captureAfterDictation = false;
      pendingDictation = false;
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
            <span {...props} class="attention-dot" aria-label={m['term.waiting_attention']()}></span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="left">{m['term.waiting_attention']()}</Tooltip.Content>
      </Tooltip.Root>
  {/if}
  {#if dictationSupported}
    <div class="dictate-controls">
      {#if dictating}
        <span class="dictate-rec" aria-live="polite">● {recSeconds}s</span>
      {:else if transcribing}
        <span class="dictate-transcribing">{m['voice.transcribing']()}</span>
      {/if}
      <Select.Root type="single" value={dictateLang} onValueChange={(value: string) => (dictateLang = value as 'auto' | 'pt' | 'en')} disabled={dictating || transcribing}>
        <Select.Trigger class="dictate-lang" aria-label={m['voice.dictation_lang']()}>
          {dictateLang === 'auto' ? 'Auto' : dictateLang.toUpperCase()}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="pt">PT</Select.Item>
          <Select.Item value="en">EN</Select.Item>
          <Select.Item value="auto">Auto</Select.Item>
        </Select.Content>
      </Select.Root>
      <HeaderIconButton
        label={dictating ? m['voice.stop_dictation']({ hotkey: comboLabel(dictateHotkey) }) : transcribing ? m['voice.transcribing']() : m['voice.dictate']({ hotkey: comboLabel(dictateHotkey) })}
        class="dictate-btn"
        side="left"
        active={dictating}
        onclick={toggleDictation}
      >
        {#if dictating}<Square size={11} />{:else}<Mic size={12} />{/if}
      </HeaderIconButton>
      <HeaderIconButton
        label={voiceOn ? m['voice.on_tooltip']() : m['voice.off_tooltip']()}
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
        placeholder={m['ph.search_terminal']()}
        spellcheck="false"
      />
      <span class="search-hint">{m['term.esc_closes']()}</span>
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
    <p class="terminal-status">{m['term.process_exited']({ code: exited })}</p>
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
