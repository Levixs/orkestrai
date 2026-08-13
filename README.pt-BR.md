<p align="center">
  <img src="orkestrai-branding/logo.svg" alt="Orkestrai" width="360">
</p>

<p align="center">
  <strong>Orquestre times de IA para criar, projetar, divulgar e entregar em um canvas visual.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> · Português (Brasil) · <a href="README.es.md">Español</a>
</p>

Orkestrai é um aplicativo desktop local-first para macOS, Windows e Linux. Ele
reúne Claude Code, Codex CLI, Kimi Code, OpenCode, Cursor, Antigravity, Cline,
Devin, shells, tarefas, notas,
navegadores e worktrees Git em um canvas persistente onde devs, vibe coders,
designers, marketers e creators podem dirigir um time de IA em tempo real.

Baixe os instaladores mais recentes em
[beeblock/orkestrai](https://github.com/beeblock/orkestrai/releases/latest).

## Destaques

- **Canvas de agentes ao vivo:** organize terminais PTY reais, notas, quadros de
  tarefas, portais de browser, árvores de arquivos, loops e formas. As conexões
  mostram a colaboração entre os agentes enquanto ela acontece.
- **Workbench configurável:** mantenha terminais, quadros, notas, portais,
  arquivos, fluxos e uso abertos em abas verticais por padrão ou horizontais
  opcionais, e organize até oito artefatos ao vivo em divisões redimensionáveis
  para a direita ou para baixo. As abas mudam de painel por arrastar e soltar ou
  por um menu acessível. O Workbench referencia os artefatos do canvas sem
  duplicar sessões, enquanto arquivos permanecem abas locais, e a bolinha de voz
  acompanha o workspace ativo e seu líder.
  O rodapé mantém visíveis todas as janelas de cota reportadas por Claude, Codex
  e Kimi sem exigir a abertura de outro painel.
- **Central de controle operacional:** acompanhe tarefa atual, estado, duração,
  provider, role e uso de cada agente. A caixa persistente comprova se cada
  handoff entrou na fila, foi entregue, recebido, respondido ou falhou sob um
  id de mensagem, sem acordar terminais ociosos após reiniciar.
- **Central de revisão Git:** inspecione alterações staged e unstaged, compare
  arquivos em um diff Monaco, crie revisões ligadas a tarefas e responsáveis,
  deixe comentários persistentes por arquivo e linha, e aprove, rejeite ou peça
  mudanças. O feedback volta ao agente responsável sem perder o histórico.
- **Portal Design Mode:** aponte o elemento exato da interface que precisa de
  atenção, revise seu screenshot recortado e contexto visual seguro e registre
  o feedback em uma tarefa nova para triagem do líder, uma tarefa atribuída ou
  uma tarefa existente. Segredos e estado oculto ficam de fora.
- **Decisões com Council:** peça perspectivas independentes e limitadas por
  orçamento a dois a cinco agentes reais sobre uma tarefa ou objetivo, compare
  o mesmo contrato de evidências, riscos, testes, divergências e confiança e
  registre a seleção, pedido de consenso ou rejeição humana. Protótipos ficam
  em andares Git isolados e só aterrissam após uma prévia segura explícita.
- **Busca universal:** pressione `Cmd/Ctrl+K` para encontrar workspaces, agentes,
  tarefas, notas, roles, skills, arquivos, configurações e comandos, com itens
  recentes/favoritos e abertura no painel atual, à direita ou abaixo.
- **Editor local rico e prévias:** navegue pela árvore nativa do workspace e
  abra arquivos diretamente em abas locais do Workbench, sem criar nós no
  canvas. O Monaco carregado sob demanda preserva undo, cursor e estado não salvo,
  busca/substituição, formatação, símbolos, minimapa, quebra de linha e autosave
  opcional. Markdown, PDFs e imagens têm prévia offline; binários mostram
  metadados seguros e abrem no aplicativo do sistema.
- **Materiais de referência compartilhados:** solte, cole ou selecione imagens,
  PDFs, arquivos e links HTTP/HTTPS em prompts de agentes, cartões, notas e
  composers. Arquivos de até 10 MB ficam no workspace em
  `.orkestrai/attachments/`, e o agente recebe o path relativo ou URL completo.
- **Modo Maestro:** defina um líder que pode propor um time, recrutar agentes,
  delegar briefings completos, coordenar o trabalho e dispensar agentes quando
  não forem mais necessários.
- **Times prontos:** inicie ou amplie um workspace com presets de Produto,
  Campanha e lançamento, Brand e design, Conteúdo e SEO, React, Next.js,
  SvelteKit, Svelar, Laravel e Orkestrai Contributing. Os agentes iniciam no
  modo autônomo de acesso total e com roles no nível nativo de system/developer
  prompt, com frontmatter válido no arquivo de agente Kimi e sem instruções
  longas bloqueando o terminal como texto colado. O líder recebe e atribui a
  tarefa inicial completa sem pedidos repetidos de permissão.
- **Fluxos que combinam com o trabalho:** nomeie, dê cores e ordene até dez etapas
  do quadro. Líder e agentes descobrem e atualizam o mesmo processo sozinhos.
- **Visões operacionais do time:** instale funções especializadas por um
  catálogo com 12 roles e acompanhe título, etapa e responsável de cada tarefa,
  além do estado Git de cada andar.
- **Ponte nativa para agentes:** a CLI `orkestrai` e o servidor MCP incluídos no
  app expõem comandos tipados para mensagens, tarefas, notas, portais, andares,
  roles e notificações desktop.
- **Workspaces paralelos:** os agentes continuam trabalhando quando você muda de
  workspace, com indicadores de atividade e notificações nativas.
- **Andares Git:** isole o trabalho em worktrees, inspecione conflitos e integre
  alterações concluídas pelo canvas.
- **Voz local:** dite em qualquer campo de texto ou use o atalho do workspace sem
  foco para o líder e ouça respostas em português brasileiro, inglês americano
  ou espanhol latino-americano. O badge da bolinha mostra se ela está fixada ou
  livre e abre diretamente os controles de posição; o tooltip também revela o
  atalho da plataforma. STT e TTS rodam na máquina do usuário.
- **Delegação por cota:** fixe o uso de Claude, Codex e Kimi no canvas, configure
  origem, fallback, janela de 5 horas/semanal/mensal e limite e deixe o líder
  consultar a mesma recomendação pela CLI ou ponte MCP antes de atribuir trabalho
  novo.
- **Aparência personalizada:** escolha entre três temas escuros e um claro ou
  duplique um deles e edite tokens semânticos com prévia e importação/exportação JSON.
- **Terminais legíveis:** escolha uma entre 10 paletas ANSI completas no menu
  compacto do terminal, junto aos controles de provider, role, recarga e Maestro.
- **Controles operacionais:** gerencie portas de portais locais, configure rotinas
  recorrentes e instale skills pelo marketplace.
- **Central de Providers:** detecte localmente as oito CLIs compatíveis, siga a
  instalação adequada ao sistema e o login oficial, e veja capacidades sem
  enviar credenciais dos providers ao Orkestrai.
- **Barra de agentes pessoal:** escolha qualquer serviço em um menu Agentes
  compacto e fixe até quatro favoritos prontos entre workspaces e reinícios.
- **Providers substituíveis:** troque um membro de Claude para Codex, Kimi ou
  outro provider instalado preservando role, andar e conexões.
- **Continuidade de sessão:** cada terminal retoma sua própria conversa do
  provider depois que o aplicativo é fechado e aberto novamente.

## Plataformas Suportadas

| Plataforma | Arquiteturas | Pacote |
| --- | --- | --- |
| macOS | Apple Silicon e Intel | DMG e ZIP de atualização |
| Windows | x64 | Instalador NSIS |
| Linux | x64 | AppImage |

O aplicativo desktop utiliza as CLIs de agentes instaladas localmente. Instale e
autentique somente os providers que pretende usar:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex CLI](https://github.com/openai/codex)
- [Kimi Code](https://www.kimi.com/code)
- [OpenCode](https://opencode.ai/)
- [Cursor Agent CLI](https://docs.cursor.com/en/cli/overview)
- [Antigravity CLI](https://antigravity.google/docs/cli/getting-started)
- [Cline CLI](https://docs.cline.bot/cli/cli-reference)
- [Devin CLI](https://docs.devin.ai/cli)

Você não precisa instalar todos os providers nem conhecer terminal. O Orkestrai
ativa as CLIs que detectar, mantém cada conversa separada e permite organizar os
agentes pelo resultado: pesquisa, design, conteúdo, marketing, produto,
engenharia ou revisão.
Abra a Central pelo ícone de cabo no canvas, `Cmd/Ctrl+2` ou o menu nativo
Workspace para preparar um provider e verificá-lo novamente após a instalação.
Novas instalações começam em inglês e perguntam o idioma preferido como primeira
etapa do onboarding.

## Desenvolvimento

Requisitos:

- Node.js 24 ou mais recente
- npm 11 ou mais recente
- Git

```bash
git clone https://github.com/beeblock/orkestrai.git
cd orkestrai
npm ci

npm run dev            # SvelteKit em http://localhost:5173
npm run electron:dev   # build de produção seguido pelo Electron
```

A voz funciona sem Docker ou Python. No primeiro uso, o Orkestrai pede
confirmação antes de baixar o runtime embarcado e os modelos locais. Um sidecar
de voz compatível com OpenAI continua disponível como backend opcional.

## Arquitetura

Orkestrai utiliza Svelte 5, SvelteKit, Electron, Svelar, SQLite, `node-pty` e
`@xyflow/svelte`.

- `src/lib/modules/agent-room/` contém as camadas de aplicação, domínio,
  persistência, PTY, bridge, voz e adapters de providers.
- `src/routes/canvas/`, `src/routes/terminal/` e
  `src/lib/components/agent-room/canvas/` implementam as duas visualizações do
  workspace desktop.
- `packages/orkestrai-cli/` fornece a CLI e a ponte MCP usadas pelos agentes.
- `electron/` controla o ciclo de vida desktop, notificações nativas e updates.
- `docs/` contém a documentação de build e releases.

Leia [AGENTS.md](AGENTS.md) antes de alterar a arquitetura. O arquivo documenta
o fluxo obrigatório do Svelar, regras de i18n, disciplina de release e restrições
de plataforma.

## Verificações De Qualidade

```bash
npm test
npm run build
npm run test:e2e
```

Os testes end-to-end rodam em série contra o build de produção. Siga as regras
de limpeza do [AGENTS.md](AGENTS.md) depois de builds de instaladores ou E2E.

## Como Contribuir

Contribuições são bem-vindas. Comece por [CONTRIBUTING.md](CONTRIBUTING.md) e
use GitHub Issues para bugs reproduzíveis e propostas objetivas. Relate problemas
de segurança de forma privada conforme [SECURITY.md](SECURITY.md).

## Releases

As tags seguem Versionamento Semântico. O workflow `Release Desktop` compila
todas as plataformas, valida os manifests de atualização e publica os artefatos
verificados nas [Releases do GitHub](https://github.com/beeblock/orkestrai/releases).
Consulte [docs/releases.md](docs/releases.md) para o processo completo.

## Licença

O Orkestrai é licenciado sob a [Apache License 2.0](LICENSE). Componentes de
terceiros e modelos baixados continuam sujeitos às licenças listadas em
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
