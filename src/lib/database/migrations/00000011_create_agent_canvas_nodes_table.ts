import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCanvasNodesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_canvas_nodes', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('type');
      table.string('title').nullable();
      table.float('x').default(0);
      table.float('y').default(0);
      table.float('width').default(560);
      table.float('height').default(360);
      table.integer('z_index').default(0);
      table.text('payload_json').nullable();
      table.timestamps();
      table.index(['workspace_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_canvas_nodes');
  }
}
