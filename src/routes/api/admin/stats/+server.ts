import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { JobMonitor } from '@beeblock/svelar/queue/JobMonitor';
import { ScheduleMonitor } from '@beeblock/svelar/scheduler/ScheduleMonitor';
import { LogViewer } from '@beeblock/svelar/logging/LogViewer';

export const GET: RequestHandler = async () => {
  try {
    const [queueHealth, recentErrors] = await Promise.all([
      JobMonitor.getHealth(),
      Promise.resolve(LogViewer.getRecentErrors(10)),
    ]);
    const schedulerHealth = await ScheduleMonitor.getHealth();
    const logStats = LogViewer.getStats();

    return json({
      queue: queueHealth,
      scheduler: schedulerHealth,
      logs: logStats,
      recentErrors,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to fetch stats' }, { status: 500 });
  }
};
