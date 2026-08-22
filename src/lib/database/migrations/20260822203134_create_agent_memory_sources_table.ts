import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentMemorySourcesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_memory_sources', (table) => {
      table.uuid('id').primary();
      table.uuid('memory_entry_id').references('id', 'agent_memory_entries');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('type');
      table.string('source_id').nullable();
      table.text('label');
      table.text('uri').nullable();
      table.text('excerpt').nullable();
      table.string('content_hash');
      table.text('metadata_json').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['memory_entry_id']);
      table.index(['workspace_id', 'type']);
      table.index(['source_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_memory_sources');
  }
}
