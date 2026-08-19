import type { CreateDesignExplorationDto } from '../application/dto/CreateDesignExplorationDto.js';
import type { CanvasNode } from './types.js';

export const DESIGN_EXPLORATION_DIRECTIONS = ['clarity', 'expressive', 'efficient'] as const;
export type DesignExplorationDirection = (typeof DESIGN_EXPLORATION_DIRECTIONS)[number];

export function isDesignExplorationPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as { workflowKind?: unknown; explorationId?: unknown };
  return value.workflowKind === 'design-exploration' || typeof value.explorationId === 'string';
}

export type DesignExplorationCopy = {
  groupTitle: string;
  noteTitle: string;
  directions: Record<DesignExplorationDirection, { title: string; intent: string }>;
  tasks: Array<{
    kind: 'brief' | 'concept' | 'review' | 'expand' | 'implement' | 'validate';
    direction?: DesignExplorationDirection;
    title: string;
    description: string;
  }>;
  brief: {
    section: string;
    objective: string;
    audience: string;
    platform: string;
    codeTarget: string;
    visualModes: string;
    constraints: string;
    references: string;
    independentDirections: string;
    requiredOutput: string;
    conceptOutput: string;
    conceptOutputs: string[];
    expansionOutput: string;
    outputs: string[];
    codeDelivery: string;
    decisionGate: string;
    decisionBody: string;
    linkedSpec: string;
    lightDark: string;
    singleMode: string;
  };
};

