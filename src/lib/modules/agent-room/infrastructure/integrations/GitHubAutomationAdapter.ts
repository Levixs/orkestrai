import { createHmac, timingSafeEqual } from 'node:crypto';
import { desktopSecretService } from '../secrets/DesktopSecretService.js';

export type GitHubConnection = {
  owner: string;
  repo: string;
  secretKey: string;
};

export type GitHubPullRequestState = {
  key: string;
  event: 'opened' | 'updated' | 'merged' | 'closed';
  data: Record<string, unknown>;
};

export class GitHubAutomationAdapter {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async validate(connection: GitHubConnection): Promise<{ login: string; repository: string }> {
    const token = await this.requireToken(connection.secretKey);
    const [user, repo] = await Promise.all([
      this.request('https://api.github.com/user', token),
      this.request(`https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}`, token),
    ]);
    return { login: String(user.login ?? ''), repository: String(repo.full_name ?? `${connection.owner}/${connection.repo}`) };
  }

  async latestPullRequest(connection: GitHubConnection): Promise<GitHubPullRequestState | null> {
    const token = await this.requireToken(connection.secretKey);
    const pulls = await this.request(
      `https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}/pulls?state=all&sort=updated&direction=desc&per_page=1`,
      token,
    );
    const pull = Array.isArray(pulls) ? pulls[0] as Record<string, unknown> | undefined : undefined;
    if (!pull) return null;
    const merged = Boolean(pull.merged_at);
    const state = String(pull.state ?? 'open');
    const event = merged
      ? 'merged'
      : state === 'closed'
        ? 'closed'
        : pull.created_at === pull.updated_at
          ? 'opened'
          : 'updated';
    return {
      key: `${pull.id}:${pull.updated_at}:${event}`,
      event,
      data: {
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        author: (pull.user as Record<string, unknown> | undefined)?.login,
        branch: (pull.head as Record<string, unknown> | undefined)?.ref,
        base: (pull.base as Record<string, unknown> | undefined)?.ref,
      },
    };
  }

  verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private async requireToken(secretKey: string): Promise<string> {
    const token = await desktopSecretService.get(secretKey);
    if (!token) throw new Error('GitHub credential is not available in the installed app.');
    return token;
  }

  private async request(url: string, token: string): Promise<any> {
    const response = await this.fetchFn(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'orkestrai-automation',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}.`);
    return response.json();
  }
}

export const githubAutomationAdapter = new GitHubAutomationAdapter();
