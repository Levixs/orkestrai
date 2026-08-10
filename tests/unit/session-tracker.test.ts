import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AgentSessionTracker } from '$lib/modules/agent-room/infrastructure/pty/AgentSessionTracker.js';
import { claudeAdapter } from '$lib/modules/agent-room/application/adapters/ClaudeAdapter.js';
import { codexAdapter } from '$lib/modules/agent-room/application/adapters/CodexAdapter.js';
import { kimiAdapter } from '$lib/modules/agent-room/application/adapters/KimiAdapter.js';
import { openCodeAdapter } from '$lib/modules/agent-room/application/adapters/OpenCodeAdapter.js';
import { cursorAdapter } from '$lib/modules/agent-room/application/adapters/CursorAdapter.js';
import { antigravityAdapter } from '$lib/modules/agent-room/application/adapters/AntigravityAdapter.js';
import { clineAdapter } from '$lib/modules/agent-room/application/adapters/ClineAdapter.js';
import { devinAdapter } from '$lib/modules/agent-room/application/adapters/DevinAdapter.js';

const temporaryHomes: string[] = [];

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function isolatedTracker() {
  const home = mkdtempSync(join(tmpdir(), 'orkestrai-session-tracker-'));
  temporaryHomes.push(home);
  return { home, tracker: new AgentSessionTracker(home) };
}

function touch(path: string, when: Date) {
  const sessionId = path.split('/').at(-1)?.replace(/\.jsonl$/, '') ?? '';
  writeFileSync(path, `${JSON.stringify({ isSidechain: false, sessionId, type: 'user' })}\n`);
  utimesSync(path, when, when);
}

