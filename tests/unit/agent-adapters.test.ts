import { describe, expect, it } from 'vitest';
import { claudeAdapter } from '$lib/modules/agent-room/application/adapters/ClaudeAdapter.js';
import { codexAdapter } from '$lib/modules/agent-room/application/adapters/CodexAdapter.js';
import { kimiAdapter } from '$lib/modules/agent-room/application/adapters/KimiAdapter.js';
import { openCodeAdapter } from '$lib/modules/agent-room/application/adapters/OpenCodeAdapter.js';
import { cursorAdapter } from '$lib/modules/agent-room/application/adapters/CursorAdapter.js';
import { antigravityAdapter } from '$lib/modules/agent-room/application/adapters/AntigravityAdapter.js';
import { clineAdapter } from '$lib/modules/agent-room/application/adapters/ClineAdapter.js';
import type { AgentRunRequest } from '$lib/modules/agent-room/domain/types.js';

function request(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    agent: 'claude',
    prompt: 'ola',
    workingDirectory: 'projeto-x',
    allowWrites: false,
    ...overrides,
  } as AgentRunRequest;
}

describe('claudeAdapter.buildCommand', () => {
  it('monta comando headless sem escrita', () => {
    const spec = claudeAdapter.buildCommand(request({ model: 'opus', effort: 'high' }));
    expect(spec.command).toBe('claude');
    expect(spec.args).toContain('--output-format');
    expect(spec.args).toContain('--model');
    expect(spec.args).toContain('opus');
    expect(spec.args).toContain('--effort');
    expect(spec.args).not.toContain('--dangerously-skip-permissions');
    expect(spec.promptDelivery ?? 'stdin').toBe('stdin');
  });

  it('adiciona bypass de permissoes com allowWrites', () => {
    const spec = claudeAdapter.buildCommand(request({ allowWrites: true }));
    expect(spec.args).toContain('--dangerously-skip-permissions');
  });
});

