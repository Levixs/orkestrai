import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCouncilPerspectivesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_council_perspectives', (table) => {
      table.uuid('id').primary();
      table.uuid('council_id').references('id', 'agent_councils');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('agent_node_id');
      table.string('provider');
      table.string('model').nullable();
      table.text('approach');
      table.string('status');
      table.uuid('floor_id').nullable();
      table.text('artifact_path').nullable();
      table.text('output_json').nullable();
      table.text('usage_snapshot_json').nullable();
      table.text('raw_output').nullable();
      table.text('error').nullable();
      table.timestamp('started_at').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['council_id', 'created_at']);
      table.index(['workspace_id', 'status']);
      table.index(['agent_node_id', 'status']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_council_perspectives');
  }
}
