import type {
  AgentName,
  AgentLoopPayload,
  AgentRunRequest,
  AgentRunResult,
  AgentTask,
  ChatMessage,
  Conversation,
  ExecutionMode,
  ModelEffort,
  RunAgentPayload,
  TaskEvent,
  TeamMember,
  TeamMemberCapability,
  TeamMemberRole,
} from '../domain/types.js';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { agentRoomRepository } from '../infrastructure/repositories/AgentRoomRepository.js';
import { assertWritableProjectPath, projectsRoot } from '../infrastructure/workspace.js';
import { runAgent, type AgentCommandProgressEvent } from './agents.js';
import { hasAgentAdapter } from './adapters/registry.js';
import { CreateBacklogFromLeaderPlanAction } from './actions/CreateBacklogFromLeaderPlanAction.js';
import { CreateBacklogFromLeaderPlanDto } from './dto/AgentRoomDtos.js';
import {
  AgentRoomPlanningService,
  isContinuationCommand,
  isContinuationNoiseTask,
} from './services/AgentRoomPlanningService.js';

const RECENT_MESSAGE_LIMIT = 12;
const HISTORY_TOTAL_CHAR_LIMIT = 14_000;
const HISTORY_MESSAGE_CHAR_LIMIT = 2_000;
const REVIEW_CONTENT_CHAR_LIMIT = 5_000;
const DEFAULT_LOOP_MAX_ROUNDS = 6;
const activeConversationRuns = new Set<string>();
const planningService = new AgentRoomPlanningService();
const createBacklogFromLeaderPlanAction = new CreateBacklogFromLeaderPlanAction();

type DefaultMemberDefinition = {
  title: string;
  provider: AgentName;
  role: TeamMemberRole;
  model: string | null;
  effort: ModelEffort;
  canWrite: boolean;
  participatesInLoop: boolean;
  capabilities: TeamMemberCapability[];
  systemPrompt: string;
};

export type AgentRoomProgressEvent =
  | {
      type: 'run_started';
      runId: string;
      agent: AgentName;
      memberId?: string;
      memberTitle?: string;
      mode: string;
      allowWrites: boolean;
    }
  | {
      type: 'agent_output';
      runId: string;
      agent: AgentName;
      memberId?: string;
      memberTitle?: string;
      stream: 'stdout' | 'stderr';
      text: string;
    }
  | {
      type: 'agent_status';
      runId: string;
      agent: AgentName;
      memberId?: string;
      memberTitle?: string;
      status: AgentCommandProgressEvent['type'];
      text?: string;
      exitCode?: number;
    }
  | {
      type: 'run_finished';
      runId: string;
      agent: AgentName;
      memberId?: string;
      memberTitle?: string;
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
    }
  | {
      type: 'team_updated';
      members: TeamMember[];
    }
  | {
      type: 'tasks_updated';
      tasks: AgentTask[];
    }
  | {
      type: 'task_event';
      event: TaskEvent;
      tasks: AgentTask[];
    };

export type AgentRoomRunOptions = {
  signal?: AbortSignal;
  onProgress?: (event: AgentRoomProgressEvent) => void;
};

function now() {
  return new Date().toISOString();
}

