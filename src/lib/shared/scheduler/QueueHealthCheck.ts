import { ScheduledTask } from '@beeblock/svelar/scheduler';
import { Queue } from '@beeblock/svelar/queue';

export default class QueueHealthCheck extends ScheduledTask {
  name = 'queue-health-check';

  schedule() {
    return this.everyFiveMinutes();
  }

  async handle(): Promise<void> {
    const stats = await Queue.stats();
    const { pending, failed } = stats;

    if (failed > 0) {
      console.warn(`[QueueHealthCheck] ${failed} failed jobs in queue`);
    }

    if (pending > 100) {
      console.warn(`[QueueHealthCheck] Queue backlog: ${pending} pending jobs`);
    }

    console.log(`[QueueHealthCheck] Queue stats: ${pending} pending, ${failed} failed`);
  }
}
