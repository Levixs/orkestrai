import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentSessionTracker } from '$lib/modules/agent-room/infrastructure/pty/AgentSessionTracker.js';
import { claudeAdapter } from '$lib/modules/agent-room/application/adapters/ClaudeAdapter.js';
import { codexAdapter } from '$lib/modules/agent-room/application/adapters/CodexAdapter.js';
import { kimiAdapter } from '$lib/modules/agent-room/application/adapters/KimiAdapter.js';
import { openCodeAdapter } from '$lib/modules/agent-room/application/adapters/OpenCodeAdapter.js';

function touch(path: string, when: Date) {
  writeFileSync(path, 'x');
  utimesSync(path, when, when);
}

describe('AgentSessionTracker', () => {
  it('encontra sessao do claude pelo jsonl mais novo apos o spawn', () => {
    const since = Date.now() - 60_000;
    const cwd = join(tmpdir(), 'meu-projeto');
    const tracker = new AgentSessionTracker();

    // Simula a estrutura real: ~/.claude/projects/-tmp-meu-projeto/
    const home = process.env.HOME!;
    const claudeDir = join(home, '.claude', 'projects', `-${cwd.replace(/[/\\]/g, '-').replace(/^-/, '')}`);
    mkdirSync(claudeDir, { recursive: true });
    const sessionFile = join(claudeDir, 'abc-123-session.jsonl');
    touch(sessionFile, new Date());
    const older = join(claudeDir, 'old-session.jsonl');
    touch(older, new Date(Date.now() - 3_600_000));

    const found = tracker.findAgentSessionId('claude', cwd, since);
    expect(found).toBe('abc-123-session');
  });

  it('retorna null quando nao ha sessao nova', () => {
    const tracker = new AgentSessionTracker();
    expect(tracker.findAgentSessionId('claude', join(tmpdir(), 'nao-existe-' + Date.now()), Date.now())).toBeNull();
  });
});

describe('resume exato dos adapters', () => {
  it('claude resume exato com id e --continue sem id', () => {
    expect(claudeAdapter.resumeArgs('abc-123')).toEqual(['--resume', 'abc-123']);
    expect(claudeAdapter.resumeArgs()).toEqual(['--continue']);
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
});
