# Changelog — Orkestrai

Todas as mudanças notáveis do projeto, em português, da mais recente para a mais antiga.

## 2026-08-04

**Tooltips, busca e polish**
- **Tooltips em TODA a toolbar**: cada ferramenta (Shell, Nota, Arquivos, Diff, Portal, Loop, Tarefas, Fluxo, Forma, Andares, Rotinas, Roles, Usage) explica o que faz ao passar o mouse — componente `ToolbarButton` com tooltip shadcn.
- **⌘K / Ctrl+K global**: de qualquer tela, abre a busca da documentação (tópicos, casos de uso, quickstart e changelog), com navegação por setas/Enter/Esc.
- Fix: desenhar um **Fluxo** pela toolbar funciona (schema de tipos aceita `flow`).

**i18n: app em Português, English e Español**
- Internacionalização com paraglide (Svelar): seletor de idioma em Configurações aplica **na hora** — a interface remonta no idioma escolhido, sem reload.
- Migradas nesta leva: página de Configurações inteira, tooltips da toolbar e o estado vazio do canvas. As demais telas entram nas próximas levas (a regra no AGENTS.md exige `m.*()` em toda string nova).

**Design pass**
- Página **Skills & MCPs redesenhada** no mesmo shell das Configurações: cabeçalho fixo, seletor de workspace no topo, abas segmentadas, seções com icon-chips e cartões com badges (oficial/curadoria/1 clique) — fim da coluna estreita com rótulos cinza.
- Página **"Como usar"** polida: tipografia com balanceamento de títulos, datas do changelog com números tabulares, rolagem suave por âncoras.

**Onboarding interativo (tours guiados)**
- Novo onboarding em 3 etapas: boas-vindas → criação do workspace inline → escolha do **caso de uso** para explorar.
- **11 tours guiados** (todos os casos de uso): o painel-guia no canvas conduz passo a passo até o caso funcionar — com botão **"Fazer por mim"** que cria os artefatos de verdade (agentes, notas, quadro, tarefas, conexões, portais, fluxos, rotinas, andares, MCPs) e **auto-conclusão** quando o passo aparece no workspace.
- Tudo em pt-BR/English/Español desde o nascimento; adicionar um caso de uso novo = um objeto no catálogo (`tours/catalog/{pt-BR,en,es}.ts`) com testes de integridade garantindo estrutura idêntica nos 3 idiomas.

**Ícone de workspace em Lucide**
- O campo "Ícone (emoji)" do editor de workspace virou um **seletor de ícones Lucide** (grid com 24 opções; clique de novo para desmarcar).
- Sidebar, presets e o seletor de preset renderizam o ícone Lucide; ícones antigos em emoji continuam funcionando (o editor avisa e oferece a troca).

**Marketplace de MCPs**
- Nova aba **MCPs** na página Skills: pesquise e instale servidores MCP como quem instala skills — curadoria dos oficiais/populares (GitHub, Gmail, Google Drive, Figma, Vercel, Postgres, Brave, DeepWiki...) mais busca no registry oficial do MCP.
- Servidores remotos instalam com **1 clique** (só a URL); os que pedem chave/token abrem um diálogo explicando onde conseguir cada campo.
- Avançado: edição manual do `.mcp.json` continua no editor do workspace, agora com suporte a `env` e servidores por URL.

**Feedback de usuário Windows (pacote)**
- **Composer não fica mais pendurado**: a resposta de um agente a outro agora é **submetida automaticamente** — antes ficava parada na caixa de texto do compositor e ia junto no próximo Enter sem querer.
- **Reconexão após suspensão**: o notebook dormiu e matou a conexão? O terminal reconecta sozinho (6 tentativas com espera crescente) e, se a sessão morreu, recria **com o contexto** — sem mais "conexão encerrada" permanente.
- **Botão Recarregar em cada terminal**: reinicia a sessão com o contexto — útil após suspensão ou atualização da CLI do provider (que pede reinício). O Descarregar do workspace tem o mesmo efeito para o time inteiro.
- **Janelas pequenas sem botões vazando**: nós nunca nascem menores que o mínimo do tipo — o desenho livre respeita o tamanho mínimo de cada janela.
- **Textos para não-devs**: tooltips de Diff/Loop/Andares em linguagem simples e nova seção "Diff, Loop & Andares — sem medo" na página Como usar.

