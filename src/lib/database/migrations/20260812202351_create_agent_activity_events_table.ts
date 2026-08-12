import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentActivityEventsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_activity_events', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('node_id');
      table.string('state');
      table.text('action').nullable();
      table.uuid('task_id').nullable();
      table.text('metadata_json').nullable();
      table.timestamp('created_at');
      table.index(['workspace_id', 'created_at']);
      table.index(['node_id', 'created_at']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_activity_events');
  }
}
