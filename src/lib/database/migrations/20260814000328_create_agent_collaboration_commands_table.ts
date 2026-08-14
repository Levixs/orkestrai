import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCollaborationCommandsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_collaboration_commands', (table) => {
      table.string('id').primary();
      table.uuid('share_id').references('id', 'agent_collaboration_shares');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('device_record_id').references('id', 'agent_collaboration_devices');
      table.integer('requested_revision');
      table.integer('result_revision');
      table.string('command_type');
      table.string('status');
      table.text('result_json').nullable();
      table.string('error_code').nullable();
      table.timestamp('created_at');
      table.timestamp('completed_at').nullable();
      table.index(['share_id', 'created_at']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_collaboration_commands');
  }
}
