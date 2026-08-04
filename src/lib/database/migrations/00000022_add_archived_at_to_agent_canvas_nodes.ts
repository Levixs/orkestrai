import { Migration } from '@beeblock/svelar/database';

/**
 * Arquivamento de nos do canvas (notas vinculadas a tarefas arquivadas):
 * saem do canvas sem serem apagadas — ficam acessiveis pelo historico.
 */
export default class AddArchivedAtToAgentCanvasNodes extends Migration {
  async up() {
    await this.schema.table('agent_canvas_nodes', (table) => {
      table.text('archived_at').nullable();
    });
  }

  async down() {
    await this.schema.dropColumn('agent_canvas_nodes', 'archived_at');
  }
}
