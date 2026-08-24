import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentProviderProfilesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_provider_profiles', (table) => {
      table.uuid('id').primary();
      table.string('provider_id');
      table.string('name');
      table.text('config_dir').nullable();
      table.text('data_dir').nullable();
      table.boolean('has_token').default(false);
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.uniqueIndex(['provider_id', 'name']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_provider_profiles');
  }
}
