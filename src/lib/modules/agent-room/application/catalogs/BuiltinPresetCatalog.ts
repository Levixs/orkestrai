export type PresetLocale = 'pt-BR' | 'en' | 'es';

export type BuiltinPresetRecipe = {
  id: string;
  key: string;
  name: string;
  icon: string;
  description: string;
  category: 'product' | 'frontend' | 'backend';
  data: {
    format: 'orkestrai-preset';
    version: 2;
    createdAt: string;
    workspace: {
      name: string;
      icon: string;
      instructions: string;
      syncAgentInstructionFiles: boolean;
      hooks: Record<string, unknown>;
    };
    nodes: Array<{
      type: string;
      title: string;
      x: number;
      y: number;
      width: number;
      height: number;
      zIndex: number;
      payload: Record<string, unknown>;
    }>;
    edges: Array<{ sourceIndex: number; targetIndex: number; style: 'cord' }>;
    roles: Array<{ name: string; color: string; prompt: string }>;
    routines: Array<{ targetTitle: string; prompt: string; intervalMinutes: null }>;
    tasks: Array<{
      title: string;
      description: string;
      status: 'todo';
      assigneeTitle: null;
      noteTitle: null;
      images: [];
    }>;
    mcpServers: [];
    skills: Array<{ relativePath: string; content: string }>;
  };
};

type Copy = {
  lead: string;
  engineer: string;
  reviewer: string;
  qa: string;
  board: string;
  brief: string;
  task: string;
  taskDescription: string;
  instructions: (stack: string) => string;
  prompts: {
    lead: (stack: string) => string;
    engineer: (stack: string) => string;
    reviewer: (stack: string) => string;
    qa: (stack: string) => string;
  };
  skill: (stack: string, guidance: string) => string;
};

