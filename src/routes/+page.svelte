<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    AlertCircle,
    ArrowDownToLine,
    ArrowUpToLine,
    MessageSquarePlus,
    Mic,
    MicOff,
    Pencil,
    RefreshCw,
    Square,
    Trash2,
  } from '@lucide/svelte';
  import AgentControls from '$lib/components/agent-room/AgentControls.svelte';
  import ChatView from '$lib/components/agent-room/ChatView.svelte';
  import ProjectPanel from '$lib/components/agent-room/ProjectPanel.svelte';
  import type {
    AgentTarget,
    ChatMessage,
    Conversation,
    ConversationMode,
    ProjectInfo,
  } from '$lib/modules/agent-room/domain/types.js';

  type ApiResult<T> = { data: T; error?: never } | { data?: never; error: string };
  type OfficialWhisperModule = {
    calledRun?: boolean;
    FS_unlink: (path: string) => void;
    FS_createDataFile: (parent: string, name: string, data: Uint8Array, canRead: boolean, canWrite: boolean) => void;
    init: (modelPath: string) => number;
    full_default: (
      instance: number,
      audio: Float32Array,
      language: string,
      threads: number,
      translate: boolean
    ) => unknown;
    print?: (text: unknown) => void;
    printErr?: (text: unknown) => void;
    setStatus?: (text: string) => void;
    monitorRunDependencies?: (left: number) => void;
    onRuntimeInitialized?: () => void;
  };
  type OfficialWhisperWindow = Window & {
    Module?: OfficialWhisperModule;
  };
  type AudioInputDevice = {
    deviceId: string;
    label: string;
  };
  type LiveLogEntry = {
    id: number;
    level: 'info' | 'stdout' | 'stderr' | 'error';
    text: string;
  };
  type AgentStreamEvent = {
    type: string;
    agent?: 'codex' | 'claude';
    stream?: 'stdout' | 'stderr';
    text?: string;
    status?: string;
    exitCode?: number;
    allowWrites?: boolean;
    error?: string;
    round?: number;
    maxRounds?: number;
    message?: string;
    data?: unknown;
  };
  type DictationEngine = 'browser' | 'whisper';
  type BrowserSpeechRecognitionResult = {
    isFinal: boolean;
    0: { transcript: string };
  };
  type BrowserSpeechRecognitionEvent = Event & {
    resultIndex: number;
    results: {
      length: number;
      [index: number]: BrowserSpeechRecognitionResult;
    };
  };
  type BrowserSpeechRecognition = EventTarget & {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event & { error?: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  };
  type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
  type SpeechWindow = Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  const WHISPER_MAIN_URL = '/whisper-official/main.js';
  const WHISPER_SAMPLE_RATE = 16000;
  const WHISPER_THREAD_COUNT = 1;
  const WHISPER_MODEL_FILE = 'whisper.bin';
  const WHISPER_MODEL_DB_NAME = 'pantheon.whisper.models';
  const WHISPER_MODEL_DB_VERSION = 1;
  const WHISPER_MODELS = {
    auto: {
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
      sizeMb: 57,
      language: 'auto',
    },
    pt: {
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
      sizeMb: 57,
      language: 'pt',
    },
    en: {
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin',
      sizeMb: 57,
      language: 'en',
    },
  };
  type WhisperLanguage = keyof typeof WHISPER_MODELS;

  let conversations = $state<Conversation[]>([]);
  let messages = $state<ChatMessage[]>([]);
  let projects = $state<ProjectInfo[]>([]);
  let activeConversationId = $state<string | null>(null);
  let selectedProjectPath = $state<string | null>(null);
  let mode = $state<Exclude<ConversationMode, 'project'>>('chat');
  let target = $state<AgentTarget>('codex');
  let allowWrites = $state(false);
  let loopMaxRounds = $state(6);
  let draft = $state('');
  let busy = $state(false);
  let errorMessage = $state('');
  let liveRunTitle = $state('');
  let liveLog = $state<LiveLogEntry[]>([]);
  let liveLogCounter = 0;
  let activeAgentAbortController = $state<AbortController | null>(null);
  let dictationEngine = $state<DictationEngine>('browser');
  let dictationActive = $state(false);
  let dictationFinalizing = $state(false);
  let whisperReady = $state(false);
  let whisperLoading = $state(false);
  let whisperProgress = $state(0);
  let whisperLanguage = $state<WhisperLanguage>('auto');
  let whisperLoadedLanguage: WhisperLanguage | null = null;
  let whisperStatus = $state('Alt+Espaco para falar');
  let audioDevices = $state<AudioInputDevice[]>([]);
  let selectedAudioDeviceId = $state('default');
  let status = $state<{ codex?: { installed: boolean; detail?: string }; claude?: { installed: boolean; detail?: string } }>({});
  let whisperModule: OfficialWhisperModule | null = null;
  let whisperLoadPromise: Promise<void> | null = null;
  let whisperInstance: number | null = null;
  let lastWhisperText = '';
  let lastDisplayedWhisperText = $state('');
  let flushedWhisperText = '';
  let draftInput: HTMLTextAreaElement | null = null;
  let activeMediaRecorder: MediaRecorder | null = null;
  let activeMediaStream: MediaStream | null = null;
  let activeAudioChunks: Blob[] = [];
  let whisperOutputCapture: string[] | null = null;
  let whisperWorkerError = '';
  let browserSpeechSupported = $state(false);
  let speechRecognition: BrowserSpeechRecognition | null = null;
  let speechRecognitionStopTimeout: number | null = null;
  let lastAutoScrollKey = '';

  let activeConversation = $derived(conversations.find((conversation) => conversation.id === activeConversationId) ?? null);

  async function api<T>(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json()) as ApiResult<T>;
    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'Falha na API local.');
    }
    return payload.data;
  }

  function stringifyStreamValue(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const parts = value.map(stringifyStreamValue).filter(Boolean);
      return parts.length ? parts.join('\n') : null;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['result', 'final', 'content', 'response', 'output', 'text', 'message', 'item', 'delta']) {
        const nested = stringifyStreamValue(record[key]);
        if (nested) return nested;
      }
    }
    return null;
  }

  function appendLiveLog(level: LiveLogEntry['level'], text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    liveLog = [...liveLog, { id: ++liveLogCounter, level, text: cleaned }].slice(-240);
  }

  function beginLiveRun(title: string) {
    liveRunTitle = title;
    liveLog = [];
    appendLiveLog('info', title);
  }

  function formatAgentName(agent?: 'codex' | 'claude') {
    if (agent === 'codex') return 'Codex';
    if (agent === 'claude') return 'Claude';
    return 'Agente';
  }

  function formatAgentStatus(status?: string) {
    if (status === 'command_started') return 'comando iniciado';
    if (status === 'command_finished') return 'comando finalizado';
    if (status === 'timeout') return 'timeout';
    if (status === 'aborted') return 'interrompido';
    return status ?? 'status';
  }

  function appendAgentOutput(event: AgentStreamEvent) {
    const agentName = formatAgentName(event.agent);
    const lines = String(event.text ?? '').split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed.type === 'thread.started') {
          appendLiveLog('info', `${agentName}: thread iniciada`);
          continue;
        }
        if (parsed.type === 'turn.started') {
          appendLiveLog('info', `${agentName}: turno iniciado`);
          continue;
        }
        if (parsed.type === 'turn.completed') {
          appendLiveLog('info', `${agentName}: turno finalizado`);
          continue;
        }
        if (parsed.type === 'item.completed') {
          const text = stringifyStreamValue(parsed.item);
          appendLiveLog(
            event.stream === 'stderr' ? 'stderr' : 'stdout',
            text ? `${agentName}: ${text}` : `${agentName}: item concluido`
          );
          continue;
        }
        if (parsed.type === 'stream_event') {
          const text = stringifyStreamValue(parsed.event);
          if (text) appendLiveLog(event.stream === 'stderr' ? 'stderr' : 'stdout', `${agentName}: ${text}`);
          continue;
        }
        if (parsed.type === 'system' || parsed.type === 'rate_limit_event' || parsed.type === 'assistant') {
          continue;
        }

        const text = stringifyStreamValue(parsed);
        appendLiveLog(event.stream === 'stderr' ? 'stderr' : 'stdout', text ? `${agentName}: ${text}` : `${agentName}: ${trimmed}`);
      } catch {
        appendLiveLog(event.stream === 'stderr' ? 'stderr' : 'stdout', `${agentName}: ${trimmed}`);
      }
    }
  }

  function handleStreamEvent(event: AgentStreamEvent) {
    if (event.type === 'run_started') {
      const access = event.allowWrites ? 'full access' : 'read-only';
      appendLiveLog('info', `${formatAgentName(event.agent)} iniciou (${access})`);
      return;
    }
    if (event.type === 'loop_round_started') {
      appendLiveLog('info', `Loop: rodada ${event.round} de ${event.maxRounds}`);
      return;
    }
    if (event.type === 'agent_output') {
      appendAgentOutput(event);
      return;
    }
    if (event.type === 'agent_status') {
      const detail = event.text ? `: ${event.text}` : event.exitCode === undefined ? '' : `: exit ${event.exitCode}`;
      appendLiveLog(
        event.status === 'timeout' || event.status === 'aborted' ? 'stderr' : 'info',
        `[${formatAgentName(event.agent)}] ${formatAgentStatus(event.status)}${detail}`
      );
      return;
    }
    if (event.type === 'run_finished') {
      const suffix = event.error ? ` com erro: ${event.error}` : ` com exit ${event.exitCode}`;
      appendLiveLog(event.error ? 'error' : 'info', `${formatAgentName(event.agent)} finalizou${suffix}`);
      return;
    }
    if (event.type === 'system') {
      appendLiveLog('info', event.message ?? 'Sistema atualizou a conversa.');
    }
  }

  async function apiStream<T>(path: string, init?: RequestInit) {
    const controller = new AbortController();
    activeAgentAbortController = controller;
    let finalData: T | undefined;

    try {
      const response = await fetch(path, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
      if (!response.ok || !response.body) {
        throw new Error('Falha ao abrir stream do agente.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AgentStreamEvent;
          if (event.type === 'done') {
            finalData = event.data as T;
          } else if (event.type === 'error') {
            throw new Error(event.error ?? 'Falha ao executar agente.');
          } else {
            handleStreamEvent(event);
          }
        }

        if (done) break;
      }

      return finalData;
    } finally {
      if (activeAgentAbortController === controller) {
        activeAgentAbortController = null;
      }
    }
  }

  function stopAgentRun() {
    activeAgentAbortController?.abort();
    appendLiveLog('error', 'Execucao interrompida pelo usuario.');
  }

  async function scrollChatTo(position: 'top' | 'bottom', behavior: ScrollBehavior = 'smooth') {
    await tick();
    const chat = document.querySelector<HTMLElement>('.chat-stream');
    if (!chat) return;

    chat.scrollTo({
      top: position === 'top' ? 0 : chat.scrollHeight,
      behavior,
    });
  }

  $effect(() => {
    const key = `${activeConversationId ?? 'none'}:${messages.length}:${busy ? 'busy' : 'idle'}`;
    if (key === lastAutoScrollKey) return;
    lastAutoScrollKey = key;

    if (messages.length || busy) {
      void scrollChatTo('bottom', 'auto');
    }
  });

  $effect(() => {
    const count = liveLog.length;
    if (!count) return;

    void tick().then(() => {
      const log = document.querySelector<HTMLElement>('.live-log');
      if (log) log.scrollTop = log.scrollHeight;
    });
  });

  async function refreshAll() {
    errorMessage = '';
    const [conversationList, projectList, cliStatus] = await Promise.all([
      api<Conversation[]>('/api/agent-room/conversations'),
      api<ProjectInfo[]>('/api/agent-room/projects'),
      api<typeof status>('/api/agent-room/status'),
    ]);
    conversations = conversationList;
    projects = projectList;
    status = cliStatus;

    if (!activeConversationId && conversations.length > 0) {
      activeConversationId = conversations[0].id;
      selectedProjectPath = conversations[0].projectPath;
    }

    if (activeConversationId) {
      messages = await api<ChatMessage[]>(`/api/agent-room/conversations/${activeConversationId}/messages`);
    }
  }

  async function createConversation(projectPath = selectedProjectPath) {
    const timestamp = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const title = projectPath ? `Projeto ${projectPath.split('/').at(-1)}` : `Conversa ${timestamp}`;
    const conversation = await api<Conversation>('/api/agent-room/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, mode: projectPath ? 'project' : 'chat', projectPath }),
    });
    conversations = [conversation, ...conversations];
    activeConversationId = conversation.id;
    selectedProjectPath = conversation.projectPath;
    messages = [];
  }

  async function selectConversation(id: string) {
    activeConversationId = id;
    const conversation = conversations.find((item) => item.id === id);
    selectedProjectPath = conversation?.projectPath ?? null;
    messages = await api<ChatMessage[]>(`/api/agent-room/conversations/${id}/messages`);
  }

  async function renameConversation(conversation: Conversation) {
    const title = prompt('Novo nome da conversa', conversation.title)?.trim();
    if (!title || title === conversation.title) return;

    errorMessage = '';
    try {
      const updated = await api<Conversation>(`/api/agent-room/conversations/${conversation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      conversations = conversations.map((item) => (item.id === updated.id ? updated : item));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao renomear conversa.';
    }
  }

  async function deleteConversation(conversation: Conversation) {
    const confirmed = confirm(`Apagar "${conversation.title}" e todo o historico desta conversa?`);
    if (!confirmed) return;

    errorMessage = '';
    try {
      await api<{ deleted: boolean }>(`/api/agent-room/conversations/${conversation.id}`, { method: 'DELETE' });
      const remaining = conversations.filter((item) => item.id !== conversation.id);
      conversations = remaining;

      if (activeConversationId === conversation.id) {
        const next = remaining[0] ?? null;
        activeConversationId = next?.id ?? null;
        selectedProjectPath = next?.projectPath ?? null;
        messages = next ? await api<ChatMessage[]>(`/api/agent-room/conversations/${next.id}/messages`) : [];
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao apagar conversa.';
    }
  }

  async function createProject(name: string) {
    const project = await api<ProjectInfo>('/api/agent-room/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    projects = [project, ...projects];
    selectedProjectPath = project.path;
    await createConversation(project.path);
  }

  async function ensureConversation() {
    if (!activeConversationId) {
      await createConversation();
    }
    return activeConversationId;
  }

  async function runAgent() {
    const message = draft.trim();
    if (!message) return;

    if (allowWrites) {
      if (!selectedProjectPath) {
        errorMessage = 'Selecione ou crie um projeto antes de ativar full access.';
        return;
      }
      const confirmed = confirm(
        `Ativar full access em ${selectedProjectPath}?\n\nCodex rodara sem sandbox/aprovacoes e Claude rodara com --dangerously-skip-permissions.`
      );
      if (!confirmed) return;
    }

    busy = true;
    errorMessage = '';
    beginLiveRun('Executando agentes...');
    try {
      const conversationId = await ensureConversation();
      const result = await apiStream<{ messages: ChatMessage[]; conversation: Conversation | null }>(
        `/api/agent-room/conversations/${conversationId}/run-agent/stream`,
        {
          method: 'POST',
          body: JSON.stringify({
            message,
            target,
            mode,
            allowWrites,
            projectPath: selectedProjectPath,
          }),
        }
      );
      if (!result) throw new Error('Stream finalizou sem resposta.');
      messages = result.messages;
      await refreshAll();
      draft = '';
    } catch (error) {
      errorMessage = error instanceof DOMException && error.name === 'AbortError'
        ? 'Execucao interrompida.'
        : error instanceof Error ? error.message : 'Falha ao executar agente.';
    } finally {
      busy = false;
    }
  }

  async function runDebate() {
    const message = draft.trim();
    if (!message) return;

    busy = true;
    errorMessage = '';
    beginLiveRun('Executando debate...');
    try {
      const conversationId = await ensureConversation();
      const result = await apiStream<{ messages: ChatMessage[] }>(`/api/agent-room/conversations/${conversationId}/debate/stream`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      if (!result) throw new Error('Stream finalizou sem resposta.');
      messages = result.messages;
      await refreshAll();
      draft = '';
      mode = 'chat';
    } catch (error) {
      errorMessage = error instanceof DOMException && error.name === 'AbortError'
        ? 'Execucao interrompida.'
        : error instanceof Error ? error.message : 'Falha ao debater.';
    } finally {
      busy = false;
    }
  }

  async function runLoop() {
    const message = draft.trim();
    if (!message) return;

    if (allowWrites && !selectedProjectPath) {
      errorMessage = 'Selecione ou crie um projeto antes de permitir escrita.';
      return;
    }

    if (allowWrites) {
      const confirmed = confirm(
        `Iniciar Ralph loop com escrita em ${selectedProjectPath}?\n\nCodex e Claude podem continuar trabalhando ate ambos concordarem que acabou ou ate atingir o limite de rodadas.`
      );
      if (!confirmed) return;
    }

    busy = true;
    errorMessage = '';
    beginLiveRun(`Executando Ralph loop (${loopMaxRounds} rodadas max)...`);
    try {
      const conversationId = await ensureConversation();
      const result = await apiStream<{ messages: ChatMessage[] }>(`/api/agent-room/conversations/${conversationId}/loop/stream`, {
        method: 'POST',
        body: JSON.stringify({
          message,
          mode,
          allowWrites,
          projectPath: selectedProjectPath,
          maxRounds: loopMaxRounds,
        }),
      });
      if (!result) throw new Error('Stream finalizou sem resposta.');
      messages = result.messages;
      await refreshAll();
      draft = '';
      mode = 'implement';
    } catch (error) {
      errorMessage = error instanceof DOMException && error.name === 'AbortError'
        ? 'Execucao interrompida.'
        : error instanceof Error ? error.message : 'Falha ao executar loop.';
    } finally {
      busy = false;
    }
  }

  function cleanWhisperText(text: string) {
    return text
      .replace(/\[(BLANK_AUDIO|SILENCE|MUSIC|NOISE|INAUDIBLE)\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function appendTranscription(text: string) {
    const normalized = cleanWhisperText(text);
    if (!normalized || normalized === lastWhisperText) return;

    let next = normalized;
    if (flushedWhisperText && normalized.startsWith(flushedWhisperText)) {
      next = normalized.slice(flushedWhisperText.length).trim();
    }

    lastWhisperText = normalized;
    lastDisplayedWhisperText = normalized;
    if (!next) return;

    const separator = draft.trim() && !draft.endsWith(' ') ? ' ' : '';
    draft = `${draft}${separator}${next}`;
    flushedWhisperText = normalized;
    requestAnimationFrame(() => draftInput?.focus());
  }

  function loadScript(src: string) {
    return new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (existing) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(script);
    });
  }

  function captureWhisperOutput(text: unknown) {
    const line = String(text ?? '').trim();
    if (/worker sent an error|SharedArrayBuffer|pthread/i.test(line)) {
      whisperWorkerError = line || 'Falha ao iniciar worker do Whisper.';
    }
    if (line && whisperOutputCapture) {
      whisperOutputCapture.push(line);
    }
  }

  function openWhisperModelDb() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(WHISPER_MODEL_DB_NAME, WHISPER_MODEL_DB_VERSION);

      request.onupgradeneeded = () => {
        request.result.createObjectStore('models');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir cache do modelo.'));
    });
  }

  async function readCachedModel(url: string) {
    try {
      const db = await openWhisperModelDb();
      return await new Promise<Uint8Array | null>((resolve) => {
        const transaction = db.transaction('models', 'readonly');
        const store = transaction.objectStore('models');
        const request = store.get(url);

        request.onsuccess = () => resolve(request.result instanceof Uint8Array ? request.result : null);
        request.onerror = () => resolve(null);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => db.close();
      });
    } catch {
      return null;
    }
  }

  async function writeCachedModel(url: string, data: Uint8Array) {
    try {
      const db = await openWhisperModelDb();
      await new Promise<void>((resolve) => {
        const transaction = db.transaction('models', 'readwrite');
        transaction.objectStore('models').put(data, url);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          resolve();
        };
      });
    } catch {
      // Cache is an optimization; transcription can continue without it.
    }
  }

  async function fetchWhisperModel(url: string, sizeMb: number) {
    const cached = await readCachedModel(url);
    if (cached) {
      whisperProgress = 100;
      whisperStatus = 'Modelo carregado do cache';
      return cached;
    }

    whisperStatus = `Baixando modelo Whisper (${sizeMb} MB)...`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar modelo Whisper: ${response.status}`);
    }

    const total = Number(response.headers.get('content-length') ?? 0);
    if (!response.body) {
      const data = new Uint8Array(await response.arrayBuffer());
      await writeCachedModel(url, data);
      return data;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;

      if (total > 0) {
        whisperProgress = Math.round((received / total) * 100);
        whisperStatus = `Baixando modelo ${whisperProgress}%`;
      }
    }

    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }

    await writeCachedModel(url, data);
    return data;
  }

  async function ensureWhisperRuntime() {
    if (whisperModule?.calledRun) return whisperModule;
    if (!window.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('Whisper precisa de Cross-Origin Isolation. Reinicie o npm run dev e recarregue a pagina.');
    }

    whisperStatus = 'Carregando runtime Whisper WASM...';
    const existingModule = (window as OfficialWhisperWindow).Module;
    if (existingModule?.calledRun) {
      whisperModule = existingModule;
      return existingModule;
    }

    const moduleConfig = {
      print: captureWhisperOutput,
      printErr: captureWhisperOutput,
      setStatus: (text: string) => {
        if (text) whisperStatus = text;
      },
      monitorRunDependencies: (left: number) => {
        if (left > 0) whisperStatus = `Preparando Whisper WASM (${left})`;
      },
      onRuntimeInitialized: () => {
        whisperModule = moduleConfig as OfficialWhisperModule;
      },
    };

    (window as OfficialWhisperWindow).Module = moduleConfig as OfficialWhisperModule;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timeout ao carregar Whisper WASM.')), 30000);
      moduleConfig.onRuntimeInitialized = () => {
        window.clearTimeout(timeout);
        whisperModule = moduleConfig as OfficialWhisperModule;
        resolve();
      };
      loadScript(WHISPER_MAIN_URL).catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
    });

    if (!whisperModule?.full_default) {
      throw new Error('Runtime oficial do whisper.cpp nao expos full_default.');
    }

    return whisperModule;
  }

  async function ensureWhisper() {
    if (whisperReady && whisperModule && whisperLoadedLanguage === whisperLanguage) return;
    if (whisperLoadPromise) return whisperLoadPromise;

    whisperLoading = true;
    whisperProgress = 0;
    whisperStatus = 'Carregando Whisper WASM...';
    whisperLoadPromise = (async () => {
      const module = await ensureWhisperRuntime();
      const model = WHISPER_MODELS[whisperLanguage];
      const modelData = await fetchWhisperModel(model.url, model.sizeMb);

      try {
        module.FS_unlink(`/${WHISPER_MODEL_FILE}`);
      } catch {
        // The model file does not exist on the first load.
      }

      module.FS_createDataFile('/', WHISPER_MODEL_FILE, modelData, true, true);
      whisperReady = true;
      whisperLoadedLanguage = whisperLanguage;
      whisperInstance = null;
      whisperStatus = 'Alt+Espaco para falar';
    })();

    try {
      await whisperLoadPromise;
    } finally {
      whisperLoading = false;
      whisperLoadPromise = null;
    }
  }

  async function refreshAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microfone ${index + 1}`,
      }));

    audioDevices = inputs;

    if (selectedAudioDeviceId !== 'default' && !inputs.some((device) => device.deviceId === selectedAudioDeviceId)) {
      selectedAudioDeviceId = 'default';
    }
  }

  function getAudioConstraints(): MediaTrackConstraints {
    return {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(selectedAudioDeviceId === 'default' ? {} : { deviceId: { exact: selectedAudioDeviceId } }),
    };
  }

  function getMediaRecorderOptions() {
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? { mimeType } : undefined;
  }

  function stopActiveMediaStream() {
    activeMediaStream?.getTracks().forEach((track) => track.stop());
    activeMediaStream = null;
  }

  function stopActiveRecording() {
    return new Promise<Blob>((resolve, reject) => {
      const recorder = activeMediaRecorder;
      if (!recorder) {
        resolve(new Blob());
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(activeAudioChunks, {
          type: recorder.mimeType || activeAudioChunks[0]?.type || 'audio/webm',
        });
        activeMediaRecorder = null;
        activeAudioChunks = [];
        stopActiveMediaStream();
        resolve(blob);
      };
      recorder.onerror = () => {
        stopActiveMediaStream();
        reject(new Error('Falha ao gravar audio do microfone.'));
      };

      if (recorder.state === 'recording') {
        recorder.requestData();
        recorder.stop();
      } else {
        const blob = new Blob(activeAudioChunks, {
          type: recorder.mimeType || activeAudioChunks[0]?.type || 'audio/webm',
        });
        activeMediaRecorder = null;
        activeAudioChunks = [];
        stopActiveMediaStream();
        resolve(blob);
      }
    });
  }

  async function decodeAudioBlob(blob: Blob) {
    if (blob.size === 0) {
      throw new Error('Nenhum audio foi gravado.');
    }

    const audioContext = new AudioContext({ sampleRate: WHISPER_SAMPLE_RATE });
    try {
      const decoded = await audioContext.decodeAudioData(await blob.arrayBuffer());
      const frameCount = Math.max(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE));
      const offlineContext = new OfflineAudioContext(1, frameCount, WHISPER_SAMPLE_RATE);
      const source = offlineContext.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineContext.destination);
      source.start(0);

      const rendered = await offlineContext.startRendering();
      return rendered.getChannelData(0);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  }

  function extractWhisperTranscript(lines: string[]) {
    return lines
      .map((line) =>
        line
          .replace(/^\s*\[[^\]]+\]\s*/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((line) => {
        if (!line) return false;
        if (/worker sent an error|SharedArrayBuffer|pthread/i.test(line)) return false;
        if (/^(js:|whisper_|ggml_|system_info:|main:|error:|operator\(\):|loadRemote|fetchRemote)/i.test(line)) {
          return false;
        }
        if (/^(processing|loading|whisper_print_timings:|whisper_model_load:)/i.test(line)) return false;
        if (/\b(processing \d+ samples|threads|processors|lang =|task = transcribe)\b/i.test(line)) return false;
        if (/\b(load time|sample time|encode time|decode time|total time)\b/i.test(line)) return false;
        return true;
      })
      .join(' ')
      .trim();
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function whisperLooksFinished(lines: string[]) {
    return lines.some((line) => /whisper_print_timings:|total time/i.test(line));
  }

  async function waitForWhisperTranscript(audioSeconds: number) {
    const deadline = Date.now() + Math.max(12_000, Math.min(90_000, audioSeconds * 12_000));
    let lastLineCount = whisperOutputCapture?.length ?? 0;
    let lastChangeAt = Date.now();

    while (Date.now() < deadline) {
      const lines = whisperOutputCapture ?? [];
      if (whisperWorkerError) {
        throw new Error(
          'Worker do Whisper falhou. Reinicie o npm run dev e faca hard refresh para aplicar os headers COOP/COEP.'
        );
      }
      const transcript = extractWhisperTranscript(lines);

      if (transcript && whisperLooksFinished(lines)) {
        return transcript;
      }

      if (lines.length !== lastLineCount) {
        lastLineCount = lines.length;
        lastChangeAt = Date.now();
      } else if (transcript && Date.now() - lastChangeAt > 1800) {
        return transcript;
      }

      const elapsedSeconds = Math.max(1, Math.round(audioSeconds));
      whisperStatus = `Transcrevendo ${elapsedSeconds}s de audio...`;
      await wait(250);
    }

    return extractWhisperTranscript(whisperOutputCapture ?? []);
  }

  async function transcribeAudio(audio: Float32Array) {
    const module = await ensureWhisperRuntime();
    if (!whisperInstance) {
      whisperInstance = module.init(WHISPER_MODEL_FILE);
    }
    if (!whisperInstance) {
      throw new Error('Falha ao inicializar modelo Whisper.');
    }

    const model = WHISPER_MODELS[whisperLanguage];
    const threads = WHISPER_THREAD_COUNT;
    const audioSeconds = audio.length / WHISPER_SAMPLE_RATE;
    whisperOutputCapture = [];
    whisperWorkerError = '';
    whisperStatus = 'Transcrevendo no navegador...';
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      module.full_default(whisperInstance, audio, model.language, threads, false);
      const transcript = await waitForWhisperTranscript(audioSeconds);
      if (transcript) {
        appendTranscription(transcript);
      }

      return Boolean(transcript);
    } finally {
      whisperOutputCapture = null;
    }
  }

  function getBrowserSpeechRecognition() {
    const speechWindow = window as SpeechWindow;
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  }

  function speechRecognitionLanguage() {
    if (whisperLanguage === 'en') return 'en-US';
    return 'pt-BR';
  }

  function startBrowserDictation() {
    if (busy || dictationActive || dictationFinalizing) return;

    const Recognition = getBrowserSpeechRecognition();
    if (!Recognition) {
      errorMessage = 'Este navegador nao expoe SpeechRecognition. Use Chrome/Edge ou mude para Whisper WASM.';
      whisperStatus = 'Reconhecimento indisponivel';
      return;
    }

    errorMessage = '';
    dictationFinalizing = false;
    lastWhisperText = '';
    lastDisplayedWhisperText = '';
    flushedWhisperText = '';
    speechRecognition?.abort();
    if (speechRecognitionStopTimeout) {
      window.clearTimeout(speechRecognitionStopTimeout);
      speechRecognitionStopTimeout = null;
    }

    const recognition = new Recognition();
    speechRecognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechRecognitionLanguage();

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalText += ` ${result[0].transcript}`;
        } else {
          interimText += ` ${result[0].transcript}`;
        }
      }

      if (finalText.trim()) {
        appendTranscription(finalText);
        whisperStatus = 'Texto inserido';
      } else if (interimText.trim()) {
        lastDisplayedWhisperText = cleanWhisperText(interimText);
        whisperStatus = 'Ouvindo... Alt+Espaco para parar';
      }
    };

    recognition.onerror = (event) => {
      dictationActive = false;
      dictationFinalizing = false;
      if (speechRecognitionStopTimeout) {
        window.clearTimeout(speechRecognitionStopTimeout);
        speechRecognitionStopTimeout = null;
      }
      errorMessage = event.error ? `Falha no reconhecimento de fala: ${event.error}` : 'Falha no reconhecimento de fala.';
      whisperStatus = 'Falha no reconhecimento';
    };

    recognition.onend = () => {
      if (speechRecognition === recognition) {
        speechRecognition = null;
      }
      dictationActive = false;
      dictationFinalizing = false;
      if (speechRecognitionStopTimeout) {
        window.clearTimeout(speechRecognitionStopTimeout);
        speechRecognitionStopTimeout = null;
      }
      whisperStatus = lastDisplayedWhisperText || draft.trim() ? 'Reconhecimento finalizado' : 'Nenhum texto reconhecido';
      requestAnimationFrame(() => draftInput?.focus());
    };

    try {
      recognition.start();
      dictationActive = true;
      whisperStatus = 'Ouvindo... Alt+Espaco para parar';
    } catch (error) {
      speechRecognition = null;
      dictationActive = false;
      dictationFinalizing = false;
      errorMessage = error instanceof Error ? error.message : 'Falha ao iniciar reconhecimento de fala.';
      whisperStatus = 'Falha no reconhecimento';
    }
  }

  function stopBrowserDictation() {
    if (!dictationActive || dictationFinalizing) return;
    dictationActive = false;
    dictationFinalizing = true;
    whisperStatus = 'Finalizando reconhecimento...';
    try {
      speechRecognition?.stop();
    } catch {
      speechRecognition = null;
      dictationFinalizing = false;
      whisperStatus = lastDisplayedWhisperText || draft.trim() ? 'Reconhecimento finalizado' : 'Nenhum texto reconhecido';
    }
    speechRecognitionStopTimeout = window.setTimeout(() => {
      speechRecognitionStopTimeout = null;
      speechRecognition = null;
      dictationActive = false;
      dictationFinalizing = false;
      whisperStatus = lastDisplayedWhisperText || draft.trim() ? 'Reconhecimento finalizado' : 'Nenhum texto reconhecido';
      requestAnimationFrame(() => draftInput?.focus());
    }, 1800);
    requestAnimationFrame(() => draftInput?.focus());
  }

  async function startDictation() {
    if (busy || dictationActive || whisperLoading || dictationFinalizing) return;
    if (dictationEngine === 'browser') {
      startBrowserDictation();
      return;
    }

    errorMessage = '';
    lastWhisperText = '';
    lastDisplayedWhisperText = '';
    flushedWhisperText = '';
    try {
      await ensureWhisper();
      activeMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(),
        video: false,
      });
      activeAudioChunks = [];
      const recorderOptions = getMediaRecorderOptions();
      activeMediaRecorder = recorderOptions
        ? new MediaRecorder(activeMediaStream, recorderOptions)
        : new MediaRecorder(activeMediaStream);
      activeMediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          activeAudioChunks.push(event.data);
        }
      };
      activeMediaRecorder.start();
      await refreshAudioDevices();
      dictationActive = true;
      whisperStatus = 'Gravando... Alt+Espaco para parar';
    } catch (error) {
      stopActiveMediaStream();
      activeMediaRecorder = null;
      activeAudioChunks = [];
      dictationActive = false;
      whisperStatus = 'Falha no Whisper';
      errorMessage = error instanceof Error ? error.message : 'Falha ao iniciar transcricao local.';
    }
  }

  async function stopDictation() {
    if (dictationEngine === 'browser') {
      stopBrowserDictation();
      return;
    }

    if (!dictationActive || dictationFinalizing) return;
    dictationActive = false;
    dictationFinalizing = true;
    whisperStatus = 'Finalizando gravacao...';

    try {
      const blob = await stopActiveRecording();
      whisperStatus = 'Decodificando audio...';
      const audio = await decodeAudioBlob(blob);
      const audioSeconds = audio.length / WHISPER_SAMPLE_RATE;
      const receivedText = await transcribeAudio(audio);
      lastWhisperText = '';
      whisperStatus = receivedText
        ? 'Transcricao inserida'
        : `Nenhuma transcricao retornada (${audioSeconds.toFixed(1)}s de audio)`;
      requestAnimationFrame(() => draftInput?.focus());
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Falha ao finalizar transcricao local.';
      whisperStatus = 'Falha na transcricao';
    } finally {
      dictationFinalizing = false;
    }
  }

  function changeWhisperLanguage(language: WhisperLanguage) {
    if (dictationActive || whisperLoading || dictationFinalizing) return;
    whisperLanguage = language;
    whisperReady = whisperLoadedLanguage === language;
    whisperStatus = language === 'en' ? 'Ingles selecionado' : language === 'pt' ? 'Portugues selecionado' : 'Auto PT/EN selecionado';
  }

  function changeDictationEngine(engine: DictationEngine) {
    if (dictationActive || whisperLoading || dictationFinalizing) return;
    dictationEngine = engine;
    whisperStatus =
      engine === 'browser'
        ? browserSpeechSupported
          ? 'Reconhecimento do navegador selecionado'
          : 'Reconhecimento indisponivel neste navegador'
        : 'Whisper WASM selecionado';
  }

  function insertLastTranscription() {
    if (!lastDisplayedWhisperText) return;
    appendTranscription(lastDisplayedWhisperText);
  }

  function changeAudioDevice(deviceId: string) {
    if (dictationActive || whisperLoading || dictationFinalizing) return;
    selectedAudioDeviceId = deviceId;
    const device = audioDevices.find((item) => item.deviceId === deviceId);
    whisperStatus = device ? `Microfone: ${device.label}` : 'Microfone padrao do sistema';
  }

  function toggleDictation() {
    if (dictationActive) {
      void stopDictation();
    } else {
      void startDictation();
    }
  }

  onMount(() => {
    const handleHotkey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'Space' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        toggleDictation();
      }
    };

    window.addEventListener('keydown', handleHotkey);
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshAudioDevices);
    browserSpeechSupported = Boolean(getBrowserSpeechRecognition());

    void (async () => {
      try {
        await refreshAudioDevices();
        await refreshAll();
        if (conversations.length === 0) {
          await createConversation();
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Falha ao iniciar o app.';
      }
    })();

    return () => {
      window.removeEventListener('keydown', handleHotkey);
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshAudioDevices);
      if (activeMediaRecorder?.state === 'recording') {
        activeMediaRecorder.stop();
      }
      if (speechRecognitionStopTimeout) {
        window.clearTimeout(speechRecognitionStopTimeout);
      }
      speechRecognition?.abort();
      activeAgentAbortController?.abort();
      stopActiveMediaStream();
    };
  });
</script>

<svelte:head>
  <title>Pantheon Agent Room</title>
  <meta
    name="description"
    content="Orquestrador local para conversa entre usuario, Codex e Claude."
  />
</svelte:head>

<main class="agent-room-shell">
  <aside class="conversation-sidebar">
    <div class="sidebar-header">
      <div>
        <strong>Pantheon</strong>
        <span>Agent Room</span>
      </div>
      <button type="button" onclick={() => createConversation()} aria-label="Nova conversa">
        <MessageSquarePlus size={17} />
      </button>
    </div>

    <div class="cli-status">
      <span class:ok={status.codex?.installed}>Codex {status.codex?.installed ? 'online' : 'ausente'}</span>
      <span class:ok={status.claude?.installed}>Claude {status.claude?.installed ? 'online' : 'ausente'}</span>
    </div>

    <nav aria-label="Conversas">
      {#each conversations as conversation}
        <div class="conversation-item" class:active={conversation.id === activeConversationId}>
          <button type="button" class="conversation-select" onclick={() => selectConversation(conversation.id)}>
            <strong>{conversation.title}</strong>
            <span>{conversation.mode}{conversation.projectPath ? ` · ${conversation.projectPath.split('/').at(-1)}` : ''}</span>
          </button>
          <div class="conversation-actions">
            <button type="button" onclick={() => renameConversation(conversation)} aria-label="Renomear conversa">
              <Pencil size={14} />
            </button>
            <button type="button" onclick={() => deleteConversation(conversation)} aria-label="Apagar conversa">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      {/each}
    </nav>
  </aside>

  <section class="chat-column">
    <header class="chat-header">
      <div>
        <strong>{activeConversation?.title ?? 'Nova conversa'}</strong>
        <span>{selectedProjectPath ?? 'Sem projeto selecionado'}</span>
      </div>
      <div class="chat-header-actions">
        <button type="button" onclick={() => scrollChatTo('top')} aria-label="Ir para o topo">
          <ArrowUpToLine size={17} />
        </button>
        <button type="button" onclick={() => scrollChatTo('bottom')} aria-label="Ir para o final">
          <ArrowDownToLine size={17} />
        </button>
        <button type="button" onclick={refreshAll} disabled={busy} aria-label="Atualizar">
          <RefreshCw size={17} />
        </button>
      </div>
    </header>

    {#if errorMessage}
      <div class="error-banner">
        <AlertCircle size={17} />
        <span>{errorMessage}</span>
      </div>
    {/if}

    <section class="chat-main">
      <ChatView {messages} {busy} />

      {#if liveLog.length}
        <section class="live-agent-panel" aria-live="polite">
          <header>
            <div>
              <span>{liveRunTitle || 'Atividade ao vivo'}</span>
              <small>Efemero: visivel so nesta aba</small>
            </div>
            <button type="button" onclick={stopAgentRun} disabled={!busy || !activeAgentAbortController}>
              <Square size={14} />
              <span>Parar</span>
            </button>
          </header>
          <div class="live-log" role="log">
            {#each liveLog as entry}
              <p class={entry.level}>{entry.text}</p>
            {/each}
          </div>
        </section>
      {/if}
    </section>

    <section class="composer">
      <div class="dictation-box" class:listening={dictationActive}>
        <textarea
          bind:this={draftInput}
          bind:value={draft}
          placeholder="Escreva para Codex, Claude ou ambos..."
          rows="4"
          disabled={busy}
          onkeydown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') runAgent();
          }}
        ></textarea>
        <div class="dictation-toolbar">
          <button
            type="button"
            class:listening={dictationActive}
            aria-pressed={dictationActive}
            disabled={busy || whisperLoading || dictationFinalizing}
            onclick={toggleDictation}
          >
            {#if dictationActive}
              <MicOff size={16} />
              <span>Parar</span>
            {:else}
              <Mic size={16} />
              <span>Falar</span>
            {/if}
          </button>
          <span class="dictation-status">
            {whisperStatus}{whisperLoading && whisperProgress ? ` (${whisperProgress}%)` : ''}
          </span>
          <select
            value={dictationEngine}
            disabled={dictationActive || whisperLoading || dictationFinalizing}
            aria-label="Motor do ditado"
            onchange={(event) => changeDictationEngine(event.currentTarget.value as DictationEngine)}
          >
            <option value="browser">Reconhecimento do navegador</option>
            <option value="whisper">Whisper WASM</option>
          </select>
          <select
            value={whisperLanguage}
            disabled={dictationActive || whisperLoading || dictationFinalizing}
            aria-label="Idioma do ditado"
            onchange={(event) => changeWhisperLanguage(event.currentTarget.value as WhisperLanguage)}
          >
            <option value="auto">Auto PT/EN</option>
            <option value="pt">PT-BR</option>
            <option value="en">EN</option>
          </select>
          {#if dictationEngine === 'whisper'}
            <select
              value={selectedAudioDeviceId}
              disabled={dictationActive || whisperLoading || dictationFinalizing}
              aria-label="Microfone"
              onchange={(event) => changeAudioDevice(event.currentTarget.value)}
            >
              <option value="default">Microfone do sistema</option>
              {#each audioDevices as device}
                <option value={device.deviceId}>{device.label}</option>
              {/each}
            </select>
          {:else}
            <span class="microphone-readonly">Mic: navegador</span>
          {/if}
        </div>
        {#if lastDisplayedWhisperText}
          <div class="dictation-preview">
            <span>{lastDisplayedWhisperText}</span>
            <button type="button" onclick={insertLastTranscription}>Inserir</button>
          </div>
        {/if}
      </div>
      <AgentControls
        bind:mode
        bind:target
        bind:allowWrites
        bind:loopMaxRounds
        {busy}
        onRun={runAgent}
        onDebate={runDebate}
        onLoop={runLoop}
      />
    </section>
  </section>

  <ProjectPanel bind:selectedProjectPath {projects} {busy} onCreateProject={createProject} />
</main>
