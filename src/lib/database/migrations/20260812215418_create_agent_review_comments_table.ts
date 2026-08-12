import { Migration } from '@beeblock/svelar/database';

export default class CreateAgentReviewCommentsTable extends Migration {
  async up() {
    await this.schema.createTable('agent_review_comments', (table) => {
      table.uuid('id').primary();
      table.uuid('review_id').references('id', 'agent_reviews');
      table.uuid('workspace_id').references('id', 'agent_workspaces');
      table.uuid('author_node_id').nullable();
      table.string('file_path');
      table.integer('line_number').nullable();
      table.string('side');
      table.text('body');
      table.string('revision');
      table.string('status');
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['review_id', 'created_at']);
      table.index(['workspace_id', 'status']);
    });
  }

  async down() {
    await this.schema.dropTable('agent_review_comments');
  }
}
