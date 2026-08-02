#!/usr/bin/env bash
# Roda DENTRO do container wine (staging montado em /project).
# Windows nao cross-compila nativo (node-gyp), entao:
# - node-pty: usa os prebuilds win32-x64 do proprio tarball npm (N-API)
# - better-sqlite3: baixa o prebuild electron-v<ABI>-win32-x64 do GitHub
# - msgpackr-extract: omitido (opcional do msgpackr, tem fallback JS)
set -euo pipefail

cd /project
npm ci --no-audit --no-fund --omit=optional

ELECTRON_VERSION="$(node -p "require('./node_modules/electron/package.json').version")"
ABI="$(node -p "require('node-abi').getAbi('$ELECTRON_VERSION', 'electron')")"
BS3="$(node -p "require('./node_modules/better-sqlite3/package.json').version")"
URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v${BS3}/better-sqlite3-v${BS3}-electron-v${ABI}-win32-x64.tar.gz"
echo "==> better-sqlite3 ${BS3} electron-v${ABI} win32-x64: $URL"
curl -fsSL "$URL" | tar xz -C node_modules/better-sqlite3
ls -la node_modules/better-sqlite3/build/Release/better_sqlite3.node
ls node_modules/node-pty/prebuilds/win32-x64/

# Sem certificado real: a imagem wine traz um cert de teste que liga a
# assinatura — e o passo de assinar o desinstalador executa o instalador
# inteiro no wine (crash do qemu em Mac ARM). Sem CSC_*, a assinatura e
# pulada e o instalador sai completo (unsigned).
unset CSC_LINK CSC_KEY_PASSWORD WIN_CSC_LINK WIN_CSC_KEY_PASSWORD CSC_NAME || true
npx electron-builder --win nsis --x64 --publish never -c.npmRebuild=false

