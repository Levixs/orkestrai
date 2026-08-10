export const APP_THEME_TOKEN_KEYS = [
  'page',
  'canvas',
  'sidebar',
  'surface',
  'surfaceRaised',
  'surfaceSubtle',
  'text',
  'textSoft',
  'textMuted',
  'border',
  'borderStrong',
  'accent',
  'accentSoft',
  'accentContrast',
  'secondary',
  'success',
  'warning',
  'danger',
  'grid',
  'edge',
] as const;

export type AppThemeToken = (typeof APP_THEME_TOKEN_KEYS)[number];
export type AppThemeTokens = Record<AppThemeToken, string>;

export type AppTheme = {
  id: string;
  name: string;
  dark: boolean;
  builtin: boolean;
  tokens: AppThemeTokens;
};

export type CustomAppTheme = Omit<AppTheme, 'builtin'>;

export const DEFAULT_APP_THEME_ID = 'orkestrai-dark';
export const APP_THEME_SETTING = 'appTheme';
export const CUSTOM_APP_THEMES_SETTING = 'customAppThemes';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const BUILTIN_APP_THEMES: AppTheme[] = [
  {
    id: DEFAULT_APP_THEME_ID,
    name: 'Orkestrai Dark',
    dark: true,
    builtin: true,
    tokens: {
      page: '#090912', canvas: '#0d0b2e', sidebar: '#100e2a', surface: '#1c1946', surfaceRaised: '#262155', surfaceSubtle: '#151238',
      text: '#f4f3f8', textSoft: '#c7c8d0', textMuted: '#8b8c96', border: '#302b62', borderStrong: '#4a4580',
      accent: '#9675ff', accentSoft: '#2a2254', accentContrast: '#0d0b2e', secondary: '#25baf5', success: '#3dd68c', warning: '#ffc857',
      danger: '#e6545d', grid: '#2c2760', edge: '#5c5696',
    },
  },
  {
    id: 'graphite-dark',
    name: 'Graphite',
    dark: true,
    builtin: true,
    tokens: {
      page: '#111214', canvas: '#151619', sidebar: '#18191d', surface: '#202126', surfaceRaised: '#292b31', surfaceSubtle: '#1b1c20',
      text: '#f2f3f5', textSoft: '#c5c8ce', textMuted: '#898e98', border: '#30333a', borderStrong: '#464a54',
      accent: '#e5e7eb', accentSoft: '#303238', accentContrast: '#151619', secondary: '#65a9ff', success: '#45c992', warning: '#e7b657',
      danger: '#ed6a70', grid: '#303238', edge: '#5d626d',
    },
  },
  {
    id: 'midnight-dark',
    name: 'Midnight',
    dark: true,
    builtin: true,
    tokens: {
      page: '#080d14', canvas: '#07111f', sidebar: '#0b1624', surface: '#122238', surfaceRaised: '#19314f', surfaceSubtle: '#0e1b2d',
      text: '#edf6ff', textSoft: '#b8cadb', textMuted: '#7890a8', border: '#203b5d', borderStrong: '#31587f',
      accent: '#5fb4ff', accentSoft: '#123b61', accentContrast: '#06111f', secondary: '#57d4c7', success: '#45cf91', warning: '#f1be60',
      danger: '#f16d76', grid: '#173251', edge: '#3d6f9d',
    },
  },
  {
    id: 'orkestrai-light',
    name: 'Orkestrai Light',
    dark: false,
    builtin: true,
    tokens: {
      page: '#f4f5f8', canvas: '#eef0f7', sidebar: '#ffffff', surface: '#ffffff', surfaceRaised: '#e7e9f1', surfaceSubtle: '#f6f7fa',
      text: '#181822', textSoft: '#474957', textMuted: '#6d7080', border: '#d7d9e3', borderStrong: '#b8bbc9',
      accent: '#6543d8', accentSoft: '#e9e3ff', accentContrast: '#ffffff', secondary: '#087da4', success: '#16845b', warning: '#9a6500',
      danger: '#c53b45', grid: '#cdd1df', edge: '#8d84b8',
    },
  },
];

function validTokenSet(value: unknown): value is AppThemeTokens {
  if (!value || typeof value !== 'object') return false;
  const tokens = value as Record<string, unknown>;
  return APP_THEME_TOKEN_KEYS.every((key) => typeof tokens[key] === 'string' && HEX_COLOR.test(tokens[key] as string));
}

