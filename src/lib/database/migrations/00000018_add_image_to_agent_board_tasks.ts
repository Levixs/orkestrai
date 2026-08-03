import { Migration } from '@beeblock/svelar/database';

export default class AddImageToAgentBoardTasks extends Migration {
  async up() {
    await this.schema.table('agent_board_tasks', (table) => {
      table.text('image_path').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_board_tasks', 'image_path');
  }
}
