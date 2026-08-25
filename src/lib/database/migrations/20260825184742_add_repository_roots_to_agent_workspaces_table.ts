import { Migration } from '@beeblock/svelar/database';

export default class AddRepositoryRootsToAgentWorkspacesTable extends Migration {
  async up() {
    await this.schema.table('agent_workspaces', (table) => {
      table.text('repository_roots_json').nullable();
    });
  }

  async down() {
    await this.schema.table('agent_workspaces', (table) => {
      table.dropColumn('repository_roots_json');
    });
  }
}