**Multi-workspace sem conflito de portas**
- Novo comando `orkestrai port`: devolve uma porta livre de verdade (e `--check <porta>` testa uma). A skill da ponte agora ensina os agentes a sempre subir dev servers em porta livre e a **nunca matar processos por porta** (podiam derrubar o servidor de outro workspace).
- Botão "Descarregar" com confirmação e feedback (quantos terminais foram encerrados).
- Tela de Configurações redesenhada; changelog dentro do app (página "Como usar").

**Atualizações automáticas**
- O app agora procura versão nova sozinho (no boot e a cada 6h), baixa em segundo plano com verificação de integridade e instala na troca — a versão atual nunca é tocada antes da nova estar pronta, e seus dados ficam fora do instalador.
- Configurações mostra a versão instalada e tem "Verificar agora"; se a instalação automática falhar, o app oferece o download manual.
- Skeleton loaders (shadcn) nos pontos de carregamento: lista de workspaces, painel de usage, busca de skills e Configurações — sem mais pulos/flash de estado vazio na UI.
- Toolbar do canvas com setas de scroll quando os itens não cabem na tela.

**Kanban com histórico**
- Tarefas concluídas podem ser **arquivadas** (botão no cartão ou "arquivar todas" na coluna Feito): saem do quadro mas nada é apagado — a nova visão de **Histórico** no nó Tarefas mostra tudo que já foi entregue, com responsável e data.
- O líder faz o mesmo pela CLI: `orkestrai task archive <id>`, `task archive-done` e `task history`.

**Vínculo tarefa ↔ nota**
- Cada tarefa pode ter **uma nota de spec vinculada** (a mesma nota pode servir várias tarefas): pelo cartão (ícone de corrente) ou pela CLI (`task add --note`, `task link`, `task unlink`).
- Ao **arquivar** a tarefa, a nota vinculada sai do canvas junto — mas continua guardada: o chip de nota no histórico abre o conteúdo mesmo arquivado.
- Proteções: nota vinculada **não apaga pelo X** do canvas (mostra qual tarefa a prende); **apagar a tarefa apaga a nota junto** quando ela é a última referência.

**Presets de equipe (templates de workspace)**
- "Salvar como preset" no editor do workspace guarda o time inteiro: agentes (provider/líder/roles), layout, notas com conteúdo e rotinas — sem nada de runtime.
- Ao criar um workspace novo, "Começar de um preset" instancia tudo no projeto; aplicar num workspace existente soma o time sem apagar nada.

**Ecossistema: MCP, tools CLI, presets completos e fluxos**
- **Orkestrai como servidor MCP** (`orkestrai mcp`): as ações do canvas viram tools nativas tipadas para agentes que falam MCP; o `.mcp.json` é provisionado por workspace (merge, sem clobberar o seu).
- **Gerenciador de MCPs** no editor do workspace (adicionar/remover servidores).
- **Tools CLI novas**: `fs read/write/search`, `say` (TTS), `run` (re-despacho), `notes`, `portals`, `clip`.
- **Presets completos**: levam tarefas-template e servidores MCP; gerenciamento (renomear/apagar) nas Configurações.
- **Fluxos no canvas**: nó Fluxo com passos em sequência (agente/aprovação), `{{input}}` encadeado, repetição com limite, aprovação humana, progresso ao vivo e histórico de execuções.

**Voz: resposta completa e limpa (transcrito da CLI)**
- A fala de resposta agora lê o **transcrito oficial da sessão** (o JSONL que Claude/Codex/Kimi gravam em disco) em vez de raspar a tela do terminal: vem a **resposta completa** do agente, sem caracteres invisíveis, molduras ou logs de ferramentas.
- Se a sessão ainda não tem id rastreado, cai no método anterior como fallback.