const DEFAULT_TEAM: DefaultMemberDefinition[] = [
  {
    title: 'Lider tecnico',
    provider: 'claude',
    role: 'leader',
    model: 'opus',
    effort: 'high',
    canWrite: false,
    participatesInLoop: true,
    capabilities: ['lead'],
    systemPrompt: 'Coordene o trabalho via Kanban. Crie, priorize e atribua tarefas. Nao implemente nem teste.',
  },
  {
    title: 'Engenheiro Svelar',
    provider: 'codex',
    role: 'engineer',
    model: null,
    effort: 'medium',
    canWrite: true,
    participatesInLoop: true,
    capabilities: ['implement'],
    systemPrompt: 'Implemente apenas a tarefa atribuida, com patches pequenos, seguindo a arquitetura Svelar.',
  },
  {
    title: 'Tester Reviewer',
    provider: 'claude',
    role: 'tester',
    model: 'sonnet',
    effort: 'medium',
    canWrite: false,
    participatesInLoop: true,
    capabilities: ['review', 'test'],
    systemPrompt: 'Revise e teste a tarefa em modo read-only. Aprove somente se nao houver pendencias reais.',
  },
  {
    title: 'Designer UX',
    provider: 'claude',
    role: 'designer',
    model: 'sonnet',
    effort: 'low',
    canWrite: false,
    participatesInLoop: false,
    capabilities: ['design'],
    systemPrompt: 'Atue apenas em design, UX, linguagem de interface e consistencia visual.',
  },
  {
    title: 'Documentador',
    provider: 'claude',
    role: 'documenter',
    model: 'sonnet',
    effort: 'low',
    canWrite: false,
    participatesInLoop: false,
    capabilities: ['document'],
    systemPrompt: 'Documente decisoes, uso e criterios de aceite. Nao implemente nem teste.',
  },
];

async function ensureDefaultTeam(conversationId: string) {
  const existing = await agentRoomRepository.listTeamMembers(conversationId);
  if (existing.length) return existing;

  for (const member of DEFAULT_TEAM) {
    await agentRoomRepository.addTeamMember({ conversationId, ...member });
  }

  return await agentRoomRepository.listTeamMembers(conversationId);
}

export async function listTeamMembers(conversationId: string) {
  await ensureConversation(conversationId);
  return ensureDefaultTeam(conversationId);
}

export async function createTeamMember(conversationId: string, input: Partial<TeamMember>) {
  await ensureConversation(conversationId);
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('Informe um titulo para o membro.');
  const requestedProvider = typeof input.provider === 'string' ? input.provider : '';
  const provider = requestedProvider && hasAgentAdapter(requestedProvider) ? requestedProvider : 'codex';
  const role = (input.role ?? 'custom') as TeamMemberRole;
  const capabilities = input.capabilities?.length ? input.capabilities : capabilitiesForRole(role);

  return await agentRoomRepository.addTeamMember({
    conversationId,
    title,
    provider,
    role,
    model: input.model ?? null,
    effort: input.effort ?? 'medium',
    canWrite: Boolean(input.canWrite),
    participatesInLoop: input.participatesInLoop ?? true,
    capabilities,
    systemPrompt: input.systemPrompt ?? defaultPromptForRole(role),
  });
}

export async function updateTeamMember(memberId: string, input: Partial<TeamMember>) {
  const existing = await agentRoomRepository.getTeamMember(memberId);
  if (!existing) throw new Error('Membro nao encontrado.');
  const updated = await agentRoomRepository.updateTeamMember(memberId, {
    ...input,
    capabilities: input.capabilities?.length ? input.capabilities : undefined,
  });
  if (!updated) throw new Error('Membro nao encontrado.');
  return updated;
}

export async function deleteTeamMember(memberId: string) {
  if (!await agentRoomRepository.deleteTeamMember(memberId)) {
    throw new Error('Membro nao encontrado.');
  }
  return { deleted: true };
}

export async function listTasks(conversationId: string) {
  await ensureConversation(conversationId);
  return await agentRoomRepository.listTasks(conversationId);
}

export async function updateTask(taskId: string, input: Partial<AgentTask>) {
  const existing = await agentRoomRepository.getTask(taskId);
  if (!existing) throw new Error('Task nao encontrada.');
  const updated = await agentRoomRepository.updateTask(taskId, input);
  if (!updated) throw new Error('Task nao encontrada.');
  return updated;
}

function capabilitiesForRole(role: TeamMemberRole): TeamMemberCapability[] {
  if (role === 'leader') return ['lead'];
  if (role === 'engineer') return ['implement'];
  if (role === 'tester') return ['review', 'test'];
  if (role === 'designer') return ['design'];
  if (role === 'documenter') return ['document'];
  return ['review'];
}

