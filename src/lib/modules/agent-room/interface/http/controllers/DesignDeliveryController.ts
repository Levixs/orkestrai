import { Controller } from '@beeblock/svelar/routing';
import { DesignDeliveryAction } from '../../../application/actions/DesignDeliveryAction.js';
import { DesignDeliveryDto } from '../../../application/dto/DesignDeliveryDto.js';
import {
  ApplyDesignDeliveryRequest,
  CaptureDesignDeliveryRequest,
  ImportDesignMarkupRequest,
  PreviewDesignDeliveryRequest,
} from '../requests/DesignDeliveryRequest.js';

const action = new DesignDeliveryAction();

export class DesignDeliveryController extends Controller {
  async targets(event: any) {
    try {
      return this.json({ data: await action.execute(new DesignDeliveryDto(event.params.id, event.params.nodeId, { kind: 'targets' })) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to list visual validation targets.' }, 422);
    }
  }

  async preview(event: any) {
    try {
      const input = await PreviewDesignDeliveryRequest.validate(event);
      return this.json({ data: await action.execute(new DesignDeliveryDto(event.params.id, event.params.nodeId, { kind: 'preview', input })) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to preview generated code.' }, 422);
    }
  }

  async apply(event: any) {
    try {
      const input = await ApplyDesignDeliveryRequest.validate(event);
      return this.json({ data: await action.execute(new DesignDeliveryDto(event.params.id, event.params.nodeId, { kind: 'apply', input })) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to write generated code.' }, 422);
    }
  }

  async import(event: any) {
    try {
      const input = await ImportDesignMarkupRequest.validate(event);
      return this.json({ data: await action.execute(new DesignDeliveryDto(event.params.id, event.params.nodeId, { kind: 'import', input })) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to import code into the design.' }, 422);
    }
  }

  async capture(event: any) {
    try {
      const input = await CaptureDesignDeliveryRequest.validate(event);
      return this.json({ data: await action.execute(new DesignDeliveryDto(event.params.id, event.params.nodeId, { kind: 'capture', input })) });
    } catch (error) {
      return this.json({ error: error instanceof Error ? error.message : 'Failed to capture the validation target.' }, 422);
    }
  }
}
