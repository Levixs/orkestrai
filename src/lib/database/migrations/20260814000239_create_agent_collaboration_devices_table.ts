import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCollaborationDevicesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_collaboration_devices', (table) => {
      table.uuid('id').primary();
      table.uuid('share_id').references('id', 'agent_collaboration_shares');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('device_id');
      table.string('display_name');
      table.string('platform');
      table.text('public_key').nullable();
      table.string('fingerprint');
      table.string('role');
      table.text('scopes_json');
      table.timestamp('requested_at');
      table.timestamp('approved_at').nullable();
      table.timestamp('last_seen_at').nullable();
      table.timestamp('revoked_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['share_id', 'revoked_at']);
      table.index(['workspace_id', 'device_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_collaboration_devices');
  }
}