const copy: Record<CreateDesignExplorationDto['locale'], DesignExplorationCopy> = {
  'pt-BR': {
    groupTitle: 'Exploração de UI - 3 direções completas',
    noteTitle: 'Spec - 3 direções completas de UI',
    directions: {
      clarity: { title: 'UI A - Clareza', intent: 'Hierarquia direta, baixa carga cognitiva e acessibilidade.' },
      expressive: { title: 'UI B - Expressiva', intent: 'Identidade marcante, motion e diferenciação visual.' },
      efficient: { title: 'UI C - Eficiente', intent: 'Densidade, produtividade e escala para uso recorrente.' },
    },
    tasks: [
      { kind: 'brief', title: '1. Fechar brief e critérios', description: 'Valide objetivo, público, plataforma, conteúdo, restrições, stack, referências e critérios mensuráveis. Inspecione código, tokens e componentes existentes antes de delegar.' },
      { kind: 'concept', direction: 'clarity', title: '2A. Conceito A - Clareza', description: 'Crie somente o conceito visual da direção A: uma tela principal desktop e uma mobile representativas. Use design_import_code com HTML/CSS semântico para obter layers nativas rapidamente, ou design_create_elements quando o scene graph for menor. Limite-se a 30-120 layers úteis, aplique a primeira revisão em até 5 minutos e não produza ainda catálogo de estados, biblioteca completa de tokens, componentes, protótipo ou código final. Rode a auditoria estrutural, confira visualmente as duas telas e marque a tarefa pronta para revisão humana.' },
      { kind: 'concept', direction: 'expressive', title: '2B. Conceito B - Expressiva', description: 'Crie somente o conceito visual da direção B: uma tela principal desktop e uma mobile representativas. Use design_import_code com HTML/CSS semântico para obter layers nativas rapidamente, ou design_create_elements quando o scene graph for menor. Limite-se a 30-120 layers úteis, aplique a primeira revisão em até 5 minutos e não produza ainda catálogo de estados, biblioteca completa de tokens, componentes, protótipo ou código final. Rode a auditoria estrutural, confira visualmente as duas telas e marque a tarefa pronta para revisão humana.' },
      { kind: 'concept', direction: 'efficient', title: '2C. Conceito C - Eficiente', description: 'Crie somente o conceito visual da direção C: uma tela principal desktop e uma mobile representativas. Use design_import_code com HTML/CSS semântico para obter layers nativas rapidamente, ou design_create_elements quando o scene graph for menor. Limite-se a 30-120 layers úteis, aplique a primeira revisão em até 5 minutos e não produza ainda catálogo de estados, biblioteca completa de tokens, componentes, protótipo ou código final. Rode a auditoria estrutural, confira visualmente as duas telas e marque a tarefa pronta para revisão humana.' },
      { kind: 'review', title: '3. Revisar conceitos e decidir', description: 'Abra cada conceito em tamanho legível, avalie hierarquia, composição, clareza, marca, responsividade e acabamento. A auditoria automática é apenas estrutural e não substitui esta inspeção. Uma pessoa deve aprovar uma direção no gate de Revisão visual ou solicitar alterações com feedback rastreável antes de qualquer expansão.' },
      { kind: 'expand', title: '4. Expandir direção aprovada', description: 'Somente depois da aprovação humana, expanda a direção aprovada para todas as áreas e estados exigidos. Então crie tokens Light/Dark, bindings, componentes e variantes, protótipo, motion reduzido e evidências. Não expanda direções rejeitadas ou ainda pendentes.' },
      { kind: 'implement', title: '5. Implementar direção aprovada', description: 'Gere o preview na stack real apenas da direção aprovada, revise arquivos e mappings e aplique com revisão e hash, preservando os vínculos com design, tokens e componentes.' },
      { kind: 'validate', title: '6. Validar e entregar ponta a ponta', description: 'Abra o Portal, compare desktop e mobile com o Design aprovado, corrija regressões, execute quality gate e testes e registre a entrega no Review Center.' },
    ],
    brief: {
      section: 'Brief', objective: 'Objetivo', audience: 'Público', platform: 'Plataforma', codeTarget: 'Destino do código', visualModes: 'Modos visuais', constraints: 'Restrições', references: 'Referências', independentDirections: 'Direções independentes', requiredOutput: 'Entrega obrigatória de cada direção', conceptOutput: 'Primeiro gate - conceito visual',
      conceptOutputs: [
        'Uma tela principal desktop e uma mobile, nativas e editáveis, com 30-120 layers úteis.',
        'Primeira revisão visível em até 5 minutos; prefira importação semântica HTML/CSS em vez de centenas de objetos JSON.',
        'Inspeção visual humana obrigatória. Contagem de layers e auditoria estrutural não comprovam qualidade visual.',
      ],
      expansionOutput: 'Somente após uma direção ser aprovada',
      outputs: [
        'Documento Design nativo e editável, com frames responsivos e estados vazio, carregando, erro e sucesso.',
        'Tokens tipados de cor, tipografia, espaçamento, raio, efeitos e motion, vinculados às layers reais.',
        'Componentes reutilizáveis, variantes, propriedades e mappings do código existente quando disponíveis.',
        'Protótipo navegável cobrindo o fluxo crítico de interação.',
        'Auditoria de nomes, clipping, sobreposição, contraste WCAG e acessibilidade sem erros críticos.',
      ],
      codeDelivery: 'Preview de código, lista de arquivos, evidência visual, risco técnico e trade-offs de UX.',
      decisionGate: 'Decisão e entrega',
      decisionBody: 'Compare as três direções antes de implementar. Uma pessoa deve aprovar uma direção ou combinação explícita. Depois, revise o preview do código, aplique com revisão e hash do arquivo, valide o Portal em desktop e mobile, rode os testes e registre a decisão final no Review Center.',
      linkedSpec: 'Spec vinculada', lightDark: 'Light + Dark', singleMode: 'modo único',
    },
  },
  en: {
    groupTitle: 'UI exploration - 3 complete directions',
    noteTitle: 'Spec - 3 complete UI directions',
    directions: {
      clarity: { title: 'UI A - Clarity', intent: 'Direct hierarchy, low cognitive load, and accessibility.' },
      expressive: { title: 'UI B - Expressive', intent: 'Distinct identity, motion, and visual differentiation.' },
      efficient: { title: 'UI C - Efficient', intent: 'Density, productivity, and scale for repeated use.' },
    },
    tasks: [
      { kind: 'brief', title: '1. Finalize brief and criteria', description: 'Validate the objective, audience, platform, content, constraints, stack, references, and measurable criteria. Inspect existing code, tokens, and components before delegating.' },
      { kind: 'concept', direction: 'clarity', title: '2A. Concept A - Clarity', description: 'Create only direction A\'s visual concept: one representative desktop screen and one mobile screen. Use design_import_code with semantic HTML/CSS to obtain native layers quickly, or design_create_elements for a smaller scene graph. Stay within 30-120 useful layers, apply the first revision within 5 minutes, and do not build the full state catalog, token library, components, prototype, or final code yet. Run the structural audit, visually inspect both screens, and mark the task ready for human review.' },
      { kind: 'concept', direction: 'expressive', title: '2B. Concept B - Expressive', description: 'Create only direction B\'s visual concept: one representative desktop screen and one mobile screen. Use design_import_code with semantic HTML/CSS to obtain native layers quickly, or design_create_elements for a smaller scene graph. Stay within 30-120 useful layers, apply the first revision within 5 minutes, and do not build the full state catalog, token library, components, prototype, or final code yet. Run the structural audit, visually inspect both screens, and mark the task ready for human review.' },
      { kind: 'concept', direction: 'efficient', title: '2C. Concept C - Efficient', description: 'Create only direction C\'s visual concept: one representative desktop screen and one mobile screen. Use design_import_code with semantic HTML/CSS to obtain native layers quickly, or design_create_elements for a smaller scene graph. Stay within 30-120 useful layers, apply the first revision within 5 minutes, and do not build the full state catalog, token library, components, prototype, or final code yet. Run the structural audit, visually inspect both screens, and mark the task ready for human review.' },
      { kind: 'review', title: '3. Review concepts and decide', description: 'Open every concept at a legible size and evaluate hierarchy, composition, clarity, brand, responsiveness, and polish. The automated audit is structural only and does not replace this inspection. A human must approve a direction in the Visual review gate or request changes with traceable feedback before expansion.' },
      { kind: 'expand', title: '4. Expand the approved direction', description: 'Only after human approval, expand the approved direction into every required area and state. Then create Light/Dark tokens, bindings, components and variants, prototype, reduced motion, and evidence. Do not expand rejected or pending directions.' },
      { kind: 'implement', title: '5. Implement the approved direction', description: 'Generate a preview in the real stack only for the approved direction, review files and mappings, and apply with revision and hash checks while preserving design, token, and component links.' },
      { kind: 'validate', title: '6. Validate and deliver end to end', description: 'Open the Portal, compare desktop and mobile with the approved Design, fix regressions, run the quality gate and tests, and record delivery in the Review Center.' },
    ],
    brief: {
      section: 'Brief', objective: 'Objective', audience: 'Audience', platform: 'Platform', codeTarget: 'Code target', visualModes: 'Visual modes', constraints: 'Constraints', references: 'References', independentDirections: 'Independent directions', requiredOutput: 'Required output for every direction', conceptOutput: 'First gate - visual concept',
      conceptOutputs: [
        'One editable native desktop key screen and one mobile screen with 30-120 useful layers.',
        'A visible first revision within 5 minutes; prefer semantic HTML/CSS import over hundreds of JSON objects.',
        'Mandatory human visual inspection. Layer counts and structural audits do not prove visual quality.',
      ],
      expansionOutput: 'Only after one direction is approved',
      outputs: [
        'Editable native Design document with responsive frames and empty, loading, error, and success states.',
        'Typed color, typography, spacing, radius, effect, and motion tokens, bound to the actual layers.',
        'Reusable components, variants, properties, and existing code mappings whenever available.',
        'Navigable prototype covering the critical interaction path.',
        'Naming, clipping, overlap, WCAG contrast, and accessibility audit without critical errors.',
      ],
      codeDelivery: 'Code preview, file list, visual evidence, technical risk, and UX trade-offs.',
      decisionGate: 'Decision and delivery gate',
      decisionBody: 'Compare all three directions before implementation. A human must approve one direction or an explicit combination. Then review the generated-code preview, apply it with revision and file-hash checks, validate the Portal on desktop and mobile, run tests, and record the final Review Center decision.',
      linkedSpec: 'Linked spec', lightDark: 'Light + Dark', singleMode: 'single mode',
    },
  },
  es: {
    groupTitle: 'Exploración de UI - 3 direcciones completas',
    noteTitle: 'Spec - 3 direcciones completas de UI',
    directions: {
      clarity: { title: 'UI A - Claridad', intent: 'Jerarquía directa, baja carga cognitiva y accesibilidad.' },
      expressive: { title: 'UI B - Expresiva', intent: 'Identidad marcada, movimiento y diferenciación visual.' },
      efficient: { title: 'UI C - Eficiente', intent: 'Densidad, productividad y escala para uso recurrente.' },
    },
    tasks: [
      { kind: 'brief', title: '1. Cerrar brief y criterios', description: 'Valida objetivo, público, plataforma, contenido, restricciones, stack, referencias y criterios medibles. Inspecciona código, tokens y componentes existentes antes de delegar.' },
      { kind: 'concept', direction: 'clarity', title: '2A. Concepto A - Claridad', description: 'Crea solamente el concepto visual de la dirección A: una pantalla principal desktop y una mobile representativas. Usa design_import_code con HTML/CSS semántico para obtener capas nativas rápidamente, o design_create_elements si el scene graph es menor. Limítate a 30-120 capas útiles, aplica la primera revisión en hasta 5 minutos y todavía no produzcas el catálogo de estados, biblioteca completa de tokens, componentes, prototipo o código final. Ejecuta la auditoría estructural, inspecciona visualmente ambas pantallas y marca la tarea lista para revisión humana.' },
      { kind: 'concept', direction: 'expressive', title: '2B. Concepto B - Expresiva', description: 'Crea solamente el concepto visual de la dirección B: una pantalla principal desktop y una mobile representativas. Usa design_import_code con HTML/CSS semántico para obtener capas nativas rápidamente, o design_create_elements si el scene graph es menor. Limítate a 30-120 capas útiles, aplica la primera revisión en hasta 5 minutos y todavía no produzcas el catálogo de estados, biblioteca completa de tokens, componentes, prototipo o código final. Ejecuta la auditoría estructural, inspecciona visualmente ambas pantallas y marca la tarea lista para revisión humana.' },
      { kind: 'concept', direction: 'efficient', title: '2C. Concepto C - Eficiente', description: 'Crea solamente el concepto visual de la dirección C: una pantalla principal desktop y una mobile representativas. Usa design_import_code con HTML/CSS semántico para obtener capas nativas rápidamente, o design_create_elements si el scene graph es menor. Limítate a 30-120 capas útiles, aplica la primera revisión en hasta 5 minutos y todavía no produzcas el catálogo de estados, biblioteca completa de tokens, componentes, prototipo o código final. Ejecuta la auditoría estructural, inspecciona visualmente ambas pantallas y marca la tarea lista para revisión humana.' },
      { kind: 'review', title: '3. Revisar conceptos y decidir', description: 'Abre cada concepto en un tamaño legible y evalúa jerarquía, composición, claridad, marca, responsividad y acabado. La auditoría automática es solo estructural y no sustituye esta inspección. Una persona debe aprobar una dirección en el gate de Revisión visual o solicitar cambios con feedback rastreable antes de expandir.' },
      { kind: 'expand', title: '4. Expandir la dirección aprobada', description: 'Solo después de la aprobación humana, expande la dirección aprobada a todas las áreas y estados exigidos. Después crea tokens Light/Dark, bindings, componentes y variantes, prototipo, motion reducido y evidencias. No expandas direcciones rechazadas o pendientes.' },
      { kind: 'implement', title: '5. Implementar la dirección aprobada', description: 'Genera la vista previa en el stack real solo para la dirección aprobada, revisa archivos y mappings y aplica con revisión y hash, conservando los vínculos de design, tokens y componentes.' },
      { kind: 'validate', title: '6. Validar y entregar de punta a punta', description: 'Abre el Portal, compara desktop y mobile con el Design aprobado, corrige regresiones, ejecuta quality gate y pruebas y registra la entrega en Review Center.' },
    ],
    brief: {
      section: 'Brief', objective: 'Objetivo', audience: 'Público', platform: 'Plataforma', codeTarget: 'Destino del código', visualModes: 'Modos visuales', constraints: 'Restricciones', references: 'Referencias', independentDirections: 'Direcciones independientes', requiredOutput: 'Entrega obligatoria de cada dirección', conceptOutput: 'Primer gate - concepto visual',
      conceptOutputs: [
        'Una pantalla principal desktop y una mobile, nativas y editables, con 30-120 capas útiles.',
        'Primera revisión visible en hasta 5 minutos; prefiere importación semántica HTML/CSS a cientos de objetos JSON.',
        'Inspección visual humana obligatoria. Conteos de capas y auditoría estructural no demuestran calidad visual.',
      ],
      expansionOutput: 'Solo después de aprobar una dirección',
      outputs: [
        'Documento Design nativo y editable, con frames responsivos y estados vacío, cargando, error y éxito.',
        'Tokens tipados de color, tipografía, espaciado, radio, efectos y movimiento, vinculados a las capas reales.',
        'Componentes reutilizables, variantes, propiedades y mappings del código existente cuando estén disponibles.',
        'Prototipo navegable que cubre el flujo crítico de interacción.',
        'Auditoría de nombres, clipping, superposición, contraste WCAG y accesibilidad sin errores críticos.',
      ],
      codeDelivery: 'Vista previa de código, lista de archivos, evidencia visual, riesgo técnico y trade-offs de UX.',
      decisionGate: 'Decisión y entrega',
      decisionBody: 'Compara las tres direcciones antes de implementar. Una persona debe aprobar una dirección o una combinación explícita. Después revisa la vista previa del código, aplica con revisión y hash del archivo, valida el Portal en desktop y mobile, ejecuta las pruebas y registra la decisión final en Review Center.',
      linkedSpec: 'Spec vinculada', lightDark: 'Light + Dark', singleMode: 'modo único',
    },
  },
};

