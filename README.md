# Orkestrai

**Orquestre times de agentes de IA num canvas visual.** Orkestrai é um app
desktop (Electron) para macOS, Windows e Linux onde você monta equipes de
agentes — Claude Code, Codex e Kimi — e os vê trabalhar em tempo real:
terminais vivos, notas compartilhadas, kanban, portais de browser e andares
(git worktrees) — tudo num canvas só.

## O que ele faz

- **Canvas multi-agente** (Svelte Flow): arraste terminais PTY reais (shell,
  Claude, Codex, Kimi), notas, portais (browser embutido), quadro de tarefas,
  loops, árvore de arquivos e formas. Conexões com cordas elásticas mostram
  quem fala com quem — e mudam de cor quando a conversa acontece.
- **Modo Maestro**: marque um agente como líder e ele orquestra de verdade —
  propõe o time, recruta (`orkestrai recruit`), distribui tarefas no kanban,
  escreve briefings em notas conectadas ao time, cria portais para testar o
  resultado e dispensa o que não precisa mais. Agentes trabalham em andares
  isolados (worktrees) e o líder integra com preview de conflitos.
- **Ponte `orkestrai` (CLI)**: os agentes conversam entre si e com o canvas
  (`ask`, `note`, `task`, `portal`, `floor`, `notify`...) — nasce instalada e
  autenticada em todo workspace, sem configurar nada.
- **Multi-workspace**: vários projetos abertos ao mesmo tempo, com indicador
  de atividade e notificações nativas quando algo termina ou precisa de você.
- **Ditado e voz de volta em pt-BR, 100% locais**: fale com o ditado por voz
  (atalho configurável ou pela bolinha no topo direito, que dita direto para
  o líder) e ouça as respostas dos agentes em voz alta. Na
  primeira vez o app baixa ~790 MB uma única vez (pede confirmação antes).
  Se preferir, use um serviço de voz externo seu em Configurações.
- **Marketplace de skills**: busque e instale skills do skills.sh direto no
  workspace.
- **Painel de usage**: cota de cada provider (5h/semanal, plano, data de
  reset), ao vivo, sem configurar nada — lê as credenciais locais das CLIs.
- **Painel de portas**: veja listeners usados pelos Portais locais do workspace
  e encerre dev servers esquecidos com confirmação, escopo por workspace e
  proteção do próprio servidor do Orkestrai.
- **Resume de contexto**: feche o app e volte — cada terminal retoma a sua
  conversa exata (session-id real da CLI, por terminal).
- **Rotinas e roles**: agende prompts recorrentes para agentes e atribua
  responsabilidades reutilizáveis.

## Requisitos

- Node.js 24+ e npm 11+
- As CLIs dos agentes que você quiser usar: Claude Code, Codex CLI, Kimi Code
- Para o app desktop: nada mais — o empacotado usa só prebuilds (sem MSVC,
  sem Xcode CLI tools além do Git)

## Rodar em desenvolvimento

```bash
npm install
npm run dev            # web (SvelteKit) em http://localhost:5173
npm run electron:dev   # app desktop (build + Electron)

# Voz (ditado + agentes falando em pt-BR): funciona out-of-the-box.
# Na 1a vez o app baixa ~790 MB uma unica vez (pergunta antes) e depois
# tudo roda local. Para usar um servico de voz externo (Docker), veja
# Configuracoes > Voz e o voice-stack em AGENTS.md (doc de desenvolvedor).
```

## Empacotar

| Plataforma | Comando | Artefato |
|---|---|---|
| macOS (Apple Silicon) | `npx electron-builder --mac dmg` | `release/Orkestrai-*-arm64.dmg` |
| macOS (Intel) | `npx electron-builder --mac dmg --x64` | `release/Orkestrai-*.dmg` |
| Windows | `scripts/package-cross.sh windows` (Docker) ou build nativo — ver `docs/build-windows.md` | NSIS / zip |
| Linux | `scripts/package-cross.sh linux` (Docker) | AppImage |

Detalhes e decisões de empacotamento (Electron pinado, `asar` off, ícones,
assinatura): `docs/build-windows.md` e `AGENTS.md`.

## Testes

```bash
npm test              # vitest (unit + feature)
npx playwright test   # e2e contra o build de produção
```

## Stack

SvelteKit 5 (runes) + Svelar (ORM, migrations, DDD modular) + SQLite
(better-sqlite3) + node-pty + Electron 42 + @xyflow/svelte + shadcn-svelte +
Superforms/Zod.

## Documentação

- `AGENTS.md` — convenções do projeto (arquitetura, bridge, canvas, Electron)
- `docs/build-windows.md` — build nativo no Windows
- `docs/plano-maestro.md` — plano mestre do produto
