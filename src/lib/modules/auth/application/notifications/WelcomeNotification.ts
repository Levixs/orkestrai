import { Notification } from '@beeblock/svelar/notifications';

export class WelcomeNotification extends Notification {
  user: any;

  constructor(user: any) {
    super();
    this.user = user;
  }

  channels() {
    return ['database'] as const;
  }

  toDatabase() {
    return {
      type: 'welcome',
      data: {
        message: `Welcome to ${process.env.APP_NAME ?? 'Svelar'}, ${this.user.name}!`,
        userId: this.user.id,
      },
    };
  }
}
