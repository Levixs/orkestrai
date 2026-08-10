import type { BuiltinPresetRecipe, PresetLocale } from './BuiltinPresetCatalog.js';
import { completePresetRolePrompt } from './PresetRolePrompt.js';

type AgentRecipe = {
  title: string;
  provider: string;
  color: string;
  prompt: string;
};

type GeneralCopy = {
  name: string;
  description: string;
  instructions: string;
  board: string;
  brief: string;
  briefBody: string;
  portal: string;
  task: string;
  taskDescription: string;
  columns: [string, string, string, string, string];
  agents: [AgentRecipe, AgentRecipe, AgentRecipe, AgentRecipe];
};

const GENERAL: Record<PresetLocale, Record<'campaign' | 'brand' | 'content', GeneralCopy>> = {
  'pt-BR': {
    campaign: {
      name: 'Campanha e lançamento',
      description: 'Estratégia, pesquisa, copy e métricas para tirar uma campanha do briefing e levar ao ar.',
      instructions: 'Time de campanha orientado por público, mensagem, canais, entregáveis, calendário e métricas. Toda tarefa deve ter contexto e critério de aprovação compreensível.',
      board: 'Plano da campanha', brief: 'Briefing da campanha', portal: 'Referências e preview',
      briefBody: '# Briefing\n\nRegistre objetivo, público, oferta, mensagem principal, canais, entregáveis, prazo, restrições e métricas de sucesso.',
      task: 'Completar o briefing da campanha',
      taskDescription: 'Consolide objetivo, público, oferta, canais, entregáveis, prazo e métrica principal. Peça ao líder para validar lacunas antes de distribuir o trabalho.',
      columns: ['Briefing', 'Planejado', 'Produção', 'Aprovação', 'Publicado'],
      agents: [
        { title: 'Líder de campanha', provider: 'claude', color: '#7de5ff', prompt: 'Você lidera a campanha. Converta o objetivo em uma estratégia clara, coordene pesquisa, copy, canais e métricas, e só aprove entregáveis que atendam ao briefing.' },
        { title: 'Pesquisador de mercado', provider: 'kimi', color: '#c4a1ff', prompt: 'Você pesquisa público, concorrentes, linguagem, objeções e referências. Diferencie evidência de hipótese e entregue fontes e implicações práticas.' },
        { title: 'Copywriter', provider: 'claude', color: '#ff7a90', prompt: 'Você transforma estratégia em mensagens, conceitos, headlines, roteiros e variações por canal. Preserve a voz da marca e explique as decisões.' },
        { title: 'Especialista de canais e métricas', provider: 'codex', color: '#b7f171', prompt: 'Você prepara distribuição, landing pages, tracking, experimentos e leitura de métricas. Defina eventos, critérios e riscos antes da publicação.' },
      ],
    },
    brand: {
      name: 'Brand e design',
      description: 'Direção criativa, referências, experiência e consistência para projetos de marca e produto.',
      instructions: 'Estúdio de design orientado por problema, público, contexto de uso e consistência de marca. Decisões visuais precisam de intenção, referência e critério de validação.',
      board: 'Studio board', brief: 'Briefing criativo', portal: 'Referências e preview',
      briefBody: '# Briefing criativo\n\nRegistre problema, público, contexto, personalidade, referências, entregáveis, restrições, formatos e critérios de aprovação.',
      task: 'Definir a direção criativa',
      taskDescription: 'Organize o briefing e proponha duas direções distintas com intenção, referências, trade-offs e critério de escolha.',
      columns: ['Briefing', 'Exploração', 'Design', 'Revisão', 'Aprovado'],
      agents: [
        { title: 'Diretor criativo', provider: 'claude', color: '#ff7a90', prompt: 'Você lidera a direção criativa. Proteja o conceito, a clareza e a coerência entre marca, experiência e entregáveis.' },
        { title: 'Pesquisador de referências', provider: 'kimi', color: '#c4a1ff', prompt: 'Você pesquisa repertório visual, padrões do setor, concorrentes e sinais culturais. Traga referências concretas e evite tendências sem relação com o problema.' },
        { title: 'Designer de experiência', provider: 'claude', color: '#7de5ff', prompt: 'Você estrutura jornadas, hierarquia, conteúdo, estados e acessibilidade. Faça o design funcionar para pessoas reais antes de polir.' },
        { title: 'Guardião do design system', provider: 'codex', color: '#b7f171', prompt: 'Você verifica tokens, componentes, responsividade, acessibilidade e consistência de implementação. Registre desvios e proponha correções reutilizáveis.' },
      ],
    },
    content: {
      name: 'Conteúdo e SEO',
      description: 'Pesquisa, pauta, redação, edição e distribuição para produzir conteúdo útil e encontrável.',
      instructions: 'Redação orientada pela intenção do público, evidência, voz da marca e objetivo de negócio. Não publique conteúdo genérico, sem fonte ou sem próximo passo.',
      board: 'Calendário editorial', brief: 'Pauta e critérios', portal: 'Pesquisa e preview',
      briefBody: '# Pauta\n\nRegistre público, intenção, pergunta central, ângulo, fontes, palavra-chave, estrutura, CTA, formato, prazo e canal.',
      task: 'Preparar a primeira pauta',
      taskDescription: 'Escolha uma intenção real do público, reúna fontes confiáveis e proponha ângulo, estrutura, palavra-chave e CTA para aprovação.',
      columns: ['Pauta', 'Planejado', 'Redação', 'Revisão', 'Publicado'],
      agents: [
        { title: 'Editor-chefe', provider: 'claude', color: '#7de5ff', prompt: 'Você lidera a linha editorial, escolhe ângulos, garante utilidade e voz de marca e aprova somente conteúdo claro, preciso e publicável.' },
        { title: 'Pesquisador', provider: 'kimi', color: '#c4a1ff', prompt: 'Você encontra fontes primárias, dados, perguntas do público e lacunas dos concorrentes. Cite fontes e sinalize incertezas.' },
        { title: 'Redator', provider: 'claude', color: '#ff7a90', prompt: 'Você escreve conteúdo claro, específico e humano a partir da pauta e das fontes. Evite enchimento, clichês e afirmações não sustentadas.' },
        { title: 'Especialista SEO e distribuição', provider: 'codex', color: '#b7f171', prompt: 'Você cuida de intenção de busca, estrutura, metadados, links, schema, publicação, distribuição e medição sem sacrificar a leitura.' },
      ],
    },
  },
  en: {
    campaign: {
      name: 'Campaign and launch', description: 'Strategy, research, copy, and measurement to take a campaign from brief to launch.',
      instructions: 'Campaign team organized around audience, message, channels, deliverables, calendar, and measurement. Every task needs context and an understandable approval criterion.',
      board: 'Campaign plan', brief: 'Campaign brief', portal: 'References and preview',
      briefBody: '# Brief\n\nRecord the goal, audience, offer, core message, channels, deliverables, deadline, constraints, and success metrics.',
      task: 'Complete the campaign brief', taskDescription: 'Consolidate the goal, audience, offer, channels, deliverables, deadline, and primary metric. Ask the lead to validate gaps before distributing work.',
      columns: ['Brief', 'Planned', 'Production', 'Approval', 'Published'],
      agents: [
        { title: 'Campaign lead', provider: 'claude', color: '#7de5ff', prompt: 'You lead the campaign. Turn the objective into a clear strategy, coordinate research, copy, channels, and measurement, and approve only work that satisfies the brief.' },
        { title: 'Market researcher', provider: 'kimi', color: '#c4a1ff', prompt: 'You research audiences, competitors, language, objections, and references. Separate evidence from assumptions and provide sources and practical implications.' },
        { title: 'Copywriter', provider: 'claude', color: '#ff7a90', prompt: 'You turn strategy into messages, concepts, headlines, scripts, and channel variants. Preserve the brand voice and explain key choices.' },
        { title: 'Channels and measurement specialist', provider: 'codex', color: '#b7f171', prompt: 'You prepare distribution, landing pages, tracking, experiments, and measurement. Define events, criteria, and risks before launch.' },
      ],
    },
    brand: {
      name: 'Brand and design', description: 'Creative direction, references, experience, and consistency for brand and product work.',
      instructions: 'Design studio organized around the problem, audience, use context, and brand consistency. Visual decisions need intent, references, and a validation criterion.',
      board: 'Studio board', brief: 'Creative brief', portal: 'References and preview',
      briefBody: '# Creative brief\n\nRecord the problem, audience, context, personality, references, deliverables, constraints, formats, and approval criteria.',
      task: 'Define the creative direction', taskDescription: 'Organize the brief and propose two distinct directions with intent, references, trade-offs, and a decision criterion.',
      columns: ['Brief', 'Exploration', 'Design', 'Review', 'Approved'],
      agents: [
        { title: 'Creative director', provider: 'claude', color: '#ff7a90', prompt: 'You lead creative direction. Protect the concept, clarity, and coherence across brand, experience, and deliverables.' },
        { title: 'Reference researcher', provider: 'kimi', color: '#c4a1ff', prompt: 'You research visual repertoire, industry patterns, competitors, and cultural signals. Bring concrete references and avoid trends unrelated to the problem.' },
        { title: 'Experience designer', provider: 'claude', color: '#7de5ff', prompt: 'You structure journeys, hierarchy, content, states, and accessibility. Make the design work for real people before polishing it.' },
        { title: 'Design system steward', provider: 'codex', color: '#b7f171', prompt: 'You verify tokens, components, responsiveness, accessibility, and implementation consistency. Record deviations and propose reusable fixes.' },
      ],
    },
    content: {
      name: 'Content and SEO', description: 'Research, briefs, writing, editing, and distribution for useful, discoverable content.',
      instructions: 'Editorial team guided by audience intent, evidence, brand voice, and business goals. Do not publish generic, unsourced, or directionless content.',
      board: 'Editorial calendar', brief: 'Brief and criteria', portal: 'Research and preview',
      briefBody: '# Content brief\n\nRecord the audience, intent, central question, angle, sources, keyword, structure, CTA, format, deadline, and channel.',
      task: 'Prepare the first content brief', taskDescription: 'Choose a real audience intent, gather reliable sources, and propose an angle, structure, keyword, and CTA for approval.',
      columns: ['Brief', 'Planned', 'Writing', 'Review', 'Published'],
      agents: [
        { title: 'Editor in chief', provider: 'claude', color: '#7de5ff', prompt: 'You lead the editorial direction, choose angles, protect usefulness and brand voice, and approve only clear, accurate, publishable content.' },
        { title: 'Researcher', provider: 'kimi', color: '#c4a1ff', prompt: 'You find primary sources, data, audience questions, and competitor gaps. Cite sources and flag uncertainty.' },
        { title: 'Writer', provider: 'claude', color: '#ff7a90', prompt: 'You write clear, specific, human content from the brief and sources. Avoid filler, clichés, and unsupported claims.' },
        { title: 'SEO and distribution specialist', provider: 'codex', color: '#b7f171', prompt: 'You handle search intent, structure, metadata, links, schema, publishing, distribution, and measurement without hurting readability.' },
      ],
    },
  },
  es: {
    campaign: {
      name: 'Campaña y lanzamiento', description: 'Estrategia, investigación, copy y métricas para llevar una campaña del briefing al lanzamiento.',
      instructions: 'Equipo de campaña organizado por audiencia, mensaje, canales, entregables, calendario y métricas. Cada tarea necesita contexto y un criterio de aprobación comprensible.',
      board: 'Plan de campaña', brief: 'Briefing de campaña', portal: 'Referencias y preview',
      briefBody: '# Briefing\n\nRegistra el objetivo, audiencia, oferta, mensaje central, canales, entregables, plazo, restricciones y métricas de éxito.',
      task: 'Completar el briefing de campaña', taskDescription: 'Consolida objetivo, audiencia, oferta, canales, entregables, plazo y métrica principal. Pide al líder validar vacíos antes de distribuir el trabajo.',
      columns: ['Briefing', 'Planificado', 'Producción', 'Aprobación', 'Publicado'],
      agents: [
        { title: 'Líder de campaña', provider: 'claude', color: '#7de5ff', prompt: 'Lideras la campaña. Convierte el objetivo en una estrategia clara, coordina investigación, copy, canales y métricas, y aprueba solo entregables que cumplen el briefing.' },
        { title: 'Investigador de mercado', provider: 'kimi', color: '#c4a1ff', prompt: 'Investigas audiencias, competidores, lenguaje, objeciones y referencias. Separa evidencia de hipótesis y entrega fuentes e implicaciones prácticas.' },
        { title: 'Copywriter', provider: 'claude', color: '#ff7a90', prompt: 'Transformas estrategia en mensajes, conceptos, titulares, guiones y variantes por canal. Preserva la voz de marca y explica las decisiones.' },
        { title: 'Especialista en canales y métricas', provider: 'codex', color: '#b7f171', prompt: 'Preparas distribución, landing pages, tracking, experimentos y lectura de métricas. Define eventos, criterios y riesgos antes de publicar.' },
      ],
    },
    brand: {
      name: 'Brand y diseño', description: 'Dirección creativa, referencias, experiencia y consistencia para proyectos de marca y producto.',
      instructions: 'Estudio de diseño guiado por problema, audiencia, contexto de uso y consistencia de marca. Las decisiones visuales necesitan intención, referencia y criterio de validación.',
      board: 'Studio board', brief: 'Briefing creativo', portal: 'Referencias y preview',
      briefBody: '# Briefing creativo\n\nRegistra problema, audiencia, contexto, personalidad, referencias, entregables, restricciones, formatos y criterios de aprobación.',
      task: 'Definir la dirección creativa', taskDescription: 'Organiza el briefing y propone dos direcciones distintas con intención, referencias, trade-offs y criterio de elección.',
      columns: ['Briefing', 'Exploración', 'Diseño', 'Revisión', 'Aprobado'],
      agents: [
        { title: 'Director creativo', provider: 'claude', color: '#ff7a90', prompt: 'Lideras la dirección creativa. Protege el concepto, la claridad y la coherencia entre marca, experiencia y entregables.' },
        { title: 'Investigador de referencias', provider: 'kimi', color: '#c4a1ff', prompt: 'Investigas repertorio visual, patrones del sector, competidores y señales culturales. Trae referencias concretas y evita tendencias sin relación con el problema.' },
        { title: 'Diseñador de experiencia', provider: 'claude', color: '#7de5ff', prompt: 'Estructuras recorridos, jerarquía, contenido, estados y accesibilidad. Haz que el diseño funcione para personas reales antes de pulirlo.' },
        { title: 'Guardián del design system', provider: 'codex', color: '#b7f171', prompt: 'Verificas tokens, componentes, responsividad, accesibilidad y consistencia de implementación. Registra desvíos y propone correcciones reutilizables.' },
      ],
    },
    content: {
      name: 'Contenido y SEO', description: 'Investigación, pauta, redacción, edición y distribución para contenido útil y fácil de encontrar.',
      instructions: 'Equipo editorial guiado por la intención de la audiencia, evidencia, voz de marca y objetivo de negocio. No publiques contenido genérico, sin fuentes o sin próximo paso.',
      board: 'Calendario editorial', brief: 'Pauta y criterios', portal: 'Investigación y preview',
      briefBody: '# Pauta\n\nRegistra audiencia, intención, pregunta central, ángulo, fuentes, palabra clave, estructura, CTA, formato, plazo y canal.',
      task: 'Preparar la primera pauta', taskDescription: 'Elige una intención real de la audiencia, reúne fuentes confiables y propone ángulo, estructura, palabra clave y CTA para aprobación.',
      columns: ['Pauta', 'Planificado', 'Redacción', 'Revisión', 'Publicado'],
      agents: [
        { title: 'Editor jefe', provider: 'claude', color: '#7de5ff', prompt: 'Lideras la línea editorial, eliges ángulos, garantizas utilidad y voz de marca y apruebas solo contenido claro, preciso y publicable.' },
        { title: 'Investigador', provider: 'kimi', color: '#c4a1ff', prompt: 'Encuentras fuentes primarias, datos, preguntas de la audiencia y vacíos de competidores. Cita fuentes y señala incertidumbres.' },
        { title: 'Redactor', provider: 'claude', color: '#ff7a90', prompt: 'Escribes contenido claro, específico y humano desde la pauta y las fuentes. Evita relleno, clichés y afirmaciones sin sustento.' },
        { title: 'Especialista SEO y distribución', provider: 'codex', color: '#b7f171', prompt: 'Cuidas intención de búsqueda, estructura, metadatos, enlaces, schema, publicación, distribución y medición sin perjudicar la lectura.' },
      ],
    },
  },
};

