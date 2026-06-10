import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { ScheduleMonitor } from '@beeblock/svelar/scheduler/ScheduleMonitor';

export const POST: RequestHandler = async (event) => {
  const { name } = event.params;
  const body = await event.request.json();
  const enabled = body.enabled ?? true;

  try {
    if (enabled) {
      ScheduleMonitor.enableTask(name);
    } else {
      ScheduleMonitor.disableTask(name);
    }
    return json({ success: true, message: `Task '${name}' ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to toggle task' }, { status: 500 });
  }
};
