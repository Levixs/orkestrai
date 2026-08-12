import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentMessageDeliveriesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_message_deliveries', (table) => {
      table.uuid('id').primary();
      table.uuid('message_id');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('from_node_id').nullable();
      table.uuid('to_node_id');
      table.string('state');
      table.text('content');
      table.text('reply').nullable();
      table.text('error').nullable();
      table.text('metadata_json').nullable();
      table.timestamp('created_at');
      table.index(['workspace_id', 'created_at']);
      table.index(['message_id', 'created_at']);
      table.index(['to_node_id', 'state']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_message_deliveries');
  }
}
