import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { JobMonitor } from '@beeblock/svelar/queue/JobMonitor';

export const GET: RequestHandler = async (event) => {
  const { searchParams } = event.url;
  const status = searchParams.get('status') || 'all';
  const queueName = searchParams.get('queue') || 'default';
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    const jobs = await JobMonitor.listJobs({
      queue: queueName,
      status: status === 'all' ? undefined : status as any,
      limit,
      offset,
    });
    const counts = await JobMonitor.getCounts(queueName);
    return json({ jobs, counts, queueName });
  } catch (error: any) {
    return json({ error: error.message || 'Failed to fetch queue jobs' }, { status: 500 });
  }
};
