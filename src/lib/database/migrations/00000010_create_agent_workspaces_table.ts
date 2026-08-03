import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentWorkspacesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_workspaces', (table) => {
      table.uuid('id').primary();
      table.string('name');
      table.text('working_dir');
      table.string('icon').nullable();
      table.text('instructions').nullable();
      table.boolean('sync_agent_instruction_files').default(false);
      table.timestamps();
    });
  }

  async down() {
    await this.schema.dropTable('agent_workspaces');
  }
}
