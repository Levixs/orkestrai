import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentMessageEnvelopesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_message_envelopes', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('from_node_id').nullable();
      table.uuid('to_node_id');
      table.string('kind').default('ask');
      table.string('state').default('queued');
      table.text('content');
      table.text('reply').nullable();
      table.text('error').nullable();
      table.string('content_hash');
      table.string('correlation_id').nullable();
      table.string('dedup_key').nullable();
      table.integer('attempts').default(0);
      table.text('metadata_json').nullable();
      table.timestamp('delivered_at').nullable();
      table.timestamp('acknowledged_at').nullable();
      table.timestamp('replied_at').nullable();
      table.timestamp('failed_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'updated_at']);
      table.index(['to_node_id', 'state']);
      table.index(['correlation_id']);
      table.index(['dedup_key']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_message_envelopes');
  }
}
