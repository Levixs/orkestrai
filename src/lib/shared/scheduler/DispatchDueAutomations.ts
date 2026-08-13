import { ScheduledTask } from '@beeblock/svelar/scheduler';
import { routineService } from '$lib/modules/agent-room/application/services/RoutineService.js';

export default class DispatchDueAutomations extends ScheduledTask {
  name = 'dispatch-due-automations';

  schedule() {
    return this.everyMinute();
  }

  async handle(): Promise<void> {
    await routineService.tick();
  }
}