const COPY: Record<PresetLocale, Copy> = {
  'pt-BR': {
    lead: 'Líder técnico',
    engineer: 'Engenheiro de implementação',
    reviewer: 'Revisor de arquitetura',
    qa: 'Engenheiro de qualidade',
    board: 'Plano de entrega',
    brief: 'Contexto do produto',
    task: 'Definir o primeiro incremento',
    taskDescription: 'Leia o contexto do projeto, proponha um incremento pequeno e verificável e confirme os critérios de aceite com o líder.',
    instructions: (stack) => `Time preparado para entregar ${stack} com planejamento, implementação, revisão e validação independentes.`,
    prompts: {
      lead: (stack) => `Você lidera entregas em ${stack}. Leia título, descrição, imagens e notas de cada tarefa antes de delegar. Transforme requisitos em critérios verificáveis, mantenha o quadro atualizado e integre apenas trabalho revisado e testado.`,
      engineer: (stack) => `Você implementa ${stack}. Siga as convenções do repositório, mantenha mudanças focadas, escreva testes proporcionais ao risco e reporte ao líder evidências objetivas da verificação.`,
      reviewer: (stack) => `Você revisa arquitetura e código em ${stack}. Procure regressão, contratos quebrados, riscos de segurança, acessibilidade e manutenção. Não aprove sem evidências.`,
      qa: (stack) => `Você valida entregas em ${stack}. Derive cenários dos critérios de aceite, execute testes focados e de regressão e reporte passos reproduzíveis para qualquer falha.`,
    },
    skill: (stack, guidance) => `---\nname: ${stack.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\ndescription: Convenções de implementação para ${stack}.\n---\n\n# ${stack}\n\n${guidance}\n\n- Leia as convenções locais antes de alterar código.\n- Prefira os geradores e abstrações existentes no projeto.\n- Valide tipos, testes e build antes de concluir.\n`,
  },
  en: {
    lead: 'Technical lead',
    engineer: 'Implementation engineer',
    reviewer: 'Architecture reviewer',
    qa: 'Quality engineer',
    board: 'Delivery plan',
    brief: 'Product context',
    task: 'Define the first increment',
    taskDescription: 'Read the project context, propose a small verifiable increment, and confirm acceptance criteria with the lead.',
    instructions: (stack) => `Team prepared to deliver ${stack} with independent planning, implementation, review, and validation.`,
    prompts: {
      lead: (stack) => `You lead ${stack} delivery. Read every task title, description, image, and linked note before delegating. Turn requirements into verifiable criteria, keep the board current, and integrate only reviewed and tested work.`,
      engineer: (stack) => `You implement ${stack}. Follow repository conventions, keep changes focused, write tests proportional to risk, and report objective verification evidence to the lead.`,
      reviewer: (stack) => `You review ${stack} architecture and code. Look for regressions, broken contracts, security risks, accessibility issues, and maintenance costs. Do not approve without evidence.`,
      qa: (stack) => `You validate ${stack} deliveries. Derive scenarios from acceptance criteria, run focused and regression tests, and report reproducible steps for every failure.`,
    },
    skill: (stack, guidance) => `---\nname: ${stack.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\ndescription: Implementation conventions for ${stack}.\n---\n\n# ${stack}\n\n${guidance}\n\n- Read local conventions before changing code.\n- Prefer the project's existing generators and abstractions.\n- Validate types, tests, and the build before finishing.\n`,
  },
  es: {
    lead: 'Líder técnico',
    engineer: 'Ingeniero de implementación',
    reviewer: 'Revisor de arquitectura',
    qa: 'Ingeniero de calidad',
    board: 'Plan de entrega',
    brief: 'Contexto del producto',
    task: 'Definir el primer incremento',
    taskDescription: 'Lee el contexto del proyecto, propón un incremento pequeño y verificable y confirma los criterios de aceptación con el líder.',
    instructions: (stack) => `Equipo preparado para entregar ${stack} con planificación, implementación, revisión y validación independientes.`,
    prompts: {
      lead: (stack) => `Lideras entregas en ${stack}. Lee el título, la descripción, las imágenes y las notas de cada tarea antes de delegar. Convierte requisitos en criterios verificables, mantén el tablero actualizado e integra solo trabajo revisado y probado.`,
      engineer: (stack) => `Implementas ${stack}. Sigue las convenciones del repositorio, mantén los cambios enfocados, escribe pruebas proporcionales al riesgo e informa al líder evidencias objetivas de verificación.`,
      reviewer: (stack) => `Revisas arquitectura y código en ${stack}. Busca regresiones, contratos rotos, riesgos de seguridad, accesibilidad y mantenimiento. No apruebes sin evidencias.`,
      qa: (stack) => `Validas entregas en ${stack}. Deriva escenarios de los criterios de aceptación, ejecuta pruebas enfocadas y de regresión e informa pasos reproducibles para cada fallo.`,
    },
    skill: (stack, guidance) => `---\nname: ${stack.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\ndescription: Convenciones de implementación para ${stack}.\n---\n\n# ${stack}\n\n${guidance}\n\n- Lee las convenciones locales antes de cambiar código.\n- Prefiere los generadores y abstracciones existentes del proyecto.\n- Valida tipos, pruebas y build antes de finalizar.\n`,
  },
};

