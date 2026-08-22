import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentHuddleTurnsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_huddle_turns', (table) => {
      table.uuid('id').primary();
      table.uuid('huddle_id').references('id', 'agent_huddles');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.integer('sequence');
      table.string('turn_key').unique();
      table.string('speaker_kind');
      table.string('speaker_id').nullable();
      table.text('speaker_name');
      table.uuid('addressed_node_id').nullable();
      table.text('text');
      table.string('state').default('completed');
      table.uuid('message_id').nullable();
      table.string('error_code').nullable();
      table.timestamp('completed_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['huddle_id', 'sequence']);
      table.index(['workspace_id', 'created_at']);
      table.index(['addressed_node_id', 'state']);
      table.index(['message_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_huddle_turns');
  }
}
