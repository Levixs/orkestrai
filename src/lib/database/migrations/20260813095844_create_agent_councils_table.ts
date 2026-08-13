import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentCouncilsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_councils', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('task_id').nullable();
      table.uuid('leader_node_id').nullable();
      table.string('title');
      table.text('objective');
      table.string('mode');
      table.string('criterion');
      table.text('custom_criterion').nullable();
      table.boolean('request_leader_recommendation').default(true);
      table.integer('max_executions');
      table.integer('execution_count').default(0);
      table.string('status');
      table.text('recommendation_json').nullable();
      table.text('recommendation_error').nullable();
      table.uuid('selected_perspective_id').nullable();
      table.text('decision_note').nullable();
      table.timestamp('started_at');
      table.timestamp('completed_at').nullable();
      table.timestamp('decided_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'updated_at']);
      table.index(['task_id', 'status']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_councils');
  }
}
