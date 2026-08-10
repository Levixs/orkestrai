import { describe, expect, it } from 'vitest';
import {
  APP_THEME_TOKEN_KEYS,
  BUILTIN_APP_THEMES,
  allAppThemes,
  appThemeCssVariables,
  parseCustomAppThemes,
  resolveAppTheme,
  serializeCustomAppThemes,
} from '$lib/components/agent-room/app-themes.js';

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return (linear[0] * 0.2126) + (linear[1] * 0.7152) + (linear[2] * 0.0722);
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('app themes', () => {
  it('mantem todos os temas nativos completos e resolve light', () => {
    expect(BUILTIN_APP_THEMES).toHaveLength(4);
    for (const theme of BUILTIN_APP_THEMES) {
      expect(Object.keys(theme.tokens).sort()).toEqual([...APP_THEME_TOKEN_KEYS].sort());
      expect(Object.values(theme.tokens).every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true);
    }
    expect(resolveAppTheme({ appTheme: 'orkestrai-light' }).dark).toBe(false);
  });

  it('ignora tema importado incompleto ou com valores que poderiam injetar CSS', () => {
    const base = BUILTIN_APP_THEMES[0];
    const valid = { id: 'custom-123456', name: 'Meu tema', dark: true, tokens: base.tokens };
    expect(parseCustomAppThemes(JSON.stringify([valid, { ...valid, id: 'custom-broken', tokens: { ...valid.tokens, page: 'red; color: hotpink' } }]))).toEqual([valid]);
  });

  it('serializa temas customizados e cria variaveis semanticas', () => {
    const custom = { id: 'custom-abcdef', name: 'Custom', dark: false, tokens: BUILTIN_APP_THEMES[3].tokens };
    const settings = { appTheme: custom.id, customAppThemes: serializeCustomAppThemes([custom]) };
    expect(allAppThemes(settings).at(-1)?.name).toBe('Custom');
    expect(appThemeCssVariables(resolveAppTheme(settings))['--app-canvas']).toBe(custom.tokens.canvas);
  });

  it('mantem o texto e os estados do tema claro com contraste acessivel', () => {
    const light = resolveAppTheme({ appTheme: 'orkestrai-light' }).tokens;
    for (const background of [light.page, light.canvas, light.sidebar, light.surface, light.surfaceSubtle]) {
      expect(contrast(light.text, background)).toBeGreaterThanOrEqual(7);
      expect(contrast(light.textSoft, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(light.textMuted, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(light.accentContrast, light.accent)).toBeGreaterThanOrEqual(4.5);
    for (const state of [light.accent, light.secondary, light.success, light.warning, light.danger]) {
      expect(contrast(state, light.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
