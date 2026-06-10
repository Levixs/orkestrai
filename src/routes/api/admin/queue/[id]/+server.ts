import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { JobMonitor } from '@beeblock/svelar/queue/JobMonitor';

export const DELETE: RequestHandler = async (event) => {
  const { id } = event.params;
  try {
    await JobMonitor.deleteJob(id);
    return json({ success: true, message: 'Job removed' });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to remove job' }, { status: 500 });
  }
};
