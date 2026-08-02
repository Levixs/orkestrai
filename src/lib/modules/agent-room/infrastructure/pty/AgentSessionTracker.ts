import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Rastreia o session-id REAL que cada CLI de agente grava em disco.
 * Assim o terminal retoma a sessao exata (nao so "a mais recente do diretorio").
 *
 * Estrategia por provider: observar o diretorio de sessoes da CLI e pegar o
 * arquivo/pasta criado DEPOIS do spawn do terminal.
 */
export class AgentSessionTracker {
  private watchers = new Map<string, ReturnType<typeof setInterval>>();

  /**
   * Observa a sessao PTY e chama onFound com o session-id da CLI quando
   * descoberto. Para de observar ao encontrar ou apos `timeoutMs`.
   */
  watch(
    ptySessionId: string,
    provider: string,
    cwd: string,
    startedAt: number,
    onFound: (agentSessionId: string) => void,
    timeoutMs = 1_800_000
  ): void {
    this.unwatch(ptySessionId);
    const started = Date.now();
    const timer = setInterval(() => {
      const found = this.findAgentSessionId(provider, cwd, startedAt);
      if (found) {
        this.unwatch(ptySessionId);
        onFound(found);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        this.unwatch(ptySessionId);
      }
    }, 3_000);
    timer.unref?.();
    this.watchers.set(ptySessionId, timer);
  }

  unwatch(ptySessionId: string): void {
    const timer = this.watchers.get(ptySessionId);
    if (timer) clearInterval(timer);
    this.watchers.delete(ptySessionId);
  }

  /** Busca o session-id mais recente criado apos `since` para o provider+cwd. */
  findAgentSessionId(provider: string, cwd: string, since: number): string | null {
    try {
      switch (provider) {
        case 'claude':
          return this.findClaudeSession(cwd, since);
        case 'codex':
          return this.findCodexSession(since);
        case 'kimi':
          return this.findKimiSession(cwd, since);
        case 'opencode':
          return this.findOpenCodeSession(cwd, since);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /** Caminho real do cwd (resolve symlinks como /tmp -> /private/tmp no macOS). */
  private realCwd(cwd: string): string {
    try {
      return realpathSync(cwd);
    } catch {
      return resolve(cwd);
    }
  }

  // ~/.claude/projects/<path-com-hifens>/<sessionId>.jsonl
  private findClaudeSession(cwd: string, since: number): string | null {
    const slug = this.realCwd(cwd).replace(/[/\\]/g, '-').replace(/^-/, '');
    const dir = join(homedir(), '.claude', 'projects', `-${slug}`);
    const newest = this.newestFile(dir, since, (name) => name.endsWith('.jsonl'));
    return newest ? newest.replace(/\.jsonl$/, '') : null;
  }

  // ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
  private findCodexSession(since: number): string | null {
    const root = join(homedir(), '.codex', 'sessions');
    const newest = this.newestFileRecursive(root, since, (name) => name.startsWith('rollout-') && name.endsWith('.jsonl'), 4);
    if (!newest) return null;
    const match = newest.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    return match ? match[1] : null;
  }

  // ~/.kimi-code/sessions/<wd_*>/session_<uuid>/
  private findKimiSession(cwd: string, since: number): string | null {
    const root = join(homedir(), '.kimi-code', 'sessions');
    if (!existsSync(root)) return null;
    const dirName = this.realCwd(cwd).split(/[/\\]/).filter(Boolean).at(-1) ?? '';
    const candidates = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.includes(dirName))
      .map((entry) => join(root, entry.name));
    for (const candidate of candidates.length ? candidates : [root]) {
      const newest = this.newestDir(candidate, since, (name) => name.startsWith('session_'));
      if (newest) return newest;
    }
    return null;
  }

  // ~/.local/share/opencode/project/<slug>/storage/session/info/<id>.json (aprox.)
  private findOpenCodeSession(cwd: string, since: number): string | null {
    const root = join(homedir(), '.local', 'share', 'opencode');
    if (!existsSync(root)) return null;
    const newest = this.newestFileRecursive(root, since, (name) => name.endsWith('.json') && name.includes('ses'), 6);
    if (!newest) return null;
    const match = newest.match(/(ses_[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    return match ? match[1] : null;
  }

  private newestFile(dir: string, since: number, match: (name: string) => boolean): string | null {
    if (!existsSync(dir)) return null;
    let best: { name: string; mtime: number } | null = null;
    for (const entry of readdirSync(dir)) {
      if (!match(entry)) continue;
      const mtime = statSync(join(dir, entry)).mtimeMs;
      if (mtime > since && (!best || mtime > best.mtime)) best = { name: entry, mtime };
    }
    return best?.name ?? null;
  }

  private newestDir(dir: string, since: number, match: (name: string) => boolean): string | null {
    if (!existsSync(dir)) return null;
    let best: { name: string; mtime: number } | null = null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !match(entry.name)) continue;
      const mtime = statSync(join(dir, entry.name)).mtimeMs;
      if (mtime > since && (!best || mtime > best.mtime)) best = { name: entry.name, mtime };
    }
    return best?.name ?? null;
  }

  private newestFileRecursive(dir: string, since: number, match: (name: string) => boolean, maxDepth: number): string | null {
    if (!existsSync(dir)) return null;
    let best: { path: string; mtime: number } | null = null;
    const walk = (current: string, depth: number) => {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (match(entry.name)) {
          try {
            const mtime = statSync(full).mtimeMs;
            if (mtime > since && (!best || mtime > best.mtime)) best = { path: full, mtime };
          } catch {
            // some durante a varredura
          }
        }
      }
    };
    walk(dir, 0);
    return best?.path ?? null;
  }
}

export const agentSessionTracker = new AgentSessionTracker();
