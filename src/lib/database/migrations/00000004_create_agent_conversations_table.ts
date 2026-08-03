import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentConversationsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_conversations', (table) => {
      table.uuid('id').primary();
      table.string('title');
      table.string('mode');
      table.string('project_path').nullable();
      table.timestamps();
    });
  }

  async down() {
    await this.schema.dropTable('agent_conversations');
  }
}
