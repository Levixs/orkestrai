import { Migration } from '@beeblock/svelar/database';

/** Presets de equipe: templates de workspace (time, layout, roles, rotinas, notas). */
export default class CreateAgentPresetsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_presets', (table) => {
      table.text('id').primary();
      table.text('name');
      table.text('icon').nullable();
      table.text('description').nullable();
      table.text('data'); // JSON: orkestrai-preset v1
      table.text('created_at');
      table.text('updated_at');
    });
  }

  async down() {
    await this.schema.dropTable('agent_presets');
  }
}
