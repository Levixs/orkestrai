import type { Tour } from '../types.js';

/**
 * Catalogo de tours guiados em pt-BR. Para adicionar um caso de uso novo:
 * copie um tour existente, ajuste os passos e registre as traducoes em
 * catalog/en.js e catalog/es.js com o MESMO id e a MESMA estrutura.
 */
export const TOURS_PT: Tour[] = [
  {
    id: 'team-leader',
    icon: 'Users',
    title: 'Time com líder (zero-config)',
    tagline: 'Um líder que monta e comanda o time por você.',
    steps: [
      {
        id: 'leader',
        title: 'Crie o líder do time',
        body: 'Tudo começa com um agente líder (Modo Maestro). Ele propõe o time, recruta, conecta e distribui o trabalho sozinho. Crio ele para você com um clique.',
        action: { kind: 'createAgent', title: 'Líder', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
      {
        id: 'brief',
        title: 'A nota de briefing',
        body: 'A spec do projeto mora numa nota conectada ao time. Vou criar uma nota "Briefing" de exemplo — edite com o que você quer construir.',
        action: { kind: 'createNote', title: 'Briefing', content: '# Briefing\n\nDescreva aqui o projeto: objetivo, escopo e critérios de pronto.\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Briefing' },
      },
      {
        id: 'brief-connect',
        title: 'Conecte a nota ao líder',
        body: 'Conectar a nota ao líder dá a ele o contexto do projeto. Faço a conexão para você.',
        action: { kind: 'connect', fromTitle: 'Briefing', toTitle: 'Líder' },
        check: { kind: 'edgeExists', fromTitle: 'Briefing', toTitle: 'Líder' },
      },
      {
        id: 'board',
        title: 'O quadro de tarefas',
        body: 'O kanban do time: cartões em A fazer/Fazendo/Feito. Vou criar o quadro e a primeira tarefa atribuída ao líder — ele quebra e distribui o resto.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'first-task',
        title: 'Primeira tarefa para o líder',
        body: 'Crio a tarefa "Montar o time e começar" atribuída ao líder. Ela cai direto no terminal dele.',
        action: { kind: 'createTask', title: 'Montar o time e começar (leia a nota Briefing)', assigneeTitle: 'Líder' },
        check: { kind: 'taskExists', titleIncludes: 'Montar o time' },
      },
      {
        id: 'talk',
        title: 'Dê a ordem',
        body: 'No terminal do líder, diga: "leia a nota Briefing, proponha o time e comece". Ele recruta os agentes, conecta tudo e trabalha. Tour concluído quando o líder estiver no canvas.',
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
    ],
  },
  {
    id: 'vigia-24-7',
    icon: 'Repeat',
    title: 'Funcionário 24/7 (vigia de tarefas)',
    tagline: 'Um agente que trabalha sem parar, de minuto em minuto.',
    steps: [
      {
        id: 'leader',
        title: 'O vigia',
        body: 'Um agente líder fica de plantão: a cada poucos minutos ele olha o quadro, atribui o que estiver sem dono e recruta se faltar gente.',
        action: { kind: 'createAgent', title: 'Vigia', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Vigia' },
      },
      {
        id: 'board',
        title: 'O quadro vigiado',
        body: 'Ele precisa de um quadro para vigiar. Crio o nó Tarefas para você.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'routine',
        title: 'A rotina de plantão',
        body: 'Crio a rotina: a cada 5 minutos o vigia recebe "verifique o quadro (orkestrai task list); atribua o que estiver sem dono; se faltar agente, recrute".',
        action: { kind: 'createRoutine', targetTitle: 'Vigia', prompt: 'Verifique o quadro com: orkestrai task list. Atribua o que estiver sem dono. Se faltar agente, recrute (orkestrai recruit).', intervalMinutes: 5 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'drop-task',
        title: 'Teste com uma tarefa',
        body: 'Crie uma tarefa qualquer no quadro (ou use "Fazer por mim") e observe: em até 5 minutos o vigia pega e distribui sozinho.',
        action: { kind: 'createTask', title: 'Tarefa de teste do vigia' },
        check: { kind: 'taskExists', titleIncludes: 'vigia' },
      },
    ],
  },
  {
    id: 'duas-features',
    icon: 'GitBranch',
    title: 'Duas features em paralelo sem conflito',
    tagline: 'Dois times, dois andares, zero pisada no pé.',
    steps: [
      {
        id: 'floor',
        title: 'Crie um andar',
        body: 'Um andar é uma cópia isolada do projeto (worktree git) com branch própria. O time B trabalha nela enquanto o time A fica no principal. Crio o andar "feature-nova" para você.',
        action: { kind: 'createFloor', name: 'feature-nova' },
        check: { kind: 'floorExists', nameIncludes: 'feature' },
      },
      {
        id: 'agents',
        title: 'Um agente por frente',
        body: 'Crio dois agentes: um trabalha no andar principal, outro na feature nova. Mova o segundo para a camada do andar (painel Andares na barra inferior).',
        action: { kind: 'createAgent', title: 'Dev Principal', provider: 'claude' },
      },
      {
        id: 'agent-b',
        title: 'O agente da feature',
        body: 'Crio o agente da frente B. No painel Andares, troque a camada visível e arraste-o para lá — ele passa a trabalhar no checkout do andar.',
        action: { kind: 'createAgent', title: 'Dev Feature', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Dev Feature' },
      },
      {
        id: 'land',
        title: 'Juntando de volta',
        body: 'Quando a feature terminar: painel Andares → preview mostra conflitos ANTES do merge; o land junta tudo. Conflito vira tarefa para um agente resolver. Conclua quando o andar existir.',
        check: { kind: 'floorExists', nameIncludes: 'feature' },
      },
    ],
  },
  {
    id: 'qa-visual',
    icon: 'Workflow',
    title: 'QA visual da sua aplicação',
    tagline: 'Um agente que abre sua app e testa de verdade.',
    steps: [
      {
        id: 'portal',
        title: 'O portal (navegador dos agentes)',
        body: 'O portal é um navegador embutido que os agentes controlam. Crio um apontado para o seu dev server — ajuste a URL depois se não for localhost:5173.',
        action: { kind: 'createPortal', url: 'http://localhost:5173', title: 'Portal App' },
        check: { kind: 'nodeExists', nodeType: 'portal' },
      },
      {
        id: 'qa',
        title: 'O agente de QA',
        body: 'Crio o agente que vai testar. Conecte-o ao portal para ele enxergar a página.',
        action: { kind: 'createAgent', title: 'QA', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'QA' },
      },
      {
        id: 'connect',
        title: 'Conecte o QA ao portal',
        body: 'Conectado, o QA navega, lê o DOM, roda JS e tira screenshots. Faço a conexão.',
        action: { kind: 'connect', fromTitle: 'QA', toTitle: 'Portal App' },
        check: { kind: 'edgeExists', fromTitle: 'QA', toTitle: 'Portal App' },
      },
      {
        id: 'test',
        title: 'Peça o teste',
        body: 'No terminal do QA: "abra o portal, faça o fluxo principal da app, tire screenshot e me diga o que quebrou". Ele executa e reporta.',
      },
    ],
  },
  {
    id: 'pesquisa-resumo',
    icon: 'Search',
    title: 'Pesquisa automatizada com resumo',
    tagline: 'O agente pesquisa na web e escreve o resumo numa nota.',
    steps: [
      {
        id: 'note',
        title: 'A nota de resumo',
        body: 'Crio a nota "Resumo" — é nela que o agente escreve os achados em bullet points.',
        action: { kind: 'createNote', title: 'Resumo', content: '# Resumo\n\n(os achados da pesquisa aparecem aqui em bullet points)\n' },
        check: { kind: 'nodeExists', nodeType: 'note', titleIncludes: 'Resumo' },
      },
      {
        id: 'portal',
        title: 'O portal de pesquisa',
        body: 'Crio um portal aberto no Google — o agente usa para ler fontes.',
        action: { kind: 'createPortal', url: 'https://www.google.com', title: 'Portal Pesquisa' },
        check: { kind: 'nodeExists', nodeType: 'portal' },
      },
      {
        id: 'agent',
        title: 'O pesquisador',
        body: 'Crio o agente pesquisador e conecto ele ao portal e à nota — portal para ler, nota para escrever.',
        action: { kind: 'createAgent', title: 'Pesquisador', provider: 'kimi' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Pesquisador' },
      },
      {
        id: 'connect',
        title: 'Conexões de trabalho',
        body: 'Faço as duas conexões: Pesquisador ↔ Portal Pesquisa e Pesquisador ↔ Resumo. Depois diga: "use o portal para ler sobre X e escreva o resumo na nota".',
        action: [
          { kind: 'connect', fromTitle: 'Pesquisador', toTitle: 'Portal Pesquisa' },
          { kind: 'connect', fromTitle: 'Pesquisador', toTitle: 'Resumo' },
        ],
        check: { kind: 'edgeExists', fromTitle: 'Pesquisador', toTitle: 'Portal Pesquisa' },
      },
    ],
  },
  {
    id: 'inbox-arquivos',
    icon: 'FolderPlus',
    title: 'Inbox de arquivos processada sozinha',
    tagline: 'Solte arquivos na pasta; o time processa em lote.',
    steps: [
      {
        id: 'agent',
        title: 'O processador',
        body: 'Crio o agente que vai olhar a pasta ./inbox do seu projeto (crie a pasta depois se não existir).',
        action: { kind: 'createAgent', title: 'Processador', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Processador' },
      },
      {
        id: 'routine',
        title: 'A rotina de varredura',
        body: 'Crio a rotina: a cada 2 minutos ele lista ./inbox, descreve/classifica o que é novo, move para ./inbox/done e registra no quadro.',
        action: { kind: 'createRoutine', targetTitle: 'Processador', prompt: 'Liste ./inbox; para cada arquivo novo, descreva e classifique; mova para ./inbox/done e registre no quadro com orkestrai task add.', intervalMinutes: 2 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'test',
        title: 'Solte um arquivo',
        body: 'Crie a pasta ./inbox no projeto e solte um arquivo qualquer. Em até 2 minutos o processador descreve, classifica e arquiva.',
      },
    ],
  },
  {
    id: 'revisao-cruzada',
    icon: 'Cable',
    title: 'Revisão cruzada entre providers',
    tagline: 'Claude implementa, Codex revisa. Dois olhares por mudança.',
    steps: [
      {
        id: 'dev',
        title: 'O implementador',
        body: 'Crio o Claude que implementa as mudanças.',
        action: { kind: 'createAgent', title: 'Claude Dev', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Claude Dev' },
      },
      {
        id: 'reviewer',
        title: 'O revisor',
        body: 'Crio o Codex revisor — um modelo diferente revisando com outro olhar.',
        action: { kind: 'createAgent', title: 'Codex Reviewer', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Codex Reviewer' },
      },
      {
        id: 'connect',
        title: 'Conecte os dois',
        body: 'Faço a conexão: tudo que um perguntar ao outro viaja por ela (e ela acende verde durante a conversa).',
        action: { kind: 'connect', fromTitle: 'Claude Dev', toTitle: 'Codex Reviewer' },
        check: { kind: 'edgeExists', fromTitle: 'Claude Dev', toTitle: 'Codex Reviewer' },
      },
      {
        id: 'flow',
        title: 'O fluxo de revisão',
        body: 'Diga ao Claude Dev: "implemente X e peça revisão ao Codex Reviewer (orkestrai ask)". Ele implementa, o Codex critica, o veredito volta na mesma corda.',
      },
    ],
  },
  {
    id: 'sentinela-deploy',
    icon: 'Rocket',
    title: 'Sentinela de deploy e testes',
    tagline: 'De hora em hora: testes rodados, falhas viram tarefa + notificação.',
    steps: [
      {
        id: 'agent',
        title: 'O sentinela',
        body: 'Crio o agente que vigia a saúde do projeto.',
        action: { kind: 'createAgent', title: 'Sentinela', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Sentinela' },
      },
      {
        id: 'board',
        title: 'O quadro de incidentes',
        body: 'Falhas viram cartões no quadro. Crio o nó Tarefas.',
        action: { kind: 'createTasksBoard' },
      },
      {
        id: 'routine',
        title: 'A ronda de hora em hora',
        body: 'Crio a rotina: a cada 60 minutos ele roda os testes; se falhar, abre tarefa para o time e te notifica no desktop.',
        action: { kind: 'createRoutine', targetTitle: 'Sentinela', prompt: 'Rode os testes do projeto. Se falhar, abra uma tarefa para o time (orkestrai task add) e notifique o usuário (orkestrai notify).', intervalMinutes: 60 },
        check: { kind: 'routineExists' },
      },
      {
        id: 'test',
        title: 'Quebre de propósito (opcional)',
        body: 'Introduza um erro no código e veja a próxima ronda abrir a tarefa e disparar a notificação nativa.',
      },
    ],
  },
  {
    id: 'preset-bootstrap',
    icon: 'Layers',
    title: 'Preset do seu framework',
    tagline: 'Monte o time uma vez; todo projeto novo nasce pronto.',
    steps: [
      {
        id: 'team',
        title: 'Monte o time padrão',
        body: 'Crie o time que você usa em todo projeto (líder, devs, roles, nota de bootstrap com as convenções do seu framework). Crio o líder para começar.',
        action: { kind: 'createAgent', title: 'Líder', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder' },
      },
      {
        id: 'save',
        title: 'Salve como preset',
        body: 'Com o time montado: lápis ao lado do nome do workspace na barra lateral → "Salvar como preset". O snapshot guarda agentes, layout, notas, roles e rotinas (sem sessões).',
      },
      {
        id: 'use',
        title: 'Use no próximo projeto',
        body: 'Ao criar um workspace novo (+ na barra lateral), escolha o preset em "Começar de um preset" — o time inteiro nasce instanciado no projeto. Gerencie presets em Configurações.',
      },
    ],
  },
  {
    id: 'pipeline-aprovacao',
    icon: 'Workflow',
    title: 'Pipeline escreve → revisa → aprova',
    tagline: 'Fluxo com 3 passos e uma pausa para o seu OK.',
    steps: [
      {
        id: 'agents',
        title: 'Dev e revisor',
        body: 'Crio os dois agentes do pipeline: o Dev (escreve) e o Revisor (critica).',
        action: { kind: 'createAgent', title: 'Dev', provider: 'claude' },
      },
      {
        id: 'reviewer',
        title: 'O revisor',
        body: 'Crio o revisor do pipeline.',
        action: { kind: 'createAgent', title: 'Revisor', provider: 'codex' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Revisor' },
      },
      {
        id: 'flow',
        title: 'O fluxo de 3 passos',
        body: 'Crio o nó Fluxo: passo 1 o Dev escreve ({{input}} = sua entrada), passo 2 o Revisor critica a saída do Dev, passo 3 pausa para a SUA aprovação.',
        action: {
          kind: 'createFlow',
          title: 'Pipeline revisão',
          steps: [
            { kind: 'agent', target: 'Dev', prompt: 'Escreva a solução para: {{input}}' },
            { kind: 'agent', target: 'Revisor', prompt: 'Revise criticamente, aponte problemas e melhorias: {{input}}' },
            { kind: 'approval' },
          ],
        },
        check: { kind: 'nodeExists', nodeType: 'flow' },
      },
      {
        id: 'run',
        title: 'Rode o fluxo',
        body: 'No nó Fluxo: escreva a entrada (ex.: "validação de formulário com zod") e clique em Rodar. Acompanhe os passos acendendo e aprove no passo final.',
      },
    ],
  },
  {
    id: 'mcp-tools',
    icon: 'Cable',
    title: 'Tools externas via MCP',
    tagline: 'GitHub, docs e web nas mãos dos agentes — com um clique.',
    steps: [
      {
        id: 'install',
        title: 'Instale um MCP com 1 clique',
        body: 'Instalo o DeepWiki (documentação de qualquer repositório, sem configurar nada) neste workspace — sem comando, sem token.',
        action: { kind: 'installMcp', key: 'deepwiki' },
        check: { kind: 'mcpInstalled', name: 'deepwiki' },
      },
      {
        id: 'market',
        title: 'O marketplace de MCPs',
        body: 'Página Skills → aba MCPs: curadoria oficial (GitHub, Gmail, Figma, Drive, Vercel...) + registry completo. Os que pedem token abrem um diálogo guiado.',
      },
      {
        id: 'use',
        title: 'Use num agente',
        body: 'Num terminal de agente (Claude/Kimi), peça algo que o MCP faz — ex.: "pergunte ao DeepWiki como funciona o auth do repositório X". A tool aparece nativa no agente.',
      },
    ],
  },
  {
    id: 'chained-flows',
    icon: 'Workflow',
    title: 'Fluxos encadeados',
    tagline: 'Um fluxo dispara o próximo — pipelines compostos e fan-out.',
    steps: [
      {
        id: 'first-flow',
        title: 'O primeiro elo',
        body: 'Crio o Fluxo "Pesquisa" com um passo de aprovação — assim você simula a etapa sem precisar de agente real.',
        action: { kind: 'createFlow', title: 'Pesquisa', steps: [{ kind: 'approval' }] },
        check: { kind: 'nodeExists', nodeType: 'flow', titleIncludes: 'Pesquisa' },
      },
      {
        id: 'second-flow',
        title: 'O segundo elo',
        body: 'Crio o Fluxo "Redação" — quando a Pesquisa terminar com sucesso, a saída dela vira a entrada da Redação sozinha.',
        action: { kind: 'createFlow', title: 'Redação', steps: [{ kind: 'approval' }] },
        check: { kind: 'nodeExists', nodeType: 'flow', titleIncludes: 'Redação' },
      },
      {
        id: 'chain',
        title: 'Conecte os dois fluxos',
        body: 'Ligo Pesquisa → Redação com uma aresta: é a aresta que diz para onde a saída vai quando o fluxo termina.',
        action: { kind: 'connect', fromTitle: 'Pesquisa', toTitle: 'Redação' },
        check: { kind: 'edgeExists', fromTitle: 'Pesquisa', toTitle: 'Redação' },
      },
      {
        id: 'run-chain',
        title: 'Rode e veja o encadeamento',
        body: 'No Fluxo Pesquisa: clique Rodar e depois Aprovar. Quando ele termina, a Redação dispara sozinha com a saída — falha não encadeia e ciclo é bloqueado. Fan-out: conecte um terceiro fluxo à Pesquisa e os dois disparam juntos. E o botão Sincronizar transforma cada agente conectado a um fluxo em passo, na ordem das arestas.',
      },
    ],
  },

  {
    id: 'design-figma',
    icon: 'Palette',
    title: 'Do Figma ao código',
    tagline: 'Mockup do Figma vira UI fiel com o agente designer.',
    steps: [
      {
        id: 'designer',
        title: 'O agente designer',
        body: 'Crio o Designer (Claude) — ele vai ler suas referências visuais e gerar a UI.',
        action: { kind: 'createAgent', title: 'Designer', provider: 'claude' },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Designer' },
      },
      {
        id: 'image',
        title: 'A referência visual',
        body: 'Adicione um nó Imagem (barra inferior), cole o print do Figma com Ctrl+V e conecte ao Designer — é assim que ele enxerga o mockup.',
      },
      {
        id: 'mcp',
        title: 'Figma MCP (opcional e poderoso)',
        body: 'Página Skills → aba MCPs → busque "Figma" e instale com seu token (Perfil do Figma → Settings → Personal access tokens). Com ele o Designer lê frames, componentes e estilos DIRETO do arquivo — sem print.',
      },
    ],
  },
  {
    id: 'managed-ports',
    icon: 'RadioTower',
    title: 'Liberar portas de dev servers',
    tagline: 'Veja e encerre listeners locais sem sair do canvas.',
    steps: [
      {
        id: 'portal',
        title: 'Registre o app num Portal',
        body: 'Crio um Portal local na porta 4173. É esse vínculo persistido que permite ao Orkestrai gerenciar a porta com segurança.',
        action: { kind: 'createPortal', url: 'http://localhost:4173', title: 'Portal Dev' },
        check: { kind: 'nodeExists', nodeType: 'portal', titleIncludes: 'Portal Dev' },
      },
      {
        id: 'server',
        title: 'Inicie seu dev server',
        body: 'No terminal do projeto, inicie o app na mesma porta do Portal. Você pode usar `orkestrai port 4173` para escolher uma porta livre antes de subir o servidor.',
      },
      {
        id: 'panel',
        title: 'Abra Portas e libere o listener',
        body: 'Na barra inferior, logo depois de Usage, abra Portas. O processo aparece como em uso; clique no ícone de parar e confirme. O Portal fica salvo para a próxima execução.',
      },
    ],
  },
  {
    id: 'leader-dictation',
    icon: 'Mic',
    title: 'Ditar direto para o líder',
    tagline: 'Fale uma ordem sem procurar a janela certa no canvas.',
    steps: [
      {
        id: 'leader',
        title: 'Tenha um líder no workspace',
        body: 'Crio um agente em Modo Maestro. A bolinha de voz sempre resolve esse líder exato, mesmo quando ele está em outro andar.',
        action: { kind: 'createAgent', title: 'Líder por voz', provider: 'claude', leader: true },
        check: { kind: 'nodeExists', nodeType: 'terminal', titleIncludes: 'Líder por voz' },
      },
      {
        id: 'record',
        title: 'Clique na bolinha de voz',
        body: 'Use a bolinha colorida no topo direito para começar a gravar. É o mesmo controle do microfone dentro da janela do líder, não um segundo ditado.',
      },
      {
        id: 'deliver',
        title: 'Pare e confira o terminal do líder',
        body: 'Clique novamente para parar. Depois da transcrição local, o texto entra diretamente no terminal do líder selecionado e fica pronto para você revisar ou enviar.',
      },
    ],
  },
];
