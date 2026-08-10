<script lang="ts">
  import { Check, Copy, Download, Palette, Plus, Trash2, Upload } from '@lucide/svelte';
  import { toast } from '@beeblock/svelar/ui';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Switch } from '$lib/components/ui/switch';
  import * as m from '$lib/paraglide/messages.js';
  import {
    APP_THEME_SETTING,
    APP_THEME_TOKEN_KEYS,
    CUSTOM_APP_THEMES_SETTING,
    allAppThemes,
    applyAppTheme,
    duplicateAppTheme,
    parseCustomAppThemes,
    resolveAppTheme,
    serializeCustomAppThemes,
    type AppTheme,
    type AppThemeToken,
    type CustomAppTheme,
  } from './app-themes.js';

  type Props = {
    settings: Record<string, string>;
    onChange: (settings: Record<string, string>) => void;
  };

  let { settings, onChange }: Props = $props();
  let importInput: HTMLInputElement;

  const themes = $derived(allAppThemes(settings));
  const activeTheme = $derived(resolveAppTheme(settings));
  const activeCustomTheme = $derived(activeTheme.builtin ? null : activeTheme as CustomAppTheme & { builtin: false });

  const TOKEN_LABELS: Record<AppThemeToken, () => string> = {
    page: () => m['theme.token_page'](),
    canvas: () => m['theme.token_canvas'](),
    sidebar: () => m['theme.token_sidebar'](),
    surface: () => m['theme.token_surface'](),
    surfaceRaised: () => m['theme.token_surface_raised'](),
    surfaceSubtle: () => m['theme.token_surface_subtle'](),
    text: () => m['theme.token_text'](),
    textSoft: () => m['theme.token_text_soft'](),
    textMuted: () => m['theme.token_text_muted'](),
    border: () => m['theme.token_border'](),
    borderStrong: () => m['theme.token_border_strong'](),
    accent: () => m['theme.token_accent'](),
    accentSoft: () => m['theme.token_accent_soft'](),
    accentContrast: () => m['theme.token_accent_contrast'](),
    secondary: () => m['theme.token_secondary'](),
    success: () => m['theme.token_success'](),
    warning: () => m['theme.token_warning'](),
    danger: () => m['theme.token_danger'](),
    grid: () => m['theme.token_grid'](),
    edge: () => m['theme.token_edge'](),
  };

  function updateSettings(partial: Record<string, string>) {
    const next = { ...settings, ...partial };
    onChange(next);
    applyAppTheme(next);
  }

  function selectTheme(id: string) {
    updateSettings({ [APP_THEME_SETTING]: id });
  }

  function customThemes(): CustomAppTheme[] {
    return parseCustomAppThemes(settings[CUSTOM_APP_THEMES_SETTING]);
  }

  function saveCustomTheme(theme: CustomAppTheme) {
    const next = customThemes().map((item) => item.id === theme.id ? theme : item);
    updateSettings({ [CUSTOM_APP_THEMES_SETTING]: serializeCustomAppThemes(next) });
  }

  function duplicateTheme(theme: AppTheme) {
    const copy = duplicateAppTheme(theme);
    copy.name = m['theme.copy_name']({ name: theme.name });
    const next = [...customThemes(), copy];
    updateSettings({
      [CUSTOM_APP_THEMES_SETTING]: serializeCustomAppThemes(next),
      [APP_THEME_SETTING]: copy.id,
    });
  }

  function commitThemeName(input: HTMLInputElement) {
    if (!activeCustomTheme) return;
    const name = input.value.trim().slice(0, 48);
    if (!name) {
      input.value = activeCustomTheme.name;
      return;
    }
    saveCustomTheme({ ...activeCustomTheme, name });
  }

  function updateThemeMode(dark: boolean) {
    if (!activeCustomTheme) return;
    saveCustomTheme({ ...activeCustomTheme, dark });
  }

  function updateToken(key: AppThemeToken, value: string) {
    if (!activeCustomTheme || !/^#[0-9a-f]{6}$/i.test(value)) return;
    saveCustomTheme({ ...activeCustomTheme, tokens: { ...activeCustomTheme.tokens, [key]: value } });
  }

  function commitToken(key: AppThemeToken, input: HTMLInputElement) {
    if (!activeCustomTheme) return;
    if (!/^#[0-9a-f]{6}$/i.test(input.value)) {
      input.value = activeCustomTheme.tokens[key];
      return;
    }
    updateToken(key, input.value);
  }

  function deleteTheme() {
    if (!activeCustomTheme) return;
    const next = customThemes().filter((theme) => theme.id !== activeCustomTheme.id);
    updateSettings({
      [CUSTOM_APP_THEMES_SETTING]: serializeCustomAppThemes(next),
      [APP_THEME_SETTING]: 'orkestrai-dark',
    });
  }

  function exportTheme() {
    const payload = JSON.stringify({ schemaVersion: 1, theme: { ...activeTheme, builtin: undefined } }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeTheme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'orkestrai-theme'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importTheme(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const source = parsed?.theme ?? parsed;
      const candidate = {
        ...source,
        id: `custom-${crypto.randomUUID()}`,
        name: String(source?.name ?? file.name.replace(/\.json$/i, '')).slice(0, 48),
      };
      const imported = parseCustomAppThemes([candidate])[0];
      if (!imported) throw new Error('invalid_theme');
      updateSettings({
        [CUSTOM_APP_THEMES_SETTING]: serializeCustomAppThemes([...customThemes(), imported]),
        [APP_THEME_SETTING]: imported.id,
      });
      toast.success(m['theme.imported']());
    } catch {
      toast.error(m['theme.import_failed']());
    }
  }
</script>

<section class="theme-settings">
  <header class="theme-heading">
    <div>
      <h3>{m['theme.choose']()}</h3>
      <p>{m['theme.choose_desc']()}</p>
    </div>
    <div class="theme-actions">
      <Button variant="outline" size="sm" onclick={() => duplicateTheme(activeTheme)}>
        <Copy size={14} aria-hidden="true" />
        {m['theme.duplicate']()}
      </Button>
      <Button variant="outline" size="sm" onclick={() => importInput.click()}>
        <Upload size={14} aria-hidden="true" />
        {m['theme.import']()}
      </Button>
      <Button variant="outline" size="icon-sm" title={m['theme.export']()} aria-label={m['theme.export']()} onclick={exportTheme}>
        <Download size={14} aria-hidden="true" />
      </Button>
      <input bind:this={importInput} class="hidden-input" type="file" accept="application/json,.json" onchange={importTheme} />
    </div>
  </header>

  <div class="theme-list">
    {#each themes as theme (theme.id)}
      <button
        type="button"
        class="theme-option"
        class:active={theme.id === activeTheme.id}
        aria-pressed={theme.id === activeTheme.id}
        onclick={() => selectTheme(theme.id)}
      >
        <span class="theme-swatches" aria-hidden="true">
          <span style:background={theme.tokens.canvas}></span>
          <span style:background={theme.tokens.surface}></span>
          <span style:background={theme.tokens.accent}></span>
          <span style:background={theme.tokens.text}></span>
        </span>
        <span class="theme-option-copy">
          <strong>{theme.name}</strong>
          <small>{theme.dark ? m['theme.dark']() : m['theme.light']()}{theme.builtin ? '' : ` · ${m['theme.custom']()}`}</small>
        </span>
        {#if theme.id === activeTheme.id}<Check size={15} aria-hidden="true" />{/if}
      </button>
    {/each}
  </div>

  {#if activeCustomTheme}
    <div class="custom-editor">
      <header class="editor-head">
        <div class="editor-title">
          <Palette size={15} aria-hidden="true" />
          <strong>{m['theme.editor']()}</strong>
        </div>
        <Button variant="ghost" size="icon-sm" class="danger-action" title={m['theme.delete']()} aria-label={m['theme.delete']()} onclick={deleteTheme}>
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </header>

      <div class="editor-meta">
        <label>
          <span>{m['theme.name']()}</span>
          <Input name="theme-name" autocomplete="off" value={activeCustomTheme.name} maxlength={48} onchange={(event: Event) => commitThemeName(event.currentTarget as HTMLInputElement)} />
        </label>
        <label class="mode-toggle">
          <span>{m['theme.dark_mode']()}</span>
          <Switch checked={activeCustomTheme.dark} onCheckedChange={(dark: boolean) => updateThemeMode(dark)} />
        </label>
      </div>

      <div class="token-grid">
        {#each APP_THEME_TOKEN_KEYS as key (key)}
          <label class="token-field">
            <span>{TOKEN_LABELS[key]()}</span>
            <span class="color-control">
              <input
                type="color"
                value={activeCustomTheme.tokens[key]}
                aria-label={TOKEN_LABELS[key]()}
                oninput={(event) => updateToken(key, event.currentTarget.value)}
              />
              <input
                class="hex-input"
                value={activeCustomTheme.tokens[key]}
                maxlength={7}
                spellcheck="false"
                autocomplete="off"
                aria-label={`${TOKEN_LABELS[key]()} HEX`}
                onblur={(event) => commitToken(key, event.currentTarget)}
                onkeydown={(event) => {
                  if (event.key !== 'Enter') return;
                  commitToken(key, event.currentTarget);
                  event.currentTarget.blur();
                }}
              />
            </span>
          </label>
        {/each}
      </div>
      <p class="editor-hint"><Plus size={12} aria-hidden="true" /> {m['theme.editor_hint']()}</p>
    </div>
  {:else}
    <p class="builtin-hint">{m['theme.builtin_hint']()}</p>
  {/if}
</section>

<style>
  .theme-settings,
  .custom-editor {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .theme-heading,
  .editor-head,
  .editor-meta,
  .mode-toggle,
  .editor-title,
  .theme-option,
  .color-control,
  .editor-hint {
    display: flex;
    align-items: center;
  }

  .theme-heading,
  .editor-head {
    justify-content: space-between;
    gap: 12px;
  }

  .theme-heading h3 {
    margin: 0;
    font-size: 13px;
    color: var(--copy);
  }

  .theme-heading p,
  .builtin-hint,
  .editor-hint {
    margin: 2px 0 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--copy-muted);
  }

  .theme-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .hidden-input {
    display: none;
  }

  .theme-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    border-block: 1px solid var(--line);
  }

  .theme-option {
    min-width: 0;
    gap: 10px;
    min-height: 58px;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    color: var(--copy-soft);
    padding: 9px 10px;
    text-align: left;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease;
  }

  .theme-option:hover,
  .theme-option.active {
    background: var(--surface-raised);
    color: var(--copy);
  }

  .theme-option.active {
    box-shadow: inset 3px 0 0 var(--violet);
  }

  .theme-swatches {
    display: grid;
    grid-template-columns: repeat(2, 13px);
    width: 28px;
    height: 28px;
    overflow: hidden;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    flex-shrink: 0;
  }

  .theme-option-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .theme-option-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .theme-option-copy small {
    font-size: 10px;
    color: var(--copy-muted);
  }

  .custom-editor {
    padding-top: 2px;
  }

  .editor-title {
    gap: 7px;
    font-size: 12px;
    color: var(--copy-soft);
  }

  :global(.danger-action:hover) {
    color: var(--app-danger);
  }

  .editor-meta {
    align-items: end;
    gap: 18px;
  }

  .editor-meta > label:not(.mode-toggle) {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
  }

  .editor-meta label > span,
  .token-field > span:first-child {
    font-size: 11px;
    font-weight: 500;
    color: var(--copy-muted);
  }

  .mode-toggle {
    gap: 9px;
    min-height: 36px;
  }

  .token-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: 9px 14px;
  }

  .token-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  .color-control {
    gap: 7px;
  }

  .color-control input[type='color'] {
    width: 34px;
    height: 30px;
    flex: 0 0 34px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface-raised);
    padding: 3px;
    cursor: pointer;
  }

  .hex-input {
    width: 100%;
    min-width: 0;
    height: 30px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface-subtle);
    color: var(--copy);
    padding: 0 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    text-transform: uppercase;
  }

  .editor-hint {
    gap: 6px;
  }

  @media (max-width: 640px) {
    .theme-heading,
    .editor-meta {
      align-items: stretch;
      flex-direction: column;
    }

    .theme-actions {
      justify-content: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .theme-option {
      transition: none;
    }
  }
</style>