function defaultPromptForRole(role: TeamMemberRole) {
  return DEFAULT_TEAM.find((member) => member.role === role)?.systemPrompt ?? 'Atue somente dentro do seu papel definido.';
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

function firstLine(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
}

function taskTitleFromObjective(objective: string) {
  const title = firstLine(objective) ?? 'Continuar a partir do historico recente';
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 90) return normalized;
  return `${normalized.slice(0, 87).trimEnd()}...`;
}

function resolveLoopObjective(message: string, previousMessages: ChatMessage[]) {
  if (!isContinuationCommand(message)) {
    return {
      objective: message,
      resolvedFromHistory: false,
    };
  }

  const recentHistory = previousMessages.slice(-RECENT_MESSAGE_LIMIT);
  if (recentHistory.length) {
    return {
      objective: 'Executar o backlog planejado pelo lider a partir do historico recente da conversa.',
      resolvedFromHistory: true,
    };
  }

  throw new Error('Nao encontrei contexto anterior para continuar. Descreva o objetivo do loop.');
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

  await agentRoomRepository.createAgentRun({
    id: runId,
    conversationId: conversation.id,
    agent: request.agent,
    memberId: request.memberId ?? null,
    taskId: request.taskId ?? null,
    provider: request.agent,
    model: request.model ?? null,
    effort: request.effort ?? null,
    allowWrites: request.allowWrites,
    mode: request.mode,
    prompt: request.prompt,
    startedAt,
  });

  options.onProgress?.({
    type: 'run_started',
    runId,
    agent: request.agent,
    memberId: request.memberId,
    memberTitle: request.memberTitle,
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
          memberId: request.memberId,
          memberTitle: request.memberTitle,
          stream: event.type,
          text: event.text ?? '',
        });
        return;
      }

      options.onProgress?.({
        type: 'agent_status',
        runId,
        agent: request.agent,
        memberId: request.memberId,
        memberTitle: request.memberTitle,
        status: event.type,
        text: event.text,
        exitCode: event.exitCode,
      });
    },
  });

  await agentRoomRepository.finishAgentRun({
    id: runId,
    output: result.content,
    rawOutput: result.rawOutput,
    exitCode: result.exitCode,
    error: result.error,
    finishedAt: now(),
  });

  await agentRoomRepository.addMessage({
    conversationId: conversation.id,
    participant: result.agent,
    content: result.error
      ? `Erro ao executar ${result.memberTitle ?? result.agent}: ${result.content}`
      : result.memberTitle
        ? `${result.memberTitle}:\n${result.content}`
        : result.content,
    metadata: {
      runId,
      memberId: request.memberId,
      memberTitle: request.memberTitle,
      taskId: request.taskId,
      provider: request.agent,
      model: request.model,
      effort: request.effort,
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
    memberId: request.memberId,
    memberTitle: request.memberTitle,
    exitCode: result.exitCode,
    error: result.error,
  });

  return result;
}

