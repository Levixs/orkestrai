import type { AutomationTriggerType } from '../types.js';

export class AutomationTriggerReceived {
  constructor(
    readonly workspaceId: string,
    readonly triggerType: Extract<AutomationTriggerType, 'task' | 'message' | 'webhook' | 'github_pull_request'>,
    readonly event: string,
    readonly key: string,
    readonly data: Record<string, unknown>,
  ) {}
}