describe('codexAdapter.buildCommand', () => {
  it('usa sandbox read-only por padrao', () => {
    const spec = codexAdapter.buildCommand(request({ agent: 'codex' }));
    expect(spec.command).toBe('codex');
    expect(spec.args[0]).toBe('exec');
    expect(spec.args).toContain('--sandbox');
    expect(spec.args).toContain('read-only');
    expect(spec.args.at(-1)).toBe('-');
  });

  it('usa danger-full-access com allowWrites', () => {
    const spec = codexAdapter.buildCommand(request({ agent: 'codex', allowWrites: true }));
    expect(spec.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(spec.args).not.toContain('--sandbox');
  });
});

describe('kimiAdapter', () => {
  it('entrega prompt como argumento e forca stream-json', () => {
    const spec = kimiAdapter.buildCommand(request({ agent: 'kimi', prompt: 'faça algo', model: 'kimi-code/kimi-for-coding' }));
    expect(spec.command).toBe('kimi');
    expect(spec.promptDelivery).toBe('args');
    expect(spec.args).toEqual(['-p', 'faça algo', '-m', 'kimi-code/kimi-for-coding', '--output-format', 'stream-json']);
    expect(spec.displayArgs).not.toContain('faça algo');
  });

  it('parseia stream-json real: ultima mensagem assistant e session.resume_hint', () => {
    const stdout = [
      '{"role":"assistant","content":"vou verificar"}',
      '{"role":"tool","content":"resultado da tool"}',
      '{"role":"assistant","content":"OK"}',
      '{"role":"meta","type":"session.resume_hint","session_id":"session_abc","command":"kimi -r session_abc","content":"To resume this session: kimi -r session_abc"}',
    ].join('\n');

    const parsed = kimiAdapter.parseOutput(stdout);
    expect(parsed.content).toBe('vou verificar\nOK');
    expect(parsed.content).not.toContain('resume');
    expect(parsed.metadata?.sessionId).toBe('session_abc');
    expect(parsed.metadata?.resumeCommand).toBe('kimi -r session_abc');
  });

  it('parseia content em partes de texto', () => {
    const stdout = '{"role":"assistant","content":[{"type":"text","text":"resposta"}],"tool_calls":[]}';
    expect(kimiAdapter.parseOutput(stdout).content).toBe('resposta');
  });

  it('cai para stdout cru quando nao ha JSON', () => {
    expect(kimiAdapter.parseOutput('saida qualquer').content).toBe('saida qualquer');
  });
});

describe('openCodeAdapter', () => {
  it('monta comando run --format json com prompt como argumento', () => {
    const spec = openCodeAdapter.buildCommand(request({ agent: 'opencode', prompt: 'liste arquivos', model: 'anthropic/claude-sonnet' }));
    expect(spec.command).toBe('opencode');
    expect(spec.promptDelivery).toBe('args');
    expect(spec.args).toEqual(['run', '--format', 'json', '-m', 'anthropic/claude-sonnet', 'liste arquivos']);
  });

  it('extrai textos de partes text e sessionID', () => {
    const stdout = [
      '{"type":"step_start","sessionID":"ses_1","part":{"type":"step_start"}}',
      '{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"primeira resposta"}}',
      '{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"resposta final"}}',
    ].join('\n');

    const parsed = openCodeAdapter.parseOutput(stdout);
    expect(parsed.content).toBe('primeira resposta\nresposta final');
    expect(parsed.metadata?.sessionId).toBe('ses_1');
  });

  it('cai no parser generico quando nao ha partes text', () => {
    const parsed = openCodeAdapter.parseOutput('{"content":"texto solto"}');
    expect(parsed.content).toBe('texto solto');
  });
});

describe('cursorAdapter', () => {
  it('usa print estruturado e so libera escrita com --force', () => {
    const review = cursorAdapter.buildCommand(request({ agent: 'cursor', prompt: 'revise' }));
    expect(review.command).toBe('cursor-agent');
    expect(review.args).toContain('stream-json');
    expect(review.args).not.toContain('--force');
    expect(review.args.at(-1)).toContain('READ-ONLY TASK');
    expect(review.args.at(-1)).toContain('revise');
    expect(review.displayArgs).not.toContain(review.args.at(-1));
    expect(review.promptDelivery).toBe('args');

    const write = cursorAdapter.buildCommand(request({ agent: 'cursor', allowWrites: true }));
    expect(write.args).toContain('--force');
  });

  it('extrai resultado e id de sessao do stream-json', () => {
    const parsed = cursorAdapter.parseOutput([
      '{"type":"system","subtype":"init","session_id":"cursor-1"}',
      '{"type":"result","subtype":"success","result":"feito"}',
    ].join('\n'));
    expect(parsed.content).toBe('feito');
    expect(parsed.metadata?.sessionId).toBe('cursor-1');
  });

  it('retoma somente a conversa exata', () => {
    expect(cursorAdapter.resumeArgs('cursor-1')).toEqual(['--resume', 'cursor-1']);
    expect(cursorAdapter.resumeArgs()).toBeNull();
  });
});

describe('antigravityAdapter', () => {
  it('usa agy em sandbox para leitura e bypass explicito para escrita', () => {
    const review = antigravityAdapter.buildCommand(request({ agent: 'antigravity' }));
    expect(review.command).toBe('agy');
    expect(review.args).toContain('--sandbox');
    expect(review.args).not.toContain('--dangerously-skip-permissions');

    const write = antigravityAdapter.buildCommand(request({ agent: 'antigravity', allowWrites: true }));
    expect(write.args).toContain('--dangerously-skip-permissions');
  });

  it('retoma uma conversa conhecida sem adivinhar a mais recente', () => {
    expect(antigravityAdapter.resumeArgs('agy-1')).toEqual(['--conversation=agy-1']);
    expect(antigravityAdapter.resumeArgs()).toBeNull();
  });
});

describe('clineAdapter', () => {
  it('usa JSON headless, respeita plan/effort e controla auto-aprovacao', () => {
    const review = clineAdapter.buildCommand(request({ agent: 'cline', mode: 'plan', effort: 'high' }));
    expect(review.command).toBe('cline');
    expect(review.args).toContain('--json');
    expect(review.args).toContain('--plan');
    expect(review.args).toContain('--thinking');
    expect(review.args).toContain('false');
    expect(review.env?.CLINE_MCP_SETTINGS_PATH).toBe('.cline/mcp.json');

    const write = clineAdapter.buildCommand(request({ agent: 'cline', allowWrites: true }));
    expect(write.args).toContain('true');
  });

  it('extrai a ultima mensagem completa e id de sessao', () => {
    const parsed = clineAdapter.parseOutput([
      '{"type":"say","say":"text","text":"parcial","partial":true,"sessionId":"cline-1"}',
      '{"type":"say","say":"completion_result","text":"concluido","partial":false}',
    ].join('\n'));
    expect(parsed.content).toBe('concluido');
    expect(parsed.metadata?.sessionId).toBe('cline-1');
  });

  it('extrai o resultado emitido pela CLI atual', () => {
    const parsed = clineAdapter.parseOutput(
      '{"type":"run_result","finishReason":"completed","text":"concluido"}'
    );
    expect(parsed.content).toBe('concluido');
  });

  it('abre TUI e retoma por id', () => {
    expect(clineAdapter.interactiveCommand({ effort: 'xhigh' }).args).toEqual(['--tui', '--thinking', 'xhigh']);
    expect(clineAdapter.interactiveCommand().env?.CLINE_MCP_SETTINGS_PATH).toBe('.cline/mcp.json');
    expect(clineAdapter.resumeArgs('cline-1')).toEqual(['--id', 'cline-1']);
    expect(clineAdapter.resumeArgs()).toBeNull();
  });
});