async function ensureConversation(id: string) {
  const conversation = await agentRoomRepository.getConversation(id);
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
  const conversation = await ensureConversation(conversationId);
  const message = payload.message.trim();

  if (!message) {
    throw new Error('A mensagem nao pode ficar vazia.');
  }

  if (payload.allowWrites) {
    assertWritableProjectPath(payload.projectPath ?? conversation.projectPath);
  }

  await agentRoomRepository.addMessage({
    conversationId,
    participant: 'user',
    content: message,
    metadata: {
      target: payload.target,
      mode: payload.mode,
      allowWrites: payload.allowWrites,
    },
  });
  const makeRequest = async (agent: AgentName, reviewOf?: AgentRunResult): Promise<AgentRunRequest> => ({
    agent,
    prompt: buildAgentPrompt({
      agent,
      mode: reviewOf ? 'review' : payload.mode,
      userMessage: message,
      history: await agentRoomRepository.listMessages(conversationId),
      reviewOf: reviewOf ? { agent: reviewOf.agent, content: reviewOf.content } : undefined,
    }),
    workingDirectory: payload.projectPath ?? conversation.projectPath ?? undefined,
    mode: reviewOf ? 'review' : payload.mode === 'debate' ? 'chat' : payload.mode,
    allowWrites: payload.allowWrites,
  });

  let results: AgentRunResult[] = [];
  if (payload.target === 'both') {
    const codex = await executeAgent(conversation, await makeRequest('codex'), options);
    const claude = await executeAgent(conversation, await makeRequest('claude'), options);
    results = [codex, claude];
  } else if (payload.target === 'codex_then_claude_review') {
    const codex = await executeAgent(conversation, await makeRequest('codex'), options);
    const claude = await executeAgent(conversation, await makeRequest('claude', codex), options);
    results = [codex, claude];
  } else if (payload.target === 'claude_then_codex_review') {
    const claude = await executeAgent(conversation, await makeRequest('claude'), options);
    const codex = await executeAgent(conversation, await makeRequest('codex', claude), options);
    results = [claude, codex];
  } else {
    results = [await executeAgent(conversation, await makeRequest(payload.target), options)];
  }

  return {
    conversation: await agentRoomRepository.getConversation(conversationId),
    messages: await agentRoomRepository.listMessages(conversationId),
    results,
  };
}

export async function handleDebate(conversationId: string, topic: string, options: AgentRoomRunOptions = {}) {
  return withConversationRun(conversationId, async () => handleDebateUnlocked(conversationId, topic, options));
}

