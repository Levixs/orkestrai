import { Migration } from '@beeblock/svelar/database';

/** Arquivamento de tarefas concluidas: saem do quadro, ficam no historico. */
export default class AddArchivedAtToAgentBoardTasks extends Migration {
  async up() {
    await this.schema.table('agent_board_tasks', (table) => {
      table.text('archived_at').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_board_tasks', 'archived_at');
  }
}