const SKILL_COPY: Record<PresetLocale, { description: (title: string) => string; checklist: string[] }> = {
  'pt-BR': {
    description: (title) => `Orientações de trabalho para ${title}.`,
    checklist: [
      'Leia o briefing compartilhado antes de começar.',
      'Registre decisões e evidências nas notas conectadas.',
      'Avance o trabalho pelas etapas do quadro e informe a conclusão ao líder.',
    ],
  },
  en: {
    description: (title) => `Operating guidance for ${title}.`,
    checklist: [
      'Read the shared brief before starting.',
      'Keep decisions and evidence in the connected notes.',
      'Move work through the board stages and report completion to the lead.',
    ],
  },
  es: {
    description: (title) => `Orientaciones de trabajo para ${title}.`,
    checklist: [
      'Lee el briefing compartido antes de comenzar.',
      'Registra decisiones y evidencias en las notas conectadas.',
      'Avanza el trabajo por las etapas del tablero e informa la conclusión al líder.',
    ],
  },
};

function skillPair(locale: PresetLocale, key: string, title: string, instructions: string) {
  const copy = SKILL_COPY[locale];
  const checklist = copy.checklist.map((item) => `- ${item}`).join('\n');
  const content = `---\nname: ${key}\ndescription: ${copy.description(title)}\n---\n\n# ${title}\n\n${instructions}\n\n${checklist}\n`;
  return [
    { relativePath: `.agents/skills/${key}/SKILL.md`, content },
    { relativePath: `.claude/skills/${key}/SKILL.md`, content },
  ];
}

