import type {
  ApplyDesignDeliveryInput,
  CaptureDesignDeliveryInput,
  ImportDesignMarkupInput,
  PreviewDesignDeliveryInput,
} from '../../contracts/schemas/design-delivery.schema.js';

export type DesignDeliveryOperation =
  | { kind: 'targets' }
  | { kind: 'preview'; input: PreviewDesignDeliveryInput }
  | { kind: 'apply'; input: ApplyDesignDeliveryInput }
  | { kind: 'import'; input: ImportDesignMarkupInput }
  | { kind: 'capture'; input: CaptureDesignDeliveryInput };

export class DesignDeliveryDto {
  constructor(
    public readonly workspaceId: string,
    public readonly nodeId: string,
    public readonly operation: DesignDeliveryOperation,
  ) {}
}
