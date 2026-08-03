import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { workspaceRepository } from '../../infrastructure/repositories/WorkspaceRepository.js';
import { agentEnv } from '../../infrastructure/agent-path.js';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;

export type GitStatusResult = {
  isRepo: boolean;
  branch: string | null;
  changes: Array<{ path: string; status: string; staged: boolean }>;
};

/**
 * Operacoes git de leitura/escrita simples no working_dir do workspace,
 * sempre via execFile (sem shell string).
 */
export class GitService {
  private async root(workspaceId: string): Promise<string> {
    const workspace = await workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) throw new Error('Workspace nao encontrado.');
    return workspace.workingDir;
  }

  private async git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd, env: agentEnv(), timeout: GIT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  }

  async status(workspaceId: string): Promise<GitStatusResult> {
    const cwd = await this.root(workspaceId);
    try {
      await this.git(cwd, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      return { isRepo: false, branch: null, changes: [] };
    }

    const branch = (await this.git(cwd, ['branch', '--show-current'])).trim() || null;
    const porcelain = await this.git(cwd, ['status', '--porcelain=v1', '-uall']);
    const changes = porcelain
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const index = line[0];
        const worktree = line[1];
        const path = line.slice(3).replace(/^"(.*)"$/, '$1');
        const staged = index !== ' ' && index !== '?';
        return { path, status: (staged ? index : worktree).trim() || index.trim(), staged };
      });

    return { isRepo: true, branch, changes };
  }

  async diff(workspaceId: string, path?: string | null, staged = false): Promise<{ diff: string }> {
    const cwd = await this.root(workspaceId);
    const args = ['diff'];
    if (staged) args.push('--cached');
    if (path) args.push('--', path);
    return { diff: await this.git(cwd, args) };
  }

  async logGraph(workspaceId: string, limit = 25): Promise<{ graph: string }> {
    const graph = await this.git(await this.root(workspaceId), [
      'log',
      '--oneline',
      '--graph',
      '--decorate',
      '-n',
      String(limit),
    ]).catch(() => '');
    return { graph };
  }

  async stage(workspaceId: string, path: string) {
    await this.git(await this.root(workspaceId), ['add', '--', path]);
    return { staged: path };
  }

  async unstage(workspaceId: string, path: string) {
    await this.git(await this.root(workspaceId), ['restore', '--staged', '--', path]);
    return { unstaged: path };
  }

  async commit(workspaceId: string, message: string) {
    const msg = message.trim();
    if (!msg) throw new Error('Informe a mensagem de commit.');
    await this.git(await this.root(workspaceId), ['commit', '-m', msg]);
    return { committed: msg };
  }

  async pull(workspaceId: string) {
    return { output: await this.git(await this.root(workspaceId), ['pull']) };
  }

  async push(workspaceId: string) {
    return { output: await this.git(await this.root(workspaceId), ['push']) };
  }

  async checkout(workspaceId: string, branch: string) {
    const name = branch.trim();
    if (!name) throw new Error('Informe a branch.');
    await this.git(await this.root(workspaceId), ['checkout', name]);
    return { checkedOut: name };
  }

  async createBranch(workspaceId: string, branch: string, checkout = true) {
    const name = branch.trim();
    if (!name) throw new Error('Informe o nome da branch.');
    await this.git(await this.root(workspaceId), ['branch', name]);
    if (checkout) await this.git(await this.root(workspaceId), ['checkout', name]);
    return { created: name };
  }

  async listBranches(workspaceId: string) {
    const output = await this.git(await this.root(workspaceId), ['branch', '--list', '--format=%(refname:short)']);
    return output.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  async stash(workspaceId: string, pop = false) {
    const args = pop ? ['stash', 'pop'] : ['stash', 'push', '-u'];
    return { output: await this.git(await this.root(workspaceId), args) };
  }

  async discard(workspaceId: string, path: string) {
    await this.git(await this.root(workspaceId), ['restore', '--', path]);
    return { discarded: path };
  }
}

export const gitService = new GitService();
