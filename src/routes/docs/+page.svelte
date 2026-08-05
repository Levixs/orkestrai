<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    ArrowLeft, BookOpen, Cable, FolderPlus, GitBranch, History, Layers, Link2, MessageSquare,
    PlayCircle, Repeat, Rocket, Search, SquareKanban, SquareTerminal, StickyNote, Users, Workflow,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';

  onMount(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    // Atalho global (Cmd/Ctrl+K de qualquer tela): abre a paleta ja focada.
    if (new URLSearchParams(location.search).has('search')) {
      history.replaceState(null, '', '/docs');
      openPalette();
    }
  });

  function rewatchOnboarding() {
    // Forca a apresentacao mesmo com workspaces existentes.
    location.href = '/canvas?onboarding=1';
  }

  const quickstart = [
    'Crie um workspace (botão + na barra lateral) apontando para a pasta do seu projeto.',
    'Clique em + Claude na barra inferior e arraste um retângulo no canvas — nomeie o agente, escolha modelo/esforço e marque Líder se ele vai comandar o time.',
    'Desenhe mais agentes e conecte-os arrastando da bolinha (handle) de um até o outro.',
    'Abra o quadro Tarefas (+ Tarefas), crie cartões e atribua — cada tarefa cai direto no terminal do agente.',
    'Fale com qualquer agente pelo próprio terminal dele, ou deixe o líder distribuir tudo sozinho via CLI orkestrai.',
  ];

  const sections = [
    {
      id: 'workspaces',
      icon: Layers,
      title: 'Workspaces',
      body: `Um workspace = uma equipe num projeto: diretório de trabalho, ícone e layout do canvas salvos. Crie com o botão + na barra lateral. Vários workspaces rodam ao mesmo tempo — os agentes continuam vivos em background ao trocar. Instruções em AGENTS.md/CLAUDE.md são injetadas nos agentes (edite no lápis ao lado do nome). O botão ⏻ (Descarregar) encerra os terminais vivos do workspace ativo — libera memória/CPU sem apagar nada: o layout fica salvo e cada agente retoma a conversa ao reabrir o terminal.`,
    },
    {
      id: 'agentes',
      icon: SquareTerminal,
      title: 'Agentes: criar, nomear, modelo & esforço',
      body: `Ao desenhar um agente (+ Claude/Codex/Kimi), o diálogo de criação pergunta: nome da janela, modelo (lista real do provider), esforço de raciocínio (low→max, onde suportado) e se ele é o Líder da equipe (Modo Maestro). Depois de criado: duplo-clique no título renomeia qualquer nó (agente, nota, o que for). O selo no cabeçalho do terminal atribui uma role; ◐ troca o tema; ★ liga/desliga o Modo Maestro.`,
    },
    {
      id: 'roles',
      icon: Users,
      title: 'Roles (papéis do time)',
      body: `Roles são conjuntos de instruções (“você é o revisor: só aponte problemas, não edite código”) salvos em .orkestrai/roles/<slug>/role.json — viajam com o repositório. Gerencie no painel Roles (barra inferior). Atribua pelo selo no cabeçalho do terminal: a role é injetada como primeira mensagem do agente. O líder também pode reatribuir roles do time via CLI (orkestrai reassign).`,
    },
    {
      id: 'times',
      icon: Cable,
      title: 'Times: paralelo, líder & Loop',
      body: `Todos os agentes rodam em paralelo (processos independentes). A coordenação é por conexões: agente pergunta a agente com orkestrai ask, ou o Líder (★ Maestro) distribui com task/ask e recruta/demite com recruit/dismiss. O nó Loop Ralph é o modo sequencial: líder planeja → engenheiro implementa → tester revisa, até N rodadas. Rotinas disparam prompts agendados em qualquer terminal.`,
    },
    {
      id: 'notas',
      icon: StickyNote,
      title: 'Notas como canais de trabalho',
      body: `Notas são markdown vivo compartilhado com os agentes. A convenção: conecte a nota a quem deve lê-la/escrevê-la e diga o propósito no título e no conteúdo. Ex.: nota “Backlog (líder escreve)” conectada ao líder — você escreve “quebre em tarefas para o time” e ele lê com orkestrai note read e distribui no quadro. Nota “Para mim (humano)” — peça ao líder para registrar status/decisões nela com orkestrai note write/edit, e você acompanha formatado (ícone de olho). Duplo-clique no título renomeia a nota. Cole imagens direto no editor.`,
    },
    {
      id: 'tarefas',
      icon: SquareKanban,
      title: 'Tarefas (kanban)',
      body: `O nó Tarefas (+ Tarefas na barra inferior) é o quadro do workspace: cartões em A fazer/Fazendo/Feito. Atribuir um cartão a um agente despacha a tarefa direto para o terminal dele (loop contínuo) — ele trabalha e marca done sozinho. O líder opera o quadro pela CLI: orkestrai task list/add/assign/done. Cada tarefa pode ter UMA nota de spec vinculada (a mesma nota pode servir várias tarefas): vincule no cartão (ícone de corrente) ou pela CLI (task add --note / task link). Concluídas ficam na coluna Feito até você (ou o líder) arquivar: saem do quadro junto com a nota vinculada, mas NADA é apagado — o ícone de histórico (relógio) abre a linha do tempo, e o chip de nota ali abre o conteúdo mesmo arquivado. Regras de proteção: nota vinculada não apaga pelo X do canvas; apagar a tarefa apaga a nota junto (quando é a última tarefa que a usa). Na CLI: orkestrai task archive/archive-done/history/link/unlink.`,
    },
    {
      id: 'presets',
      icon: Layers,
      title: 'Presets de equipe',
      body: `Um preset é um template de workspace: time (agentes com provider/líder/roles), layout do canvas, notas com conteúdo e rotinas. Salve o workspace atual como preset no lápis de editar (barra lateral) → "Salvar como preset". Ao criar um workspace novo, escolha o preset em "Começar de um preset" — o time inteiro nasce instanciado no seu projeto, sem nada de runtime (sessões ficam de fora). Aplicar num workspace existente SOMA o time ao canvas sem apagar nada. Caso típico: seu framework padrão — monte uma vez, salve, e todo projeto novo já começa com o time pronto.`,
    },
    {
      id: 'fluxos',
      icon: Workflow,
      title: 'Fluxos (pipelines de agentes)',
      body: `O nó Fluxo (+ Fluxo na barra inferior) é um pipeline visual: passos em sequência, onde a saída de um agente vira a entrada do próximo via {{input}} no prompt. Passo "Agente" conversa com o agente escolhido (a aresta acende durante); passo "Aprovação" pausa até você clicar em Aprovar — humano no loop. Repetição com limite (até 5 rodadas). O progresso aparece ao vivo no nó e o histórico das últimas 5 execuções fica guardado nele. Use para revisões encadeadas (escreve → revisa → aprova), processamento em etapas ou qualquer rotina multi-passo do time.`,
    },
    {
      id: 'sem-medo',
      icon: BookOpen,
      title: 'Diff, Loop & Andares — sem medo (para não-devs)',
      body: `Três botões que assustam mas são amigáveis: DIFF é só um comparador — mostra lado a lado o que mudou no código entre duas versões, sem mexer em nada. LOOP (Loop Ralph) é um piloto automático: o time repete sozinho o ciclo planejar → fazer → revisar até o número de rodadas que você escolher. ANDARES são cópias de segurança do projeto: cada time trabalha numa cópia separada e ninguém bagunça a versão principal — no fim, o app ajuda a juntar tudo de volta (e avisa se houver conflito antes). Pode clicar sem receio: nada aqui apaga seu trabalho.`,
    },
    {
      id: 'conexoes',
      icon: Link2,
      title: 'Conexões',
      body: `Arraste da bolinha de um nó até outro — a conexão é bidirecional e a bolinha flutua pela borda sempre no ponto mais próximo do outro nó. A corda tracejada tem física (balança ao mover) e fica verde animada enquanto os agentes conversam. Hover mostra o X de remover; clique fixa o X. Conectar instala a skill da ponte nos agentes (eles aprendem a CLI orkestrai sozinhos).`,
    },
    {
      id: 'andares',
      icon: GitBranch,
      title: 'Andares (worktrees)',
      body: `Um andar é um git worktree do repo do workspace com branch própria — duas frentes de trabalho no mesmo projeto sem se atropelar: agentes do andar rodam com cwd no checkout do andar. Crie no painel Andares (barra inferior, que também lista os andares e troca a camada visível do canvas) ou os agentes criam pela CLI: orkestrai floor create/list/preview/land/remove. Aterrissar = merge da branch de volta, com prévia de diff e conflitos antes. Conflitos não são resolvidos automaticamente: o erro lista os arquivos e a resolução vira tarefa para um agente (ou você no editor) — depois repita o land. Hooks de setup/run/teardown com variáveis $ORKESTRAI_FLOOR_*, $ORKESTRAI_BRANCH_NAME, $ORKESTRAI_ROOT_PATH.`,
    },
    {
      id: 'rotinas',
      icon: Repeat,
      title: 'Rotinas',
      body: `Prompts agendados que disparam num terminal a cada X minutos (ou uma vez só). Use && numa linha para encadear etapas. O histórico mostra cada disparo. Ex.: “rode os testes a cada 30 min”, “verifique o deploy de hora em hora”. Rotinas disparam mesmo com o workspace em background.`,
    },
    {
      id: 'portal',
      icon: Workflow,
      title: 'Portal (browser dos agentes)',
      body: `O nó Portal é um navegador embutido. Conectado a um agente, ele vira os olhos do agente: orkestrai portal <nodeId> navigate (abrir URL), eval (rodar JS na página), dom (ler o HTML), screenshot. Use para testar a aplicação que o time está construindo (aponte o portal para o dev server) ou pesquisar na web. A automação completa roda no app desktop (Electron); no browser comum o portal é só visualizador.`,
    },
    {
      id: 'mcp',
      icon: Cable,
      title: 'MCP (tools externas dos agentes)',
      body: `MCP é o padrão para dar ferramentas externas aos agentes (GitHub, Gmail, Figma, Drive, Postgres...). O JEITO FÁCIL: página Skills (barra lateral) → aba MCPs — pesquise na curadoria oficial ou no registry MCP e instale com um clique; se o servidor pedir chave/token, o app pergunta com instruções de onde conseguir. Remotos instalam com 1 clique (sem comando). AVANÇADO: lápis ao lado do nome do workspace → seção "Servidores MCP" para editar o .mcp.json na mão. AUTOMÁTICO: o próprio Orkestrai já aparece como servidor MCP "orkestrai" (provisionado sozinho) — os agentes ganham as ações do canvas como tools tipadas. Presets carregam seus MCPs junto com o time.`,
    },
    {
      id: 'cli',
      icon: MessageSquare,
      title: 'CLI orkestrai (a ponte)',
      body: `Os agentes usam a CLI orkestrai para agir no canvas: list --agent <id> (agentes, suas notas e portais), ask (perguntar a outro agente), note read/write/edit/create, task list/add/assign/done/archive/history (+ link/unlink de nota de spec), role show/write/edit, floor create/list/preview/land/remove, notify (notificação nativa para você), recruit/dismiss/connect/reassign (Modo Maestro), portal (automação de browser), port (porta livre para dev servers), fs read/write/search, run (re-despacha tarefa), say (fala no desktop), clip (lê a área de transferência), notes/portals (listagens). Agentes que falam MCP ganham tudo isso como tools nativas via orkestrai mcp — o .mcp.json é provisionado sozinho na raiz do projeto; gerencie servidores MCP extras no editor do workspace. O token fica em .orkestrai/workspace.json no diretório do workspace.`,
    },
    {
      id: 'atalhos',
      icon: BookOpen,
      title: 'Atalhos',
      body: `⌘P paleta · ⌘K (ou Ctrl+K) buscar na documentação de qualquer tela · ⌘⇧A próxima atenção · ⌘⇧T organizar · ⌘G agrupar · ⌘⇧G desagrupar · N nova nota · L conectar selecionados · Alt+1…9 focar terminal · Alt+Espaço ditado por voz (configurável em Configurações) · ⌘F buscar no terminal · ⌘Z desfazer · Backspace excluir. Lista completa em Configurações.`,
    },
  ];

  let query = $state('');

  const filtered = $derived.by(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sections;
    return sections.filter((section) => `${section.title} ${section.body}`.toLowerCase().includes(term));
  });

  // -- Paleta de busca (Cmd/Ctrl+K): cobre topicos, casos de uso e changelog --
  type PaletteItem = { kind: 'topico' | 'caso'; title: string; body: string; href: string };
  let paletteOpen = $state(false);
  let paletteSelected = $state(0);
  let paletteInput = $state<HTMLInputElement | null>(null);

  const paletteItems = $derived.by((): PaletteItem[] => {
    const term = query.trim().toLowerCase();
    const items: PaletteItem[] = [
      { kind: 'topico', title: 'Comece em 5 minutos', body: quickstart.join(' '), href: '#comece' },
      ...useCases.map((useCase) => ({ kind: 'caso' as const, title: useCase.title, body: useCase.body, href: '#casos-de-uso' })),
      ...sections.map((section) => ({ kind: 'topico' as const, title: section.title, body: section.body, href: `#${section.id}` })),
      { kind: 'topico', title: 'Changelog', body: changelog.map((entry) => `${entry.date} ${entry.items.join(' ')}`).join(' '), href: '#changelog' },
    ];
    if (!term) return items;
    return items.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(term));
  });

  $effect(() => {
    void query;
    paletteSelected = 0;
  });

  function openPalette() {
    paletteOpen = true;
    paletteSelected = 0;
    void tick().then(() => paletteInput?.focus());
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (paletteOpen) paletteOpen = false;
      else openPalette();
    }
  }

  function handlePaletteKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      paletteOpen = false;
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      paletteSelected = Math.min(paletteSelected + 1, paletteItems.length - 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      paletteSelected = Math.max(paletteSelected - 1, 0);
      return;
    }
    if (event.key === 'Enter' && paletteItems[paletteSelected]) {
      event.preventDefault();
      goToItem(paletteItems[paletteSelected]);
    }
  }

  function goToItem(item: PaletteItem) {
    paletteOpen = false;
    location.hash = item.href;
    document.querySelector(item.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const useCases = [
    {
      icon: Users,
      title: 'Time de desenvolvimento com líder (zero-config)',
      body: 'Crie um Claude e diga: “orquestra pra mim a feature X”. Ele propõe o time (ex.: 2 backend, 1 frontend, 1 reviewer), você aprova, e ele recruta, conecta e distribui via kanban. Ao final, dispensa os agentes que não precisa mais.',
      tags: ['Líder/Maestro', 'recruit/dismiss', 'kanban'],
    },
    {
      icon: Repeat,
      title: 'Funcionário 24/7 (vigia de tarefas)',
      body: 'Rotina a cada 1–5 min no líder: “verifique o quadro (orkestrai task list); atribua o que estiver sem dono; se faltar agente, recrute”. O time inteiro trabalha sem você tocar em nada — atribuir despacha a tarefa direto pro terminal do agente.',
      tags: ['Rotinas', 'task assign', 'auto-dispatch'],
    },
    {
      icon: GitBranch,
      title: 'Duas features em paralelo sem conflito',
      body: 'Um andar (worktree) por feature: time A no Térreo na main, time B no andar “auth-refactor”. Ao terminar, floor preview mostra conflitos antes; o land mergeia. Conflito vira tarefa para um agente resolver.',
      tags: ['Andares/worktrees', 'floor land', 'branches'],
    },
    {
      icon: Workflow,
      title: 'QA visual da sua aplicação',
      body: 'Portal apontado para o dev server (http://localhost:5173) conectado a um agente: “abra o portal, faça o fluxo de checkout, tire screenshot e me diga o que quebrou”. O agente navega, executa JS, lê o DOM e reporta.',
      tags: ['Portal', 'screenshot', 'eval/dom'],
    },
    {
      icon: Search,
      title: 'Pesquisa automatizada com resumo',
      body: '“Use o Portal Pesquisa para ler sobre X, crie uma nota chamada Resumo X e escreva os achados em bullet points.” O agente navega, extrai e escreve — você lê formatado na nota conectada.',
      tags: ['Portal', 'notas', 'note create'],
    },
    {
      icon: FolderPlus,
      title: 'Inbox de arquivos processada sozinha',
      body: 'Rotina a cada 2 min: “liste ./inbox; para cada imagem nova, descreva e classifique; mova para ./inbox/done e registre no quadro”. Solte arquivos na pasta e o time processa em lote, sem parar.',
      tags: ['Rotinas', 'pastas', 'lote'],
    },
    {
      icon: Cable,
      title: 'Revisão cruzada entre providers',
      body: 'Conecte Claude e Codex: o Claude implementa, o Codex revisa (orkestrai ask), o veredito volta na mesma corda (ela acende verde durante a conversa). Dois olhares de modelos diferentes em cada mudança.',
      tags: ['Conexões', 'ask', 'multi-provider'],
    },
    {
      icon: Rocket,
      title: 'Sentinela de deploy/testes',
      body: 'Rotina de hora em hora num shell ou agente: “rode os testes; se falhar, abra uma tarefa para o time e me notifique (orkestrai notify)”. Você recebe notificação nativa do sistema e o kanban já tem o cartão.',
      tags: ['Rotinas', 'notify', 'CI local'],
    },
    {
      icon: Layers,
      title: 'Preset do seu framework (projeto novo em 30s)',
      body: 'Monte uma vez o time padrão do seu framework (líder + devs + roles + nota de bootstrap com as convenções), salve como preset no editor do workspace, e todo projeto novo nasce com o time completo: agentes, notas de spec, tarefas-template no quadro e MCPs configurados.',
      tags: ['Presets', 'bootstrap', 'tarefas-template'],
    },
    {
      icon: Workflow,
      title: 'Pipeline escreve → revisa → aprova',
      body: 'Fluxo com 3 passos: Dev escreve a feature, Revisor critica (a saída de um vira {{input}} do outro) e o passo de Aprovação pausa até você dar OK no nó. O progresso aparece ao vivo e as últimas execuções ficam no histórico do fluxo.',
      tags: ['Fluxos', 'aprovação humana', 'pipeline'],
    },
    {
      icon: Cable,
      title: 'Agentes com tools externas via MCP',
      body: 'Adicione servidores MCP no editor do workspace (ex.: filesystem, web, banco) — os agentes ganham as tools nativamente, e o Orkestrai em si aparece como servidor MCP com as ações do canvas (orkestrai mcp). Presets podem carregar os MCPs junto com o time.',
      tags: ['MCP', 'tools tipadas', '.mcp.json'],
    },
  ];

  const changelog = [
    {
      date: '04 ago 2026',
      items: [
        'Ciclo de conversa por voz: ditou, o agente responde falando — em português do Brasil de verdade.',
        'Voz 100% autocontida (sem Node, sem Docker): runtime próprio baixado junto com o modelo, verificação de espaço em disco e opção de apagar o modelo.',
        'A fala lê só a resposta atual — sem markdown, URLs ou caracteres estranhos.',
        'Kanban: anexar imagens nos cartões funcionando (Ctrl+V e seletor).',
        'Seta sem ponta vazando; painel de estilo com sliders e cabeça de seta configurável.',
        'Usage do Kimi renova a credencial sozinho.',
        'Sem briga de portas entre workspaces: orkestrai port devolve porta livre e os agentes aprendem a nunca matar processo de porta alheia.',
        'Botão Descarregar com confirmação e feedback; Configurações redesenhadas; changelog aqui na página.',
        'Atualizações automáticas: o app busca versão nova sozinho e instala na troca, sem tocar seus dados.',
        'Skeletons de carregamento na sidebar, usage, skills e Configurações — sem pulos na UI.',
        'Kanban com histórico: arquive concluídas sem perder o registro do que foi entregue.',
        'Tarefa com nota de spec vinculada: arquiva junto, protegida contra exclusão, lida pelo histórico.',
        'Voz lê o transcrito da sessão: resposta completa do agente, sem caracteres invisíveis.',
        'Presets de equipe: salve o workspace como template e comece projetos com o time pronto.',
        'Fluxos: pipelines visuais de agentes com aprovação humana e histórico de execuções.',
        'Servidor MCP próprio + tools CLI novas (fs, say, run, clip) + gerenciador de MCPs.',
        'Resposta entre agentes submetida sozinha — composer não fica mais pendurado.',
        'Reconexão automática após suspensão do notebook, com o contexto restaurado.',
        'Botão Recarregar em cada terminal (reinicia a sessão com o contexto).',
        'Janelas nunca nascem menores que o mínimo — sem botões vazando.',
        'Tooltips em toda a toolbar; textos de Diff/Loop/Andares em linguagem simples.',
        '⌘K / Ctrl+K global: busca na documentação de qualquer tela.',
        'Marketplace de MCPs na página Skills: curadoria oficial + registry, instalação com 1 clique e campos de token guiados.',
        'App em Português, English e Español: seletor de idioma nas Configurações (paraglide).',
        'Design pass: página Skills & MCPs redesenhada (abas segmentadas, cartões com badges) e docs polidas.',
        'Onboarding interativo: 11 tours guiados por caso de uso, com "Fazer por mim" e auto-conclusão, em 3 idiomas.',
        'Ícone de workspace agora é seletor Lucide (sidebar, editor e presets); emoji antigo continua funcionando.',
      ],
    },
    {
      date: '03 ago 2026',
      items: [
        'Voz embarcada sem Docker e sem Python, com confirmação antes do download.',
        'Kanban com imagens de referência e líder avisado de tarefa nova; roles com editor markdown.',
        'Suporte completo a Windows; notificações nativas com marca, workspace e agente.',
      ],
    },
    {
      date: '02 ago 2026',
      items: [
        'Modo Maestro consertado de ponta a ponta: o líder recruta, conecta e distribui sozinho.',
        'Painel de usage dos providers e marketplace de skills (skills.sh) dentro do app.',
        'Orquestração automática no canvas: organograma, arestas vivas, kanban e portal.',
        'Ditado offline com atalho configurável; builds Linux/Windows e fundo do DMG com a marca.',
      ],
    },
    {
      date: '01 ago 2026',
      items: [
        'Nasce o Orkestrai: canvas de agentes, ponte CLI, andares (worktrees), rotinas, roles, kanban, portal e Modo Maestro.',
        'Multi-workspace com resume exato de contexto; app desktop para macOS, Linux e Windows.',
      ],
    },
  ];
</script>

<svelte:head>
  <title>Orkestrai — Como usar</title>
  <meta name="theme-color" content="#0D0B2E" />
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="docs-page">
  <header class="docs-header">
    <Button variant="ghost" size="sm" href="/canvas">
      <ArrowLeft size={15} aria-hidden="true" />
      Canvas
    </Button>
    <h1>Como usar o Orkestrai</h1>
    <span class="docs-spacer"></span>
    <Button variant="outline" size="sm" onclick={rewatchOnboarding}>
      <PlayCircle size={15} aria-hidden="true" />
      Rever apresentação
    </Button>
  </header>

  <div class="docs-layout">
    <aside class="docs-nav">
      <label class="docs-search">
        <Search size={14} aria-hidden="true" />
        <input bind:value={query} placeholder="Filtrar tópicos…" aria-label="Filtrar tópicos" autocomplete="off" spellcheck="false" />
        <kbd class="search-kbd">⌘K</kbd>
      </label>
      <nav aria-label="Tópicos da documentação">
        <a href="#comece" class="nav-link">Comece em 5 minutos</a>
        <a href="#casos-de-uso" class="nav-link">Casos de uso</a>
        {#each filtered as section (section.id)}
          <a href={`#${section.id}`} class="nav-link">{section.title}</a>
        {/each}
        <a href="#changelog" class="nav-link">Changelog</a>
        {#if !filtered.length}
          <span class="nav-empty">Nenhum tópico para “{query}”.</span>
        {/if}
      </nav>
    </aside>

    <div class="docs-content">
      <article class="doc-card quickstart" id="comece">
        <header>
          <span class="icon-chip"><Rocket size={15} aria-hidden="true" /></span>
          <h2>Comece em 5 minutos</h2>
        </header>
        <ol>
          {#each quickstart as step, index (index)}
            <li><span class="step-num">{index + 1}</span><span>{step}</span></li>
          {/each}
        </ol>
      </article>

      <section class="usecases" id="casos-de-uso">
        <h2 class="usecases-title">Casos de uso</h2>
        <div class="usecases-grid">
          {#each useCases as useCase (useCase.title)}
            <article class="doc-card usecase-card">
              <header>
                <span class="icon-chip"><useCase.icon size={15} aria-hidden="true" /></span>
                <h3>{useCase.title}</h3>
              </header>
              <p>{useCase.body}</p>
              <footer>
                {#each useCase.tags as tag (tag)}
                  <span class="usecase-tag">{tag}</span>
                {/each}
              </footer>
            </article>
          {/each}
        </div>
      </section>

      {#each filtered as section (section.id)}
        <article class="doc-card" id={section.id}>
          <header>
            <span class="icon-chip"><section.icon size={15} aria-hidden="true" /></span>
            <h2>{section.title}</h2>
            <a href={`#${section.id}`} class="anchor-link" aria-label={`Link direto para ${section.title}`}>#</a>
          </header>
          <p>{section.body}</p>
        </article>
      {/each}

      <article class="doc-card" id="changelog">
        <header>
          <span class="icon-chip"><History size={15} aria-hidden="true" /></span>
          <h2>Changelog</h2>
          <a href="#changelog" class="anchor-link" aria-label="Link direto para Changelog">#</a>
        </header>
        <div class="changelog-list">
          {#each changelog as entry (entry.date)}
            <section class="changelog-entry">
              <h3 class="changelog-date">{entry.date}</h3>
              <ul>
                {#each entry.items as item, index (index)}
                  <li>{item}</li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      </article>
    </div>
  </div>

  {#if paletteOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette-overlay" onclick={() => (paletteOpen = false)} onkeydown={handlePaletteKeydown}>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="palette-card" onclick={(event) => event.stopPropagation()} role="dialog" aria-label="Buscar na documentacao">
        <label class="palette-input-row">
          <Search size={15} aria-hidden="true" />
          <input
            bind:this={paletteInput}
            bind:value={query}
            placeholder="Buscar nos topicos, casos de uso e changelog…"
            aria-label="Buscar na documentacao"
            autocomplete="off"
            spellcheck="false"
            onkeydown={handlePaletteKeydown}
          />
          <kbd class="search-kbd">esc</kbd>
        </label>
        <ul class="palette-list" role="listbox">
          {#each paletteItems as item, index (item.href + item.title)}
            <li>
              <button
                class="palette-item"
                class:selected={index === paletteSelected}
                role="option"
                aria-selected={index === paletteSelected}
                onclick={() => goToItem(item)}
                onmousemove={() => (paletteSelected = index)}
              >
                <span class="palette-kind">{item.kind === 'caso' ? 'caso de uso' : 'topico'}</span>
                <span class="palette-title">{item.title}</span>
              </button>
            </li>
          {:else}
            <li class="palette-empty">Nada para “{query.trim()}”.</li>
          {/each}
        </ul>
        <p class="palette-hint">↑↓ navega · Enter abre · Esc fecha</p>
      </div>
    </div>
  {/if}
</main>

<style>
  .docs-page {
    min-height: 100vh;
    background: #0D0B2E;
    color: #e6e6eb;
    padding: 24px 24px 80px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
    scroll-behavior: smooth;
  }

  .docs-page > * {
    width: min(1200px, 100%);
  }

  .docs-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .docs-header h1 {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
    text-wrap: balance;
  }

  .docs-spacer {
    flex: 1;
  }

  .docs-layout {
    display: grid;
    grid-template-columns: 230px 1fr;
    gap: 28px;
    align-items: start;
  }

  /* ---- Navegacao lateral ---------------------------------------------- */
  .docs-nav {
    position: sticky;
    top: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: calc(100vh - 40px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .docs-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 9px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    background: #1A1742;
    color: #8b8c96;
    transition: border-color 140ms ease;
  }

  .docs-search:focus-within {
    border-color: rgba(91, 141, 239, 0.55);
  }

  .docs-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 12.5px;
  }

  .docs-search input:focus-visible {
    outline: none;
  }

  .docs-nav nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-link {
    display: block;
    padding: 6px 10px;
    border-radius: 8px;
    color: #a9aab3;
    font-size: 12.5px;
    text-decoration: none;
    line-height: 1.35;
    transition: color 120ms ease, background 120ms ease;
  }

  .nav-link:hover {
    color: #e6e6eb;
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-link:focus-visible {
    outline: 2px solid #7C4DFF;
    outline-offset: 1px;
  }

  .nav-empty {
    padding: 6px 10px;
    font-size: 12px;
    color: #6d6d78;
  }

  /* ---- Conteudo -------------------------------------------------------- */
  .docs-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .doc-card {
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 14px;
    background: #1A1742;
    padding: 18px 20px;
    scroll-margin-top: 20px;
    transition: border-color 160ms ease;
  }

  .doc-card:target {
    border-color: rgba(91, 141, 239, 0.5);
  }

  .doc-card header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .icon-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(91, 141, 239, 0.12);
    color: #7DE5FF;
    flex-shrink: 0;
  }

  .doc-card h2 {
    flex: 1;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    letter-spacing: -0.005em;
    margin: 0;
    color: #e6e6eb;
    text-wrap: balance;
  }

  .anchor-link {
    color: #4a4a55;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    padding: 2px 6px;
    border-radius: 6px;
    transition: color 120ms ease, background 120ms ease;
  }

  .anchor-link:hover {
    color: #7DE5FF;
    background: rgba(91, 141, 239, 0.12);
  }

  .anchor-link:focus-visible {
    outline: 2px solid #7C4DFF;
    outline-offset: 1px;
  }

  .doc-card p {
    margin: 0;
    font-size: 13px;
    line-height: 1.7;
    color: #a9aab3;
    text-wrap: pretty;
    overflow-wrap: break-word;
  }

  /* ---- Quickstart ------------------------------------------------------ */
  .quickstart {
    border-color: rgba(91, 141, 239, 0.28);
    background: linear-gradient(180deg, rgba(91, 141, 239, 0.06), rgba(91, 141, 239, 0.015));
  }

  .quickstart ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  /* ---- Casos de uso --------------------------------------------------- */
  .usecases {
    display: flex;
    flex-direction: column;
    gap: 12px;
    scroll-margin-top: 20px;
  }

  .usecases-title {
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 600;
    margin: 8px 2px 0;
    color: #e5e1ff;
  }

  .usecases-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .usecase-card h3 {
    flex: 1;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 13.5px;
    font-weight: 600;
    margin: 0;
    color: #e6e6eb;
    text-wrap: balance;
  }

  .usecase-card p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.65;
    color: #a9aab3;
    text-wrap: pretty;
  }

  .usecase-card footer {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 10px;
  }

  .usecase-tag {
    font-size: 10px;
    font-weight: 500;
    color: #7de5ff;
    background: rgba(0, 191, 255, 0.1);
    border-radius: 7px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .quickstart li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    line-height: 1.6;
    color: #c9cad2;
    text-wrap: pretty;
  }

  .step-num {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 50%;
    background: rgba(91, 141, 239, 0.16);
    color: #7DE5FF;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* ---- Changelog -------------------------------------------------------- */
  .changelog-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .changelog-date {
    margin: 0 0 6px;
    font-family: 'Sora', 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #7de5ff;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .changelog-entry ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .changelog-entry li {
    font-size: 12.5px;
    line-height: 1.6;
    color: #a9aab3;
    text-wrap: pretty;
  }

  @media (max-width: 900px) {
    .docs-layout {
      grid-template-columns: 1fr;
    }

    .docs-nav {
      position: static;
      max-height: none;
    }
  }

  /* ---- Paleta de busca (Cmd/Ctrl+K) --------------------------------------- */
  .search-kbd {
    flex-shrink: 0;
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #6d6d78;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 1px 5px;
  }

  .palette-overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(8, 7, 24, 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
  }

  .palette-card {
    width: min(560px, calc(100vw - 40px));
    background: #1a1742;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .palette-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    color: #8b8c96;
  }

  .palette-input-row input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: #e6e6eb;
    font-size: 14px;
  }

  .palette-list {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 46vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
  }

  .palette-item.selected {
    background: rgba(91, 141, 239, 0.16);
  }

  .palette-kind {
    flex-shrink: 0;
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #7de5ff;
    background: rgba(0, 191, 255, 0.1);
    border-radius: 6px;
    padding: 2px 7px;
  }

  .palette-title {
    font-size: 13px;
    color: #e6e6eb;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .palette-empty {
    padding: 14px 12px;
    font-size: 12px;
    color: #6d6d78;
  }

  .palette-hint {
    margin: 0;
    padding: 8px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 10.5px;
    color: #6d6d78;
  }

  @media (prefers-reduced-motion: reduce) {
    .doc-card,
    .nav-link,
    .anchor-link,
    .docs-search {
      transition: none;
    }
  }
</style>
