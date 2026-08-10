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
});
