import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentRunsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_runs', (table) => {
      table.uuid('id').primary();
      table.uuid('conversation_id').references('id', 'agent_conversations');
      table.string('agent');
      table.uuid('member_id').nullable();
      table.uuid('task_id').nullable();
      table.string('provider').nullable();
      table.string('model').nullable();
      table.string('effort').nullable();
      table.boolean('allow_writes').default(false);
      table.string('mode');
      table.text('prompt');
      table.text('output').nullable();
      table.text('raw_output').nullable();
      table.integer('exit_code').nullable();
      table.text('error').nullable();
      table.timestamp('started_at');
      table.timestamp('finished_at').nullable();
      table.index(['conversation_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_runs');
  }
}
