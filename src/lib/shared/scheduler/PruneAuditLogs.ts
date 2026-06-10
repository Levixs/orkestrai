import { ScheduledTask } from '@beeblock/svelar/scheduler';
import { QueryBuilder } from '@beeblock/svelar/orm';

export default class PruneAuditLogs extends ScheduledTask {
  name = 'prune-audit-logs';

  schedule() {
    return this.weeklyOn(0, '02:00');
  }

  async handle(): Promise<void> {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

    try {
      await new QueryBuilder('audit_logs').where('timestamp', '<', ninetyDaysAgo).delete();
      console.log('[PruneAuditLogs] Pruned audit logs older than 90 days');
    } catch (err: any) {
      // Table may not exist yet if no auditable events have fired
      if (!err.message?.includes('no such table')) {
        throw err;
      }
    }
  }
}
