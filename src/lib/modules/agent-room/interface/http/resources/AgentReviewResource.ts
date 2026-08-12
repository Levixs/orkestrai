import { Resource } from '@beeblock/svelar/routing';
import type { AgentReview } from '$lib/modules/agent-room/domain/models/AgentReview.js';
import type { ReviewStatus } from '$lib/modules/agent-room/contracts/schemas/review-schemas.schema.js';

// ── API Contract ────────────────────────────────────────────
// Define the shape once — import this type on the frontend.
//
//   import type { AgentReviewData } from '$lib/modules/.../interface/http/resources/AgentReviewResource';
//

export interface AgentReviewData {
  id: string;
  workspaceId: string;
  taskId: string | null;
  assigneeNodeId: string | null;
  title: string;
  summary: string | null;
  status: ReviewStatus;
  revision: string;
  selectedPaths: string[];
  evidence: string[];
  tests: string[];
  risks: string[];
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function jsonList(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function iso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

// ── Resource ────────────────────────────────────────────────

export class AgentReviewResource extends Resource<AgentReview, AgentReviewData> {
  toJSON(): AgentReviewData {
    return {
      id: String(this.data.getAttribute('id')),
      workspaceId: String(this.data.getAttribute('workspace_id')),
      taskId: this.data.getAttribute('task_id') ?? null,
      assigneeNodeId: this.data.getAttribute('assignee_node_id') ?? null,
      title: String(this.data.getAttribute('title')),
      summary: this.data.getAttribute('summary') ?? null,
      status: this.data.getAttribute('status') as ReviewStatus,
      revision: String(this.data.getAttribute('revision')),
      selectedPaths: jsonList(this.data.getAttribute('selected_paths_json')),
      evidence: jsonList(this.data.getAttribute('evidence_json')),
      tests: jsonList(this.data.getAttribute('tests_json')),
      risks: jsonList(this.data.getAttribute('risks_json')),
      decisionNote: this.data.getAttribute('decision_note') ?? null,
      decidedAt: iso(this.data.getAttribute('decided_at')),
      createdAt: iso(this.data.getAttribute('created_at')) ?? '',
      updatedAt: iso(this.data.getAttribute('updated_at')) ?? '',
    };
  }

  // Override toWith() to include top-level data in every response
  // (roles, permissions, related context). Can be async.
  //
  // async toWith() {
  //   return {
  //     roles: await this.data.getRoleNames(),
  //     permissions: await this.data.getAllPermissions(),
  //   };
  // }

  // Override toAdditional() to include metadata under "meta"
  //
  // toAdditional() {
  //   return { comments_count: this.data.comments_count ?? 0 };
  // }
}
