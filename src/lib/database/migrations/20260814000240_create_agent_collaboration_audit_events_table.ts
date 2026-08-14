import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCollaborationAuditEventsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_collaboration_audit_events', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('share_id').nullable();
      table.string('actor_device_id').nullable();
      table.string('event_type');
      table.text('metadata_json').nullable();
      table.timestamp('created_at');
      table.index(['workspace_id', 'created_at']);
      table.index(['share_id', 'created_at']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_collaboration_audit_events');
  }
}
