import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export type AgentSessionStorage =
  | 'claude-project-jsonl'
  | 'codex-rollout-jsonl'
  | 'kimi-session-dir'
  | 'opencode-session-json'
  | 'cursor-transcript-jsonl'
  | 'antigravity-workspace-cache'
  | 'cline-session-manifest';

/**
 * Rastreia o session-id REAL que cada CLI de agente grava em disco.
 * Assim o terminal retoma a sessao exata (nao so "a mais recente do diretorio").
 *
 * Estrategia declarada pelo adapter: observar o diretorio de sessoes da CLI e pegar o
 * arquivo/pasta criado DEPOIS do spawn do terminal.
 */
export class AgentSessionTracker {
  private watchers = new Map<string, ReturnType<typeof setInterval>>();
  /** Ids ja atribuidos a algum terminal — dois agentes no mesmo diretorio
      nao podem receber o mesmo session-id. */
  private claimed = new Set<string>();
  private readonly homeDir: string;

  constructor(homeDir = homedir()) {
    this.homeDir = homeDir;
  }

  /** Marca um id como reivindicado (watch ou lookup de respawn). */
  claim(agentSessionId: string): void {
    this.claimed.add(agentSessionId);
  }

  /** Busca o session-id mais ANTIGO nao reivindicado criado apos `since`
      (o primeiro arquivo que aparece depois do meu spawn tende a ser o meu). */
  findAgentSessionId(storage: string | undefined, cwd: string, since: number, exclude?: Set<string>): string | null {
    return this.findByStrategy(storage, cwd, since, exclude ?? this.claimed, 'oldest');
  }

  /** Session-id mais RECENTE que nenhum terminal do workspace reivindicou
      (lookup de respawn: cobre o watch que expirou antes da 1a mensagem). */
  findLatestUnclaimedSessionId(storage: string | undefined, cwd: string, exclude?: Set<string>): string | null {
    const excludeIds = new Set<string>([...this.claimed, ...(exclude ?? [])]);
    return this.findByStrategy(storage, cwd, 0, excludeIds, 'newest');
  }