function generalPreset(locale: PresetLocale, key: string, category: 'creative' | 'growth', icon: string, copy: GeneralCopy): BuiltinPresetRecipe {
  const nodes = [
    ...copy.agents.map((agent, index) => ({
      type: 'terminal', title: agent.title,
      x: index === 0 ? 70 : index === 1 ? 660 : index === 2 ? 660 : 1250,
      y: index === 0 ? 80 : index === 1 ? 20 : index === 2 ? 410 : 180,
      width: 520, height: 340, zIndex: 2,
      payload: { command: agent.provider, args: [], provider: agent.provider, role: agent.title, ...(index === 0 ? { maestro: true } : {}) },
    })),
    { type: 'tasks', title: copy.board, x: 70, y: 500, width: 520, height: 400, zIndex: 1, payload: {} },
    { type: 'note', title: copy.brief, x: 1250, y: 560, width: 520, height: 300, zIndex: 1, payload: { content: copy.briefBody } },
    { type: 'portal', title: copy.portal, x: 660, y: 810, width: 600, height: 420, zIndex: 1, payload: { url: 'about:blank' } },
  ];
  return {
    id: `builtin:${key}`, key, name: copy.name, icon, description: copy.description, category,
    data: {
      format: 'orkestrai-preset', version: 2, createdAt: '2026-08-09T00:00:00.000Z',
      workspace: { name: copy.name, icon, instructions: copy.instructions, syncAgentInstructionFiles: true, hooks: {} },
      nodes,
      edges: [1, 2, 3, 4, 5, 6].map((targetIndex) => ({ sourceIndex: 0, targetIndex, style: 'cord' as const })),
      roles: copy.agents.map((agent, index) => ({
        name: agent.title,
        color: agent.color,
        prompt: completePresetRolePrompt(locale, agent.prompt, copy.instructions, index === 0),
      })),
      routines: [],
      tasks: [{ title: copy.task, description: copy.taskDescription, status: 'todo', assigneeTitle: null, noteTitle: copy.brief, images: [] }],
      mcpServers: [],
      taskColumns: [
        { key: 'todo', name: copy.columns[0], color: '#7de5ff', position: 0 },
        { key: 'planned', name: copy.columns[1], color: '#c4a1ff', position: 1 },
        { key: 'doing', name: copy.columns[2], color: '#ffc857', position: 2 },
        { key: 'review', name: copy.columns[3], color: '#ff7a90', position: 3 },
        { key: 'done', name: copy.columns[4], color: '#8ec98e', position: 4 },
      ],
      skills: skillPair(locale, key, copy.name, copy.instructions),
    },
  };
}

