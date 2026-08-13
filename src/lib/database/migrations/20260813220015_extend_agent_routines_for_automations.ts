import { Migration } from '@beeblock/svelar/database';

export default class ExtendAgentRoutinesForAutomations extends Migration {
  async up() {
    await this.schema.table('agent_routines', (table) => {
      table.text('name').nullable();
      table.text('trigger_type').nullable();
      table.text('trigger_config_json').nullable();
      table.text('action_type').nullable();
      table.text('action_config_json').nullable();
      table.text('recipe_id').nullable();
      table.text('last_trigger_key').nullable();
      table.timestamp('updated_at').nullable();
    });
  }

  async down() {
    for (const column of [
      'name',
      'trigger_type',
      'trigger_config_json',
      'action_type',
      'action_config_json',
      'recipe_id',
      'last_trigger_key',
      'updated_at',
    ]) {
      await this.schema.dropColumn('agent_routines', column);
    }
  }
}
