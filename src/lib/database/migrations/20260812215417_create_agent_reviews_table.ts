import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentReviewsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_reviews', (table) => {
      table.uuid('id').primary();
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('task_id').nullable();
      table.uuid('assignee_node_id').nullable();
      table.string('title');
      table.text('summary').nullable();
      table.string('status');
      table.string('revision');
      table.text('selected_paths_json').nullable();
      table.text('evidence_json').nullable();
      table.text('tests_json').nullable();
      table.text('risks_json').nullable();
      table.text('decision_note').nullable();
      table.timestamp('decided_at').nullable();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['workspace_id', 'updated_at']);
      table.index(['task_id', 'status']);
      table.index(['assignee_node_id', 'status']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_reviews');
  }
}