  private findByStrategy(
    storage: string | undefined,
    cwd: string,
    since: number,
    exclude: Set<string>,
    strategy: 'oldest' | 'newest'
  ): string | null {
    try {
      switch (storage) {
        case 'claude-project-jsonl':
          return this.findClaudeSession(cwd, since, exclude, strategy);
        case 'codex-rollout-jsonl':
          return this.findCodexSession(since, exclude, strategy);
        case 'kimi-session-dir':
          return this.findKimiSession(cwd, since, exclude, strategy);
        case 'opencode-session-json':
          return this.findOpenCodeSession(cwd, since, exclude, strategy);
        case 'cursor-transcript-jsonl':
          return this.findCursorSession(cwd, since, exclude, strategy);
        case 'antigravity-workspace-cache':
          return this.findAntigravitySession(cwd, since, exclude);
        case 'cline-session-manifest':
          return this.findClineSession(cwd, since, exclude, strategy);
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
    storage: string | undefined,
    cwd: string,
    startedAt: number,
    onFound: (agentSessionId: string) => void,
    timeoutMs = 1_800_000
  ): void {
    this.unwatch(ptySessionId);
    const started = Date.now();
    const timer = setInterval(() => {
      const found = this.findAgentSessionId(storage, cwd, startedAt);
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
    const dir = join(this.homeDir, '.claude', 'projects', slug);
    const pick = strategy === 'oldest' ? this.oldestFile : this.newestFile;
    const found = pick.call(this, dir, since, (name) => {
      const agentSessionId = name.replace(/\.jsonl$/, '');
      if (!name.endsWith('.jsonl') || name.startsWith('agent-') || exclude.has(agentSessionId)) return false;

      // Claude cria arquivos agent-* para subagentes e transcripts que contem
      // apenas snapshots durante o startup. So uma entrada da conversa
      // principal torna o novo session-id retomavel.
      try {
        const stat = statSync(join(dir, name));
        return stat.isFile() && this.isResumableClaudeTranscript(join(dir, name), agentSessionId, stat.size);
      } catch {
        return false;
      }
    });
    return found ? found.replace(/\.jsonl$/, '') : null;
  }

  private isResumableClaudeTranscript(path: string, agentSessionId: string, size: number): boolean {
    if (size <= 0) return false;
    const fd = openSync(path, 'r');
    try {
      const buffer = Buffer.allocUnsafe(Math.min(size, 256 * 1024));
      const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
      const sessionMarker = `\"sessionId\":\"${agentSessionId}\"`;
      return buffer
        .toString('utf8', 0, bytesRead)
        .split('\n')
        .some(
          (line) =>
            line.includes(sessionMarker) &&
            line.includes('\"isSidechain\":false') &&
            (line.includes('\"type\":\"user\"') || line.includes('\"type\":\"assistant\"'))
        );
    } finally {
      closeSync(fd);
    }
  }

  // ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
  private findCodexSession(since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const root = join(this.homeDir, '.codex', 'sessions');
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
    const root = join(this.homeDir, '.kimi-code', 'sessions');
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
    const root = join(this.homeDir, '.local', 'share', 'opencode');
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

  // ~/.cursor/projects/<workspace-slug>/agent-transcripts/<session-id>/<session-id>.jsonl
  private findCursorSession(cwd: string, since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const workspaceSlug = this.realCwd(cwd)
      .replace(/^[\\/]+/, '')
      .replace(/[^a-zA-Z0-9]/g, '-');
    const projectsRoot = join(this.homeDir, '.cursor', 'projects');
    const roots = [
      join(projectsRoot, workspaceSlug, 'agent-transcripts'),
      join(projectsRoot, `-${workspaceSlug}`, 'agent-transcripts'),
    ].filter((path, index, paths) => paths.indexOf(path) === index && existsSync(path));
    const pick = strategy === 'oldest' ? this.oldestFileRecursive : this.newestFileRecursive;

    for (const root of roots) {
      const found = pick.call(
        this,
        root,
        since,
        (name: string) => {
          const id = name.replace(/\.jsonl$/, '');
          return name.endsWith('.jsonl') && !exclude.has(id);
        },
        2
      );
      if (found) return basename(found).replace(/\.jsonl$/, '');
    }
    return null;
  }

  // ~/.gemini/antigravity-cli/cache/last_conversations.json — mapa cwd -> UUID.
  private findAntigravitySession(cwd: string, since: number, exclude: Set<string>): string | null {
    const cachePath = join(this.homeDir, '.gemini', 'antigravity-cli', 'cache', 'last_conversations.json');
    if (!existsSync(cachePath) || statSync(cachePath).mtimeMs <= since) return null;
    const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
    const candidates = [this.realCwd(cwd), resolve(cwd)];
    for (const workspacePath of candidates) {
      const id = cache[workspacePath];
      if (typeof id === 'string' && id.trim() && !exclude.has(id)) return id;
    }
    return null;
  }

  // ~/.cline/data/sessions/<session-id>/<session-id>.json — manifesto com cwd.
  private findClineSession(cwd: string, since: number, exclude: Set<string>, strategy: 'oldest' | 'newest'): string | null {
    const root = join(this.homeDir, '.cline', 'data', 'sessions');
    if (!existsSync(root)) return null;
    const targetCwd = this.realCwd(cwd);
    const candidates: Array<{ id: string; mtime: number }> = [];

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || exclude.has(entry.name)) continue;
      const manifestPath = join(root, entry.name, `${entry.name}.json`);
      if (!existsSync(manifestPath)) continue;
      try {
        const stat = statSync(manifestPath);
        if (stat.mtimeMs <= since) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
        const id = typeof manifest.session_id === 'string' ? manifest.session_id : entry.name;
        const workspacePath =
          typeof manifest.cwd === 'string'
            ? manifest.cwd
            : typeof manifest.workspace_root === 'string'
              ? manifest.workspace_root
              : null;
        if (!workspacePath || this.realCwd(workspacePath) !== targetCwd || exclude.has(id)) continue;
        candidates.push({ id, mtime: stat.mtimeMs });
      } catch {
        // Manifesto ainda esta sendo gravado ou pertence a outra versao.
      }
    }

    candidates.sort((a, b) => (strategy === 'oldest' ? a.mtime - b.mtime : b.mtime - a.mtime));
    return candidates[0]?.id ?? null;
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
