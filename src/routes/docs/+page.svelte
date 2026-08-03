<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ArrowLeft, BookOpen, Cable, FolderPlus, GitBranch, Layers, Link2, MessageSquare,
    PlayCircle, Repeat, Rocket, Search, SquareKanban, SquareTerminal, StickyNote, Users, Workflow,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';

  onMount(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
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
      body: `Um workspace = uma equipe num projeto: diretório de trabalho, ícone e layout do canvas salvos. Crie com o botão + na barra lateral. Vários workspaces rodam ao mesmo tempo — os agentes continuam vivos em background ao trocar. Instruções em AGENTS.md/CLAUDE.md são injetadas nos agentes (edite no lápis ao lado do nome).`,
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
      body: `O nó Tarefas (+ Tarefas na barra inferior) é o quadro do workspace: cartões em A fazer/Fazendo/Feito. Atribuir um cartão a um agente despacha a tarefa direto para o terminal dele (loop contínuo) — ele trabalha e marca done sozinho. O líder opera o quadro pela CLI: orkestrai task list/add/assign/done.`,
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
      id: 'cli',
      icon: MessageSquare,
      title: 'CLI orkestrai (a ponte)',
      body: `Os agentes usam a CLI orkestrai para agir no canvas: list --agent <id> (agentes, suas notas e portais), ask (perguntar a outro agente), note read/write/edit/create, task list/add/assign/done, role show/write/edit, floor create/list/preview/land/remove, notify (notificação nativa para você), recruit/dismiss/connect/reassign (Modo Maestro), portal (automação de browser). O token fica em .orkestrai/workspace.json no diretório do workspace.`,
    },
    {
      id: 'atalhos',
      icon: BookOpen,
      title: 'Atalhos',
      body: `⌘P paleta · ⌘⇧A próxima atenção · ⌘⇧T organizar · ⌘G agrupar · ⌘⇧G desagrupar · N nova nota · L conectar selecionados · Alt+1…9 focar terminal · Alt+Espaço ditado por voz (configurável em Configurações) · ⌘F buscar no terminal · ⌘Z desfazer · Backspace excluir. Lista completa em Configurações.`,
    },
  ];

  let query = $state('');

  const filtered = $derived.by(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sections;
    return sections.filter((section) => `${section.title} ${section.body}`.toLowerCase().includes(term));
  });

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
  ];
</script>

<svelte:head>
  <title>Orkestrai — Como usar</title>
  <meta name="theme-color" content="#0D0B2E" />
</svelte:head>

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
      </label>
      <nav aria-label="Tópicos da documentação">
        <a href="#comece" class="nav-link">Comece em 5 minutos</a>
        <a href="#casos-de-uso" class="nav-link">Casos de uso</a>
        {#each filtered as section (section.id)}
          <a href={`#${section.id}`} class="nav-link">{section.title}</a>
        {/each}
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
    </div>
  </div>
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

  @media (max-width: 900px) {
    .docs-layout {
      grid-template-columns: 1fr;
    }

    .docs-nav {
      position: static;
      max-height: none;
    }
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
