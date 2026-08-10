<script lang="ts">
  import { onMount } from 'svelte';
  import { Mic, Square } from '@lucide/svelte';
  import { toast } from '@beeblock/svelar/ui';
  import { getCsrfToken } from '@beeblock/svelar/http';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import VoiceConfirmDialog from './VoiceConfirmDialog.svelte';
  import { blobToWav16k } from './audio-pcm.js';
  import { appSettingsStore, getAppSettings } from './app-settings.svelte.js';
  import { DEFAULT_DICTATION_HOTKEY, matchesCombo } from './dictation-hotkey.js';
  import {
    LEADER_DICTATION_STATE,
    type LeaderDictationStateDetail,
    type LeaderDictationStatus,
  } from './leader-dictation.js';
  import { TEXT_DICTATION_FALLBACK, type TextDictationFallbackDetail } from './text-dictation.js';
  import { voiceModelsReadyForUse } from './voice-model-status.js';
  import * as m from '$lib/paraglide/messages.js';

  type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

  let target = $state<Editable | null>(null);
  let savedRange: Range | null = null;
  let status = $state<LeaderDictationStatus>('idle');
  let source = $state<'text' | 'leader' | null>(null);
  let voiceConfirmOpen = $state(false);
  let checkingVoiceModels = false;
  let mediaRecorder: MediaRecorder | null = null;
  let mediaStream: MediaStream | null = null;
  let audioChunks: Blob[] = [];
  const hotkey = $derived(appSettingsStore.values.dictationHotkey || DEFAULT_DICTATION_HOTKEY);

  const supported = typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);

  function editableFrom(value: EventTarget | null): Editable | null {
    if (!(value instanceof HTMLElement)) return null;
    const element = value.closest('input, textarea, [contenteditable="true"]');
    if (!(element instanceof HTMLElement) || element.closest('.xterm') || element.closest('[data-dictation-ignore]')) return null;
    if (element instanceof HTMLInputElement) {
      const excluded = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
      if (excluded.has(element.type) || element.disabled || element.readOnly) return null;
    }
    if (element instanceof HTMLTextAreaElement && (element.disabled || element.readOnly)) return null;
    return element;
  }

  function rememberSelection() {
    if (!target?.isContentEditable) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (target.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
  }

  function insertText(element: Editable, text: string) {
    if (!element.isConnected) return;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const supportsSelection = !(element instanceof HTMLInputElement)
        || ['text', 'search', 'tel', 'url', 'password'].includes(element.type);
      const start = supportsSelection ? (element.selectionStart ?? element.value.length) : element.value.length;
      const end = supportsSelection ? (element.selectionEnd ?? start) : start;
      const spacer = start > 0 && !/\s$/.test(element.value.slice(0, start)) ? ' ' : '';
      if (supportsSelection) element.setRangeText(`${spacer}${text}`, start, end, 'end');
      else element.value = `${element.value}${spacer}${text}`;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      element.focus();
      return;
    }

    element.focus();
    const selection = window.getSelection();
    const range = savedRange && element.contains(savedRange.commonAncestorContainer)
      ? savedRange
      : document.createRange();
    if (!savedRange || !element.contains(savedRange.commonAncestorContainer)) range.selectNodeContents(element);
    if (!savedRange || !element.contains(savedRange.commonAncestorContainer)) range.collapse(false);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange = range.cloneRange();
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  function stopTracks() {
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  function label(): string {
    if (status === 'recording') return m['dictation.stop']();
    if (status === 'transcribing') return m['dictation.transcribing']();
    return target?.isConnected ? m['dictation.start_field']() : m['dictation.start']();
  }

  async function toggleTextDictation() {
    if (status === 'recording' && source === 'text') {
      mediaRecorder?.stop();
      return;
    }
    if (status !== 'idle' || !target?.isConnected || checkingVoiceModels) return;

    checkingVoiceModels = true;
    try {
      if (!(await voiceModelsReadyForUse(await getAppSettings(true)))) {
        voiceConfirmOpen = true;
        return;
      }
    } catch {
      toast.error(m['voice.model_status_error']());
      return;
    } finally {
      checkingVoiceModels = false;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(m['voice.mic_denied']());
      return;
    }

    const insertionTarget = target;
    audioChunks = [];
    const recorder = new MediaRecorder(mediaStream);
    mediaRecorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };
    recorder.onstop = async () => {
      stopTracks();
      mediaRecorder = null;
      status = 'transcribing';
      try {
        const blob = new Blob(audioChunks, { type: recorder.mimeType || 'audio/webm' });
        const wav = await blobToWav16k(blob);
        const form = new FormData();
        form.append('file', wav, 'dictation.wav');
        const locale = appSettingsStore.values.uiLanguage;
        if (locale === 'pt-BR') form.append('language', 'pt');
        if (locale === 'en') form.append('language', 'en');
        const csrf = getCsrfToken();
        const response = await fetch('/api/agent-room/voice/transcribe', {
          method: 'POST',
          headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
          body: form,
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 413) throw new Error(m['voice.recording_too_long']());
        if (!response.ok || payload.error) throw new Error(payload.error || m['voice.dictation_error']());
        const text = String(payload.data?.text ?? '').trim();
        if (!text) toast.error(m['voice.nothing_transcribed']());
        else insertText(insertionTarget, text);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : m['voice.dictation_error']());
      } finally {
        status = 'idle';
        source = null;
      }
    };
    recorder.start();
    source = 'text';
    status = 'recording';
  }

  function requestFallback() {
    const detail: TextDictationFallbackDetail = { handled: false };
    window.dispatchEvent(new CustomEvent(TEXT_DICTATION_FALLBACK, { detail }));
    if (!detail.handled) toast.error(m['dictation.no_target']());
  }

  function toggle() {
    if (!supported || status === 'transcribing') return;
    if (source === 'leader' || (!target?.isConnected && source !== 'text')) {
      requestFallback();
      return;
    }
    void toggleTextDictation();
  }

  onMount(() => {
    const focusIn = (event: FocusEvent) => {
      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      if (eventTarget?.closest('[data-dictation-trigger]')) return;
      target = editableFrom(event.target);
      if (!target) savedRange = null;
    };
    const pointerDown = (event: PointerEvent) => {
      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      if (eventTarget?.closest('[data-dictation-trigger]')) return;
      target = editableFrom(event.target);
      if (!target) savedRange = null;
    };
    const selectionChange = () => rememberSelection();
    const keyDown = (event: KeyboardEvent) => {
      if (!matchesCombo(event, hotkey)) return;
      event.preventDefault();
      toggle();
    };
    const leaderState = (event: Event) => {
      const detail = (event as CustomEvent<LeaderDictationStateDetail>).detail;
      if (!detail) return;
      source = detail.status === 'idle' ? null : 'leader';
      status = detail.status;
    };
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('selectionchange', selectionChange);
    window.addEventListener('keydown', keyDown);
    window.addEventListener(LEADER_DICTATION_STATE, leaderState);
    return () => {
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('selectionchange', selectionChange);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener(LEADER_DICTATION_STATE, leaderState);
      if (mediaRecorder?.state !== 'inactive') mediaRecorder?.stop();
      stopTracks();
    };
  });
</script>

{#if supported}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          data-dictation-trigger
          class="fixed right-4 top-14 z-30 grid size-12 place-items-center rounded-full border-0 bg-[conic-gradient(from_25deg,#58d6ff,#9674ff,#f05fb4,#ffb45e,#61e5a7,#58d6ff)] p-[3px] text-white shadow-[0_8px_24px_rgba(5,4,26,0.48)] transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:scale-[1.03] hover:shadow-[0_10px_28px_rgba(5,4,26,0.58)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait"
          class:animate-pulse={status === 'recording'}
          class:animate-spin={status === 'transcribing'}
          aria-label={label()}
          aria-pressed={status === 'recording'}
          disabled={status === 'transcribing'}
          onclick={toggle}
        >
          <span class="grid size-full place-items-center rounded-full border border-white/15 bg-[#11102f]">
            {#if status === 'recording'}<Square size={14} fill="currentColor" />{:else}<Mic size={18} />{/if}
          </span>
        </button>
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="left">{label()}</Tooltip.Content>
  </Tooltip.Root>
{/if}

<VoiceConfirmDialog bind:open={voiceConfirmOpen} onConfirm={() => void toggleTextDictation()} onCancel={() => {}} />
