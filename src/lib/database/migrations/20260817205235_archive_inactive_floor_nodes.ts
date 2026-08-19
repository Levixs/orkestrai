import { Connection, Migration } from '@beeblock/svelar/database';

export default class ArchiveInactiveFloorNodes extends Migration {
  async up() {
    await Connection.raw(`
      DELETE FROM agent_canvas_edges
      WHERE source_node_id IN (
        SELECT nodes.id
        FROM agent_canvas_nodes AS nodes
        INNER JOIN agent_floors AS floors ON floors.id = nodes.floor_id
        WHERE floors.status <> 'active'
      )
      OR target_node_id IN (
        SELECT nodes.id
        FROM agent_canvas_nodes AS nodes
        INNER JOIN agent_floors AS floors ON floors.id = nodes.floor_id
        WHERE floors.status <> 'active'
      )
    `);
    await Connection.raw(`
      UPDATE agent_canvas_nodes
      SET archived_at = CURRENT_TIMESTAMP
      WHERE archived_at IS NULL
      AND floor_id IN (
        SELECT id FROM agent_floors WHERE status <> 'active'
      )
    `);
  }

  async down() {
    // Historical floor nodes cannot be restored safely after their worktree is gone.
  }
}
