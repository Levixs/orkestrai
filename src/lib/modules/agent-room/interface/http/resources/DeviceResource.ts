import { Resource } from '@beeblock/svelar/routing';
import {
  deviceSnapshotSchema,
  type DeviceSnapshot,
} from '../../../contracts/schemas/device.schema.js';

export class DeviceResource extends Resource<DeviceSnapshot, DeviceSnapshot> {
  toJSON(): DeviceSnapshot {
    return deviceSnapshotSchema.parse(this.data);
  }
}
