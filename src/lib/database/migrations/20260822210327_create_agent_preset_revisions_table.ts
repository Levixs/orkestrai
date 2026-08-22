import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentPresetRevisionsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_preset_revisions', (table) => {
      table.string('id').primary();
      table.string('preset_id').notNullable();
      table.string('version').notNullable();
      table.string('revision_key').notNullable().unique();
      table.text('release_notes').nullable();
      table.text('data').notNullable();
      table.string('checksum').notNullable();
      table.timestamp('created_at').notNullable();
      table.index(['preset_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_preset_revisions');
  }
}