describe('AgentSessionTracker', () => {
  it('encontra sessao do claude pelo jsonl mais novo apos o spawn', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), 'meu-projeto');
    const { home, tracker } = isolatedTracker();

    // Simula a estrutura real: ~/.claude/projects/-tmp-meu-projeto/
    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    const sessionFile = join(claudeDir, 'abc-123-session.jsonl');
    touch(sessionFile, new Date());
    const older = join(claudeDir, 'old-session.jsonl');
    touch(older, new Date(Date.now() - 3_600_000));

    const found = tracker.findAgentSessionId(claudeAdapter.sessionStorage, cwd, since);
    expect(found).toBe('abc-123-session');
  });

  it('retorna null quando nao ha sessao nova', () => {
    const { tracker } = isolatedTracker();
    expect(tracker.findAgentSessionId(claudeAdapter.sessionStorage, join(tmpdir(), 'nao-existe-' + Date.now()), Date.now())).toBeNull();
  });

  it('atribui ids distintos a agentes no mesmo diretorio (mais antigo nao reivindicado)', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), 'projeto-multi-' + Date.now());
    const { home, tracker } = isolatedTracker();

    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    const first = join(claudeDir, 'sessao-a.jsonl');
    const second = join(claudeDir, 'sessao-b.jsonl');
    touch(first, new Date(Date.now() - 10_000));
    touch(second, new Date());

    // Primeiro agente pega a mais antiga; o id fica reivindicado...
    const foundA = tracker.findAgentSessionId(claudeAdapter.sessionStorage, cwd, since);
    expect(foundA).toBe('sessao-a');
    tracker.claim(foundA!);

    // ...e o segundo agente NAO recebe o mesmo id.
    const foundB = tracker.findAgentSessionId(claudeAdapter.sessionStorage, cwd, since);
    expect(foundB).toBe('sessao-b');
    expect(foundB).not.toBe(foundA);
  });

  it('findLatestUnclaimedSessionId retorna a mais recente fora da exclusao', () => {
    const cwd = join(tmpdir(), 'projeto-respawn-' + Date.now());
    const { home, tracker } = isolatedTracker();

    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    touch(join(claudeDir, 'velha.jsonl'), new Date(Date.now() - 3_600_000));
    touch(join(claudeDir, 'media.jsonl'), new Date(Date.now() - 60_000));
    touch(join(claudeDir, 'nova.jsonl'), new Date());

    // Sem exclusao: a mais recente. Excluindo-a: a segunda mais recente.
    expect(tracker.findLatestUnclaimedSessionId(claudeAdapter.sessionStorage, cwd)).toBe('nova');
    expect(tracker.findLatestUnclaimedSessionId(claudeAdapter.sessionStorage, cwd, new Set(['nova']))).toBe('media');
  });

  it('ignora transcripts de subagentes do claude', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), 'projeto-claude-subagent-' + Date.now());
    const { home, tracker } = isolatedTracker();

    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    touch(join(claudeDir, 'agent-a2a88b5.jsonl'), new Date(Date.now() - 5_000));
    touch(join(claudeDir, 'sessao-principal.jsonl'), new Date());

    expect(tracker.findAgentSessionId(claudeAdapter.sessionStorage, cwd, since)).toBe('sessao-principal');
  });

  it('ignora transcript principal vazio do claude', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), 'projeto-claude-vazio-' + Date.now());
    const { home, tracker } = isolatedTracker();

    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    const empty = join(claudeDir, 'sessao-vazia.jsonl');
    writeFileSync(empty, '');
    utimesSync(empty, new Date(), new Date());
    touch(join(claudeDir, 'sessao-valida.jsonl'), new Date(Date.now() - 5_000));

    expect(tracker.findLatestUnclaimedSessionId(claudeAdapter.sessionStorage, cwd)).toBe('sessao-valida');
  });

  it('ignora transcript do claude que ainda contem apenas snapshots de startup', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), 'projeto-claude-snapshot-' + Date.now());
    const { home, tracker } = isolatedTracker();

    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    const snapshotOnly = join(claudeDir, 'sessao-snapshot.jsonl');
    writeFileSync(snapshotOnly, `${JSON.stringify({ type: 'file-history-snapshot', messageId: 'abc' })}\n`);
    utimesSync(snapshotOnly, new Date(), new Date());
    touch(join(claudeDir, 'sessao-retomavel.jsonl'), new Date(Date.now() - 5_000));

    expect(tracker.findLatestUnclaimedSessionId(claudeAdapter.sessionStorage, cwd)).toBe('sessao-retomavel');
  });

  it('valida um id exato do Claude apenas quando o transcript e retomavel', () => {
    const cwd = join(tmpdir(), 'projeto-claude-validacao-' + Date.now());
    const { home, tracker } = isolatedTracker();
    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'reservada.jsonl'), `${JSON.stringify({ type: 'file-history-snapshot' })}\n`);
    touch(join(claudeDir, 'valida.jsonl'), new Date());

    expect(tracker.isAgentSessionResumable(claudeAdapter.sessionStorage, cwd, 'ausente')).toBe(false);
    expect(tracker.isAgentSessionResumable(claudeAdapter.sessionStorage, cwd, 'reservada')).toBe(false);
    expect(tracker.isAgentSessionResumable(claudeAdapter.sessionStorage, cwd, 'valida')).toBe(true);
    expect(tracker.isAgentSessionResumable(codexAdapter.sessionStorage, cwd, 'qualquer')).toBeNull();
  });

  it('encontra a sessao do Cursor apenas no projeto correspondente', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), `cursor-workspace-${Date.now()}`);
    const { home, tracker } = isolatedTracker();
    const slug = cwd.replace(/^[\\/]+/, '').replace(/[^a-zA-Z0-9]/g, '-');
    const sessionId = 'cursor-session-1';
    const transcriptDir = join(home, '.cursor', 'projects', slug, 'agent-transcripts', sessionId);
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(join(transcriptDir, `${sessionId}.jsonl`), '{"role":"user"}\n');

    expect(tracker.findAgentSessionId(cursorAdapter.sessionStorage, cwd, since)).toBe(sessionId);
  });

  it('resolve a conversa do Antigravity pelo cache do workspace', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), `antigravity-workspace-${Date.now()}`);
    const { home, tracker } = isolatedTracker();
    const cacheDir = join(home, '.gemini', 'antigravity-cli', 'cache');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'last_conversations.json'), JSON.stringify({ [cwd]: 'agy-session-1' }));

    expect(tracker.findAgentSessionId(antigravityAdapter.sessionStorage, cwd, since)).toBe('agy-session-1');
  });

  it('filtra manifestos do Cline pelo diretorio do workspace', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), `cline-workspace-${Date.now()}`);
    const otherCwd = join(tmpdir(), `cline-other-${Date.now()}`);
    const { home, tracker } = isolatedTracker();
    const sessionsDir = join(home, '.cline', 'data', 'sessions');
    for (const [id, manifestCwd] of [
      ['cline-other', otherCwd],
      ['cline-session-1', cwd],
    ]) {
      const sessionDir = join(sessionsDir, id);
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, `${id}.json`), JSON.stringify({ session_id: id, cwd: manifestCwd }));
    }

    expect(tracker.findAgentSessionId(clineAdapter.sessionStorage, cwd, since)).toBe('cline-session-1');
  });

  it('resolve sessoes concorrentes do Devin pelo banco e cwd exatos', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), `devin-workspace-${Date.now()}`);
    const otherCwd = join(tmpdir(), `devin-other-${Date.now()}`);
    mkdirSync(cwd, { recursive: true });
    mkdirSync(otherCwd, { recursive: true });
    const { home, tracker } = isolatedTracker();
    const databaseDir = join(home, '.local', 'share', 'devin', 'cli');
    mkdirSync(databaseDir, { recursive: true });
    const database = new DatabaseSync(join(databaseDir, 'sessions.db'));
    database.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, working_directory TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)');
    const insert = database.prepare('INSERT INTO sessions (id, working_directory, created_at, hidden) VALUES (?, ?, ?, ?)');
    const now = Math.floor(Date.now() / 1_000);
    insert.run('devin-other', otherCwd, now - 2, 0);
    insert.run('calm-river', cwd, now - 1, 0);
    insert.run('bright-piano', cwd, now, 0);
    insert.run('hidden-helper', cwd, now, 1);
    database.close();

    const first = tracker.findAgentSessionId(devinAdapter.sessionStorage, cwd, since);
    expect(first).toBe('calm-river');
    tracker.claim(first!);
    expect(tracker.findAgentSessionId(devinAdapter.sessionStorage, cwd, since)).toBe('bright-piano');
    expect(tracker.findLatestUnclaimedSessionId(devinAdapter.sessionStorage, cwd)).toBe('bright-piano');
  });
});

