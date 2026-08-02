/**
 * Atalho configuravel do ditado por voz.
 * Formato do combo: modificadores em minusculo + KeyboardEvent.code, ex.:
 * "alt+space", "ctrl+shift+keyd", "meta+f5".
 */

export const DEFAULT_DICTATION_HOTKEY = 'alt+space';

const MODIFIER_CODES = new Set([
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
]);

type HotkeyEvent = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

/** Monta o combo a partir de um keydown. Retorna null para modificador puro. */
export function comboFromEvent(event: HotkeyEvent): string | null {
  if (MODIFIER_CODES.has(event.code)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  if (event.metaKey) parts.push('meta');
  parts.push(event.code.toLowerCase());
  return parts.join('+');
}

/** Verdadeiro quando o keydown corresponde exatamente ao combo. */
export function matchesCombo(event: HotkeyEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+').filter(Boolean);
  const key = parts.at(-1);
  if (!key) return false;
  return (
    event.code.toLowerCase() === key &&
    event.ctrlKey === parts.includes('ctrl') &&
    event.altKey === parts.includes('alt') &&
    event.shiftKey === parts.includes('shift') &&
    event.metaKey === parts.includes('meta')
  );
}

const CODE_LABELS: Record<string, string> = {
  space: 'Espaco',
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  minus: '-',
  equal: '=',
  comma: ',',
  period: '.',
  slash: '/',
  backquote: '`',
  bracketleft: '[',
  bracketright: ']',
  semicolon: ';',
  quote: "'",
  backslash: '\\',
};

function codeLabel(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  const keyMatch = code.match(/^key([a-z])$/);
  if (keyMatch) return keyMatch[1].toUpperCase();
  const digitMatch = code.match(/^digit(\d)$/);
  if (digitMatch) return digitMatch[1];
  const numpadMatch = code.match(/^numpad(\d)$/);
  if (numpadMatch) return `Num ${numpadMatch[1]}`;
  const fnMatch = code.match(/^f(\d{1,2})$/);
  if (fnMatch) return `F${fnMatch[1]}`;
  return code.charAt(0).toUpperCase() + code.slice(1);
}

const MOD_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Cmd',
};

/** "ctrl+shift+keyd" -> "Ctrl+Shift+D" */
export function comboLabel(combo: string): string {
  const parts = combo.toLowerCase().split('+').filter(Boolean);
  return parts.map((part) => MOD_LABELS[part] ?? codeLabel(part)).join('+');
}
