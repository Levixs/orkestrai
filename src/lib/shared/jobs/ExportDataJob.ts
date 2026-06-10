import { Job } from '@beeblock/svelar/queue';
import { Storage } from '@beeblock/svelar/storage';
import { User } from '$lib/modules/auth/domain/models/User.js';
import { Post } from '$lib/modules/posts/domain/models/Post.js';

export class ExportDataJob extends Job {
  maxAttempts = 2;
  retryDelay = 120;

  declare userId: number;
  declare format: 'csv' | 'json';

  constructor(userId?: number, format: 'csv' | 'json' = 'csv') {
    super();
    this.userId = userId ?? 0;
    this.format = format;
  }

  async handle(): Promise<void> {
    if (!this.userId) throw new Error('User ID is required for export');

    const user = await User.find(this.userId);
    if (!user) throw new Error(`User #${this.userId} not found`);

    const posts = await Post.where('user_id', '=', this.userId).get();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `exports/user-${this.userId}-${timestamp}.${this.format}`;

    let content: string;

    if (this.format === 'csv') {
      const rows = [
        'ID,Title,Slug,Published,Created At',
        ...posts.map((p: any) =>
          `${p.id},"${p.title}","${p.slug}",${p.published},${p.created_at}`
        ),
      ];
      content = rows.join('\n');
    } else {
      content = JSON.stringify(
        posts.map((p: any) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          body: p.body,
          published: p.published,
          created_at: p.created_at,
        })),
        null,
        2
      );
    }

    await Storage.put(filename, content);
    console.log(`[ExportDataJob] Exported ${posts.length} posts to ${filename}`);
  }

  failed(error: Error): void {
    console.error(`[ExportDataJob] Failed for user #${this.userId}:`, error.message);
  }

  serialize(): string {
    return JSON.stringify({ userId: this.userId, format: this.format });
  }

  restore(data: Record<string, any>): void {
    this.userId = data.userId;
    this.format = data.format ?? 'csv';
  }
}
