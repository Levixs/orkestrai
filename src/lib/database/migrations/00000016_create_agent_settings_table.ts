import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentSettingsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_settings', (table) => {
      table.string('key').primary();
      table.text('value');
    });
  }

  async down() {
    await this.schema.dropTable('agent_settings');
  }
}
