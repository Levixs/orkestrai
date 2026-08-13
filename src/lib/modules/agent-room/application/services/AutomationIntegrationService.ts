import { uuidv7 } from '@beeblock/svelar/support';
import type { AutomationIntegration } from '../../domain/types.js';
import { AgentAutomationIntegration } from '../../domain/models/AgentAutomationIntegration.js';
import { githubAutomationAdapter } from '../../infrastructure/integrations/GitHubAutomationAdapter.js';

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapIntegration(model: AgentAutomationIntegration): AutomationIntegration {
  const config = object(model.getAttribute('config_json'));
  return {
    id: String(model.getAttribute('id')),
    workspaceId: String(model.getAttribute('workspace_id')),
    type: 'github',
    name: String(model.getAttribute('name')),
    config: { owner: String(config.owner ?? ''), repo: String(config.repo ?? '') },
    secretKey: model.getAttribute('secret_key') ? String(model.getAttribute('secret_key')) : null,
    status: model.getAttribute('status') as AutomationIntegration['status'],
    lastCheckedAt: model.getAttribute('last_checked_at') ? toIso(model.getAttribute('last_checked_at')) : null,
    error: model.getAttribute('error') ? String(model.getAttribute('error')) : null,
    createdAt: toIso(model.getAttribute('created_at')),
    updatedAt: toIso(model.getAttribute('updated_at')),
  };
}

export class AutomationIntegrationService {
  async list(workspaceId: string): Promise<AutomationIntegration[]> {
    const rows = await AgentAutomationIntegration.query().where('workspace_id', workspaceId).orderBy('created_at', 'asc').get();
    return rows.map(mapIntegration);
  }

  async github(workspaceId: string): Promise<AutomationIntegration | null> {
    const row = await AgentAutomationIntegration.query().where('workspace_id', workspaceId).where('type', 'github').first();
    return row ? mapIntegration(row) : null;
  }

  async connectGitHub(workspaceId: string, input: { owner: string; repo: string }): Promise<AutomationIntegration> {
    const now = new Date();
    const existing = await AgentAutomationIntegration.query().where('workspace_id', workspaceId).where('type', 'github').first();
    const secretKey = `automation:github:${workspaceId}`;
    const base = {
      name: 'GitHub',
      config_json: JSON.stringify({ owner: input.owner, repo: input.repo }),
      secret_key: secretKey,
      updated_at: now,
    };
    if (existing) {
      await AgentAutomationIntegration.query().where('id', existing.getAttribute('id')).update(base);
    } else {
      await AgentAutomationIntegration.create({
        id: uuidv7(),
        workspace_id: workspaceId,
        type: 'github',
        ...base,
        status: 'disconnected',
        last_checked_at: null,
        error: null,
        created_at: now,
      });
    }
    return this.checkGitHub(workspaceId);
  }

  async checkGitHub(workspaceId: string): Promise<AutomationIntegration> {
    const integration = await this.github(workspaceId);
    if (!integration?.secretKey) throw new Error('GitHub integration is not configured.');
    const checkedAt = new Date();
    try {
      await githubAutomationAdapter.validate({ ...integration.config, secretKey: integration.secretKey });
      await AgentAutomationIntegration.query().where('id', integration.id).update({
        status: 'connected', error: null, last_checked_at: checkedAt, updated_at: checkedAt,
      });
    } catch (error) {
      await AgentAutomationIntegration.query().where('id', integration.id).update({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        last_checked_at: checkedAt,
        updated_at: checkedAt,
      });
    }
    const updated = await AgentAutomationIntegration.find(integration.id);
    if (!updated) throw new Error('GitHub integration disappeared during validation.');
    return mapIntegration(updated);
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await AgentAutomationIntegration.query().where('workspace_id', workspaceId).where('id', id).delete();
    return deleted > 0;
  }
}

export const automationIntegrationService = new AutomationIntegrationService();
