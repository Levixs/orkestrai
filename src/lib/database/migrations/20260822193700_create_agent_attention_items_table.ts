import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentAttentionItemsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_attention_items', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('activity_event_id').nullable();
      table.uuid('node_id').nullable();
      table.uuid('task_id').nullable();
      table.string('category');
      table.string('severity').default('info');
      table.string('status').default('open');
      table.text('title');
      table.text('body').nullable();
      table.string('source_type').nullable();
      table.string('source_id').nullable();
      table.string('correlation_id').nullable();
      table.text('action_json').nullable();
      table.timestamp('read_at').nullable();
      table.timestamp('snoozed_until').nullable();
      table.timestamp('resolved_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'status', 'updated_at']);
      table.index(['workspace_id', 'category']);
      table.index(['correlation_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_attention_items');
  }
}
