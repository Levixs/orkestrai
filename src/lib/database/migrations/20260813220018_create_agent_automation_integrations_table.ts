import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentAutomationIntegrationsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_automation_integrations', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.text('type');
      table.text('name');
      table.text('config_json').nullable();
      table.text('secret_key').nullable();
      table.text('status').default('disconnected');
      table.timestamp('last_checked_at').nullable();
      table.text('error').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_automation_integrations');
  }
}