type ContributingCopy = {
  name: string; description: string; instructions: string; board: string; consensus: string; consensusBody: string;
  architecture: string; architectureBody: string; files: string; diff: string; flow: string; task: string; taskDescription: string;
  columns: [string, string, string, string, string, string];
  agents: [AgentRecipe, AgentRecipe, AgentRecipe, AgentRecipe, AgentRecipe, AgentRecipe];
  flowPrompts: [string, string, string, string, string, string];
};

const CONTRIBUTING: Record<PresetLocale, ContributingCopy> = {
  'pt-BR': {
    name: 'Orkestrai Contributing', description: 'Time completo para evoluir o Orkestrai com consenso Claude + Codex + Kimi, Svelar, desktop, QA e release.',
    instructions: 'Você contribui no Orkestrai. Antes de criar tarefas, o Líder deve ler AGENTS.md, CLAUDE.md, README e CHANGELOG; pedir análise independente ao Oráculo Codex e ao Oráculo Kimi; sintetizar o plano; e obter APROVADO explícito dos dois. Se qualquer um pedir revisão, ajuste e consulte novamente. Só depois registre o consenso na nota e crie tarefas com título, descrição, imagens/notas, critério de aceite, responsável e etapa. Siga Svelar, i18n pt-BR/en/es, testes, build e changelog no mesmo commit. Mensagens de commit sempre em inglês.',
    board: 'Entrega Orkestrai', consensus: 'Protocolo de consenso',
    consensusBody: '# Protocolo de consenso\n\n1. Líder lê contexto e restrições.\n2. Codex propõe/critica arquitetura.\n3. Kimi faz análise independente de riscos e UX.\n4. Líder sintetiza.\n5. Codex e Kimi respondem **APROVADO** ou **REVISAR** com motivo.\n6. Só após dois APROVADO o líder registra o plano e cria tarefas completas.',
    architecture: 'Mapa do Orkestrai', architectureBody: '# Mapa técnico\n\n- Svelar: route → controller → schema/FormRequest → DTO → service → repository → model → response.\n- Svelte 5 + Paraglide nos três idiomas.\n- PTY/MCP/CLI são contratos críticos.\n- Electron empacota o servidor adapter-node.\n- Releases exigem changelog, assinatura e artefatos validados.',
    files: 'Código e Git', diff: 'Revisão de mudanças', flow: 'Consenso: Claude + Codex + Kimi',
    task: 'Validar a primeira contribuição', taskDescription: 'Leia a solicitação completa, execute o Flow de consenso ou consulte os dois oráculos, registre a decisão na nota e só então decomponha o trabalho.',
    columns: ['Entrada', 'Planejado', 'Em andamento', 'Revisão', 'Validação', 'Feito'],
    agents: [
      { title: 'Líder Orkestrai', provider: 'claude', color: '#7de5ff', prompt: 'Você orquestra a contribuição. Não crie tarefas antes do consenso explícito com os dois oráculos. Depois distribua briefings completos, acompanhe o quadro e integre apenas trabalho revisado, testado e documentado.' },
      { title: 'Oráculo Codex', provider: 'codex', color: '#b7f171', prompt: 'Você é o oráculo técnico. Analise arquitetura, contratos, migrações, concorrência, segurança, testes e regressões. Responda APROVADO apenas quando o plano for executável e verificável; caso contrário responda REVISAR com mudanças concretas.' },
      { title: 'Oráculo Kimi', provider: 'kimi', color: '#c4a1ff', prompt: 'Você é o oráculo crítico. Analise produto, UX, casos extremos, compatibilidade multiplataforma, clareza para não-programadores e riscos esquecidos. Responda APROVADO ou REVISAR com justificativa objetiva.' },
      { title: 'Especialista Svelar', provider: 'codex', color: '#9675ff', prompt: 'Você implementa backend e frontend seguindo estritamente a arquitetura Svelar, geradores, ORM, schemas compartilhados, Svelte 5, Tailwind, shadcn e Paraglide.' },
      { title: 'Engenheiro desktop', provider: 'codex', color: '#ffc857', prompt: 'Você cuida de Electron, PTY, processos, MCP, CLI, atualização e compatibilidade macOS, Windows e Linux. Preserve sessões, dados e higiene de build.' },
      { title: 'QA e release', provider: 'codex', color: '#ff7a90', prompt: 'Você deriva testes dos critérios, revisa acessibilidade e i18n, executa suíte/build, valida artefatos e garante versão, changelog e release notes sincronizados.' },
    ],
    flowPrompts: [
      'Analise a solicitação a seguir e proponha um plano técnico com riscos, contratos afetados e verificação:\n\n{{input}}',
      'Faça uma crítica independente desta proposta. Inclua UX, clareza para não-programadores, multiplataforma e casos extremos:\n\n{{input}}',
      'Sintetize as duas perspectivas em um plano único, pequeno, ordenado e verificável:\n\n{{input}}',
      'Audite a síntese. Responda APROVADO ou REVISAR e liste qualquer mudança obrigatória:\n\n{{input}}',
      'Faça a auditoria final independente. Responda APROVADO ou REVISAR com motivo:\n\n{{input}}',
      'Só se os dois oráculos aprovaram, publique o plano final com critérios de aceite. Caso contrário, incorpore as correções antes de prosseguir:\n\n{{input}}',
    ],
  },
  en: {
    name: 'Orkestrai Contributing', description: 'A complete team for evolving Orkestrai with Claude + Codex + Kimi consensus, Svelar, desktop, QA, and release.',
    instructions: 'You contribute to Orkestrai. Before creating tasks, the Lead must read AGENTS.md, CLAUDE.md, README, and CHANGELOG; request independent analysis from the Codex Oracle and Kimi Oracle; synthesize the plan; and obtain an explicit APPROVED from both. If either requests changes, revise and ask again. Only then record consensus in the note and create tasks with title, description, images/notes, acceptance criteria, owner, and stage. Follow Svelar, pt-BR/en/es i18n, tests, build, and changelog in the same commit. Commit messages are always in English.',
    board: 'Orkestrai delivery', consensus: 'Consensus protocol', consensusBody: '# Consensus protocol\n\n1. Lead reads context and constraints.\n2. Codex proposes or critiques architecture.\n3. Kimi independently reviews risks and UX.\n4. Lead synthesizes.\n5. Codex and Kimi answer **APPROVED** or **REVISE** with a reason.\n6. Only after two approvals does the lead record the plan and create complete tasks.',
    architecture: 'Orkestrai map', architectureBody: '# Technical map\n\n- Svelar: route → controller → schema/FormRequest → DTO → service → repository → model → response.\n- Svelte 5 + Paraglide in three languages.\n- PTY/MCP/CLI are critical contracts.\n- Electron packages the adapter-node server.\n- Releases require changelog, signing, and validated artifacts.',
    files: 'Code and Git', diff: 'Change review', flow: 'Consensus: Claude + Codex + Kimi',
    task: 'Validate the first contribution', taskDescription: 'Read the complete request, run the consensus Flow or consult both oracles, record the decision in the note, and only then break down the work.',
    columns: ['Inbox', 'Planned', 'In progress', 'Review', 'Validation', 'Done'],
    agents: [
      { title: 'Orkestrai Lead', provider: 'claude', color: '#7de5ff', prompt: 'You orchestrate the contribution. Do not create tasks before explicit consensus with both oracles. Then distribute complete briefs, track the board, and integrate only reviewed, tested, documented work.' },
      { title: 'Codex Oracle', provider: 'codex', color: '#b7f171', prompt: 'You are the technical oracle. Review architecture, contracts, migrations, concurrency, security, tests, and regressions. Answer APPROVED only when the plan is executable and verifiable; otherwise answer REVISE with concrete changes.' },
      { title: 'Kimi Oracle', provider: 'kimi', color: '#c4a1ff', prompt: 'You are the critical oracle. Review product, UX, edge cases, cross-platform compatibility, clarity for non-programmers, and overlooked risks. Answer APPROVED or REVISE with an objective reason.' },
      { title: 'Svelar Specialist', provider: 'codex', color: '#9675ff', prompt: 'You implement backend and frontend while strictly following Svelar architecture, generators, ORM, shared schemas, Svelte 5, Tailwind, shadcn, and Paraglide.' },
      { title: 'Desktop Engineer', provider: 'codex', color: '#ffc857', prompt: 'You own Electron, PTY, processes, MCP, CLI, updates, and macOS, Windows, and Linux compatibility. Preserve sessions, data, and build hygiene.' },
      { title: 'QA and Release', provider: 'codex', color: '#ff7a90', prompt: 'You derive tests from criteria, review accessibility and i18n, run the suite/build, validate artifacts, and keep version, changelog, and release notes synchronized.' },
    ],
    flowPrompts: [
      'Analyze the following request and propose a technical plan with risks, affected contracts, and verification:\n\n{{input}}',
      'Independently critique this proposal. Include UX, clarity for non-programmers, cross-platform behavior, and edge cases:\n\n{{input}}',
      'Synthesize both perspectives into one small, ordered, verifiable plan:\n\n{{input}}',
      'Audit the synthesis. Answer APPROVED or REVISE and list any mandatory change:\n\n{{input}}',
      'Perform the final independent audit. Answer APPROVED or REVISE with a reason:\n\n{{input}}',
      'Only if both oracles approved, publish the final plan with acceptance criteria. Otherwise incorporate the required corrections first:\n\n{{input}}',
    ],
  },
  es: {
    name: 'Orkestrai Contributing', description: 'Equipo completo para evolucionar Orkestrai con consenso Claude + Codex + Kimi, Svelar, desktop, QA y release.',
    instructions: 'Contribuyes en Orkestrai. Antes de crear tareas, el Líder debe leer AGENTS.md, CLAUDE.md, README y CHANGELOG; pedir análisis independiente al Oráculo Codex y Oráculo Kimi; sintetizar el plan; y obtener APROBADO explícito de ambos. Si cualquiera pide revisión, ajusta y consulta otra vez. Solo entonces registra el consenso en la nota y crea tareas con título, descripción, imágenes/notas, criterio de aceptación, responsable y etapa. Sigue Svelar, i18n pt-BR/en/es, pruebas, build y changelog en el mismo commit. Los commits siempre van en inglés.',
    board: 'Entrega Orkestrai', consensus: 'Protocolo de consenso', consensusBody: '# Protocolo de consenso\n\n1. Líder lee contexto y restricciones.\n2. Codex propone o critica arquitectura.\n3. Kimi revisa riesgos y UX de forma independiente.\n4. Líder sintetiza.\n5. Codex y Kimi responden **APROBADO** o **REVISAR** con motivo.\n6. Solo tras dos aprobaciones el líder registra el plan y crea tareas completas.',
    architecture: 'Mapa de Orkestrai', architectureBody: '# Mapa técnico\n\n- Svelar: route → controller → schema/FormRequest → DTO → service → repository → model → response.\n- Svelte 5 + Paraglide en tres idiomas.\n- PTY/MCP/CLI son contratos críticos.\n- Electron empaqueta el servidor adapter-node.\n- Releases exigen changelog, firma y artefactos validados.',
    files: 'Código y Git', diff: 'Revisión de cambios', flow: 'Consenso: Claude + Codex + Kimi',
    task: 'Validar la primera contribución', taskDescription: 'Lee la solicitud completa, ejecuta el Flow de consenso o consulta los dos oráculos, registra la decisión en la nota y solo entonces divide el trabajo.',
    columns: ['Entrada', 'Planificado', 'En progreso', 'Revisión', 'Validación', 'Hecho'],
    agents: [
      { title: 'Líder Orkestrai', provider: 'claude', color: '#7de5ff', prompt: 'Orquestas la contribución. No crees tareas antes del consenso explícito con ambos oráculos. Después distribuye briefings completos, acompaña el tablero e integra solo trabajo revisado, probado y documentado.' },
      { title: 'Oráculo Codex', provider: 'codex', color: '#b7f171', prompt: 'Eres el oráculo técnico. Revisa arquitectura, contratos, migraciones, concurrencia, seguridad, pruebas y regresiones. Responde APROBADO solo cuando el plan sea ejecutable y verificable; de lo contrario responde REVISAR con cambios concretos.' },
      { title: 'Oráculo Kimi', provider: 'kimi', color: '#c4a1ff', prompt: 'Eres el oráculo crítico. Revisa producto, UX, casos extremos, compatibilidad multiplataforma, claridad para no-programadores y riesgos olvidados. Responde APROBADO o REVISAR con motivo objetivo.' },
      { title: 'Especialista Svelar', provider: 'codex', color: '#9675ff', prompt: 'Implementas backend y frontend siguiendo estrictamente arquitectura Svelar, generadores, ORM, schemas compartidos, Svelte 5, Tailwind, shadcn y Paraglide.' },
      { title: 'Ingeniero desktop', provider: 'codex', color: '#ffc857', prompt: 'Cuidas Electron, PTY, procesos, MCP, CLI, actualización y compatibilidad macOS, Windows y Linux. Preserva sesiones, datos e higiene de build.' },
      { title: 'QA y release', provider: 'codex', color: '#ff7a90', prompt: 'Derivas pruebas de los criterios, revisas accesibilidad e i18n, ejecutas suite/build, validas artefactos y mantienes versión, changelog y release notes sincronizados.' },
    ],
    flowPrompts: [
      'Analiza la siguiente solicitud y propone un plan técnico con riesgos, contratos afectados y verificación:\n\n{{input}}',
      'Critica esta propuesta de forma independiente. Incluye UX, claridad para no-programadores, multiplataforma y casos extremos:\n\n{{input}}',
      'Sintetiza ambas perspectivas en un plan único, pequeño, ordenado y verificable:\n\n{{input}}',
      'Audita la síntesis. Responde APROBADO o REVISAR y enumera cualquier cambio obligatorio:\n\n{{input}}',
      'Realiza la auditoría final independiente. Responde APROBADO o REVISAR con motivo:\n\n{{input}}',
      'Solo si ambos oráculos aprobaron, publica el plan final con criterios de aceptación. De lo contrario incorpora primero las correcciones:\n\n{{input}}',
    ],
  },
};

