#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

builder_args=(--mac "$@" --publish never)
required_signing_env=(
  CSC_LINK
  CSC_KEY_PASSWORD
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID
)

if [[ "${ORKESTRAI_REQUIRE_MAC_SIGNING:-false}" == "true" ]]; then
  for variable in "${required_signing_env[@]}"; do
    if [[ -z "${!variable:-}" ]]; then
      printf 'ERROR: %s is required for an official macOS release.\n' "$variable" >&2
      exit 1
    fi
  done
fi

if [[ -z "${CSC_LINK:-}" ]]; then
  unset CSC_LINK CSC_NAME CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  npx electron-builder "${builder_args[@]}" -c.mac.identity=- -c.mac.hardenedRuntime=false -c.mac.notarize=false
  node scripts/set-mac-update-policy.mjs release/latest-mac.yml
else
  npx electron-builder "${builder_args[@]}"
fi
