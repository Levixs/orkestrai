import type { PresetLocale } from './BuiltinPresetCatalog.js';

type ProtocolCopy = {
  mission: string;
  context: string;
  inputs: string;
  process: string[];
  outputs: string;
  quality: string;
  handoff: string;
  leaderRule: string;
  memberRule: string;
};

const COPY: Record<PresetLocale, ProtocolCopy> = {
  'pt-BR': {
    mission: 'Missão específica',
    context: 'Contexto do time',
    inputs: 'Entrada obrigatória: antes de agir, leia o título, a descrição completa, todas as imagens e a nota vinculada da tarefa. Declare qualquer lacuna antes de começar.',
    process: [
      'Confirme objetivo, restrições, dependências e critério de aceite.',
      'Mantenha o trabalho pequeno, rastreável e compatível com as convenções do projeto.',
      'Registre decisões, riscos e evidências objetivas enquanto trabalha.',
      'Valide o resultado contra os critérios de aceite e execute verificações proporcionais ao risco.',
    ],
    outputs: 'Entregáveis: resultado utilizável, resumo do que mudou, arquivos ou artefatos afetados, verificações executadas e riscos restantes.',
    quality: 'Qualidade: não declare conclusão sem evidência; não omita falhas, limitações, dependências ou trabalho pendente.',
    handoff: 'Handoff: atualize a etapa da tarefa, marque-a como concluída somente quando o escopo estiver entregue e informe o líder citando o id e o título da tarefa.',
    leaderRule: 'Regra do líder: todo trabalho delegado deve nascer no Kanban, com título, descrição autossuficiente, imagens/notas, responsável e etapa. Nunca delegue apenas por mensagem direta. A conclusão de uma tarefa não significa conclusão do projeto.',
    memberRule: 'Regra do membro: não execute uma delegação sem tarefa rastreável no Kanban. Se receber apenas uma mensagem direta, peça ao líder para criar ou indicar a tarefa antes de começar.',
  },
  en: {
    mission: 'Specific mission',
    context: 'Team context',
    inputs: 'Required input: before acting, read the task title, full description, every image, and the linked note. State any missing information before starting.',
    process: [
      'Confirm the objective, constraints, dependencies, and acceptance criteria.',
      'Keep the work focused, traceable, and consistent with project conventions.',
      'Record decisions, risks, and objective evidence while working.',
      'Validate the result against acceptance criteria and run checks proportional to risk.',
    ],
    outputs: 'Deliverables: a usable result, summary of changes, affected files or artifacts, checks performed, and remaining risks.',
    quality: 'Quality: do not claim completion without evidence; do not hide failures, limitations, dependencies, or remaining work.',
    handoff: 'Handoff: update the task stage, mark it complete only when its scope is delivered, and report to the lead with the task id and title.',
    leaderRule: 'Lead rule: every delegated piece of work must start on the Kanban board with a title, self-contained description, images/notes, assignee, and stage. Never delegate through a direct message alone. Completing one task does not mean completing the project.',
    memberRule: 'Member rule: do not execute untracked delegated work. If you receive only a direct message, ask the lead to create or identify the Kanban task before starting.',
  },
  es: {
    mission: 'Misión específica',
    context: 'Contexto del equipo',
    inputs: 'Entrada obligatoria: antes de actuar, lee el título, la descripción completa, todas las imágenes y la nota vinculada de la tarea. Declara cualquier información faltante antes de comenzar.',
    process: [
      'Confirma objetivo, restricciones, dependencias y criterios de aceptación.',
      'Mantén el trabajo enfocado, rastreable y compatible con las convenciones del proyecto.',
      'Registra decisiones, riesgos y evidencias objetivas mientras trabajas.',
      'Valida el resultado contra los criterios de aceptación y ejecuta verificaciones proporcionales al riesgo.',
    ],
    outputs: 'Entregables: resultado utilizable, resumen de cambios, archivos o artefactos afectados, verificaciones realizadas y riesgos restantes.',
    quality: 'Calidad: no declares conclusión sin evidencia; no ocultes fallos, limitaciones, dependencias o trabajo pendiente.',
    handoff: 'Handoff: actualiza la etapa de la tarea, márcala como completada solo al entregar su alcance e informa al líder con el id y el título de la tarea.',
    leaderRule: 'Regla del líder: todo trabajo delegado debe nacer en el Kanban con título, descripción autosuficiente, imágenes/notas, responsable y etapa. Nunca delegues solo por mensaje directo. Completar una tarea no significa completar el proyecto.',
    memberRule: 'Regla del miembro: no ejecutes trabajo delegado sin seguimiento. Si recibes solo un mensaje directo, pide al líder crear o indicar la tarea del Kanban antes de comenzar.',
  },
};

export function completePresetRolePrompt(
  locale: PresetLocale,
  basePrompt: string,
  teamContext: string,
  leader: boolean
): string {
  const copy = COPY[locale];
  return [
    `## ${copy.mission}\n${basePrompt.trim()}`,
    `## ${copy.context}\n${teamContext.trim()}`,
    `## Workflow\n${copy.inputs}\n${copy.process.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
    `## Definition of done\n${copy.outputs}\n${copy.quality}\n${copy.handoff}`,
    `## Kanban\n${leader ? copy.leaderRule : copy.memberRule}`,
  ].join('\n\n');
}

