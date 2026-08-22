import type { AnnotationCenterSnapshot, TraceableAnnotation } from '../../domain/types.js';
import { reviewCenterService } from './ReviewCenterService.js';
import { designDocumentService } from './DesignDocumentService.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';

export class AnnotationCenterService {
  async snapshot(workspaceId: string): Promise<AnnotationCenterSnapshot> {
    if (!await workspaceRepository.getWorkspace(workspaceId)) throw new Error('Workspace not found.');
    const nodes = await workspaceRepository.listNodes(workspaceId, undefined, true);
    const annotations: TraceableAnnotation[] = [];

    const reviews = await reviewCenterService.snapshot(workspaceId).catch(() => null);
    for (const review of reviews?.reviews ?? []) {
      for (const comment of review.comments) {
        annotations.push({
          id: `code:${comment.id}`, workspaceId, kind: 'code', status: comment.status,
          body: comment.body, authorTitle: comment.authorTitle, targetTitle: review.title,
          targetDetail: `${comment.filePath}${comment.lineNumber ? `:${comment.lineNumber}` : ''}`,
          targetId: review.id, nodeId: null, taskId: review.taskId, revision: comment.revision,
          stale: comment.stale, route: `/terminal?workspace=${workspaceId}&node=workbench-review-center:${workspaceId}`,
          createdAt: comment.createdAt, updatedAt: comment.updatedAt,
        });
      }
    }

    for (const node of nodes.filter((item) => item.type === 'design')) {
      const document = await designDocumentService.get(workspaceId, node.id).catch(() => null);
      if (!document) continue;
      const elementNames = new Map(document.elements.map((element) => [element.id, element.name]));
      for (const comment of document.comments) {
        const first = comment.messages[0];
        const latest = comment.messages.at(-1);
        annotations.push({
          id: `design:${node.id}:${comment.id}`, workspaceId, kind: 'design', status: comment.status,
          body: latest?.body ?? first?.body ?? '', authorTitle: first?.author.name ?? null,
          targetTitle: node.title ?? document.name,
          targetDetail: comment.elementId ? elementNames.get(comment.elementId) ?? comment.elementId : document.pages.find((page) => page.id === comment.pageId)?.name ?? null,
          targetId: comment.id, nodeId: node.id, taskId: null,
          revision: String(document.revision), stale: false,
          route: `/terminal?workspace=${workspaceId}&node=${node.id}`,
          createdAt: comment.createdAt, updatedAt: comment.updatedAt,
        });
      }
    }

    annotations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      annotations,
      counts: {
        open: annotations.filter((item) => item.status === 'open').length,
        resolved: annotations.filter((item) => item.status === 'resolved').length,
        stale: annotations.filter((item) => item.stale).length,
        code: annotations.filter((item) => item.kind === 'code').length,
        design: annotations.filter((item) => item.kind === 'design').length,
      },
    };
  }
}

export const annotationCenterService = new AnnotationCenterService();