async function handleDebateUnlocked(conversationId: string, topic: string, options: AgentRoomRunOptions) {
  const conversation = await ensureConversation(conversationId);
  const message = topic.trim();

  if (!message) {
    throw new Error('Informe um tema para debater.');
  }

  await agentRoomRepository.addMessage({
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
    const history = await agentRoomRepository.listMessages(conversationId);
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

  await agentRoomRepository.addMessage({
    conversationId,
    participant: 'system',
    content: 'Debate encerrado apos 4 turnos controlados.',
    metadata: { resultCount: results.length },
  });

  return {
    conversation: await agentRoomRepository.getConversation(conversationId),
    messages: await agentRoomRepository.listMessages(conversationId),
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

function memberCan(member: TeamMember, capability: TeamMemberCapability) {
  return member.participatesInLoop && member.capabilities.includes(capability);
}

function requireMember(members: TeamMember[], capability: TeamMemberCapability) {
  const member = members.find((item) => memberCan(item, capability));
  if (!member) {
    throw new Error(`Nenhum membro do time tem capability "${capability}".`);
  }
  return member;
}

function memberForTask(members: TeamMember[], task: AgentTask, capability: TeamMemberCapability) {
  const assigned = task.assigneeId ? members.find((member) => member.id === task.assigneeId) : null;
  if (assigned && memberCan(assigned, capability)) return assigned;
  return requireMember(members, capability);
}

async function selectTask(
  conversationId: string,
  objective: string,
  leader: TeamMember,
  engineer: TeamMember,
  options: { allowCreateFromObjective?: boolean; taskTitle?: string } = {}
) {
  const tasks = await agentRoomRepository.listTasks(conversationId);
  const active = tasks.find((task) => task.status === 'in_progress' || task.status === 'testing' || task.status === 'backlog');
  if (active) return active;

  if (!options.allowCreateFromObjective) {
    throw new Error('Nao ha task aberta. O lider precisa criar o backlog antes da execucao.');
  }

  const task = await agentRoomRepository.addTask({
    conversationId,
    title: options.taskTitle ?? taskTitleFromObjective(objective),
    description: objective,
    status: 'backlog',
    priority: 1,
    assigneeId: engineer.id,
    createdByMemberId: leader.id,
  });
  await agentRoomRepository.addTaskEvent({
    conversationId,
    taskId: task.id,
    type: 'task_created',
    actorMemberId: leader.id,
    content: `${leader.title} criou a task inicial a partir do objetivo do usuario.`,
  });
  return task;
}

function findOpenTask(tasks: AgentTask[]) {
  return tasks.find((task) => task.status === 'in_progress' || task.status === 'testing' || task.status === 'backlog');
}

async function emitTasks(options: AgentRoomRunOptions, conversationId: string) {
  options.onProgress?.({ type: 'tasks_updated', tasks: await agentRoomRepository.listTasks(conversationId) });
}

async function emitTaskEvent(
  options: AgentRoomRunOptions,
  input: {
    conversationId: string;
    taskId: string;
    type: string;
    actorMemberId?: string | null;
    content: string;
    metadata?: Record<string, unknown>;
  }
) {
  const event = await agentRoomRepository.addTaskEvent(input);
  options.onProgress?.({ type: 'task_event', event, tasks: await agentRoomRepository.listTasks(input.conversationId) });
  return event;
}

function formatTaskBoard(tasks: AgentTask[], members: TeamMember[]) {
  const memberName = (id: string | null) => members.find((member) => member.id === id)?.title ?? 'sem responsavel';
  return tasks
    .map((task) => `- [${task.status}] ${task.title} (${memberName(task.assigneeId)})\n  ${truncateText(task.description, 700)}`)
    .join('\n');
}

function buildTaskPrompt(input: {
  member: TeamMember;
  task: AgentTask;
  objective: string;
  history: ChatMessage[];
  tasks: AgentTask[];
  members: TeamMember[];
  mode: AgentLoopPayload['mode'];
  reviewOf?: AgentRunResult;
}) {
  const capabilityRules =
    input.member.role === 'engineer'
      ? '- Voce e engenheiro: implemente somente a task atribuida. Nao aprove nem finalize a propria task.'
      : input.member.role === 'tester'
        ? '- Voce e tester/reviewer: revise em read-only. Se aprovado, termine com STATUS: DONE; se houver pendencia, termine com STATUS: CONTINUE.'
        : input.member.role === 'leader'
          ? '- Voce e lider: coordene apenas via tarefas. Nao implemente, nao teste e nao edite arquivos.'
          : '- Atue somente dentro das suas capabilities e do seu papel.';
  const reviewBlock = input.reviewOf
    ? `\n\nResultado para revisar:\n${truncateText(input.reviewOf.content, REVIEW_CONTENT_CHAR_LIMIT)}`
    : '';

  return `Voce e um membro de uma sala multiagente.

Membro: ${input.member.title}
Provider: ${input.member.provider}
Papel: ${input.member.role}
Capabilities: ${input.member.capabilities.join(', ')}
Modo: ${input.mode}

Prompt permanente do membro:
${input.member.systemPrompt}

Guardrails obrigatorios:
${capabilityRules}
- Nao assuma outro papel.
- Nao trabalhe em task que nao seja a task atual.
- Nao mova status por texto livre; o backend move o Kanban.
- Se faltar algo, diga exatamente o menor proximo passo.

Objetivo do usuario:
${input.objective}

Task atual:
${input.task.title}
Status: ${input.task.status}
Descricao:
${input.task.description}

Kanban atual:
${formatTaskBoard(input.tasks, input.members)}

Historico recente:
${formatHistory(input.history) || 'Sem historico anterior.'}${reviewBlock}

Ultima linha obrigatoria:
STATUS: DONE
ou
STATUS: CONTINUE`;
}

function assertRoleExecution(member: TeamMember, capability: TeamMemberCapability, allowWrites: boolean) {
  if (!memberCan(member, capability)) {
    throw new Error(`${member.title} nao pode executar capability "${capability}".`);
  }
  if (allowWrites && !member.canWrite) {
    throw new Error(`${member.title} nao tem permissao de escrita.`);
  }
  if (member.role === 'leader' && (capability === 'implement' || capability === 'test')) {
    throw new Error('Lider nao pode implementar nem testar.');
  }
  if ((member.role === 'designer' || member.role === 'documenter') && capability === 'test') {
    throw new Error(`${member.title} nao pode atuar como tester.`);
  }
}

function isGitProject(path: string) {
  const result = spawnSync('git', ['-C', path, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    shell: false,
  });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function prepareExecutionDirectory(input: {
  mode: ExecutionMode;
  projectPath: string | null | undefined;
  task: AgentTask;
  member: TeamMember;
}) {
  const projectPath = input.projectPath ? assertWritableProjectPath(input.projectPath) : input.projectPath;
  if (input.mode === 'sequential') return { cwd: projectPath, cleanup: () => undefined };

  if (!projectPath || !isGitProject(projectPath)) {
    throw new Error('Modo paralelo exige um projeto Git selecionado.');
  }

  const branch = `orkestrai/${input.task.id.slice(0, 8)}-${input.member.id.slice(0, 8)}`;
  const worktreePath = resolve(projectsRoot, '.orkestrai-worktrees', `${input.task.id}-${input.member.id}`);
  if (existsSync(worktreePath)) rmSync(worktreePath, { recursive: true, force: true });
  const add = spawnSync('git', ['-C', projectPath, 'worktree', 'add', '-B', branch, worktreePath, 'HEAD'], {
    encoding: 'utf8',
    shell: false,
  });
  if (add.status !== 0) {
    throw new Error(add.stderr.trim() || 'Falha ao criar worktree para execucao paralela.');
  }

  return {
    cwd: worktreePath,
    branch,
    cleanup: () => {
      spawnSync('git', ['-C', projectPath, 'worktree', 'remove', '--force', worktreePath], { shell: false });
      spawnSync('git', ['-C', projectPath, 'branch', '-D', branch], { shell: false });
    },
    merge: () => {
      const merge = spawnSync('git', ['-C', projectPath, 'merge', '--no-ff', '--no-edit', branch], {
        encoding: 'utf8',
        shell: false,
      });
      if (merge.status !== 0) {
        spawnSync('git', ['-C', projectPath, 'merge', '--abort'], { shell: false });
        return merge.stderr.trim() || merge.stdout.trim() || 'Conflito ao integrar worktree.';
      }
      return null;
    },
  };
}

async function handleAgentLoopUnlocked(conversationId: string, payload: AgentLoopPayload, options: AgentRoomRunOptions) {
  const conversation = await ensureConversation(conversationId);
  const message = payload.message.trim();

  if (!message) {
    throw new Error('Informe um objetivo para o loop.');
  }

  if (payload.allowWrites) {
    assertWritableProjectPath(payload.projectPath ?? conversation.projectPath);
  }

  const maxRounds = Math.min(12, Math.max(1, Math.floor(Number(payload.maxRounds) || DEFAULT_LOOP_MAX_ROUNDS)));
  const executionMode = payload.executionMode === 'parallel' ? 'parallel' : 'sequential';
  const members = await ensureDefaultTeam(conversationId);
  const historyBeforeLoop = await agentRoomRepository.listMessages(conversationId);
  const continuationCommand = isContinuationCommand(message);
  const { objective, resolvedFromHistory } = resolveLoopObjective(message, historyBeforeLoop);
  options.onProgress?.({ type: 'team_updated', members });
  await emitTasks(options, conversationId);

  await agentRoomRepository.addMessage({
    conversationId,
    participant: 'user',
    content: message,
    metadata: {
      target: 'ralph_loop',
      mode: payload.mode,
      allowWrites: payload.allowWrites,
      maxRounds,
      executionMode,
      resolvedObjective: resolvedFromHistory ? objective : undefined,
      planningStrategy: 'leader_when_no_open_task',
    },
  });

  const results: AgentRunResult[] = [];
  let completed = false;
  let stoppedByError = false;
  let blocked = false;
  let loopError: string | null = null;
  let roundsRun = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    roundsRun = round;
    const agentMode = payload.mode === 'debate' ? 'chat' : payload.mode;
    const latestMembers = await ensureDefaultTeam(conversationId);
    const leader = requireMember(latestMembers, 'lead');
    const defaultEngineer = requireMember(latestMembers, 'implement');
    const currentTasks = await agentRoomRepository.listTasks(conversationId);
    const currentOpenTask = findOpenTask(currentTasks);
    const needsLeaderPlan = !currentOpenTask || isContinuationNoiseTask(currentOpenTask);

    if (needsLeaderPlan) {
      const planning = await executeAgent(conversation, {
        agent: leader.provider,
        memberId: leader.id,
        memberTitle: leader.title,
        model: leader.model,
        effort: leader.effort,
        prompt: planningService.buildBacklogPlanningPrompt({
          leader,
          userCommand: message,
          isContinuationCommand: continuationCommand,
          history: historyBeforeLoop,
          tasks: currentTasks,
          members: latestMembers,
        }),
        mode: 'plan',
        allowWrites: false,
        workingDirectory: payload.projectPath ?? conversation.projectPath,
      }, options);
      results.push(planning);

      if (planning.error) {
        stoppedByError = true;
        loopError = planning.content;
        break;
      }

      try {
        await createBacklogFromLeaderPlanAction.execute(
          new CreateBacklogFromLeaderPlanDto(
            conversationId,
            leader,
            defaultEngineer.id,
            planning.content,
            currentOpenTask && isContinuationNoiseTask(currentOpenTask) ? currentOpenTask.id : null
          )
        );
        await emitTasks(options, conversationId);
      } catch (error) {
        stoppedByError = true;
        loopError = error instanceof Error ? error.message : 'Falha ao criar backlog a partir do plano do lider.';
        break;
      }
    }

    const task = await selectTask(conversationId, objective, leader, defaultEngineer, {
      allowCreateFromObjective: false,
    });
    const engineer = memberForTask(latestMembers, task, 'implement');
    const tester = memberForTask(latestMembers, { ...task, assigneeId: null }, 'test');
    options.onProgress?.({ type: 'loop_round_started', round, maxRounds });
    await emitTasks(options, conversationId);

    if (task.status === 'done') {
      completed = (await agentRoomRepository.listTasks(conversationId)).every((item) => item.status === 'done');
      if (completed) break;
      continue;
    }

    assertRoleExecution(engineer, 'implement', payload.allowWrites && engineer.canWrite);
    const inProgress = await agentRoomRepository.updateTask(task.id, {
      status: 'in_progress',
      assigneeId: engineer.id,
      blockedReason: null,
    }) ?? task;
    await emitTaskEvent(options, {
      conversationId,
      taskId: inProgress.id,
      type: 'task_started',
      actorMemberId: engineer.id,
      content: `${engineer.title} iniciou implementacao.`,
      metadata: { executionMode },
    });

    const execution = prepareExecutionDirectory({
      mode: executionMode,
      projectPath: payload.projectPath ?? conversation.projectPath,
      task: inProgress,
      member: engineer,
    });

    const implementation = await executeAgent(conversation, {
      agent: engineer.provider,
      memberId: engineer.id,
      memberTitle: engineer.title,
      taskId: inProgress.id,
      model: engineer.model,
      effort: engineer.effort,
      prompt: buildTaskPrompt({
        member: engineer,
        objective,
        task: inProgress,
        history: await agentRoomRepository.listMessages(conversationId),
        tasks: await agentRoomRepository.listTasks(conversationId),
        members: latestMembers,
        mode: payload.mode,
      }),
      mode: agentMode,
      allowWrites: payload.allowWrites && engineer.canWrite,
      workingDirectory: execution.cwd,
    }, options);
    results.push(implementation);

    if (implementation.error) {
      stoppedByError = true;
      execution.cleanup();
      break;
    }

    await agentRoomRepository.updateTask(inProgress.id, {
      status: 'testing',
      assigneeId: tester.id,
      resultSummary: truncateText(implementation.content, 1200),
    });
    await emitTaskEvent(options, {
      conversationId,
      taskId: inProgress.id,
      type: 'task_moved',
      actorMemberId: engineer.id,
      content: `${engineer.title} enviou para testing.`,
    });

    assertRoleExecution(tester, 'test', false);
    const testingTask = await agentRoomRepository.getTask(inProgress.id) ?? inProgress;
    const review = await executeAgent(conversation, {
      agent: tester.provider,
      memberId: tester.id,
      memberTitle: tester.title,
      taskId: testingTask.id,
      model: tester.model,
      effort: tester.effort,
      prompt: buildTaskPrompt({
        member: tester,
        objective,
        task: testingTask,
        history: await agentRoomRepository.listMessages(conversationId),
        tasks: await agentRoomRepository.listTasks(conversationId),
        members: latestMembers,
        mode: 'review',
        reviewOf: implementation,
      }),
      mode: 'review',
      allowWrites: false,
      workingDirectory: payload.projectPath ?? conversation.projectPath,
    }, options);
    results.push(review);

    stoppedByError = Boolean(review.error);
    if (stoppedByError) {
      execution.cleanup();
      break;
    }

    const approved = parseLoopStatus(review.content) === 'done';
    if (approved) {
      const mergeError = executionMode === 'parallel' && execution.merge ? execution.merge() : null;
      if (mergeError) {
        await agentRoomRepository.updateTask(testingTask.id, {
          status: 'in_progress',
          assigneeId: engineer.id,
          blockedReason: mergeError,
        });
        await emitTaskEvent(options, {
          conversationId,
          taskId: testingTask.id,
          type: 'task_blocked',
          actorMemberId: tester.id,
          content: `Conflito ao integrar worktree: ${mergeError}`,
        });
        blocked = true;
        execution.cleanup();
        break;
      }

      await agentRoomRepository.updateTask(testingTask.id, {
        status: 'done',
        assigneeId: tester.id,
        acceptedByMemberId: tester.id,
        blockedReason: null,
        resultSummary: truncateText(review.content, 1200),
      });
      await emitTaskEvent(options, {
        conversationId,
        taskId: testingTask.id,
        type: 'task_completed',
        actorMemberId: tester.id,
        content: `${tester.title} aprovou a task.`,
      });
      execution.cleanup();
    } else {
      await agentRoomRepository.updateTask(testingTask.id, {
        status: 'in_progress',
        assigneeId: engineer.id,
        resultSummary: truncateText(review.content, 1200),
      });
      await emitTaskEvent(options, {
        conversationId,
        taskId: testingTask.id,
        type: 'task_returned',
        actorMemberId: tester.id,
        content: `${tester.title} devolveu a task para implementacao.`,
      });
      execution.cleanup();
    }

    if ((await agentRoomRepository.listTasks(conversationId)).every((item) => item.status === 'done')) {
      completed = true;
      break;
    }
  }

  const content = stoppedByError
    ? `Ralph loop interrompido apos ${roundsRun} rodada(s): ${loopError ?? 'um agente retornou erro.'}`
    : blocked
      ? `Ralph loop pausado apos ${roundsRun} rodada(s): uma task ficou bloqueada e precisa de decisao humana.`
      : completed
        ? `Ralph loop finalizado apos ${roundsRun} rodada(s): todas as tasks obrigatorias estao em done.`
        : `Ralph loop pausado apos atingir o limite de ${maxRounds} rodada(s). Ainda havia tasks abertas.`;

  await agentRoomRepository.addMessage({
    conversationId,
    participant: 'system',
    content,
    metadata: { resultCount: results.length, roundsRun, completed, stoppedByError, blocked, maxRounds, executionMode, loopError },
  });
  options.onProgress?.({ type: 'system', message: content });
  await emitTasks(options, conversationId);

  return {
    conversation: await agentRoomRepository.getConversation(conversationId),
    messages: await agentRoomRepository.listMessages(conversationId),
    tasks: await agentRoomRepository.listTasks(conversationId),
    teamMembers: await agentRoomRepository.listTeamMembers(conversationId),
    results,
  };
}
