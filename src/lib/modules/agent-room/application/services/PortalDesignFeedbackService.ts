import type { PortalDesignFeedbackResult } from '../../contracts/schemas/portal-design-feedback.schema.js';
import type { PortalDesignFeedbackDto } from '../dto/PortalDesignFeedbackDto.js';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { bridgeService } from './BridgeService.js';
import { filesystemService } from './FilesystemService.js';
import { taskBoardService } from './TaskBoardService.js';

export function redactPortalText(value: string): string {
  return value
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted token]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]{12,}/gi, '$1[redacted]')
    .replace(/\b(api[_-]?key|access[_-]?token|auth(?:orization)?|cookie|password|secret|session(?:id)?)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 2_000);
}

function formatFeedback(dto: PortalDesignFeedbackDto, portalTitle: string): string {
  const capture = dto.capture;
  const styleLines = Object.entries(capture.styles)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${redactPortalText(value)}`)
    .join('; ');
  return [
    '[portal design feedback]',
    `Portal: ${portalTitle}`,
    `Page: ${capture.page.title || '(untitled)'} — ${capture.page.origin}${capture.page.path}`,
    `Element: ${capture.selector} (<${capture.tagName}>)`,
    capture.role ? `Role: ${capture.role}` : '',
    capture.ariaLabel ? `Accessible label: ${redactPortalText(capture.ariaLabel)}` : '',
    `Element bounds: ${Math.round(capture.rect.width)}x${Math.round(capture.rect.height)} at ${Math.round(capture.rect.x)},${Math.round(capture.rect.y)}`,
    `Viewport: ${capture.viewport.width}x${capture.viewport.height} @${capture.viewport.deviceScaleFactor}x`,
    capture.text ? `Visible text:\n${redactPortalText(capture.text)}` : '',
    styleLines ? `Relevant computed styles:\n${styleLines}` : '',
    `Screenshot: ${dto.screenshot.path}`,
    `Requested outcome:\n${redactPortalText(dto.instruction)}`,
    'Use the screenshot and inspected context above as the source of truth. Do not infer cookies, headers, storage, tokens, or hidden page state.',
  ].filter(Boolean).join('\n\n');
}

export class PortalDesignFeedbackService {
  async send(workspaceId: string, portalNodeId: string, dto: PortalDesignFeedbackDto): Promise<PortalDesignFeedbackResult> {
    const [workspace, portal, screenshotInfo, screenshotFile] = await Promise.all([
      workspaceRepository.getWorkspace(workspaceId),
      workspaceRepository.getNode(portalNodeId),
      filesystemService.inspect(workspaceId, dto.screenshot.path ?? ''),
      filesystemService.readBinary(workspaceId, dto.screenshot.path ?? ''),
    ]);
    if (!workspace) throw new Error('Workspace não encontrado.');
    if (!portal || portal.workspaceId !== workspaceId || portal.type !== 'portal') {
      throw new Error('Portal não encontrado neste workspace.');
    }
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const hasPngSignature = pngSignature.every((byte, index) => screenshotFile.data[index] === byte);
    if (screenshotInfo.kind !== 'image' || screenshotInfo.contentType !== 'image/png' || !hasPngSignature) {
      throw new Error('A captura do portal precisa ser um PNG válido do workspace.');
    }

    const content = formatFeedback(dto, portal.title ?? 'Portal');
    if (dto.destination.kind === 'agent') {
      const target = (await bridgeService.listAgents(workspaceId)).find((agent) => agent.nodeId === dto.destination.nodeId);
      if (!target) throw new Error('Agente não encontrado neste workspace.');
      try {
        const sent = await bridgeService.sendOneWay(workspaceId, {
          to: target.nodeId,
          message: content,
          kind: 'portal-design-feedback',
        });
        return {
          destinationKind: 'agent',
          destinationId: target.nodeId,
          destinationTitle: target.title,
          persisted: true,
          delivery: { delivered: true, messageId: sent.messageId, error: null },
        };
      } catch (error) {
        return {
          destinationKind: 'agent',
          destinationId: target.nodeId,
          destinationTitle: target.title,
          persisted: false,
          delivery: { delivered: false, messageId: null, error: error instanceof Error ? error.message : String(error) },
        };
      }
    }

    const task = await taskBoardService.appendPortalFeedback(
      workspaceId,
      dto.destination.taskId,
      content,
      dto.screenshot,
    );
    let delivery: PortalDesignFeedbackResult['delivery'] = null;
    if (task.assigneeNodeId) {
      try {
        const sent = await bridgeService.sendOneWay(workspaceId, {
          to: task.assigneeNodeId,
          message: `[portal feedback added to task #${task.id.slice(0, 8)}]\n${content}`,
          kind: 'portal-design-feedback',
        });
        delivery = { delivered: true, messageId: sent.messageId, error: null };
      } catch (error) {
        delivery = { delivered: false, messageId: null, error: error instanceof Error ? error.message : String(error) };
      }
    }
    return {
      destinationKind: 'task',
      destinationId: task.id,
      destinationTitle: task.title,
      persisted: true,
      delivery,
    };
  }
}

export const portalDesignFeedbackService = new PortalDesignFeedbackService();
