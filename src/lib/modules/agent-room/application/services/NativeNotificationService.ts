import type { Workspace } from '../../domain/types.js';
import { settingsService } from './SettingsService.js';

export type NativeNotificationKind = 'info' | 'attention' | 'project' | 'task';

const COPY = {
  'pt-BR': {
    attention: 'Atenção necessária',
    project: 'Projeto concluído',
    task: 'Tarefa concluída',
  },
  en: {
    attention: 'Attention required',
    project: 'Project completed',
    task: 'Task completed',
  },
  es: {
    attention: 'Atención necesaria',
    project: 'Proyecto completado',
    task: 'Tarea completada',
  },
} as const;

/** Emits one structured stdout record consumed by Electron's native shell. */
export class NativeNotificationService {
  async send(
    workspace: Workspace,
    input: { message: string; kind?: NativeNotificationKind; title?: string | null }
  ): Promise<{ notified: boolean }> {
    const locale = await settingsService.get('uiLanguage');
    const copy = COPY[locale === 'pt-BR' || locale === 'es' ? locale : 'en'];
    const kind = input.kind ?? 'info';
    // Heartbeats ficam no Control Center. O sistema operacional recebe apenas
    // transições semânticas de atenção e conclusão.
    if (kind === 'info') return { notified: false };
    const title = `Orkestrai — ${copy[kind]}`;
    const subject = input.title?.trim();
    const body = [subject ? `“${subject}”` : '', input.message.trim(), workspace.name]
      .filter(Boolean)
      .join(' · ');
    console.log(`[orkestrai:notify] ${JSON.stringify({ kind, title, body })}`);
    return { notified: true };
  }
}

export const nativeNotificationService = new NativeNotificationService();
