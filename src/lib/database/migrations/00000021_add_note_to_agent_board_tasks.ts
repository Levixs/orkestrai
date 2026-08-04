import { Migration } from '@beeblock/svelar/database';

/** Vinculo tarefa -> nota de spec (N tarefas podem apontar para a mesma nota). */
export default class AddNoteToAgentBoardTasks extends Migration {
  async up() {
    await this.schema.table('agent_board_tasks', (table) => {
      table.text('note_node_id').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_board_tasks', 'note_node_id');
  }
}
