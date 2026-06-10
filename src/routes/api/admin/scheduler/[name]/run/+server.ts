import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ScheduleMonitor } from '@beeblock/svelar/scheduler/ScheduleMonitor';

export const POST: RequestHandler = async (event) => {
  const { name } = event.params;
  try {
    await ScheduleMonitor.runTask(name);
    return json({ success: true, message: `Task '${name}' triggered` });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to run task' }, { status: 500 });
  }
};
