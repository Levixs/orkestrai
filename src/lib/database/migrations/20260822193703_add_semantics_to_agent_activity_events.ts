import { Migration } from '@beeblock/svelar/database';

export default class AddSemanticsToAgentActivityEvents extends Migration {
  async up() {
    await this.schema.table('agent_activity_events', (table) => {
      table.string('category').nullable();
      table.string('verb').nullable();
      table.string('object_type').nullable();
      table.string('object_id').nullable();
      table.text('object_title').nullable();
      table.text('outcome').nullable();
      table.string('severity').nullable();
      table.string('correlation_id').nullable();
      table.string('source_type').nullable();
      table.string('source_id').nullable();
      table.boolean('attention_required').default(false);
      table.timestamp('resolved_at').nullable();
      table.index(['workspace_id', 'category', 'created_at']);
      table.index(['workspace_id', 'attention_required', 'created_at']);
      table.index(['correlation_id']);
    });
  }

  async down() {
    for (const column of [
      'category',
      'verb',
      'object_type',
      'object_id',
      'object_title',
      'outcome',
      'severity',
      'correlation_id',
      'source_type',
      'source_id',
      'attention_required',
      'resolved_at',
    ]) await this.schema.dropColumn('agent_activity_events', column);
  }
}
