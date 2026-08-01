import { AgentSetting } from '../../domain/models/AgentSetting.js';

const DEFAULTS: Record<string, string> = {
  terminalTheme: 'dark',
  showMinimap: 'true',
  showControls: 'true',
  terminalFontSize: '13',
  terminalFontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  terminalPadding: '6',
  newTerminalWidth: '560',
  newTerminalHeight: '340',
  newNoteWidth: '320',
  newNoteHeight: '220',
};

/** Configuracoes globais do app (chave/valor, com defaults). */
export class SettingsService {
  private cache = new Map<string, string>();

  async get(key: string): Promise<string> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const model = await AgentSetting.find(key);
    const value = (model?.getAttribute('value') as string | undefined) ?? DEFAULTS[key] ?? '';
    this.cache.set(key, value);
    return value;
  }

  async set(key: string, value: string): Promise<string> {
    const existing = await AgentSetting.find(key);
    if (existing) await existing.update({ value });
    else await AgentSetting.create({ key, value });
    this.cache.set(key, value);
    return value;
  }

  async all(): Promise<Record<string, string>> {
    const rows = await AgentSetting.query().get();
    const result = { ...DEFAULTS };
    for (const row of rows) {
      result[row.getAttribute('key')] = row.getAttribute('value');
    }
    this.cache = new Map(Object.entries(result));
    return result;
  }
}

export const settingsService = new SettingsService();
