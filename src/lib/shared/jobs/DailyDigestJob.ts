import { Job } from '@beeblock/svelar/queue';
import { Mailer } from '@beeblock/svelar/mail';
import { User } from '$lib/modules/auth/domain/models/User.js';
import { Post } from '$lib/modules/posts/domain/models/Post.js';

export class DailyDigestJob extends Job {
  maxAttempts = 3;
  retryDelay = 60;

  declare date: string;

  constructor(date?: string) {
    super();
    this.date = date ?? new Date().toISOString().split('T')[0];
  }

  async handle(): Promise<void> {
    const appName = process.env.APP_NAME ?? 'Svelar';
    const userCount = await User.count();
    const postCount = await Post.count();
    const recentPosts = await Post.where('published', true)
      .orderBy('created_at', 'desc')
      .limit(5)
      .get();

    const postList = recentPosts.length > 0
      ? recentPosts.map((p: any) => `- ${p.title}`).join('\n')
      : 'No new posts today.';

    // Send digest to all admin users
    const admins = await User.where('role', 'admin').get();

    for (const admin of admins) {
      try {
        await Mailer.send({
          to: (admin as any).email,
          subject: `[${appName}] Daily Digest — ${this.date}`,
          html: `
            <h2>${appName} Daily Digest</h2>
            <p><strong>Date:</strong> ${this.date}</p>
            <p><strong>Total Users:</strong> ${userCount}</p>
            <p><strong>Total Posts:</strong> ${postCount}</p>
            <h3>Recent Posts</h3>
            <pre>${postList}</pre>
          `,
        });
      } catch {
        console.warn(`[DailyDigestJob] Failed to send digest to ${(admin as any).email}`);
      }
    }

    console.log(`[DailyDigestJob] Digest sent to ${admins.length} admins`);
  }

  failed(error: Error): void {
    console.error(`[DailyDigestJob] Failed to generate digest for ${this.date}:`, error.message);
  }

  serialize(): string {
    return JSON.stringify({ date: this.date });
  }

  restore(data: Record<string, any>): void {
    this.date = data.date;
  }
}
