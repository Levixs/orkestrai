import { Migration } from '@beeblock/svelar/database';

export default class AddBridgeTokenToAgentWorkspaces extends Migration {
  async up() {
    await this.schema.table('agent_workspaces', (table) => {
      table.string('bridge_token').nullable();
    });
  }

  async down() {
    await this.schema.table('agent_workspaces', (table) => {
      table.dropColumn('bridge_token');
    });
  }
}
