import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ScheduleMonitor } from '@beeblock/svelar/scheduler/ScheduleMonitor';

export const GET: RequestHandler = async () => {
  try {
    const tasks = await ScheduleMonitor.listTasks();
    const health = await ScheduleMonitor.getHealth();
    return json({ tasks, health });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to fetch scheduled tasks' }, { status: 500 });
  }
};
