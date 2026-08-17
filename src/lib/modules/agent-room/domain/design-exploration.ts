import type { CreateDesignExplorationDto } from '../application/dto/CreateDesignExplorationDto.js';
import type { CanvasNode } from './types.js';

export const DESIGN_EXPLORATION_DIRECTIONS = ['clarity', 'expressive', 'efficient'] as const;
export type DesignExplorationDirection = (typeof DESIGN_EXPLORATION_DIRECTIONS)[number];

export type DesignExplorationCopy = {
  groupTitle: string;
  noteTitle: string;
  directions: Record<DesignExplorationDirection, { title: string; intent: string }>;
  tasks: Array<{ title: string; description: string }>;
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
      { title: '1. Fechar brief e critérios', description: 'Valide objetivo, público, plataforma, conteúdo, restrições, stack, referências e critérios mensuráveis. Inspecione código, tokens e componentes existentes antes de delegar.' },
      { title: '2. Produzir 3 direções completas', description: 'Produza A Clareza, B Expressiva e C Eficiente nos três documentos Design. Em cada documento: leia uma vez, consulte design_reference, aplique o plano em 1–3 lotes com design_create_elements/design_apply_blueprint e só então releia e audite. Não inspecione a instalação, faça probes ou crie scratch scripts para descobrir schemas. Cada alternativa deve incluir frames responsivos e estados, tokens, componentes, protótipo, auditoria e preview de código.' },
      { title: '3. Comparar e decidir direção', description: 'Compare UX, marca, acessibilidade, responsividade, esforço, risco e aderência ao brief. Registre a decisão humana explícita; nunca escolha ou combine propostas automaticamente.' },
      { title: '4. Implementar direção aprovada', description: 'Depois da aprovação humana, gere o preview na stack real, revise arquivos e mappings e aplique com revisão e hash, preservando os vínculos com design, tokens e componentes.' },
      { title: '5. Validar e entregar ponta a ponta', description: 'Abra o Portal, compare desktop e mobile com o Design aprovado, corrija regressões, execute quality gate e testes e registre a entrega no Review Center.' },
    ],
    brief: {
      section: 'Brief', objective: 'Objetivo', audience: 'Público', platform: 'Plataforma', codeTarget: 'Destino do código', visualModes: 'Modos visuais', constraints: 'Restrições', references: 'Referências', independentDirections: 'Direções independentes', requiredOutput: 'Entrega obrigatória de cada direção',
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
      { title: '1. Finalize brief and criteria', description: 'Validate the objective, audience, platform, content, constraints, stack, references, and measurable criteria. Inspect existing code, tokens, and components before delegating.' },
      { title: '2. Produce 3 complete directions', description: 'Produce A Clarity, B Expressive, and C Efficient in the three Design documents. For each document: read once, call design_reference, apply the plan in 1–3 batches with design_create_elements/design_apply_blueprint, then read and audit once. Do not inspect the installation, probe operations, or create scratch scripts to discover schemas. Each alternative must include responsive frames and states, tokens, components, a prototype, an audit, and a code preview.' },
      { title: '3. Compare and choose a direction', description: 'Compare UX, brand, accessibility, responsiveness, effort, risk, and brief alignment. Record an explicit human decision; never select or combine proposals automatically.' },
      { title: '4. Implement the approved direction', description: 'After human approval, generate a preview in the real stack, review files and mappings, and apply with revision and hash checks while preserving design, token, and component links.' },
      { title: '5. Validate and deliver end to end', description: 'Open the Portal, compare desktop and mobile with the approved Design, fix regressions, run the quality gate and tests, and record delivery in the Review Center.' },
    ],
    brief: {
      section: 'Brief', objective: 'Objective', audience: 'Audience', platform: 'Platform', codeTarget: 'Code target', visualModes: 'Visual modes', constraints: 'Constraints', references: 'References', independentDirections: 'Independent directions', requiredOutput: 'Required output for every direction',
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
      { title: '1. Cerrar brief y criterios', description: 'Valida objetivo, público, plataforma, contenido, restricciones, stack, referencias y criterios medibles. Inspecciona código, tokens y componentes existentes antes de delegar.' },
      { title: '2. Producir 3 direcciones completas', description: 'Produce A Claridad, B Expresiva y C Eficiente en los tres documentos Design. En cada documento: lee una vez, consulta design_reference, aplica el plan en 1–3 lotes con design_create_elements/design_apply_blueprint y solo entonces vuelve a leer y auditar. No inspecciones la instalación, hagas probes ni crees scratch scripts para descubrir schemas. Cada alternativa debe incluir frames responsivos y estados, tokens, componentes, prototipo, auditoría y vista previa de código.' },
      { title: '3. Comparar y elegir una dirección', description: 'Compara UX, marca, accesibilidad, responsividad, esfuerzo, riesgo y alineación con el brief. Registra una decisión humana explícita; nunca elijas ni combines propuestas automáticamente.' },
      { title: '4. Implementar la dirección aprobada', description: 'Tras la aprobación humana, genera una vista previa en el stack real, revisa archivos y mappings y aplica con revisión y hash, conservando los vínculos de design, tokens y componentes.' },
      { title: '5. Validar y entregar de punta a punta', description: 'Abre el Portal, compara desktop y mobile con el Design aprobado, corrige regresiones, ejecuta quality gate y pruebas y registra la entrega en Review Center.' },
    ],
    brief: {
      section: 'Brief', objective: 'Objetivo', audience: 'Público', platform: 'Plataforma', codeTarget: 'Destino del código', visualModes: 'Modos visuales', constraints: 'Restricciones', references: 'Referencias', independentDirections: 'Direcciones independientes', requiredOutput: 'Entrega obligatoria de cada dirección',
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
    `## ${labels.requiredOutput}`,
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
