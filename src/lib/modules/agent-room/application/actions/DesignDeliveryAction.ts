import { Action } from '@beeblock/svelar/actions';
import type { DesignDeliveryDto } from '../dto/DesignDeliveryDto.js';
import { designDeliveryService } from '../services/DesignDeliveryService.js';

export class DesignDeliveryAction extends Action<DesignDeliveryDto, unknown> {
  async execute(dto: DesignDeliveryDto): Promise<unknown> {
    if (dto.operation.kind === 'targets') return designDeliveryService.targets(dto.workspaceId);
    if (dto.operation.kind === 'preview') return designDeliveryService.preview(dto.workspaceId, dto.nodeId, dto.operation.input);
    if (dto.operation.kind === 'apply') return designDeliveryService.apply(dto.workspaceId, dto.nodeId, dto.operation.input);
    if (dto.operation.kind === 'import') return designDeliveryService.import(dto.workspaceId, dto.nodeId, dto.operation.input);
    return designDeliveryService.capture(dto.workspaceId, dto.operation.input);
  }
}
