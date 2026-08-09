import { describe, expect, it } from 'vitest';
import {
  parseClaudeTranscriptReply,
  parseCodexTranscriptReply,
  parseGenericTranscriptReply,
  parseKimiTranscriptReply,
  parseStructuredMessagesReply,
} from '$lib/modules/agent-room/infrastructure/transcript/AgentTranscript.js';

describe('parseClaudeTranscriptReply', () => {
  it('junta TODOS os blocos de texto do assistant apos a ultima pergunta (inclusive com tool calls no meio)', () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'como estao as tasks?' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Vou verificar o quadro.' }, { type: 'tool_use', name: 'Bash', input: {} }] } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'saida do comando' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Tudo verde: 3 tarefas feitas e 1 em andamento.' }] } }),
    ].join('\n');
    expect(parseClaudeTranscriptReply(jsonl)).toBe('Vou verificar o quadro.\n\nTudo verde: 3 tarefas feitas e 1 em andamento.');
  });

  it('resposta com paragrafos/multiplas mensagens assistant vem completa', () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'resume o projeto' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Primeiro ponto.' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Segundo ponto.' }] } }),
    ].join('\n');
    expect(parseClaudeTranscriptReply(jsonl)).toBe('Primeiro ponto.\n\nSegundo ponto.');
  });

  it('pergunta nova no fim vira fronteira (nao mistura respostas antigas)', () => {
    const jsonl = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Resposta velha.' }] } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'nova pergunta' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Resposta nova.' }] } }),
    ].join('\n');
    expect(parseClaudeTranscriptReply(jsonl)).toBe('Resposta nova.');
  });

  it('sem resposta retorna null', () => {
    expect(parseClaudeTranscriptReply(JSON.stringify({ type: 'user', message: { role: 'user', content: 'so pergunta' } }))).toBeNull();
  });
});

describe('parseCodexTranscriptReply', () => {
  it('junta output_text do assistant apos o ultimo input_text do usuario', () => {
    const jsonl = [
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'status?' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Estou operacional.' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Pronto para o proximo passo.' }] } }),
    ].join('\n');
    expect(parseCodexTranscriptReply(jsonl)).toBe('Estou operacional.\n\nPronto para o proximo passo.');
  });

  it('ignora eventos nao-message (reasoning, tool calls)', () => {
    const jsonl = [
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'vai' }] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'reasoning', summary: [] } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'shell' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Feito.' }] } }),
    ].join('\n');
    expect(parseCodexTranscriptReply(jsonl)).toBe('Feito.');
  });

  it('sem resposta retorna null', () => {
    expect(parseCodexTranscriptReply('{"type":"session_meta","payload":{}}')).toBeNull();
  });
});

describe('parseKimiTranscriptReply (formato real do wire.jsonl, 0.33)', () => {
  it('junta os textos do assistente depois do ultimo turn.prompt', () => {
    const jsonl = [
      JSON.stringify({ type: 'profile.bind', modelAlias: 'kimi-code/k3' }),
      JSON.stringify({ type: 'turn.prompt', input: [{ type: 'text', text: 'como voce esta?' }], origin: { kind: 'user' } }),
      JSON.stringify({ type: 'context.append_loop_event', event: { type: 'content.part', part: { type: 'text', text: 'Estou bem.' } } }),
      JSON.stringify({ type: 'context.append_loop_event', event: { type: 'content.part', part: { type: 'text', text: 'Pronto para trabalhar.' } } }),
      JSON.stringify({ type: 'turn.ended', reason: 'completed' }),
    ].join('\n');
    expect(parseKimiTranscriptReply(jsonl)).toBe('Estou bem.\n\nPronto para trabalhar.');
  });

  it('ignora o que veio antes do ultimo prompt e retorna null sem resposta', () => {
    const jsonl = [
      JSON.stringify({ type: 'context.append_loop_event', event: { type: 'content.part', part: { type: 'text', text: 'resposta antiga' } } }),
      JSON.stringify({ type: 'turn.prompt', input: [{ type: 'text', text: 'oi' }] }),
    ].join('\n');
    expect(parseKimiTranscriptReply(jsonl)).toBeNull();
    expect(parseKimiTranscriptReply('{"type":"profile.bind"}')).toBeNull();
  });
});

describe('transcritos estruturados dos providers adicionais', () => {
  it('le Cursor e Antigravity em JSONL sem misturar a resposta anterior', () => {
    const jsonl = [
      JSON.stringify({ role: 'assistant', content: 'resposta antiga' }),
      JSON.stringify({ role: 'user', content: 'nova pergunta' }),
      JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'Resposta atual.' }] }),
    ].join('\n');
    expect(parseGenericTranscriptReply(jsonl)).toBe('Resposta atual.');
  });

  it('le o array de mensagens persistido pelo Cline', () => {
    expect(
      parseStructuredMessagesReply([
        { role: 'user', content: 'faça a análise' },
        { role: 'assistant', content: [{ type: 'text', text: 'Análise concluída.' }] },
      ])
    ).toBe('Análise concluída.');
  });
});
