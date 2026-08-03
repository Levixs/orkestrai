import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentTeamMembersTable extends Migration {
  async up() {
    await this.schema.createTable('agent_team_members', (table) => {
      table.uuid('id').primary();
      table.uuid('conversation_id').references('id', 'agent_conversations');
      table.string('title');
      table.string('provider');
      table.string('role');
      table.string('model').nullable();
      table.string('effort');
      table.boolean('can_write').default(false);
      table.boolean('participates_in_loop').default(true);
      table.text('capabilities_json');
      table.text('system_prompt');
      table.timestamps();
      table.index(['conversation_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_team_members');
  }
}