function contributingPreset(locale: PresetLocale): BuiltinPresetRecipe {
  const copy = CONTRIBUTING[locale];
  const nodes = [
    ...copy.agents.map((agent, index) => ({
      type: 'terminal', title: agent.title,
      x: index === 0 ? 60 : index === 1 ? 650 : index === 2 ? 650 : index === 3 ? 1240 : index === 4 ? 1240 : 1830,
      y: index === 0 ? 80 : index === 1 ? 20 : index === 2 ? 410 : index === 3 ? 20 : index === 4 ? 410 : 210,
      width: 520, height: 340, zIndex: 2,
      payload: { command: agent.provider, args: [], provider: agent.provider, role: agent.title, ...(index === 0 ? { maestro: true } : {}) },
    })),
    { type: 'tasks', title: copy.board, x: 60, y: 500, width: 720, height: 450, zIndex: 1, payload: {} },
    { type: 'note', title: copy.consensus, x: 830, y: 810, width: 560, height: 340, zIndex: 1, payload: { content: copy.consensusBody } },
    { type: 'note', title: copy.architecture, x: 1430, y: 810, width: 560, height: 340, zIndex: 1, payload: { content: copy.architectureBody } },
    { type: 'fileTree', title: copy.files, x: 2030, y: 650, width: 520, height: 500, zIndex: 1, payload: { path: '' } },
    { type: 'diff', title: copy.diff, x: 2030, y: 80, width: 600, height: 500, zIndex: 1, payload: {} },
    {
      type: 'flow', title: copy.flow, x: 830, y: 1210, width: 720, height: 620, zIndex: 1,
      payload: {
        iterations: 1,
        steps: [
          { kind: 'agent', target: copy.agents[1].title, prompt: copy.flowPrompts[0] },
          { kind: 'agent', target: copy.agents[2].title, prompt: copy.flowPrompts[1] },
          { kind: 'agent', target: copy.agents[0].title, prompt: copy.flowPrompts[2] },
          { kind: 'agent', target: copy.agents[1].title, prompt: copy.flowPrompts[3] },
          { kind: 'agent', target: copy.agents[2].title, prompt: copy.flowPrompts[4] },
          { kind: 'agent', target: copy.agents[0].title, prompt: copy.flowPrompts[5] },
          { kind: 'approval' },
        ],
      },
    },
  ];
  const skills = [
    ...skillPair(locale, 'orkestrai-contributing', copy.name, copy.instructions),
    ...skillPair(locale, 'svelar-conventions', 'Svelar', copy.architectureBody),
    ...skillPair(locale, 'release-discipline', 'Orkestrai release', copy.agents[5].prompt),
  ];
  return {
    id: 'builtin:orkestrai-contributing', key: 'orkestrai-contributing', name: copy.name, icon: 'wrench',
    description: copy.description, category: 'orkestrai',
    data: {
      format: 'orkestrai-preset', version: 2, createdAt: '2026-08-09T00:00:00.000Z',
      workspace: { name: copy.name, icon: 'wrench', instructions: copy.instructions, syncAgentInstructionFiles: true, hooks: {} },
      nodes,
      edges: [
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((targetIndex) => ({ sourceIndex: 0, targetIndex, style: 'cord' as const })),
        { sourceIndex: 11, targetIndex: 1, style: 'cord' },
        { sourceIndex: 11, targetIndex: 2, style: 'cord' },
      ],
      roles: copy.agents.map((agent, index) => ({
        name: agent.title,
        color: agent.color,
        prompt: completePresetRolePrompt(locale, agent.prompt, copy.instructions, index === 0),
      })),
      routines: [],
      tasks: [{ title: copy.task, description: copy.taskDescription, status: 'todo', assigneeTitle: null, noteTitle: copy.consensus, images: [] }],
      mcpServers: [],
      taskColumns: [
        { key: 'todo', name: copy.columns[0], color: '#7de5ff', position: 0 },
        { key: 'planned', name: copy.columns[1], color: '#c4a1ff', position: 1 },
        { key: 'doing', name: copy.columns[2], color: '#ffc857', position: 2 },
        { key: 'review', name: copy.columns[3], color: '#9675ff', position: 3 },
        { key: 'validation', name: copy.columns[4], color: '#ff7a90', position: 4 },
        { key: 'done', name: copy.columns[5], color: '#8ec98e', position: 5 },
      ],
      skills,
    },
  };
}

export function specializedPresetCatalog(locale: PresetLocale): BuiltinPresetRecipe[] {
  const copy = GENERAL[locale];
  return [
    generalPreset(locale, 'campaign-launch', 'growth', 'rocket', copy.campaign),
    generalPreset(locale, 'brand-design', 'creative', 'palette', copy.brand),
    generalPreset(locale, 'content-seo', 'growth', 'globe', copy.content),
    contributingPreset(locale),
  ];
}
