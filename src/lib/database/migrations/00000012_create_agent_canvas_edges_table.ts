import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCanvasEdgesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_canvas_edges', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('source_node_id').references('id', 'agent_canvas_nodes');
      table.uuid('target_node_id').references('id', 'agent_canvas_nodes');
      table.string('style').default('cord');
      table.timestamp('created_at');
      table.index(['workspace_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_canvas_edges');
  }
}
