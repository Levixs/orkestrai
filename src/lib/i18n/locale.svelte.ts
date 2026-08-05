import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import { appSettingsStore, getAppSettings } from '$lib/components/agent-room/app-settings.svelte.js';

const SUPPORTED = new Set(['pt-BR', 'en', 'es']);
const pick = (value: unknown): 'pt-BR' | 'en' | 'es' => (SUPPORTED.has(String(value)) ? String(value) : 'pt-BR') as 'pt-BR' | 'en' | 'es';

/** Locale reativo do app (propriedade de objeto $state — tracking profundo). */
export const localeState = $state({ current: 'pt-BR' as 'pt-BR' | 'en' | 'es' });

/**
 * Locale do app vem das settings (desktop: sem rota por URL). O overwriteGetLocale
 * le o localeState ($state) — a troca de idioma re-renderiza na hora, sem reload.
 * Chame uma vez no mount do layout raiz.
 */
export function initLocaleRuntime(): void {
  void getAppSettings();
  overwriteGetLocale(() => localeState.current);
  // Sync continuo: settings (API) -> localeState. $effect.root porque isto
  // roda no modulo (fora de componente).
  $effect.root(() => {
    $effect(() => {
      localeState.current = pick(appSettingsStore.values.uiLanguage);
    });
  });
}
