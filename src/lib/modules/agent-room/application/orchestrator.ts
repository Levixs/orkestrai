import type {
  AgentName,
  AgentLoopPayload,
  AgentRunRequest,
  AgentRunResult,
  ChatMessage,
  Conversation,
  RunAgentPayload,
} from '../domain/types.js';
import { randomUUID } from 'node:crypto';
import { agentRoomRepository } from '../infrastructure/db.js';
import { assertWritableProjectPath } from '../infrastructure/workspace.js';
import { runAgent, type AgentCommandProgressEvent } from './agents.js';

const RECENT_MESSAGE_LIMIT = 12;
const HISTORY_TOTAL_CHAR_LIMIT = 14_000;
const HISTORY_MESSAGE_CHAR_LIMIT = 2_000;
const REVIEW_CONTENT_CHAR_LIMIT = 5_000;
const DEFAULT_LOOP_MAX_ROUNDS = 6;
const activeConversationRuns = new Set<string>();

export type AgentRoomProgressEvent =
  | {
      type: 'run_started';
      runId: string;
      agent: AgentName;
      mode: string;
      allowWrites: boolean;
    }
  | {
      type: 'agent_output';
      runId: string;
      agent: AgentName;
      stream: 'stdout' | 'stderr';
      text: string;
    }
  | {
      type: 'agent_status';
      runId: string;
      agent: AgentName;
      status: AgentCommandProgressEvent['type'];
      text?: string;
      exitCode?: number;
    }
  | {
      type: 'run_finished';
      runId: string;
      agent: AgentName;
      exitCode: number;
      error?: string;
    }
  | {
      type: 'loop_round_started';
      round: number;
      maxRounds: number;
    }
  | {
      type: 'system';
      message: string;
    };

export type AgentRoomRunOptions = {
  signal?: AbortSignal;
  onProgress?: (event: AgentRoomProgressEvent) => void;
};

function now() {
  return new Date().toISOString();
}

function roleFor(agent: AgentName, mode: RunAgentPayload['mode']) {
  if (mode === 'review') return `${agent} revisa riscos, lacunas e melhorias acionaveis`;
  if (mode === 'plan') return `${agent} cria ou critica um plano tecnico objetivo`;
  if (mode === 'implement') return `${agent} prepara uma implementacao rastreavel e limitada ao workspace`;
  return `${agent} responde como participante tecnico da conversa`;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;

  const tailLength = Math.min(500, Math.floor(maxLength / 4));
  const headLength = Math.max(0, maxLength - tailLength - 80);
  const omitted = text.length - headLength - tailLength;

  return `${text.slice(0, headLength).trimEnd()}\n...[trecho truncado: ${omitted} caracteres omitidos]...\n${text
    .slice(-tailLength)
    .trimStart()}`;
}

function formatHistory(messages: ChatMessage[]) {
  const selected: string[] = [];
  let remaining = HISTORY_TOTAL_CHAR_LIMIT;

  for (const message of messages.slice(-RECENT_MESSAGE_LIMIT).reverse()) {
    if (remaining <= 0) break;

    const prefix = `${message.participant.toUpperCase()}: `;
    const maxContentLength = Math.max(240, Math.min(HISTORY_MESSAGE_CHAR_LIMIT, remaining - prefix.length));
    const content = truncateText(message.content, maxContentLength);
    const entry = `${prefix}${content}`;

    selected.unshift(entry);
    remaining -= entry.length + 2;
  }

  return selected.join('\n\n');
}

function buildAgentPrompt(input: {
  agent: AgentName;
  mode: RunAgentPayload['mode'];
  userMessage: string;
  history: ChatMessage[];
  reviewOf?: { agent: AgentName; content: string };
}) {
  const reviewBlock = input.reviewOf
    ? `\n\nResposta de ${input.reviewOf.agent} para revisar:\n${truncateText(input.reviewOf.content, REVIEW_CONTENT_CHAR_LIMIT)}`
    : '';

return `Voce esta participando de uma conversa com tres participantes:
- Usuario humano
- Codex
- Claude

Seu papel nesta chamada: ${roleFor(input.agent, input.mode)}
Modo: ${input.mode}

Historico recente:
${formatHistory(input.history) || 'Sem historico anterior.'}

Pedido atual do usuario:
${input.userMessage}${reviewBlock}

Instrucoes:
- Responda de forma objetiva.
- Trate o historico como uma sala compartilhada: todos os participantes veem as falas anteriores.
- Se outro agente acabou de falar, continue a conversa a partir dele em vez de reiniciar o assunto.
- Nao finja que executou comandos se nao executou.
- Se precisar editar arquivos, explique quais arquivos pretende editar.
- Se estiver revisando outro agente, aponte riscos concretos e melhorias acionaveis.`;
}

