import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentFloorsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_floors', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('name');
      table.string('branch');
      table.text('path');
      table.string('status').default('active');
      table.timestamps();
      table.index(['workspace_id']);
    });

    await this.schema.table('agent_canvas_nodes', (table) => {
      table.uuid('floor_id').nullable();
    });

    await this.schema.table('agent_workspaces', (table) => {
      table.text('hooks_json').nullable();
    });
  }

  async down() {
    await this.schema.dropTable('agent_floors');
    await this.schema.table('agent_canvas_nodes', (table) => {
      table.dropColumn('floor_id');
    });
    await this.schema.table('agent_workspaces', (table) => {
      table.dropColumn('hooks_json');
    });
  }
}
