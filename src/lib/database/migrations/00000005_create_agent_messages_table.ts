import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentMessagesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_messages', (table) => {
      table.uuid('id').primary();
      table.uuid('conversation_id').references('id', 'agent_conversations');
      table.string('participant');
      table.text('content');
      table.text('metadata_json').nullable();
      table.timestamp('created_at');
      table.index(['conversation_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_messages');
  }
}
