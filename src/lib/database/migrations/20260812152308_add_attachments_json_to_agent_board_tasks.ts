import { Migration } from '@beeblock/svelar/database';

export default class AddAttachmentsJsonToAgentBoardTasks extends Migration {
  async up() {
    await this.schema.table('agent_board_tasks', (table) => {
      table.text('attachments_json').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_board_tasks', 'attachments_json');
  }
}