const DEFINITIONS = [
  {
    key: 'product-team', icon: 'briefcase', category: 'product' as const,
    stack: 'Product engineering',
    stackLabels: { 'pt-BR': 'engenharia de produto', en: 'product engineering', es: 'ingeniería de producto' },
    guidance: {
      'pt-BR': 'Trabalhe a partir dos resultados para o usuário e dos critérios de aceite. Mantenha explícitas as responsabilidades de produto, engenharia, revisão e QA.',
      en: 'Work from user outcomes and acceptance criteria. Keep product, engineering, review, and QA responsibilities explicit.',
      es: 'Trabaja a partir de los resultados para el usuario y los criterios de aceptación. Mantén explícitas las responsabilidades de producto, ingeniería, revisión y QA.',
    },
    names: { 'pt-BR': 'Time de produto', en: 'Product team', es: 'Equipo de producto' },
    descriptions: {
      'pt-BR': 'Líder, implementação, arquitetura e QA para entregar funcionalidades de ponta a ponta.',
      en: 'Lead, implementation, architecture, and QA for end-to-end product delivery.',
      es: 'Liderazgo, implementación, arquitectura y QA para entregas de producto de punta a punta.',
    },
  },
  {
    key: 'react-team', icon: 'code', category: 'frontend' as const, stack: 'React',
    stackLabels: { 'pt-BR': 'React', en: 'React', es: 'React' },
    guidance: {
      'pt-BR': 'Use componentes funcionais, semântica acessível, limites estáveis de estado e a stack de testes do repositório.',
      en: 'Use function components, accessible semantics, stable state boundaries, and the repository testing stack.',
      es: 'Usa componentes funcionales, semántica accesible, límites de estado estables y la stack de pruebas del repositorio.',
    },
    names: { 'pt-BR': 'Time React', en: 'React team', es: 'Equipo React' },
    descriptions: { 'pt-BR': 'Especialistas em React, arquitetura frontend, testes e acessibilidade.', en: 'React specialists for frontend architecture, testing, and accessibility.', es: 'Especialistas en React, arquitectura frontend, pruebas y accesibilidad.' },
  },
  {
    key: 'nextjs-team', icon: 'globe', category: 'frontend' as const, stack: 'Next.js',
    stackLabels: { 'pt-BR': 'Next.js', en: 'Next.js', es: 'Next.js' },
    guidance: {
      'pt-BR': 'Respeite os limites entre componentes de servidor e cliente, as convenções de rotas, a semântica de cache, os metadados e as restrições de deploy.',
      en: 'Respect server and client component boundaries, route conventions, caching semantics, metadata, and deployment constraints.',
      es: 'Respeta los límites entre componentes de servidor y cliente, las convenciones de rutas, la semántica de caché, los metadatos y las restricciones de despliegue.',
    },
    names: { 'pt-BR': 'Time Next.js', en: 'Next.js team', es: 'Equipo Next.js' },
    descriptions: { 'pt-BR': 'App Router, renderização, dados, performance e testes com responsabilidades claras.', en: 'App Router, rendering, data, performance, and testing with clear ownership.', es: 'App Router, renderizado, datos, rendimiento y pruebas con responsabilidades claras.' },
  },
  {
    key: 'sveltekit-team', icon: 'zap', category: 'frontend' as const, stack: 'SvelteKit',
    stackLabels: { 'pt-BR': 'SvelteKit', en: 'SvelteKit', es: 'SvelteKit' },
    guidance: {
      'pt-BR': 'Use runes do Svelte 5 nos componentes, mantenha explícitos os limites do servidor e siga as convenções de rotas e formulários do SvelteKit.',
      en: 'Use Svelte 5 runes in components, keep server boundaries explicit, and follow SvelteKit routing and form conventions.',
      es: 'Usa runes de Svelte 5 en los componentes, mantén explícitos los límites del servidor y sigue las convenciones de rutas y formularios de SvelteKit.',
    },
    names: { 'pt-BR': 'Time SvelteKit', en: 'SvelteKit team', es: 'Equipo SvelteKit' },
    descriptions: { 'pt-BR': 'Svelte 5, rotas, dados, UX e verificação para produtos SvelteKit.', en: 'Svelte 5, routing, data, UX, and verification for SvelteKit products.', es: 'Svelte 5, rutas, datos, UX y verificación para productos SvelteKit.' },
  },
  {
    key: 'svelar-team', icon: 'boxes', category: 'product' as const, stack: 'Svelar',
    stackLabels: { 'pt-BR': 'Svelar', en: 'Svelar', es: 'Svelar' },
    guidance: {
      'pt-BR': 'Siga a arquitetura route-to-response do Svelar e use geradores da CLI, schemas compartilhados, repositórios ORM, policies e serviços do framework.',
      en: 'Follow the Svelar route-to-response architecture, use CLI generators, shared schemas, ORM repositories, policies, and framework services.',
      es: 'Sigue la arquitectura route-to-response de Svelar y usa generadores de CLI, schemas compartidos, repositorios ORM, policies y servicios del framework.',
    },
    names: { 'pt-BR': 'Time Svelar', en: 'Svelar team', es: 'Equipo Svelar' },
    descriptions: { 'pt-BR': 'Arquitetura Svelar completa, frontend Svelte 5, qualidade e operação.', en: 'Complete Svelar architecture, Svelte 5 frontend, quality, and operations.', es: 'Arquitectura Svelar completa, frontend Svelte 5, calidad y operación.' },
  },
  {
    key: 'laravel-team', icon: 'database', category: 'backend' as const, stack: 'Laravel',
    stackLabels: { 'pt-BR': 'Laravel', en: 'Laravel', es: 'Laravel' },
    guidance: {
      'pt-BR': 'Use a validação do framework, actions e services, repositórios Eloquent, policies, jobs, events, migrations e testes de feature focados.',
      en: 'Use framework validation, actions and services, Eloquent repositories, policies, jobs, events, migrations, and focused feature tests.',
      es: 'Usa la validación del framework, actions y services, repositorios Eloquent, policies, jobs, events, migrations y pruebas funcionales enfocadas.',
    },
    names: { 'pt-BR': 'Time Laravel', en: 'Laravel team', es: 'Equipo Laravel' },
    descriptions: { 'pt-BR': 'Backend Laravel com arquitetura, implementação, revisão e testes de feature.', en: 'Laravel backend with architecture, implementation, review, and feature tests.', es: 'Backend Laravel con arquitectura, implementación, revisión y pruebas funcionales.' },
  },
] as const;

