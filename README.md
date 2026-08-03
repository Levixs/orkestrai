# Orkestrai Agent Room

Aplicativo local para conversar com dois agentes no mesmo ambiente:

- Usuario humano
- Codex via `codex exec`
- Claude via `claude -p --output-format json`

O MVP usa Svelar/SvelteKit, SQLite local e adaptadores baseados em `spawn`, sem montar comandos por string de shell.

## Requisitos

- Node.js 20+
- npm 10+
- Codex CLI instalado para respostas do Codex
- Claude Code CLI instalado para respostas do Claude

O app detecta CLIs ausentes na barra lateral e tambem registra o erro quando uma execucao falha.

## Instalar

```bash
npm install
npm run migrate
```

O banco interno do Svelar fica em `database.db`. O historico do Agent Room fica em `data/app.sqlite`.

## Rodar

```bash
npm run dev
```

Abra `http://localhost:5173`.

## Como Usar

1. Crie ou selecione uma conversa.
2. Escreva uma mensagem no chat.
3. Escolha o estilo: Chat, Planejar, Implementar ou Revisar.
4. Escolha o alvo: Codex, Claude, Sala 3 vias ou um fluxo de revisao.
5. Envie.

Na `Sala 3 vias`, Codex responde primeiro e Claude responde em seguida ja vendo a fala do Codex. Na proxima mensagem, ambos recebem o historico recente compartilhado, incluindo o que usuario, Codex e Claude disseram antes. O botao `Debater` roda uma rodada controlada de quatro turnos com historico atualizado entre os agentes.

O botao `Loop` inicia um Ralph loop: Codex trabalha no objetivo, Claude revisa, e novas rodadas continuam ate os dois finalizarem a mesma rodada com `STATUS: DONE` ou ate atingir o limite configurado na tela. Se qualquer agente responder `STATUS: CONTINUE`, o loop segue com o historico atualizado.

O historico persiste em `data/app.sqlite` e volta ao recarregar a pagina.
Use os icones de lapis e lixeira na barra lateral para renomear ou apagar uma conversa.
Durante `Enviar`, `Debater` e `Loop`, a tela mostra um painel de atividade ao vivo com stdout/stderr das CLIs e eventos de rodada. O botao `Parar` aborta a requisicao e o backend tenta encerrar a arvore de processos da CLI.

## Ditado Local Com Whisper WASM

O composer suporta dois motores de ditado:

- `Reconhecimento do navegador`: usa a API nativa de fala do browser e e o padrao por ser mais estavel para hotkey.
- `Whisper WASM`: roda `whisper.cpp` no navegador, sem backend de transcricao, mas pode falhar em navegadores que quebram workers WASM.

- Aperte `Alt+Espaco` para iniciar a gravacao.
- Fale normalmente.
- Aperte `Alt+Espaco` de novo para parar.
- O texto transcrito entra no campo da mensagem, sem envio automatico.
- Nao e necessario clicar no campo antes; quando a transcricao chega, o campo recebe foco.
- Use o seletor `Auto PT/EN`, `PT-BR` ou `EN` antes de gravar.
- No modo `Reconhecimento do navegador`, o microfone e definido pelo navegador/sistema.
- No modo `Whisper WASM`, use o seletor `Microfone` para escolher a entrada, por exemplo um headset JBL em vez do microfone padrao/iPhone.
- A ultima transcricao tambem aparece abaixo dos controles com um botao `Inserir`, caso o texto tenha sido reconhecido mas nao tenha entrado automaticamente no campo.

No primeiro uso do `Whisper WASM`, o navegador baixa e cacheia o modelo `base-q5_1` em IndexedDB. `Auto PT/EN` e `PT-BR` usam o modelo multilingual; `EN` usa o modelo ingles. O processamento roda localmente no browser e exige suporte a `SharedArrayBuffer`/Cross-Origin Isolation. A transcricao usa 1 thread para evitar falhas de worker/pthread em navegadores que aceitam WASM mas quebram no modo multithread.

Observacao: alguns navegadores so mostram os nomes reais dos microfones depois que voce concede permissao de microfone pela primeira vez. Se aparecer `Microfone 1`, inicie/pare uma gravacao curta, depois abra o seletor de novo.

## Projetos E Escrita

Projetos sao criados dentro de `projects/`.

Chamadas comuns usam sandbox `read-only`. Para habilitar full access:

1. Crie ou selecione um projeto.
2. Ative `Full access no projeto`.
3. Confirme o dialogo do navegador.

Com full access, o backend ainda exige um projeto selecionado e inicia as CLIs dentro de `projects/`, mas remove bloqueios das CLIs:

- Codex usa `codex exec --dangerously-bypass-approvals-and-sandbox`.
- Claude usa `claude -p --dangerously-skip-permissions`.

## Endpoints Principais

- `GET /api/agent-room/conversations`
- `POST /api/agent-room/conversations`
- `PATCH /api/agent-room/conversations/:id`
- `DELETE /api/agent-room/conversations/:id`
- `GET /api/agent-room/conversations/:id/messages`
- `POST /api/agent-room/conversations/:id/run-agent`
- `POST /api/agent-room/conversations/:id/debate`
- `POST /api/agent-room/conversations/:id/loop`
- `GET /api/agent-room/projects`
- `POST /api/agent-room/projects`
- `GET /api/agent-room/status`

## Arquivos Importantes

- `src/lib/modules/agent-room/application/orchestrator.ts`
- `src/lib/modules/agent-room/application/agents.ts`
- `src/lib/modules/agent-room/infrastructure/db.ts`
- `src/routes/+page.svelte`
- `data/app.sqlite`
- `projects/`
