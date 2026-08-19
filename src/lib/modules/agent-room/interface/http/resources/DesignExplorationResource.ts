import { Resource } from '@beeblock/svelar/routing';
import type { DesignExplorationResult } from '../../../application/services/DesignExplorationService.js';

export type DesignExplorationData = {
  id: string;
  groupId: string;
  noteId: string;
  tasksNodeId: string;
  tasksNodeCreated: boolean;
  designNodeIds: string[];
  taskIds: string[];
  leaderNodeId: string | null;
  dispatched: boolean;
};

export class DesignExplorationResource extends Resource<DesignExplorationResult, DesignExplorationData> {
  toJSON(): DesignExplorationData {
    return {
      id: this.data.id,
      groupId: this.data.group.id,
      noteId: this.data.note.id,
      tasksNodeId: this.data.tasksNode.id,
      tasksNodeCreated: this.data.tasksNodeCreated,
      designNodeIds: this.data.designNodes.map((node) => node.id),
      taskIds: this.data.taskIds,
      leaderNodeId: this.data.leaderNodeId,
      dispatched: this.data.dispatched,
    };
  }
}
