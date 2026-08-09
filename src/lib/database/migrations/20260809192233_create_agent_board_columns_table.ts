import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentBoardColumnsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_board_columns', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces').onDelete('cascade');
      table.string('key');
      table.string('name').nullable();
      table.string('color').default('#9675ff');
      table.integer('position').default(0);
      table.boolean('builtin').default(false);
      table.timestamps();
      table.index(['workspace_id']);
      table.uniqueIndex(['workspace_id', 'key']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_board_columns');
  }
}