function optionalLine(label: string, value: string): string {
  return value.trim() ? `- ${label}: ${value.trim()}` : '';
}

export function designExplorationCopy(locale: CreateDesignExplorationDto['locale']): DesignExplorationCopy {
  return copy[locale];
}

export function designExplorationBrief(input: CreateDesignExplorationDto, noteId: string): string {
  const localized = copy[input.locale];
  const labels = localized.brief;
  const darkMode = input.includeDarkMode ? labels.lightDark : labels.singleMode;
  const directionLines = DESIGN_EXPLORATION_DIRECTIONS.map((id) => (
    `- ${localized.directions[id].title}: ${localized.directions[id].intent}`
  ));
  return [
    `# ${input.title}`,
    '',
    `## ${labels.section}`,
    `- ${labels.objective}: ${input.objective}`,
    optionalLine(labels.audience, input.audience),
    `- ${labels.platform}: ${input.platform}`,
    `- ${labels.codeTarget}: ${input.codeTarget}`,
    `- ${labels.visualModes}: ${darkMode}`,
    optionalLine(labels.constraints, input.constraints),
    optionalLine(labels.references, input.references),
    '',
    `## ${labels.independentDirections}`,
    ...directionLines,
    '',
    `## ${labels.conceptOutput}`,
    ...labels.conceptOutputs.map((output) => `- ${output}`),
    '',
    `## ${labels.expansionOutput}`,
    `### ${labels.requiredOutput}`,
    ...labels.outputs.map((output) => `- ${output}`),
    `- ${input.codeTarget}: ${labels.codeDelivery}`,
    '',
    `## ${labels.decisionGate}`,
    labels.decisionBody,
    '',
    `${labels.linkedSpec}: ${noteId}`,
  ].filter(Boolean).join('\n');
}

