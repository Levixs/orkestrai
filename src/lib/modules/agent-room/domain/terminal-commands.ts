export const MAX_SAVED_TERMINAL_COMMANDS = 100;
export const MAX_SAVED_TERMINAL_COMMAND_NAME = 80;
export const MAX_SAVED_TERMINAL_COMMAND_LENGTH = 4_000;

export type SavedTerminalCommand = {
  id: string;
  name: string;
  command: string;
  runOnResume: boolean;
};

function commandFrom(value: unknown): SavedTerminalCommand | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const name = typeof item.name === 'string' ? item.name.trim().slice(0, MAX_SAVED_TERMINAL_COMMAND_NAME) : '';
  const command = typeof item.command === 'string' ? item.command.trim().slice(0, MAX_SAVED_TERMINAL_COMMAND_LENGTH) : '';
  if (!id || !name || !command) return null;
  return { id, name, command, runOnResume: item.runOnResume === true };
}

export function normalizeSavedTerminalCommands(value: unknown): SavedTerminalCommand[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const result: SavedTerminalCommand[] = [];
  const seen = new Set<string>();
  for (const value of parsed) {
    const command = commandFrom(value);
    if (!command || seen.has(command.id)) continue;
    result.push(command);
    seen.add(command.id);
    if (result.length >= MAX_SAVED_TERMINAL_COMMANDS) break;
  }
  return result;
}

export function savedTerminalCommandInput(command: string): string {
  return `${command.replaceAll('\r\n', '\n').replaceAll('\n', '\r').replace(/\r+$/, '')}\r`;
}

export function resumeTerminalCommandInput(commands: SavedTerminalCommand[], executable: string): string {
  const selected = Array.from(new Set(commands.filter((command) => command.runOnResume).map((command) => command.command.trim()).filter(Boolean)));
  if (!selected.length) return '';
  const shell = executable.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  const separator = shell === 'powershell.exe' || shell === 'powershell' || shell === 'pwsh.exe' || shell === 'pwsh'
    ? '; '
    : ' && ';
  return savedTerminalCommandInput(selected.join(separator));
}

export function terminalCommandFingerprint(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
