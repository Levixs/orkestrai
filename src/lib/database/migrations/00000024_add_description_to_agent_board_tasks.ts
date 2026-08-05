import { Migration } from '@beeblock/svelar/database';

/** Descricao em markdown por tarefa do quadro (corpo do cartao, estilo Trello). */
export default class AddDescriptionToAgentBoardTasks extends Migration {
  async up() {
    await this.schema.table('agent_board_tasks', (table) => {
      table.text('description').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_board_tasks', 'description');
  }
}