**Voz (ditado + agentes falando em pt-BR)**
- Ciclo de conversa por voz: você dita, o agente responde **falando** — a captura da resposta arma só após o Enter e não repete texto já falado.
- Voz 100% autocontida: o app baixa um runtime próprio junto com o modelo de voz — não depende mais de Node.js instalado na máquina.
- Sotaque brasileiro de verdade: correção do idioma do sintetizador (estava português europeu) e do mapeamento de vozes (estava deslocado, saindo voz estrangeira).
- A fala lê só a resposta atual do agente — sem markdown, URLs, emojis, caracteres de controle ou logs de ferramentas.
- Verificação de espaço em disco antes de baixar o modelo de voz (~2 GB livres exigidos, aviso na modal).
- Opção de apagar o modelo de voz para liberar espaço (Configurações), com download progressivo visível.

**Kanban**
- Correção: anexar imagem nos cartões não funcionava (nem Ctrl+V nem seletor) — agora funciona pelos dois caminhos, com mensagem de erro visível se algo falhar.

**Canvas & formas**
- Seta: cabeça não deixa mais a ponta da linha vazando na frente.
- Painel de estilo: sliders funcionando, dropdowns por cima do painel, X fecha com um clique, cabeça da seta configurável.
- Seta com pontos-âncora arrastáveis e curva suave.

**Providers**
- Usage do Kimi renova a credencial sozinho (sem mais "credencial expirada" falso).

## 2026-08-03

**Voz**
- Voz embarcada sem Docker e sem Python: ditado e fala rodam local, com modal de confirmação antes do download único.
- Serviço de voz externo (Docker) vira opção avançada, com porta configurável.
- Textos de voz em linguagem simples, sem jargão técnico.

**Kanban & roles**
- Kanban com imagens de referência nos cartões e líder avisado automaticamente de tarefa nova.
- Editor markdown nas roles (abas Escrever/Preview).

**Windows**
- Suporte completo: resolução das CLIs de agente (PATH do registro + .cmd), git e hooks de andares, boot do servidor empacotado.
- Correção: Codex não submetia tarefas (Enter colado ao texto).

**Geral**
- Notificações nativas com a marca, o workspace e o nome do agente.
- README reescrito refletindo o app atual.

## 2026-08-02

**Orquestração**
- Correção crítica: o líder nascia sem contexto de orquestração — ponte CLI reparada de ponta a ponta; o Modo Maestro agora recruta, conecta e distribui de verdade.
- Orquestração automática no canvas: time organizado em organograma, arestas que acendem durante conversas, kanban e portal adicionados automaticamente.
- Resume com session-ids distintos por terminal (cada agente retoma a própria conversa).

**Novidades**
- Painel de usage dos providers (cota de 5h/semanal, plano, reset) ao vivo.
- Marketplace de skills do skills.sh dentro do app.
- Ditado por voz offline com atalho configurável.
- Fundo personalizado do DMG de instalação (marca, mascote Nodo e seta de arraste).

**Empacotamento**
- Builds Linux/Windows locais via Docker; ícones dos três sistemas no padrão da marca.

## 2026-08-01

**Renascimento como Orkestrai**
- Rebrand completo (de Pantheon para Orkestrai): identidade, mascote Nodo, splash animada e assets de marca.
- Núcleo de orquestração: terminais PTY reais, ponte CLI `orkestrai`, andares (worktrees), rotinas, roles, kanban de tarefas, portal (browser dos agentes) e Modo Maestro.
- Canvas novo: nós (terminal, nota, arquivos, diff, portal, loop, tarefas), conexões com física de corda, toolbar compacta e onboarding.
- Multi-workspace: vários projetos abertos ao mesmo tempo, com resume exato de contexto ao reabrir o app.
- Empacotamento desktop (Electron) para macOS, Linux e Windows, com resiliência de dados (backups rotativos do banco).

## 2026-06-10

- Início do projeto: Agent Room com chat dual-agent e adaptadores de CLI (Claude, Codex, Kimi).
