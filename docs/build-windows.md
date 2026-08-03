# Build do Orkestrai no Windows

Guia para compilar o app desktop nativamente numa máquina Windows (o caminho
recomendado para produzir o instalador NSIS — cross-build via Docker/wine em
Mac ARM não é confiável).

## Pré-requisitos

- **Node.js 24+** (o servidor de produção usa type stripping do Node 24)
- **Git**
- Não precisa de Visual Studio nem de MSVC: os módulos nativos usam prebuilds.

## Passo a passo

```powershell
git clone <url-do-repo> pantheon
cd pantheon
npm ci
npm run build                # build web (vite -> build/)
npm run electron:rebuild     # alinha nativos ao ABI do Electron (baixa prebuilds)
npx electron-builder --win nsis --x64 --publish never   # instalador
# ou, portátil:
npx electron-builder --win zip --x64 --publish never
```

Artefatos em `release/`:

- `Orkestrai Setup 0.0.1.exe` — instalador NSIS (unsigned: o SmartScreen vai
  avisar; "Mais informações" → "Executar assim mesmo")
- `Orkestrai-0.0.1-win.zip` — versão portátil (descompactar e rodar `Orkestrai.exe`)

## Decisões de empacotamento (não mude sem ler)

- **Electron pinado em 42 (ABI 146)**: o `better-sqlite3` só publica
  prebuilds de Electron até ABI 146. Se atualizar o Electron, a build passa a
  exigir compilar `better-sqlite3` do zero (aí sim precisa de Visual Studio
  Build Tools). O `node-pty` traz prebuilds win32-x64 no próprio tarball.
- **`asar: false`** no `package.json`: o servidor de produção
  (`scripts/orkestrai-server.mjs`) é ESM e o loader ESM do Node não resolve
  pacotes dentro do asar. Não reative.
- **Sem assinatura de código**: não temos certificado. Instalador e exe saem
  unsigned (avisos do Windows são esperados).

## Runtime no Windows

- **Dados do app**: `%APPDATA%\orkestrai\` (SQLite, backups rotativos,
  `bin/orkestrai.cmd` da CLI da ponte — entra no PATH dos terminais PTY
  automaticamente a cada boot do servidor interno).
- **PTY**: `node-pty` usa **conpty** nativo do Windows 10+ (fallback winpty).
  Shells: `powershell.exe` por padrão; WSL funciona apontando o terminal para
  `wsl.exe` (Windows e WSL lado a lado no mesmo canvas).
- **CLIs de agente** (claude, codex, kimi) precisam estar instaladas e no
  PATH (o app também procura em locais comuns de instalação).

## Testes (opcional mas recomendado)

```powershell
npm test          # vitest (unit + feature)
npx playwright test   # e2e contra build de producao (PORT=5199)
```

## Build das outras plataformas

- **macOS**: `npx electron-builder --mac dmg` (arm64 e/ou `--x64` para Intel)
- **Linux/Windows a partir do Mac**: `scripts/package-cross.sh linux|windows|windows-zip|clean`
  (Docker; ver comentários no script)
