import { Queue } from '@beeblock/svelar/queue';
import { Notifier } from '@beeblock/svelar/notifications';
import { SendWelcomeEmail } from '$lib/shared/jobs/SendWelcomeEmail.js';
import { WelcomeNotification } from '$lib/modules/auth/application/notifications/WelcomeNotification.js';

export class SendWelcomeEmailListener {
  async handle(event: any): Promise<void> {
    const user = event.user;

    // Dispatch welcome email job to the queue
    await Queue.dispatch(new SendWelcomeEmail(user.id, user.email, user.name));

    // Send welcome notification (persisted to database)
    await Notifier.notify(user, new WelcomeNotification(user));
  }
}
