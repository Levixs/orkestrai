import { Migration } from '@beeblock/svelar/database';

export default class AddExecutionRuntimeToAgentWorkspaces extends Migration {
  async up() {
    await this.schema.table('agent_workspaces', (table) => {
      table.string('runtime_kind').default('native');
      table.string('wsl_distribution').nullable();
      table.string('wsl_working_dir').nullable();
    });
  }

  async down() {
    await this.schema.table('agent_workspaces', (table) => {
      table.dropColumn('wsl_working_dir');
      table.dropColumn('wsl_distribution');
      table.dropColumn('runtime_kind');
    });
  }
}
