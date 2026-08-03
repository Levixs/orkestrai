import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentTaskEventsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_task_events', (table) => {
      table.uuid('id').primary();
      table.uuid('conversation_id').references('id', 'agent_conversations');
      table.uuid('task_id').references('id', 'agent_tasks');
      table.string('type');
      table.uuid('actor_member_id').nullable();
      table.text('content');
      table.text('metadata_json').nullable();
      table.timestamp('created_at');
      table.index(['conversation_id']);
      table.index(['task_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_task_events');
  }
}
