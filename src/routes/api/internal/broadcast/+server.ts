import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { Broadcast } from '@beeblock/svelar/broadcasting';

export const POST: RequestHandler = async (event) => {
  const secret = event.request.headers.get('x-internal-secret');
  const expected = process.env.INTERNAL_SECRET;
  if (!expected) return json({ message: 'INTERNAL_SECRET not set' }, { status: 500 });

  if (secret !== expected) {
    return json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { channel, eventName, data } = await event.request.json();

    if (!channel || !eventName) {
      return json({ message: 'channel and eventName are required' }, { status: 400 });
    }

    await Broadcast.to(channel).send(eventName, data ?? {});

    return json({
      message: 'Event broadcast',
      subscribers: Broadcast.totalSubscribers(),
    });
  } catch (err: any) {
    return json({ message: err.message || 'Failed to broadcast' }, { status: 500 });
  }
};
