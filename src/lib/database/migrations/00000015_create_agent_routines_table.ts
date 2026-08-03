import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentRoutinesTable extends Migration {
  async up() {
    await this.schema.createTable('agent_routines', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('target_node_id');
      table.text('prompt');
      table.integer('interval_minutes').nullable();
      table.boolean('enabled').default(true);
      table.timestamp('last_run_at').nullable();
      table.integer('run_count').default(0);
      table.timestamp('created_at');
      table.index(['workspace_id']);
    });

    await this.schema.createTable('agent_routine_runs', (table) => {
      table.uuid('id').primary();
      table.uuid('routine_id').references('id', 'agent_routines');
      table.timestamp('ran_at');
      table.boolean('ok').default(true);
      table.text('detail').nullable();
      table.index(['routine_id']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_routine_runs');
    await this.schema.dropTable('agent_routines');
  }
}