export type DesignExplorationLayout = {
  baseX: number;
  baseY: number;
  group: { x: number; y: number; width: number; height: number };
  note: { x: number; y: number; width: number; height: number };
  tasks: { x: number; y: number; width: number; height: number };
  designs: Array<{ x: number; y: number; width: number; height: number }>;
};

export function designExplorationLayout(nodes: CanvasNode[]): DesignExplorationLayout {
  const nonGroups = nodes.filter((node) => node.type !== 'group');
  const baseX = nonGroups.length ? Math.min(...nonGroups.map((node) => node.x)) : 120;
  const baseY = nonGroups.length
    ? Math.max(...nonGroups.map((node) => node.y + node.height)) + 160
    : 120;
  const designWidth = 520;
  const gap = 40;
  const designsY = baseY + 420;
  return {
    baseX,
    baseY,
    group: { x: baseX - 40, y: baseY - 68, width: designWidth * 3 + gap * 4, height: 880 },
    note: { x: baseX, y: baseY, width: 520, height: 340 },
    tasks: { x: baseX + designWidth + gap, y: baseY, width: 520, height: 340 },
    designs: DESIGN_EXPLORATION_DIRECTIONS.map((_, index) => ({
      x: baseX + index * (designWidth + gap),
      y: designsY,
      width: designWidth,
      height: 380,
    })),
  };
}
