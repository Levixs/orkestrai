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
  /** Ids ja atribuidos a algum terminal — dois agentes no mesmo diretorio
      nao podem receber o mesmo session-id. */
  private claimed = new Set<string>();

  /** Marca um id como reivindicado (watch ou lookup de respawn). */
  claim(agentSessionId: string): void {
    this.claimed.add(agentSessionId);
  }

  /** Busca o session-id mais ANTIGO nao reivindicado criado apos `since`
      (o primeiro arquivo que aparece depois do meu spawn tende a ser o meu). */
  findAgentSessionId(provider: string, cwd: string, since: number, exclude?: Set<string>): string | null {
    return this.findByStrategy(provider, cwd, since, exclude ?? this.claimed, 'oldest');
  }

  /** Session-id mais RECENTE que nenhum terminal do workspace reivindicou
      (lookup de respawn: cobre o watch que expirou antes da 1a mensagem). */
  findLatestUnclaimedSessionId(provider: string, cwd: string, exclude?: Set<string>): string | null {
    const excludeIds = new Set<string>([...this.claimed, ...(exclude ?? [])]);
    return this.findByStrategy(provider, cwd, 0, excludeIds, 'newest');
  }

  private findByStrategy(
    provider: string,
    cwd: string,
    since: number,
    exclude: Set<string>,
    strategy: 'oldest' | 'newest'
  ): string | null {
    try {
      switch (provider) {
        case 'claude':
          return this.findClaudeSession(cwd, since, exclude, strategy);
        case 'codex':
          return this.findCodexSession(since, exclude, strategy);
        case 'kimi':
          return this.findKimiSession(cwd, since, exclude, strategy);
        case 'opencode':
          return this.findOpenCodeSession(cwd, since, exclude, strategy);
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

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
        this.claim(found);
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

  /** Caminho real do cwd (resolve symlinks como /tmp -> /private/tmp no macOS). */
  private realCwd(cwd: string): string {
    try {
      return realpathSync(cwd);
    } catch {
      return resolve(cwd);
    }
  }

  // ~/.claude/projects/<slug>/<sessionId>.jsonl — o claude troca TODO caractere
  // nao-alfanumerico por '-' (C:\a.b_c -> C--a-b-c no Windows; /Users/x ->
  // -Users-x no macOS). So ':' '/' '\' nao basta: cobre '.', '_', espaco etc.
  private findClaudeSession(cwd: string, since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const slug = this.realCwd(cwd).replace(/[^a-zA-Z0-9]/g, '-');
    const dir = join(homedir(), '.claude', 'projects', slug);
    const pick = strategy === 'oldest' ? this.oldestFile : this.newestFile;
    const found = pick.call(this, dir, since, (name) => name.endsWith('.jsonl') && !exclude.has(name.replace(/\.jsonl$/, '')));
    return found ? found.replace(/\.jsonl$/, '') : null;
  }

  // ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
  private findCodexSession(since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const root = join(homedir(), '.codex', 'sessions');
    const uuidOf = (name: string) =>
      name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] ?? null;
    const pick = strategy === 'oldest' ? this.oldestFileRecursive : this.newestFileRecursive;
    const found = pick.call(
      this,
      root,
      since,
      (name: string) => {
        if (!name.startsWith('rollout-') || !name.endsWith('.jsonl')) return false;
        const id = uuidOf(name);
        return id !== null && !exclude.has(id);
      },
      4
    );
    return found ? uuidOf(found) : null;
  }

  // ~/.kimi-code/sessions/<wd_*>/session_<uuid>/
  private findKimiSession(cwd: string, since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const root = join(homedir(), '.kimi-code', 'sessions');
    if (!existsSync(root)) return null;
    const dirName = this.realCwd(cwd).split(/[/\\]/).filter(Boolean).at(-1) ?? '';
    const candidates = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.includes(dirName))
      .map((entry) => join(root, entry.name));
    const pick = strategy === 'oldest' ? this.oldestDir : this.newestDir;
    for (const candidate of candidates.length ? candidates : [root]) {
      const found = pick.call(this, candidate, since, (name: string) => name.startsWith('session_') && !exclude.has(name));
      if (found) return found;
    }
    return null;
  }

  // ~/.local/share/opencode/project/<slug>/storage/session/info/<id>.json (aprox.)
  private findOpenCodeSession(cwd: string, since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const root = join(homedir(), '.local', 'share', 'opencode');
    if (!existsSync(root)) return null;
    const idOf = (name: string) =>
      name.match(/(ses_[A-Za-z0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)?.[1] ?? null;
    const pick = strategy === 'oldest' ? this.oldestFileRecursive : this.newestFileRecursive;
    const found = pick.call(
      this,
      root,
      since,
      (name: string) => {
        if (!name.endsWith('.json') || !name.includes('ses')) return false;
        const id = idOf(name);
        return id !== null && !exclude.has(id);
      },
      6
    );
    return found ? idOf(found) : null;
  }

  private oldestFile(dir: string, since: number, match: (name: string) => boolean): string | null {
    if (!existsSync(dir)) return null;
    let best: { name: string; mtime: number } | null = null;
    for (const entry of readdirSync(dir)) {
      if (!match(entry)) continue;
      const mtime = statSync(join(dir, entry)).mtimeMs;
      if (mtime > since && (!best || mtime < best.mtime)) best = { name: entry, mtime };
    }
    return best?.name ?? null;
  }

  private oldestDir(dir: string, since: number, match: (name: string) => boolean): string | null {
    if (!existsSync(dir)) return null;
    let best: { name: string; mtime: number } | null = null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !match(entry.name)) continue;
      const mtime = statSync(join(dir, entry.name)).mtimeMs;
      if (mtime > since && (!best || mtime < best.mtime)) best = { name: entry.name, mtime };
    }
    return best?.name ?? null;
  }

  private oldestFileRecursive(dir: string, since: number, match: (name: string) => boolean, maxDepth: number): string | null {
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
            if (mtime > since && (!best || mtime < best.mtime)) best = { path: full, mtime };
          } catch {
            // some durante a varredura
          }
        }
      }
    };
    walk(dir, 0);
    return best?.path ?? null;
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
