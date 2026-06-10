import { Job } from '@beeblock/svelar/queue';
import { EmailTemplates } from '@beeblock/svelar/email-templates';
import { Mailer } from '@beeblock/svelar/mail';

export class SendWelcomeEmail extends Job {
  maxAttempts = 3;
  retryDelay = 30;

  userId: number;
  email: string;
  name: string;

  constructor(userId: number, email: string, name: string) {
    super();
    this.userId = userId;
    this.email = email;
    this.name = name;
  }

  async handle(): Promise<void> {
    const appName = process.env.APP_NAME ?? 'Svelar';
    const appUrl = process.env.APP_URL ?? 'http://localhost:5173';

    const rendered = await EmailTemplates.render('welcome', {
      appName,
      'user.name': this.name,
      'user.email': this.email,
      confirmUrl: `${appUrl}/verify-email`,
    });

    await Mailer.send({
      to: this.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  failed(error: Error): void {
    console.error(`[Job] Failed to send welcome email to ${this.email}:`, error.message);
  }
}
