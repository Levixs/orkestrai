# Mudanças de build/empacotamento — 2026-08-03 (feitas no Windows)

> Handoff para o agente do macOS. Resume o que foi alterado, **por que**, o que é
> seguro cross-platform e **o que você precisa revalidar no Mac**. Nada foi
> commitado ainda (decisão do dono).

## TL;DR

Três arquivos alterados no working tree (não commitados):

| Arquivo | Mudança | Escopo |
|---|---|---|
| `scripts/orkestrai-server.mjs` | `pathToFileURL()` no `import()` das migrations | **Runtime, cross-platform** (conserta Windows, no-op no Mac) |
| `package.json` | `electron:rebuild` `-w`→`-o` **+** exclusões de `node_modules` no `build.files` | rebuild = Windows; exclusões = **todas as plataformas** |
| `docs/build-windows.md` | comandos corrigidos + notas | doc do Windows |
| `.../infrastructure/agent-path.ts` **(novo)** + `PtySessionManager.ts` + `application/agents.ts` + `application/adapters/{Claude,Codex,Kimi,OpenCode}Adapter.ts` | resolve CLI de agente no Windows (PATH do registro + PATHEXT/.cmd), num módulo compartilhado por canvas/PTY, Maestro e detecção | **Runtime, Windows** (no-op no Mac/Linux) |
| `.../infrastructure/pty/AgentSessionTracker.ts` | slug do dir de sessões do claude cross-platform (`:` `/` `\` → `-`) — conserta o resume no Windows | **Runtime, cross-platform** (macOS idêntico ao de antes) |
| `application/services/{Git,Floor}Service.ts` + `application/orchestrator.ts` | chamadas `git` passam `env: agentEnv()` (PATH do registro); `FloorService` usa `cmd.exe` no lugar de `/bin/sh` | **Runtime, cross-platform** (Mac: só adiciona dirs ao PATH) |

`package-lock.json` **não** foi alterado (foi revertido de propósito — ver §4).

---

## 1. Fix do servidor — o bug que impedia o app de abrir no Windows

**Sintoma:** no Windows o app abria a splash e fechava após ~30s. No Mac funcionava
perfeitamente.

**Causa:** em `scripts/orkestrai-server.mjs`, as migrations eram carregadas com
`await import(resolve(migrationsDir, file))`. O `resolve()` devolve um caminho
**absoluto** e, no Windows, isso vira `C:\...\0001.ts` — o loader ESM do Node
interpreta o `C:` como *scheme de URL* e lança
`ERR_UNSUPPORTED_ESM_URL_SCHEME`. O servidor morria antes de escutar a porta; o
`waitForServer` (30s) em `electron/main.cjs` estourava e o Electron chamava
`app.exit(1)`. No macOS/Linux os caminhos são POSIX (`/...`) e o `import()` aceita
— por isso o bug nunca apareceu aí.

**Fix:**
```js
import { pathToFileURL } from 'node:url';
// ...
const mod = await import(pathToFileURL(resolve(migrationsDir, file)).href);
```

**Impacto no Mac:** **nenhum**. `pathToFileURL('/Users/…/0001.ts').href` gera
`file:///Users/…/0001.ts`, que é exatamente o que o `import()` já aceitava. É a
forma canônica e portável de fazer `import()` dinâmico de caminho absoluto.

**Ação no Mac:** nada obrigatório; só confirme que o app continua subindo.

---

## 2. Exclusões de `node_modules` no pacote — AFETA MAC E LINUX

**Objetivo:** instalação lenta no Windows. O pacote tinha **42.500 arquivos**; o
NSIS grava arquivo por arquivo (com `asar: false`), então file count domina o
tempo. `@tabler` (ícones) sozinho eram ~17k arquivos (41%).

**Mudança** em `package.json` → `build.files`, adicionadas linhas negativas:
```
"!node_modules/@tabler/**/*",
"!node_modules/@xterm/**/*",
"!node_modules/@codemirror/**/*",
"!node_modules/@lezer/**/*",
"!node_modules/codemirror/**/*",
"!node_modules/@xyflow/**/*",
"!node_modules/layerchart/**/*",
"!node_modules/bits-ui/**/*",
"!node_modules/pusher-js/**/*"
```

**Por que é seguro (todas as plataformas):** são pacotes **100% frontend**. O
Vite/adapter-node já os compila para `build/client`, que o browser carrega. O
processo servidor (Node puro via `ELECTRON_RUN_AS_NODE`) só importa builtins +
`ws` + `node-pty` + os `.ts` irmãos em
`src/lib/modules/agent-room/infrastructure/pty/` — **nunca** importa esses UI
libs. Portanto as cópias em `node_modules` são peso morto no instalador.

**Resultado medido no Windows:** 42.500 → **22.167 arquivos** (−48%); install
silencioso caiu para **71s** (o pacote gordo levaria ~2×). Tamanho: 556→518 MB
(redução modesta em bytes — são muitos arquivos pequenos).

**Efeito no Mac/Linux:** o `build.files` é **compartilhado**, então o `.dmg` e o
`.AppImage` também sairão sem esses pacotes → **artefato menor** (download/disco).
Mas o ganho é de **tamanho**, não de velocidade de instalação (dmg/AppImage já são
imagens empacotadas; instalar já é "instantâneo"). E em bytes a diferença é
pequena (~10-20 MB comprimidos), porque o que foi cortado são SVGs/fontes
pequenos, não os pesos de runtime.

### ⚠️ AÇÃO no Mac (importante — só validei no Windows)
1. `npx electron-builder --mac dmg` — deve completar normal.
2. Abra o app: a janela deve renderizar o canvas (**"Orkestrai — Canvas"**) e o
   servidor interno deve subir sem erro (`database.db` criado em
   `~/Library/Application Support/orkestrai/`).
3. Se **qualquer** recurso quebrar por módulo faltando, olhe o stderr do processo
   servidor; se apontar um dos pacotes excluídos, **remova a linha
   `!node_modules/<pacote>` correspondente** (nesse caso ele é runtime no seu
   caminho) e rebuild.

**NÃO exclua** os de runtime (o servidor os importa fora do bundle):
`drizzle-orm`, `@beeblock/svelar`, `ws`, `better-sqlite3`, `node-pty`, `bullmq`,
`zod`, `effect`, `pdfkit`, `@aws-sdk/*`.

### Como cortar MAIS (opção agressiva — NÃO feita)
Auditar todo o `node_modules` e enviar só o que o servidor importa fora do bundle
(nativos + `ws` + `@beeblock/svelar` + deps não-bundladas). Corta bem mais, mas
tem risco real de esquecer uma dep de runtime carregada sob demanda (PDF, storage
S3, fila…) — precisa teste cuidadoso nos dois SOs.

---

## 3. Comandos de build corrigidos (Windows-only)

Em `docs/build-windows.md`. **Nada disso muda o fluxo do Mac** (`npx
electron-builder --mac dmg`):

- **`npm ci` → `npm install`**: o lock commitado foi gerado com npm 11.6.x; npm
  novo (testado 11.18) o rejeita como "fora de sync". Os cross builds fixam
  `npm@11.6.2` justamente por isso (ver `scripts/package-cross.sh`).
- **`electron:rebuild`: `-w` → `-o better-sqlite3`**: `-w` (`--which-module`)
  **não** restringe no `@electron/rebuild` 4.x — ele forçava recompilar
  `node-pty`/`msgpackr-extract` do zero (precisa de Visual Studio → falha).
  `-o` (`--only`) restringe de verdade. Só o `better-sqlite3` precisa (baixa
  prebuild do ABI do Electron).
- **electron-builder Windows: `"-c.npmRebuild=false"`** (aspas obrigatórias no
  PowerShell). Desliga o rebuild nativo interno do electron-builder, que também
  tentava compilar `node-pty`/`msgpackr` sem toolchain. Fica **só no comando do
  Windows** — **NÃO** mova para `package.json`: é config global e **quebraria o
  build do Mac**, que depende desse rebuild pra alinhar o `better-sqlite3` ao ABI
  do Electron.

---

## 4. `package-lock.json` — não commitar o reconciliado

O `npm install` do Windows (npm 11.18) reconcilia o lock e o modifica localmente.
**Não commite isso**: o lock commitado é pareado com o `npm@11.6.2` que os cross
builds fixam; um lock reconciliado por npm novo desalinha esses builds. A cópia foi
revertida no working tree.

---

## 5. CLIs de agente (claude/codex) no canvas — Windows (`PtySessionManager.ts`)

**Sintoma (Windows):** arrastar um `claude`/`codex` pro canvas → o terminal mostra
`File not found:`. Um **shell** funciona, e `claude` digitado **dentro** do shell
funciona.

**Duas causas, ambas só no Windows:**

1. **PATH defasado.** O `claude.exe` (instalado via winget) vive em
   `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Anthropic.ClaudeCode_*\`, e o winget
   adiciona esse dir ao **PATH do usuário no registro**. Mas o app aberto pelo
   Explorer herda o PATH de quando o Explorer subiu — sem esse dir. Uma shell
   nova relê o registro e acha; o app não. (Análogo Windows do problema de login
   shell que o `pathFromLoginShell()` resolve no macOS.)
2. **node-pty/conpty não resolve.** Diferente do CreateProcess padrão, o conpty
   não busca no PATH, não aplica PATHEXT e não executa `.cmd`/`.bat` direto —
   spawnar o nome nu `claude` falha mesmo com o PATH certo.

**Fix (módulo compartilhado `infrastructure/agent-path.ts`, guardado por
`IS_WIN`; no-op no Mac/Linux):**
- `agentEnv()` — copia de `process.env` com PATH aumentado. `windowsRegistryPathDirs()`
  lê `HKCU\Environment` e `HKLM\...\Session Manager\Environment` (via `reg query`,
  cacheado) e mescla. Agora o app enxerga o mesmo PATH de uma shell nova.
- `resolveCommand()` — resolve o nome nu varrendo PATH + PATHEXT: `.exe`/`.com` →
  caminho absoluto; `.cmd`/`.bat`/`.ps1` → embrulha em `cmd.exe /c`. Shells
  (`powershell.exe`, caminhos, strings com espaço) passam intactos.
- `cliInvocation()` / `probeCliVersion()` — helpers p/ `child_process` (spawn/execFile).

**Todos os três caminhos usam o mesmo módulo:**
- **canvas/PTY** (`PtySessionManager`, node-pty) — importa `agentEnv`/`resolveCommand`.
- **Modo Maestro** (`application/agents.ts`, `spawn`) — idem, + `detached: !IS_WIN`
  e `windowsHide` (evita console piscando no Windows).
- **detecção + listagem de modelos** (`adapters/*`, `execFile`) — `probeCliVersion`
  e `cliInvocation`.

**Validado no Windows:** PTY WS `claude` → "2.1.200 (Claude Code)"; detecção
`/api/agent-room/status` → claude=installed, **codex(.cmd)=installed** (antes
falhava), kimi/opencode=false (não instalados). `codex --version` via node-pty →
"codex-cli 0.133.0".

**Mac/Linux:** tudo cercado por `IS_WIN` (`windowsRegistryPathDirs`/`resolveCommand`
retornam cedo; `EXTRA_PATH_DIRS`/`nvmBins` idênticos ao de antes; `detached:
!IS_WIN` = `true` como era). **No-op** — nada a revalidar além do smoke normal do
§2. `kimi`/`opencode` não foram testados ao vivo (não instalados aqui), mas usam o
mesmo caminho do `claude`/`codex`.

## 6. Resume do claude no canvas — Windows (`AgentSessionTracker.ts`)

**Sintoma (Windows):** fecha o app e reabre → o terminal do claude não retoma a
sessão; erro "no conversation found to continue", processo sai com código 1.

**Causa:** o rastreador calculava o slug do dir de projetos do claude no formato
Unix. O claude grava em `~/.claude/projects/<slug>` trocando `:` `/` `\` por `-`
(ex.: `C:\xampp\htdocs\pantheon` → `C--xampp-htdocs-pantheon`). A conta antiga
(`replace(/[/\\]/g,'-').replace(/^-/,'')` + prefixo `-`) dava
`-C:-xampp-htdocs-pantheon` no Windows — dir inexistente. Sem achar o id real da
sessão, o resume caía no `--continue`, que falha quando o slug/cwd nao bate.

**Fix 6a (slug):** `slug = realCwd.replace(/[^a-zA-Z0-9]/g, '-')` — o algoritmo
real do claude troca TODO não-alfanumérico por `-` (`C:\a.b_c` → `C--a-b-c`;
macOS `/Users/x` → `-Users-x`). Antes era só `[:/\\]` (falhava em cwd com `.`,
`_`, espaço). Validado: acha `C--xampp-htdocs-pantheon` com as sessões reais.

**Fix 6b (o principal — `ClaudeAdapter.resumeArgs`):** a causa do erro reportado.
O claude só persiste sessão **depois da 1ª mensagem** (codex/kimi persistem já no
start). Reabrir um nó claude que **nunca recebeu mensagem** não tem sessão pra
retomar; o app caía em `--continue`, e `claude --continue` **sai com erro "No
conversation found to continue" + código 1** quando não há conversa naquele
diretório. Fix: sem id exato, o claude começa **fresco** (`[]`) em vez de
`--continue` — abre limpo, pronto pra digitar. Quando existe conversa, o
rastreador (6a) acha o id e usa `--resume <id>`. Só o `ClaudeAdapter` mudou;
codex/kimi/opencode mantêm o `--continue` (que não erra neles).

**Nota:** os "resumes" de codex/kimi são por sessão global (não por-cwd), então
podem retomar qualquer sessão recente. O claude é por-cwd (correto). Tracking de
`codex` (`~/.codex/sessions`) e `opencode` (`~/.local/share/opencode`) confirmados
existentes no Windows.

## 7. Hooks de Floor no Windows (`FloorService.ts`) + auditoria de paths

**Bug:** `runHooks` executava `execFileAsync('/bin/sh', ['-c', command])` — `/bin/sh`
não existe no Windows, então os hooks de andar (setup/run/teardown) falhavam. **Fix:**
shell por plataforma (`cmd.exe /d /s /c` no Windows, `/bin/sh -c` no Unix) + `env`
agora usa `agentEnv()` (PATH do registro, pros hooks acharem npm/git/etc.).

**Auditoria de paths Windows — o que foi varrido e o veredito:**

| Item | Status |
|---|---|
| `import(resolve(...))` absoluto (migrations) | ✅ corrigido (`pathToFileURL`, §1) |
| PATH/resolução de CLI (PTY/Maestro/detecção) | ✅ corrigido (`agent-path.ts`, §2/§5) |
| Slug de sessão do claude (resume) | ✅ corrigido (§6) |
| `/bin/sh` nos hooks de Floor | ✅ corrigido (este §) |
| kimi instalado em `~/.kimi-code/bin` (fora do PATH) | ✅ corrigido — adicionado `~/.kimi-code/bin` (+ `.local/bin`, `.bun`, `.cargo`) ao `EXTRA_PATH_DIRS` do Windows |
| `git` nu (`GitService`, `FloorService`, `orchestrator`) | ✅ blindado — passam `env: agentEnv()` (PATH do registro). O git do usuário (ex.: laragon `C:\laragon\bin\git\bin`) vive no PATH do usuário, sujeito à mesma defasagem |
| `UsageService` lê `~/.claude/.credentials.json`, `~/.codex/auth.json` | ✅ **confirmado funcionando** — os arquivos existem no Windows e batem com o código (`claudeAiOauth.accessToken`). Nada a mudar |
| `AgentSessionTracker` opencode = `~/.local/share/opencode` | ✅ opencode usa esse mesmo path **no Windows** (confirmado em disco). codex `~/.codex/sessions` ✓, kimi `~/.kimi-code/sessions` (aparece quando kimi roda) |
| `defaultShell()` → `wsl.exe` default no Windows | ℹ️ escolha de design (exige WSL); `/bin/zsh` é só fallback não-Windows. Não alterado |

**Teste completo dos 4 providers (servidor empacotado):** detecção → claude/codex/kimi/opencode todos `installed=true`; PTY `--version` → claude "2.1.200", codex "codex-cli 0.133.0", kimi "0.31.1", opencode "1.18.11". Tudo exit 0, sem "File not found".

## 8. Skill do Maestro — desbloqueio + handoff (`BridgeService.ts`) [cross-platform]

Não é Windows — é orquestração. Um líder Maestro travou (um recruta ficou
esperando uma nota que não existia) e o líder **assumiu o trabalho** em vez de
desbloquear o time, violando a própria regra ("o líder NUNCA executa sozinho").
Reforçado o `bridgeSkillContent()` (distribuído pros workspaces via
`ensureProvisioned`, que regrava o `SKILL.md` quando o template evolui):

1. **Regra de abertura** — "nunca sozinho" agora vale inclusive quando o time
   trava/demora/erra; assumir o trabalho é falha de orquestração.
2. **Handoff nota↔task (passo 5)** — task tem que ser autossuficiente OU citar id
   de nota que JÁ existe; nunca atribuir task que depende de nota não criada; cada
   agente PRODUZ os próprios artefatos (o designer cria a nota de design).
3. **Protocolo de desbloqueio (passo 7)** — agente travado/em silêncio/pedindo
   algo → o líder resolve via `ask`/`note create` e devolve o id; implementar você
   mesmo é o último recurso (prefira reatribuir). Time travado = problema de
   coordenação, não motivo pra assumir.

## Estado atual / pendências

- Nada commitado (decisão do dono; **sem** co-authoring do Claude quando for
  commitar).
- **No Mac:** revalidar §2 (exclusões) com um `--mac dmg` + abrir o app.
- Validado no Windows: install silencioso 71s, app instalado abre no canvas,
  servidor sobe, `database.db` criado, sem `MODULE_NOT_FOUND`.

(No Windows a máquina foi atualizada para Node 24.18 — irrelevante pro Mac, mas o
`orkestrai-server.mjs` exige Node 24+ para o type stripping dos `.ts`, o que o
Electron 42 já satisfaz: ele embute Node 24.18.)
