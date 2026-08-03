import { Migration } from '@beeblock/svelar/database';

/** Multiplas imagens de referencia por tarefa do quadro (image_path = capa/1a). */
export default class AddImagesJsonToAgentBoardTasks extends Migration {
  async up() {
    await this.schema.table('agent_board_tasks', (table) => {
      table.text('images_json').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_board_tasks', 'images_json');
  }
}
