import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentTasksTable extends Migration {
  async up() {
    await this.schema.createTable('agent_tasks', (table) => {
      table.uuid('id').primary();
      table.uuid('conversation_id').references('id', 'agent_conversations');
      table.string('title');
      table.text('description');
      table.string('status');
      table.integer('priority').default(0);
      table.uuid('assignee_id').nullable().references('id', 'agent_team_members');
      table.uuid('created_by_member_id').nullable();
      table.uuid('accepted_by_member_id').nullable();
      table.text('blocked_reason').nullable();
      table.text('result_summary').nullable();
      table.timestamps();
      table.index(['conversation_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_tasks');
  }
}
