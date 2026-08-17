import { designOperationSchema } from '../../contracts/schemas/designSchemas.js';
import type {
  DesignCollaborator,
  DesignDocument,
  DesignOperation,
  DesignPresenceHeartbeatInput,
} from '../../contracts/schemas/designSchemas.js';

const PRESENCE_TTL_MS = 15_000;

export type DesignPresence = {
  participant: DesignCollaborator;
  pageId: string;
  elementIds: string[];
  cursor: { x: number; y: number } | null;
  viewport: { x: number; y: number; zoom: number } | null;
  followParticipantId: string | null;
  lastSeenAt: string;
};

export type DesignLease = {
  participantId: string;
  participantName: string;
  color: string;
  pageId: string;
  elementIds: string[];
  expiresAt: string;
};

export type DesignCollaborationSnapshot = {
  presences: DesignPresence[];
  leases: DesignLease[];
  leaseConflict: DesignLease | null;
  generatedAt: string;
};

type PresenceEntry = {
  presence: DesignPresence;
  leaseElementIds: string[];
  expiresAt: number;
};

type CollaborationState = { documents: Map<string, Map<string, PresenceEntry>> };
const stateKey = Symbol.for('orkestrai.designCollaboration');
const globals = globalThis as typeof globalThis & { [stateKey]?: CollaborationState };
const state = globals[stateKey] ??= { documents: new Map() };

export class DesignLeaseConflictError extends Error {
  constructor(public readonly lease: DesignLease) {
    super(`Design layers are being edited by ${lease.participantName}.`);
    this.name = 'DesignLeaseConflictError';
  }
}

function documentKey(workspaceId: string, nodeId: string): string {
  return `${workspaceId}:${nodeId}`;
}

function isAncestor(document: DesignDocument, ancestorId: string, elementId: string): boolean {
  let current = document.elements.find((element) => element.id === elementId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = document.elements.find((element) => element.id === current?.parentId);
  }
  return false;
}

function elementsOverlap(document: DesignDocument, first: readonly string[], second: readonly string[]): boolean {
  for (const firstId of first) {
    for (const secondId of second) {
      if (firstId === secondId || isAncestor(document, firstId, secondId) || isAncestor(document, secondId, firstId)) return true;
    }
  }
  return false;
}

function affectedElementIds(operations: readonly DesignOperation[], document: DesignDocument): string[] {
  const ids = new Set<string>();
  for (const operation of operations) {
    if ('elementId' in operation && typeof operation.elementId === 'string') ids.add(operation.elementId);
    if (operation.kind === 'create' && operation.element.parentId) ids.add(operation.element.parentId);
    if (operation.kind === 'create-component-instance' && operation.parentId) ids.add(operation.parentId);
    if (operation.kind === 'swap-component-instance'
      || operation.kind === 'set-instance-property'
      || operation.kind === 'assign-instance-slot'
      || operation.kind === 'detach-component-instance') ids.add(operation.instanceId);
    if (operation.kind === 'decide-design-proposal') {
      const proposal = document.proposals.find((candidate) => candidate.id === operation.proposalId);
      if (proposal && operation.status === 'approved') {
        const nested = proposal.operations.map((candidate) => designOperationSchema.parse(candidate));
        for (const id of affectedElementIds(nested, document)) ids.add(id);
      }
    }
  }
  return [...ids];
}

export class DesignCollaborationService {
  heartbeat(
    workspaceId: string,
    nodeId: string,
    input: DesignPresenceHeartbeatInput,
    document: DesignDocument,
  ): DesignCollaborationSnapshot {
    if (!document.pages.some((page) => page.id === input.pageId)) throw new Error('Design presence page not found.');
    if (input.elementIds.some((id) => !document.elements.some((element) => element.id === id && element.pageId === input.pageId))) {
      throw new Error('Design presence layer not found.');
    }
    const entries = this.entries(workspaceId, nodeId);
    this.prune(entries);
    entries.delete(input.participant.id);
    const conflict = this.findConflict(entries, input.participant.id, input.pageId, input.elementIds, document);
    const now = Date.now();
    entries.set(input.participant.id, {
      presence: {
        participant: input.participant,
        pageId: input.pageId,
        elementIds: [...input.elementIds],
        cursor: input.cursor,
        viewport: input.viewport,
        followParticipantId: input.followParticipantId,
        lastSeenAt: new Date(now).toISOString(),
      },
      leaseElementIds: conflict ? [] : [...input.elementIds],
      expiresAt: now + PRESENCE_TTL_MS,
    });
    return this.snapshot(workspaceId, nodeId, input.participant.id, document);
  }

  snapshot(
    workspaceId: string,
    nodeId: string,
    participantId: string | null,
    document: DesignDocument,
  ): DesignCollaborationSnapshot {
    const entries = this.entries(workspaceId, nodeId);
    this.prune(entries);
    const current = participantId ? entries.get(participantId) : null;
    const conflict = current
      ? this.findConflict(entries, participantId!, current.presence.pageId, current.presence.elementIds, document)
      : null;
    return {
      presences: [...entries.values()].map((entry) => structuredClone(entry.presence)),
      leases: [...entries.values()].filter((entry) => entry.leaseElementIds.length).map((entry) => this.lease(entry)),
      leaseConflict: conflict,
      generatedAt: new Date().toISOString(),
    };
  }

  leave(workspaceId: string, nodeId: string, participantId: string): void {
    const key = documentKey(workspaceId, nodeId);
    const entries = state.documents.get(key);
    if (!entries) return;
    entries.delete(participantId);
    if (!entries.size) state.documents.delete(key);
  }

  assertWritable(
    workspaceId: string,
    nodeId: string,
    participantId: string | null,
    operations: readonly DesignOperation[],
    document: DesignDocument,
  ): void {
    if (!participantId) return;
    const ids = affectedElementIds(operations, document);
    if (!ids.length) return;
    const entries = this.entries(workspaceId, nodeId);
    this.prune(entries);
    const pageId = document.elements.find((element) => ids.includes(element.id))?.pageId ?? document.activePageId;
    const conflict = this.findConflict(entries, participantId, pageId, ids, document);
    if (conflict) throw new DesignLeaseConflictError(conflict);
  }

  private entries(workspaceId: string, nodeId: string): Map<string, PresenceEntry> {
    const key = documentKey(workspaceId, nodeId);
    let entries = state.documents.get(key);
    if (!entries) {
      entries = new Map();
      state.documents.set(key, entries);
    }
    return entries;
  }

  private prune(entries: Map<string, PresenceEntry>): void {
    const now = Date.now();
    for (const [id, entry] of entries) if (entry.expiresAt <= now) entries.delete(id);
  }

  private findConflict(
    entries: Map<string, PresenceEntry>,
    participantId: string,
    pageId: string,
    elementIds: readonly string[],
    document: DesignDocument,
  ): DesignLease | null {
    if (!elementIds.length) return null;
    for (const entry of entries.values()) {
      if (entry.presence.participant.id === participantId || entry.presence.pageId !== pageId || !entry.leaseElementIds.length) continue;
      if (elementsOverlap(document, elementIds, entry.leaseElementIds)) return this.lease(entry);
    }
    return null;
  }

  private lease(entry: PresenceEntry): DesignLease {
    return {
      participantId: entry.presence.participant.id,
      participantName: entry.presence.participant.name,
      color: entry.presence.participant.color,
      pageId: entry.presence.pageId,
      elementIds: [...entry.leaseElementIds],
      expiresAt: new Date(entry.expiresAt).toISOString(),
    };
  }
}

export const designCollaborationService = new DesignCollaborationService();
