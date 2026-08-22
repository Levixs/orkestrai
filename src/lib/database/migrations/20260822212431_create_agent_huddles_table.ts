import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentHuddlesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_huddles', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.text('title');
      table.text('agenda').nullable();
      table.string('status').default('active');
      table.uuid('facilitator_node_id').nullable();
      table.uuid('linked_task_id').nullable();
      table.string('created_by_kind');
      table.string('created_by_id').nullable();
      table.timestamp('started_at');
      table.timestamp('ended_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'status', 'updated_at']);
      table.index(['linked_task_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_huddles');
  }
}