function normalizeCustomTheme(value: unknown): CustomAppTheme | null {
  if (!value || typeof value !== 'object') return null;
  const theme = value as Partial<CustomAppTheme>;
  const id = String(theme.id ?? '').trim();
  const name = String(theme.name ?? '').trim().slice(0, 48);
  if (!/^custom-[a-z0-9-]{6,80}$/i.test(id) || !name || typeof theme.dark !== 'boolean' || !validTokenSet(theme.tokens)) return null;
  return { id, name, dark: theme.dark, tokens: { ...theme.tokens } };
}

export function parseCustomAppThemes(raw: unknown): CustomAppTheme[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((item) => {
      const theme = normalizeCustomTheme(item);
      if (!theme || seen.has(theme.id)) return [];
      seen.add(theme.id);
      return [theme];
    }).slice(0, 24);
  } catch {
    return [];
  }
}

export function serializeCustomAppThemes(themes: CustomAppTheme[]): string {
  return JSON.stringify(themes.flatMap((theme) => normalizeCustomTheme(theme) ?? []).slice(0, 24));
}

export function allAppThemes(settings: Record<string, string>): AppTheme[] {
  return [
    ...BUILTIN_APP_THEMES,
    ...parseCustomAppThemes(settings[CUSTOM_APP_THEMES_SETTING]).map((theme) => ({ ...theme, builtin: false })),
  ];
}

export function resolveAppTheme(settings: Record<string, string>): AppTheme {
  const themes = allAppThemes(settings);
  return themes.find((theme) => theme.id === settings[APP_THEME_SETTING]) ?? themes[0];
}

export function duplicateAppTheme(theme: AppTheme, id = `custom-${crypto.randomUUID()}`): CustomAppTheme {
  return { id, name: `${theme.name} Copy`, dark: theme.dark, tokens: { ...theme.tokens } };
}

export function appThemeCssVariables(theme: AppTheme): Record<string, string> {
  const token = theme.tokens;
  return {
    '--page': token.page,
    '--surface': token.surface,
    '--surface-raised': token.surfaceRaised,
    '--surface-subtle': token.surfaceSubtle,
    '--copy': token.text,
    '--copy-soft': token.textSoft,
    '--copy-muted': token.textMuted,
    '--line': token.border,
    '--line-strong': token.borderStrong,
    '--violet': token.accent,
    '--violet-soft': token.accentSoft,
    '--cyan': token.secondary,
    '--success': token.success,
    '--background': token.page,
    '--foreground': token.text,
    '--card': token.surface,
    '--card-foreground': token.text,
    '--popover': token.surfaceRaised,
    '--popover-foreground': token.text,
    '--primary': token.accent,
    '--primary-foreground': token.accentContrast,
    '--secondary': token.surfaceRaised,
    '--secondary-foreground': token.text,
    '--muted': token.surfaceRaised,
    '--muted-foreground': token.textMuted,
    '--accent': token.accentSoft,
    '--accent-foreground': token.text,
    '--destructive': token.danger,
    '--destructive-foreground': '#ffffff',
    '--border': token.border,
    '--input': token.border,
    '--ring': token.accent,
    '--sidebar': token.sidebar,
    '--sidebar-foreground': token.textSoft,
    '--sidebar-primary': token.accent,
    '--sidebar-primary-foreground': token.accentContrast,
    '--sidebar-accent': token.accentSoft,
    '--sidebar-accent-foreground': token.text,
    '--sidebar-border': token.border,
    '--sidebar-ring': token.accent,
    '--app-page': token.page,
    '--app-canvas': token.canvas,
    '--app-sidebar': token.sidebar,
    '--app-surface': token.surface,
    '--app-surface-raised': token.surfaceRaised,
    '--app-surface-subtle': token.surfaceSubtle,
    '--app-text': token.text,
    '--app-text-soft': token.textSoft,
    '--app-text-muted': token.textMuted,
    '--app-border': token.border,
    '--app-border-strong': token.borderStrong,
    '--app-accent': token.accent,
    '--app-accent-soft': token.accentSoft,
    '--app-accent-contrast': token.accentContrast,
    '--app-secondary': token.secondary,
    '--app-success': token.success,
    '--app-warning': token.warning,
    '--app-danger': token.danger,
    '--app-grid': token.grid,
    '--app-edge': token.edge,
  };
}

export function applyAppTheme(settings: Record<string, string>, root?: HTMLElement): AppTheme {
  const theme = resolveAppTheme(settings);
  const target = root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  if (!target) return theme;
  target.dataset.appTheme = theme.id;
  target.classList.toggle('dark', theme.dark);
  target.style.colorScheme = theme.dark ? 'dark' : 'light';
  for (const [key, value] of Object.entries(appThemeCssVariables(theme))) target.style.setProperty(key, value);
  const themeColor = typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="theme-color"]') : null;
  if (themeColor) themeColor.content = theme.tokens.page;
  return theme;
}
