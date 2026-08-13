import { EventServiceProvider as BaseProvider } from '@beeblock/svelar/events';
import { UserRegistered } from '$lib/modules/auth/domain/events/UserRegistered.js';
import { SendWelcomeEmailListener } from '$lib/modules/auth/application/listeners/SendWelcomeEmailListener.js';
import { AutomationTriggerReceived } from '$lib/modules/agent-room/domain/events/AutomationTriggerReceived.js';
import { DispatchAutomationTriggerListener } from '$lib/modules/agent-room/application/listeners/DispatchAutomationTriggerListener.js';

export class EventServiceProvider extends BaseProvider {
  protected listen = {
    [UserRegistered.name]: [SendWelcomeEmailListener],
    [AutomationTriggerReceived.name]: [DispatchAutomationTriggerListener],
  };

  protected observers = {};
  protected subscribe = [];
}
