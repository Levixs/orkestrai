import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentBoardTasksTable extends Migration {
  async up() {
    await this.schema.createTable('agent_board_tasks', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.text('title');
      table.string('status').default('todo'); // todo | doing | done
      table.uuid('assignee_node_id').nullable();
      table.string('created_by').default('user');
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_board_tasks');
  }
}