describe('resume exato dos adapters', () => {
  it('claude resume exato com id e fresh sem id', () => {
    expect(claudeAdapter.resumeArgs('abc-123')).toEqual(['--resume', 'abc-123']);
    // Sem id: comeca fresco — "claude --continue" sai com erro quando nao ha
    // conversa no diretorio (ex.: agente novo que nunca recebeu mensagem).
    expect(claudeAdapter.resumeArgs()).toEqual([]);
    expect(claudeAdapter.freshSessionArgs?.('novo-uuid')).toEqual(['--session-id', 'novo-uuid']);
  });

  it('codex resume exato com id e resume --last sem id', () => {
    expect(codexAdapter.resumeArgs('uuid-1')).toEqual(['resume', 'uuid-1']);
    expect(codexAdapter.resumeArgs()).toEqual(['resume', '--last']);
  });

  it('kimi resume exato com id e --continue sem id', () => {
    expect(kimiAdapter.resumeArgs('session_x')).toEqual(['-r', 'session_x']);
    expect(kimiAdapter.resumeArgs()).toEqual(['--continue']);
  });

  it('opencode resume exato com id e --continue sem id', () => {
    expect(openCodeAdapter.resumeArgs('ses_1')).toEqual(['--session', 'ses_1']);
    expect(openCodeAdapter.resumeArgs()).toEqual(['--continue']);
  });

  it('devin resume apenas com id exato', () => {
    expect(devinAdapter.resumeArgs('calm-river')).toEqual(['--resume', 'calm-river']);
    expect(devinAdapter.resumeArgs()).toBeNull();
  });
});
