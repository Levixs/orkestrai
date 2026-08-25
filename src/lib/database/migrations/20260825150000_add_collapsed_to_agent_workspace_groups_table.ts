import { Migration } from '@beeblock/svelar/database';

export default class AddCollapsedToAgentWorkspaceGroupsTable extends Migration {
  async up() {
    await this.schema.table('agent_workspace_groups', (table) => {
      table.boolean('collapsed').default(false);
    });
  }

  async down() {
    await this.schema.table('agent_workspace_groups', (table) => {
      table.dropColumn('collapsed');
    });
  }
}
