import { Model } from '@beeblock/svelar/orm';

export class AgentSetting extends Model {
  static table = 'agent_settings';
  static primaryKey = 'key';
  static incrementing = false;
  static timestamps = false;
  static fillable = ['key', 'value'];

  declare key: string;
  declare value: string;
}