function skillFiles(stack: string, content: string) {
  const slug = stack.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [
    { relativePath: `.agents/skills/${slug}/SKILL.md`, content },
    { relativePath: `.claude/skills/${slug}/SKILL.md`, content },
  ];
}

export function normalizePresetLocale(value: unknown): PresetLocale {
  return value === 'en' || value === 'es' ? value : 'pt-BR';
}

export function builtinPresetCatalog(locale: PresetLocale): BuiltinPresetRecipe[] {
  const copy = COPY[locale];
  return DEFINITIONS.map((definition) => {
    const stack = definition.stackLabels[locale];
    const roles = [
      { name: copy.lead, color: '#7DE5FF', prompt: copy.prompts.lead(stack) },
      { name: copy.engineer, color: '#B7F171', prompt: copy.prompts.engineer(stack) },
      { name: copy.reviewer, color: '#FFC857', prompt: copy.prompts.reviewer(stack) },
      { name: copy.qa, color: '#FF7A90', prompt: copy.prompts.qa(stack) },
    ];
    const nodes = [
      { type: 'terminal', title: copy.lead, x: 80, y: 90, width: 520, height: 340, zIndex: 2, payload: { command: 'claude', args: [], provider: 'claude', role: copy.lead, maestro: true } },
      { type: 'terminal', title: copy.engineer, x: 690, y: 40, width: 520, height: 340, zIndex: 2, payload: { command: 'codex', args: [], provider: 'codex', role: copy.engineer } },
      { type: 'terminal', title: copy.reviewer, x: 690, y: 440, width: 520, height: 340, zIndex: 2, payload: { command: 'kimi', args: [], provider: 'kimi', role: copy.reviewer } },
      { type: 'terminal', title: copy.qa, x: 1300, y: 240, width: 520, height: 340, zIndex: 2, payload: { command: 'codex', args: [], provider: 'codex', role: copy.qa } },
      { type: 'tasks', title: copy.board, x: 80, y: 500, width: 520, height: 400, zIndex: 1, payload: {} },
      { type: 'note', title: copy.brief, x: 1300, y: 640, width: 520, height: 260, zIndex: 1, payload: { content: copy.instructions(stack) } },
    ];
    return {
      id: `builtin:${definition.key}`,
      key: definition.key,
      name: definition.names[locale],
      icon: definition.icon,
      description: definition.descriptions[locale],
      category: definition.category,
      data: {
        format: 'orkestrai-preset',
        version: 2,
        createdAt: '2026-08-09T00:00:00.000Z',
        workspace: {
          name: definition.names[locale],
          icon: definition.icon,
          instructions: copy.instructions(stack),
          syncAgentInstructionFiles: true,
          hooks: {},
        },
        nodes,
        edges: [
          { sourceIndex: 0, targetIndex: 1, style: 'cord' },
          { sourceIndex: 0, targetIndex: 2, style: 'cord' },
          { sourceIndex: 0, targetIndex: 3, style: 'cord' },
          { sourceIndex: 0, targetIndex: 4, style: 'cord' },
          { sourceIndex: 0, targetIndex: 5, style: 'cord' },
        ],
        roles,
        routines: [],
        tasks: [{
          title: copy.task,
          description: copy.taskDescription,
          status: 'todo',
          assigneeTitle: null,
          noteTitle: null,
          images: [],
        }],
        mcpServers: [],
        skills: skillFiles(definition.stack, copy.skill(stack, definition.guidance[locale])),
      },
    };
  });
}
