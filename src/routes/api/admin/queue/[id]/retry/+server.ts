import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { JobMonitor } from '@beeblock/svelar/queue/JobMonitor';

export const POST: RequestHandler = async (event) => {
  const { id } = event.params;
  try {
    await JobMonitor.retryJob(id);
    return json({ success: true, message: 'Job queued for retry' });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to retry job' }, { status: 500 });
  }
};