function parseLoopStatus(content: string) {
  const matches = [...content.matchAll(/STATUS:\s*(DONE|CONTINUE)\b/gi)];
  return matches.at(-1)?.[1]?.toUpperCase() === 'DONE' ? 'done' : 'continue';
}

function buildLoopPrompt(input: {
  agent: AgentName;
  objective: string;
  history: ChatMessage[];
  round: number;
  maxRounds: number;
  mode: AgentLoopPayload['mode'];
}) {
  const role =
    input.agent === 'codex'
      ? 'avance a implementacao ou o plano para chegar no objetivo'
      : 'revise criticamente o trabalho do Codex e aponte apenas pendencias reais';
  const executionGuardrails =
    input.agent === 'codex'
      ? `\nLimites desta rodada para Codex:\n- Faca no maximo um passo concreto e pequeno nesta rodada.\n- Se for editar, limite-se a um patch pequeno e comandos focados.\n- Nao rode servidores, watchers, comandos interativos ou verificacoes longas.\n- Se o proximo passo for grande demais para uma rodada curta, descreva exatamente o proximo passo e finalize com STATUS: CONTINUE.`
      : `\nLimites desta rodada para Claude:\n- Atue como revisor read-only.\n- Nao tente editar arquivos nem executar implementacoes.\n- Se houver pendencia real, diga a menor acao necessaria para o Codex na proxima rodada.`;

  return `Voce esta em um Ralph loop com tres participantes:
- Usuario humano
- Codex
- Claude

Objetivo do usuario:
${input.objective}

Rodada ${input.round} de ${input.maxRounds}
Modo: ${input.mode}
Seu papel nesta rodada: ${role}
${executionGuardrails}

Historico recente compartilhado:
${formatHistory(input.history) || 'Sem historico anterior.'}

Regras do loop:
- Trabalhe a partir do historico; nao reinicie a discussao.
- Se voce for Codex, execute apenas o menor proximo passo concreto que couber em uma rodada curta.
- Se voce for Claude, revise e nao implemente.
- Se faltar algo para cumprir o objetivo, diga exatamente o que falta.
- Se o objetivo estiver cumprido e nao houver pendencia relevante, finalize com DONE.
- A ultima linha da sua resposta deve ser exatamente uma destas:
STATUS: DONE
STATUS: CONTINUE`;
}

async function withConversationRun<T>(conversationId: string, callback: () => Promise<T>) {
  if (activeConversationRuns.has(conversationId)) {
    throw new Error('Ja existe uma execucao de agente em andamento nesta conversa.');
  }

  activeConversationRuns.add(conversationId);
  try {
    return await callback();
  } finally {
    activeConversationRuns.delete(conversationId);
  }
}

async function executeAgent(
  conversation: Conversation,
  request: Omit<AgentRunRequest, 'workingDirectory'> & { workingDirectory?: string | null },
  options: AgentRoomRunOptions = {}
) {
  const runId = randomUUID();
  const startedAt = now();

  agentRoomRepository.createAgentRun({
    id: runId,
    conversationId: conversation.id,
    agent: request.agent,
    mode: request.mode,
    prompt: request.prompt,
      startedAt,
  });

  options.onProgress?.({
    type: 'run_started',
    runId,
    agent: request.agent,
    mode: request.mode,
    allowWrites: request.allowWrites,
  });

  const result = await runAgent({
    ...request,
    workingDirectory: request.workingDirectory ?? conversation.projectPath ?? undefined,
  }, {
    signal: options.signal,
    onProgress: (event) => {
      if (event.type === 'stdout' || event.type === 'stderr') {
        options.onProgress?.({
          type: 'agent_output',
          runId,
          agent: request.agent,
          stream: event.type,
          text: event.text ?? '',
        });
        return;
      }

      options.onProgress?.({
        type: 'agent_status',
        runId,
        agent: request.agent,
        status: event.type,
        text: event.text,
        exitCode: event.exitCode,
      });
    },
  });

  agentRoomRepository.finishAgentRun({
    id: runId,
    output: result.content,
    rawOutput: result.rawOutput,
    exitCode: result.exitCode,
    error: result.error,
    finishedAt: now(),
  });

  agentRoomRepository.addMessage({
    conversationId: conversation.id,
    participant: result.agent,
    content: result.error ? `Erro ao executar ${result.agent}: ${result.content}` : result.content,
    metadata: {
      runId,
      mode: request.mode,
      exitCode: result.exitCode,
      error: result.error,
      allowWrites: request.allowWrites,
    },
  });

  options.onProgress?.({
    type: 'run_finished',
    runId,
    agent: request.agent,
    exitCode: result.exitCode,
    error: result.error,
  });

  return result;
}

