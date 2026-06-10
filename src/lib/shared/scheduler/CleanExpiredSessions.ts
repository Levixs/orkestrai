import { ScheduledTask } from '@beeblock/svelar/scheduler';
import { QueryBuilder } from '@beeblock/svelar/orm';

export default class CleanExpiredSessions extends ScheduledTask {
  name = 'clean-expired-sessions';

  schedule() {
    return this.daily();
  }

  async handle(): Promise<void> {
    const now = new Date().toISOString();
    await new QueryBuilder('sessions').where('expires_at', '<', now).delete();
    console.log('[CleanExpiredSessions] Expired sessions cleaned');
  }
}
