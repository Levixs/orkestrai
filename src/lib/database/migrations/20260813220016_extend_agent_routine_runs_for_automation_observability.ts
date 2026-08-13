import { Migration } from '@beeblock/svelar/database';

export default class ExtendAgentRoutineRunsForAutomationObservability extends Migration {
  async up() {
    await this.schema.table('agent_routine_runs', (table) => {
      table.text('status').nullable();
      table.text('trigger_type').nullable();
      table.text('trigger_key').nullable();
      table.text('idempotency_key').nullable();
      table.text('input_json').nullable();
      table.text('output_json').nullable();
      table.text('error').nullable();
      table.text('agent_node_id').nullable();
      table.text('provider').nullable();
      table.text('usage_before_json').nullable();
      table.text('usage_after_json').nullable();
      table.timestamp('started_at').nullable();
      table.timestamp('finished_at').nullable();
      table.integer('duration_ms').nullable();
      table.integer('attempt').nullable();
      table.text('retry_of_id').nullable();
    });
  }

  async down() {
    for (const column of [
      'status',
      'trigger_type',
      'trigger_key',
      'idempotency_key',
      'input_json',
      'output_json',
      'error',
      'agent_node_id',
      'provider',
      'usage_before_json',
      'usage_after_json',
      'started_at',
      'finished_at',
      'duration_ms',
      'attempt',
      'retry_of_id',
    ]) {
      await this.schema.dropColumn('agent_routine_runs', column);
    }
  }
}
