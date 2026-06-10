import { Scheduler } from '@beeblock/svelar/scheduler';
import { ScheduleMonitor } from '@beeblock/svelar/scheduler/ScheduleMonitor';
import CleanupExpiredTokens from './CleanupExpiredTokens.js';
import CleanExpiredSessions from './CleanExpiredSessions.js';
import DailyDigestEmail from './DailyDigestEmail.js';
import PruneAuditLogs from './PruneAuditLogs.js';
import QueueHealthCheck from './QueueHealthCheck.js';

export function createScheduler(): Scheduler {
  const scheduler = new Scheduler().persistToDatabase();

  scheduler.registerMany([
    new CleanupExpiredTokens(),
    new CleanExpiredSessions(),
    new DailyDigestEmail(),
    new PruneAuditLogs(),
    new QueueHealthCheck(),
  ]);

  ScheduleMonitor.configure(scheduler);
  return scheduler;
}
