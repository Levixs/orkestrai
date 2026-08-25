import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentWorkspaceGroupsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_workspace_groups', (table) => {
      table.uuid('id').primary();
      table.string('name');
      table.uuid('parent_id').nullable().references('id', 'agent_workspace_groups').onDelete('set null');
      table.integer('position').default(0);
      table.timestamps();
      table.index(['parent_id', 'position']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_workspace_groups');
  }
}
