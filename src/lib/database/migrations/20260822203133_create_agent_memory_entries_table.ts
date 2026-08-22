import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentMemoryEntriesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_memory_entries', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('kind');
      table.string('status').default('active');
      table.text('title');
      table.text('content');
      table.integer('confidence').default(100);
      table.boolean('pinned').default(false);
      table.text('tags_json').nullable();
      table.uuid('created_by_node_id').nullable();
      table.uuid('supersedes_id').nullable();
      table.integer('revision').default(1);
      table.timestamp('verified_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'status', 'updated_at']);
      table.index(['workspace_id', 'kind']);
      table.index(['supersedes_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_memory_entries');
  }
}
