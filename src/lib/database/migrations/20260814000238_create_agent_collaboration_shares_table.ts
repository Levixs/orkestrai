import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCollaborationSharesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_collaboration_shares', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.string('status').default('active');
      table.string('default_role').default('viewer');
      table.string('relay_url');
      table.string('relay_region').nullable();
      table.integer('max_peers').default(5);
      table.integer('revision').default(0);
      table.timestamp('expires_at');
      table.timestamp('started_at');
      table.timestamp('stopped_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'status']);
      table.index(['expires_at']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_collaboration_shares');
  }
}