function ensureConversation(id: string) {
  const conversation = agentRoomRepository.getConversation(id);
  if (!conversation) {
    throw new Error('Conversa nao encontrada.');
  }
  return conversation;
}

export async function handleRunAgent(
  conversationId: string,
  payload: RunAgentPayload,
  options: AgentRoomRunOptions = {}
) {
  return withConversationRun(conversationId, async () => handleRunAgentUnlocked(conversationId, payload, options));
}

async function handleRunAgentUnlocked(conversationId: string, payload: RunAgentPayload, options: AgentRoomRunOptions) {
  const conversation = ensureConversation(conversationId);
  const message = payload.message.trim();

  if (!message) {
    throw new Error('A mensagem nao pode ficar vazia.');
  }

  if (payload.allowWrites) {
    assertWritableProjectPath(payload.projectPath ?? conversation.projectPath);
  }

  agentRoomRepository.addMessage({
    conversationId,
    participant: 'user',
    content: message,
    metadata: {
      target: payload.target,
      mode: payload.mode,
      allowWrites: payload.allowWrites,
    },
  });
  const makeRequest = (agent: AgentName, reviewOf?: AgentRunResult): AgentRunRequest => ({
    agent,
    prompt: buildAgentPrompt({
      agent,
      mode: reviewOf ? 'review' : payload.mode,
      userMessage: message,
      history: agentRoomRepository.listMessages(conversationId),
      reviewOf: reviewOf ? { agent: reviewOf.agent, content: reviewOf.content } : undefined,
    }),
    workingDirectory: payload.projectPath ?? conversation.projectPath ?? undefined,
    mode: reviewOf ? 'review' : payload.mode === 'debate' ? 'chat' : payload.mode,
    allowWrites: payload.allowWrites,
  });

  let results: AgentRunResult[] = [];
  if (payload.target === 'both') {
    const codex = await executeAgent(conversation, makeRequest('codex'), options);
    const claude = await executeAgent(conversation, makeRequest('claude'), options);
    results = [codex, claude];
  } else if (payload.target === 'codex_then_claude_review') {
    const codex = await executeAgent(conversation, makeRequest('codex'), options);
    const claude = await executeAgent(conversation, makeRequest('claude', codex), options);
    results = [codex, claude];
  } else if (payload.target === 'claude_then_codex_review') {
    const claude = await executeAgent(conversation, makeRequest('claude'), options);
    const codex = await executeAgent(conversation, makeRequest('codex', claude), options);
    results = [claude, codex];
  } else {
    results = [await executeAgent(conversation, makeRequest(payload.target), options)];
  }

  return {
    conversation: agentRoomRepository.getConversation(conversationId),
    messages: agentRoomRepository.listMessages(conversationId),
    results,
  };
}

export async function handleDebate(conversationId: string, topic: string, options: AgentRoomRunOptions = {}) {
  return withConversationRun(conversationId, async () => handleDebateUnlocked(conversationId, topic, options));
}

