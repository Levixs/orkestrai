import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentHuddleParticipantsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_huddle_participants', (table) => {
      table.uuid('id').primary();
      table.uuid('huddle_id').references('id', 'agent_huddles');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('kind');
      table.string('participant_id');
      table.string('participant_key').unique();
      table.text('display_name');
      table.string('role').default('member');
      table.boolean('voice_enabled').default(true);
      table.timestamp('joined_at');
      table.timestamp('left_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['huddle_id', 'left_at']);
      table.index(['workspace_id', 'kind']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_huddle_participants');
  }
}
