import { EventServiceProvider as BaseProvider } from '@beeblock/svelar/events';
import { UserRegistered } from '$lib/modules/auth/domain/events/UserRegistered.js';
import { SendWelcomeEmailListener } from '$lib/modules/auth/application/listeners/SendWelcomeEmailListener.js';

export class EventServiceProvider extends BaseProvider {
  protected listen = {
    [UserRegistered.name]: [SendWelcomeEmailListener],
  };

  protected observers = {};
  protected subscribe = [];
}
