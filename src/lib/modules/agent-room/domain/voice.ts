export const EMBEDDED_TTS_VOICES = [
  { id: 'pt-BR-f1', locale: 'pt-BR', language: 'pt', sid: 0 },
  { id: 'en-US-m2', locale: 'en-US', language: 'en', sid: 6 },
  { id: 'es-MX-f3', locale: 'es-MX', language: 'es', sid: 2 },
] as const;

export type EmbeddedTtsVoiceId = (typeof EMBEDDED_TTS_VOICES)[number]['id'];
export type EmbeddedTtsVoice = (typeof EMBEDDED_TTS_VOICES)[number];

export const DEFAULT_EMBEDDED_TTS_VOICE: EmbeddedTtsVoiceId = 'pt-BR-f1';
export const DEFAULT_EMBEDDED_TTS_SPEED = 1;
export const MIN_EMBEDDED_TTS_SPEED = 0.75;
export const MAX_EMBEDDED_TTS_SPEED = 1.5;

const LEGACY_KOKORO_VOICES = new Set(['pf_dora', 'pm_alex', 'pm_santa']);

export function embeddedTtsVoice(value?: string | null): EmbeddedTtsVoice {
  const voice = EMBEDDED_TTS_VOICES.find((candidate) => candidate.id === value);
  if (voice) return voice;
  return EMBEDDED_TTS_VOICES[0];
}

export function normalizeEmbeddedTtsVoice(value?: string | null): EmbeddedTtsVoiceId {
  if (!value || LEGACY_KOKORO_VOICES.has(value)) return DEFAULT_EMBEDDED_TTS_VOICE;
  return embeddedTtsVoice(value).id;
}

export function normalizeEmbeddedTtsSpeed(value?: string | number | null): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  if (!Number.isFinite(parsed)) return DEFAULT_EMBEDDED_TTS_SPEED;
  const clamped = Math.min(MAX_EMBEDDED_TTS_SPEED, Math.max(MIN_EMBEDDED_TTS_SPEED, parsed));
  return Math.round(clamped * 20) / 20;
}
