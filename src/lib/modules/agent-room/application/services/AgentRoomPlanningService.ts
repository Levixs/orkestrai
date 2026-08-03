import { Service } from '@beeblock/svelar/services';
import type { AgentTask, ChatMessage, TeamMember } from '$lib/modules/agent-room/domain/types.js';
import type { PlannedBacklogTaskDto } from '$lib/modules/agent-room/application/dto/AgentRoomDtos.js';

const MAX_TASKS = 8;

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 40).trimEnd()}\n...[trecho truncado]`;
}

function compactTitle(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeCommand(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isContinuationCommand(text: string) {
  const normalized = normalizeCommand(text).replace(/[.!?]+$/g, '').trim();
  return /^(continua|continue|continuem|continuar|segue|seguir|siga|prossiga|prossigam|vai|bora|next|go on|keep going|continue please)$/.test(
    normalized
  );
}

export function isContinuationNoiseTask(task: Pick<AgentTask, 'title' | 'description'>) {
  return (
    isContinuationCommand(task.title) ||
    task.title === 'Continuar pelo proximo passo concreto do historico' ||
    task.title.includes('trecho truncado') ||
    task.description.includes('comando de continuidade') ||
    task.description.includes('Continuar a partir do historico recente:') ||
    task.description.includes('\nUSER:') ||
    task.description.includes('\nSYSTEM:') ||
    task.description.includes('\nCODEX:') ||
    task.description.includes('\nCLAUDE:')
  );
}

function formatHistoryForPlanning(messages: ChatMessage[]) {
  return messages
    .slice(-12)
    .map((message) => `${message.participant.toUpperCase()}:\n${truncateText(message.content, 1800)}`)
    .join('\n\n');
}

function formatTasksForPlanning(tasks: AgentTask[], members: TeamMember[]) {
  if (!tasks.length) return 'Nenhuma task criada ainda.';
  const memberName = (id: string | null) => members.find((member) => member.id === id)?.title ?? 'sem responsavel';
  return tasks
    .map((task) => `- [${task.status}] ${task.title} (${memberName(task.assigneeId)})\n  ${truncateText(task.description, 600)}`)
    .join('\n');
}

function extractJsonValue(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) return fenced;

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) return text.slice(objectStart, objectEnd + 1);

  return text.trim();
}

function taskListFromParsedJson(parsed: unknown) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.tasks)) return record.tasks;
    if (Array.isArray(record.backlog)) return record.backlog;
  }
  return [];
}

function cleanPlannedTask(input: unknown, index: number): PlannedBacklogTaskDto | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const title = String(record.title ?? '').trim();
  const description = String(record.description ?? record.details ?? title).trim();
  const priority = Number(record.priority ?? MAX_TASKS - index);

  if (title.length < 8 || description.length < 12 || isContinuationCommand(title)) return null;
  if (title === 'Continuar pelo proximo passo concreto do historico') return null;

  return {
    title: compactTitle(title, 120),
    description: truncateText(description, 1800),
    priority: Number.isFinite(priority) ? Math.max(0, Math.floor(priority)) : MAX_TASKS - index,
  };
}

export class AgentRoomPlanningService extends Service {
  buildBacklogPlanningPrompt(input: {
    leader: TeamMember;
    userCommand: string;
    isContinuationCommand: boolean;
    history: ChatMessage[];
    tasks: AgentTask[];
    members: TeamMember[];
  }) {
    const requestContext = input.isContinuationCommand
      ? `O usuario enviou apenas "${input.userCommand}", que significa continuar o trabalho. Isso NAO e uma task.`
      : `Pedido atual do usuario:
${input.userCommand}

O pedido atual pode conter varias entregas. Transforme isso em backlog antes de qualquer execucao.`;

    return `Voce e o lider tecnico da sala multiagente.

Membro: ${input.leader.title}
Papel: ${input.leader.role}
Capabilities: ${input.leader.capabilities.join(', ')}

${requestContext}

Sua responsabilidade:
- Leia o pedido atual, o historico recente e o Kanban atual.
- Identifique o planejamento e o trabalho ainda nao materializado em tasks.
- Crie um backlog real, com tasks concretas e compreensiveis para um usuario humano.
- Quebre pedidos grandes em tasks pequenas que caibam em uma rodada curta de agente.
- Nao implemente, nao teste e nao escreva codigo.
- Nao crie tasks genericas como "continuar pelo historico".
- Nao coloque o historico bruto nem o pedido inteiro dentro de titulo ou descricao.
- Se o usuario pediu para criar tasks, sua resposta deve ser o backlog dessas tasks.

Kanban atual:
${formatTasksForPlanning(input.tasks, input.members)}

Historico recente:
${formatHistoryForPlanning(input.history) || 'Sem historico anterior.'}

Responda SOMENTE com JSON valido neste formato:
{
  "tasks": [
    {
      "title": "Titulo concreto da task",
      "description": "O que deve ser feito, por que importa e criterio de aceite objetivo.",
      "priority": 100
    }
  ]
}`;
  }

  parseBacklogPlan(output: string): PlannedBacklogTaskDto[] {
    try {
      const parsed = JSON.parse(extractJsonValue(output));
      return taskListFromParsedJson(parsed)
        .map((item, index) => cleanPlannedTask(item, index))
        .filter((item): item is PlannedBacklogTaskDto => Boolean(item))
        .slice(0, MAX_TASKS);
    } catch {
      return [];
    }
  }
}
