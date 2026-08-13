import { routineService } from '../services/RoutineService.js';
import type { AutomationTriggerReceived } from '../../domain/events/AutomationTriggerReceived.js';

export class DispatchAutomationTriggerListener {
  async handle(event: AutomationTriggerReceived): Promise<void> {
    await routineService.dispatchEvent(event);
  }
}
