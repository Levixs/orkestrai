/**
 * Temas de terminal (xterm) disponiveis por no terminal (payload.theme).
 */
export type TerminalThemeName = 'dark' | 'dracula' | 'nord' | 'solarized' | 'light';

export const TERMINAL_THEMES: Record<TerminalThemeName, { label: string; theme: Record<string, string> }> = {
  dark: {
    label: 'Escuro',
    theme: { background: '#090820', foreground: '#e6e6eb', cursor: '#e6e6eb', selectionBackground: '#2c2c36' },
  },
  dracula: {
    label: 'Dracula',
    theme: { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a' },
  },
  nord: {
    label: 'Nord',
    theme: { background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e' },
  },
  solarized: {
    label: 'Solarized',
    theme: { background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642' },
  },
  light: {
    label: 'Claro',
    theme: { background: '#f5f5f0', foreground: '#1c1c20', cursor: '#1c1c20', selectionBackground: '#c9d4e3' },
  },
};

export const TERMINAL_THEME_ORDER: TerminalThemeName[] = ['dark', 'dracula', 'nord', 'solarized', 'light'];

export function nextTerminalTheme(current?: string): TerminalThemeName {
  const index = TERMINAL_THEME_ORDER.indexOf((current as TerminalThemeName) ?? 'dark');
  return TERMINAL_THEME_ORDER[(index + 1) % TERMINAL_THEME_ORDER.length];
}