async function handleDebateUnlocked(conversationId: string, topic: string, options: AgentRoomRunOptions) {
  const conversation = ensureConversation(conversationId);
  const message = topic.trim();

  if (!message) {
    throw new Error('Informe um tema para debater.');
  }

  agentRoomRepository.addMessage({
    conversationId,
    participant: 'user',
    content: message,
    metadata: { target: 'debate', mode: 'debate', allowWrites: false },
  });

  const turns: Array<{ agent: AgentName; instruction: string }> = [
    { agent: 'codex', instruction: 'Abra o debate com uma proposta tecnica.' },
    { agent: 'claude', instruction: 'Responda ao Codex com riscos, contrapontos e alternativas.' },
    { agent: 'codex', instruction: 'Replique incorporando ou rejeitando os pontos de Claude com justificativa.' },
    { agent: 'claude', instruction: 'Feche com recomendacao, riscos restantes e proximo passo.' },
  ];

  const results: AgentRunResult[] = [];
  for (const turn of turns) {
    const history = agentRoomRepository.listMessages(conversationId);
    const prompt = `${buildAgentPrompt({
      agent: turn.agent,
      mode: 'debate',
      userMessage: message,
      history,
    })}

Turno controlado:
${turn.instruction}`;

    results.push(
      await executeAgent(conversation, {
        agent: turn.agent,
        prompt,
        mode: 'chat',
        allowWrites: false,
        workingDirectory: conversation.projectPath,
      }, options)
    );
  }

  agentRoomRepository.addMessage({
    conversationId,
    participant: 'system',
    content: 'Debate encerrado apos 4 turnos controlados.',
    metadata: { resultCount: results.length },
  });

  return {
    conversation: agentRoomRepository.getConversation(conversationId),
    messages: agentRoomRepository.listMessages(conversationId),
    results,
  };
}

export async function handleAgentLoop(
  conversationId: string,
  payload: AgentLoopPayload,
  options: AgentRoomRunOptions = {}
) {
  return withConversationRun(conversationId, async () => handleAgentLoopUnlocked(conversationId, payload, options));
}

async function handleAgentLoopUnlocked(conversationId: string, payload: AgentLoopPayload, options: AgentRoomRunOptions) {
  const conversation = ensureConversation(conversationId);
  const message = payload.message.trim();

  if (!message) {
    throw new Error('Informe um objetivo para o loop.');
  }

  if (payload.allowWrites) {
    assertWritableProjectPath(payload.projectPath ?? conversation.projectPath);
  }

  const maxRounds = Math.min(12, Math.max(1, Math.floor(Number(payload.maxRounds) || DEFAULT_LOOP_MAX_ROUNDS)));

  agentRoomRepository.addMessage({
    conversationId,
    participant: 'user',
    content: message,
    metadata: { target: 'ralph_loop', mode: payload.mode, allowWrites: payload.allowWrites, maxRounds },
  });

  const results: AgentRunResult[] = [];
  let completed = false;
  let stoppedByError = false;
  let roundsRun = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    roundsRun = round;
    const agentMode = payload.mode === 'debate' ? 'chat' : payload.mode;
    options.onProgress?.({ type: 'loop_round_started', round, maxRounds });

    const codex = await executeAgent(conversation, {
      agent: 'codex',
      prompt: buildLoopPrompt({
        agent: 'codex',
        objective: message,
        history: agentRoomRepository.listMessages(conversationId),
        round,
        maxRounds,
        mode: payload.mode,
      }),
      mode: agentMode,
      allowWrites: payload.allowWrites,
      workingDirectory: payload.projectPath ?? conversation.projectPath,
    }, options);
    results.push(codex);

    if (codex.error) {
      stoppedByError = true;
      break;
    }

    const claude = await executeAgent(conversation, {
      agent: 'claude',
      prompt: buildLoopPrompt({
        agent: 'claude',
        objective: message,
        history: agentRoomRepository.listMessages(conversationId),
        round,
        maxRounds,
        mode: payload.mode,
      }),
      mode: 'review',
      allowWrites: false,
      workingDirectory: payload.projectPath ?? conversation.projectPath,
    }, options);
    results.push(claude);

    stoppedByError = Boolean(claude.error);
    if (stoppedByError) break;

    const codexDone = parseLoopStatus(codex.content) === 'done';
    const claudeDone = parseLoopStatus(claude.content) === 'done';
    if (codexDone && claudeDone) {
      completed = true;
      break;
    }
  }

  const content = stoppedByError
    ? `Ralph loop interrompido apos ${roundsRun} rodada(s) porque um agente retornou erro.`
    : completed
      ? `Ralph loop finalizado apos ${roundsRun} rodada(s): Codex e Claude concordaram com STATUS: DONE.`
      : `Ralph loop pausado apos atingir o limite de ${maxRounds} rodada(s). Ainda havia discordancia ou pendencias.`;

  agentRoomRepository.addMessage({
    conversationId,
    participant: 'system',
    content,
    metadata: { resultCount: results.length, roundsRun, completed, stoppedByError, maxRounds },
  });
  options.onProgress?.({ type: 'system', message: content });

  return {
    conversation: agentRoomRepository.getConversation(conversationId),
    messages: agentRoomRepository.listMessages(conversationId),
    results,
  };
}
