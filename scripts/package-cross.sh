#!/usr/bin/env bash
# Empacota o Orkestrai para Linux e Windows LOCALMENTE via Docker, usando as
# imagens oficiais do electron-builder. Pensado para macOS (Intel ou Apple
# Silicon); em CI depois e so reusar os mesmos comandos.
#
# Uso:
#   ./scripts/package-cross.sh linux     # AppImage x64
#   ./scripts/package-cross.sh windows   # NSIS x64 (imagem wine; emulada em Mac ARM)
#   ./scripts/package-cross.sh all       # os dois
#   ./scripts/package-cross.sh clean     # remove imagens dos builders + camadas dangling
#
# Notas:
# - O staging NAO leva node_modules do host (ABI do macOS) — npm ci roda
#   dentro do container. node-pty/better-sqlite3 usam prebuilds (x64).
# - Containers rodam com --rm e o staging e removido via trap no EXIT:
#   o script nao deixa lixo para tras.
# - Caches do electron/electron-builder ficam em ~/.cache para builds
#   subsequentes serem rapidos (usados tambem pelo build mac local).
set -euo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d /tmp/orkestrai-cross-XXXXXX)"
CACHE_ELECTRON="$HOME/.cache/electron"
CACHE_BUILDER="$HOME/.cache/electron-builder"
mkdir -p "$CACHE_ELECTRON" "$CACHE_BUILDER" "$ROOT/release"

# Limpeza garantida: staging sempre removido (sucesso ou falha) e camadas
# dangling podadas ao final — nada de lixo para tras.
cleanup() {
  rm -rf "$STAGE"
  docker image prune -f > /dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "$TARGET" == "clean" ]]; then
  echo "==> Removendo imagens dos builders e caches de cross-build"
  docker rmi electronuserland/builder:latest electronuserland/builder:wine 2>/dev/null || true
  docker image prune -f || true
  rm -rf "$STAGE"
  echo "Pronto. (~/.cache/electron* mantidos: aceleram TODOS os builds, mac incluso)"
  exit 0
fi

echo "==> Build web (vite)"
(cd "$ROOT" && npm run build)

echo "==> Staging limpo em $STAGE"
rsync -a --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'release' \
  --exclude '.svelte-kit' \
  --exclude 'data' \
  --exclude 'database.db*' \
  --exclude 'test-results' \
  --exclude 'storage' \
  --exclude 'orkestrai-branding' \
  --exclude 'projects' \
  --exclude '.env' \
  "$ROOT/" "$STAGE/"

run_builder() {
  local image="$1"
  local cmd="$2"
  docker run --rm --platform linux/amd64 \
    -e ELECTRON_CACHE=/root/.cache/electron \
    -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
    -v "$STAGE":/project \
    -v "$CACHE_ELECTRON":/root/.cache/electron \
    -v "$CACHE_BUILDER":/root/.cache/electron-builder \
    "$image" /bin/bash -lc "$cmd"
}

# Mesma major do npm do host — npm mais novo considera o lock "fora de sync".
NPM_PIN="npm@11.6.2"

if [[ "$TARGET" == "linux" || "$TARGET" == "all" ]]; then
  echo "==> Linux (AppImage x64)"
  run_builder electronuserland/builder:latest \
    "npm install -g $NPM_PIN && cd /project && npm ci --no-audit --no-fund && npx electron-builder --linux AppImage --x64 --publish never"
fi

if [[ "$TARGET" == "windows" || "$TARGET" == "all" ]]; then
  echo "==> Windows (NSIS x64) — imagem wine; em Mac ARM roda emulada, demora"
  # Sem rebuild nativo (node-gyp nao cross-compila): prebuilds semeados —
  # ver scripts/cross-build-windows.sh.
  run_builder electronuserland/builder:wine \
    "npm install -g $NPM_PIN && bash scripts/cross-build-windows.sh"
fi

echo "==> Copiando artefatos para release/"
rsync -a "$STAGE/release/" "$ROOT/release/"
rm -rf "$STAGE"
ls -la "$ROOT/release/"
