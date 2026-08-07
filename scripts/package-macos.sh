#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

builder_args=(--mac "$@" --publish never)

if [[ -z "${CSC_LINK:-}" ]]; then
  unset CSC_LINK CSC_NAME CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  npx electron-builder "${builder_args[@]}" -c.mac.identity=- -c.mac.hardenedRuntime=false
  node scripts/set-mac-update-policy.mjs release/latest-mac.yml
else
  npx electron-builder "${builder_args[@]}"
fi
