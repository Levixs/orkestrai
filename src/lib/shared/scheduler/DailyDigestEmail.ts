import { ScheduledTask } from '@beeblock/svelar/scheduler';
import { Queue } from '@beeblock/svelar/queue';
import { DailyDigestJob } from '$lib/shared/jobs/DailyDigestJob.js';

export default class DailyDigestEmail extends ScheduledTask {
  name = 'daily-digest-email';

  schedule() {
    return this.dailyAt('09:00');
  }

  async handle(): Promise<void> {
    await Queue.dispatch(new DailyDigestJob());
  }
}
