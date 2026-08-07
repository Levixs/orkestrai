#!/usr/bin/env bash

set -euo pipefail

VERSION="${1:-}"
MODE="${2:-new}"
SOURCE_REPO="beeblock/pantheon"
RELEASE_REPO="beeblock/orkestrai-releases"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'usage: preflight.sh <major.minor.patch> [new|recover]'
[[ "$MODE" == "new" || "$MODE" == "recover" ]] || fail 'mode must be new or recover'

for command in git gh node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "missing required command: $command"
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'not inside a Git repository'
cd "$ROOT"

[[ "$(git branch --show-current)" == "main" ]] || fail 'release must run from main'
[[ "$(node -p "require('./package.json').version")" == "$VERSION" ]] || fail 'package.json version does not match'
[[ "$(node -p "require('./package-lock.json').version")" == "$VERSION" ]] || fail 'package-lock.json version does not match'
[[ "$(node -p "require('./package-lock.json').packages[''].version")" == "$VERSION" ]] || fail 'package-lock root package version does not match'

[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail 'tracked worktree changes remain'
if [[ -n "$(git status --porcelain --untracked-files=normal | grep '^??' || true)" ]]; then
  printf 'WARN: unrelated untracked files exist; do not stage them.\n'
fi

git fetch origin main --quiet
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail 'local main is not synchronized with origin/main'
[[ "$(git remote get-url origin)" == *"beeblock/pantheon"* ]] || fail 'origin is not beeblock/pantheon'

TODAY="$(date +%F)"
grep -q "^## $TODAY$" CHANGELOG.md || fail "CHANGELOG.md has no $TODAY section"
for catalog in src/lib/i18n/docs/pt-BR.ts src/lib/i18n/docs/en.ts src/lib/i18n/docs/es.ts; do
  grep -Fq "Orkestrai $VERSION" "$catalog" || fail "$catalog does not mention Orkestrai $VERSION"
done

COMPANION_ROOT="$(dirname "$ROOT")"
SITE_REPO="$COMPANION_ROOT/orkestra-site"
PUBLIC_REPO="$COMPANION_ROOT/orkestrai-releases"

verify_companion_repo() {
  local repo="$1"
  local expected_remote="$2"
  [[ -d "$repo/.git" ]] || fail "missing companion repository: $repo"
  [[ "$(git -C "$repo" branch --show-current)" == "main" ]] || fail "$repo must be on main"
  [[ -z "$(git -C "$repo" status --porcelain)" ]] || fail "$repo has uncommitted changes"
  [[ "$(git -C "$repo" remote get-url origin)" == *"$expected_remote"* ]] || fail "$repo origin is not $expected_remote"
  git -C "$repo" fetch origin main --quiet
  [[ "$(git -C "$repo" rev-parse HEAD)" == "$(git -C "$repo" rev-parse origin/main)" ]] || fail "$repo is not synchronized with origin/main"
}

verify_companion_repo "$SITE_REPO" "beeblock/orkestrai-site"
verify_companion_repo "$PUBLIC_REPO" "beeblock/orkestrai-releases"

for catalog in src/lib/content/site/pt-BR.ts src/lib/content/site/en.ts src/lib/content/site/es.ts; do
  grep -Fq "$VERSION" "$SITE_REPO/$catalog" || fail "$SITE_REPO/$catalog does not mention $VERSION"
done
for changelog in CHANGELOG.md CHANGELOG.en.md CHANGELOG.es.md; do
  grep -Fq "## $VERSION" "$PUBLIC_REPO/$changelog" || fail "$PUBLIC_REPO/$changelog does not mention $VERSION"
done

gh auth status >/dev/null 2>&1 || fail 'GitHub CLI is not authenticated'
gh repo view "$SOURCE_REPO" >/dev/null 2>&1 || fail 'cannot access source repository'
gh repo view "$RELEASE_REPO" >/dev/null 2>&1 || fail 'cannot access public releases repository'
gh secret list --repo "$SOURCE_REPO" | awk '{print $1}' | grep -qx RELEASES_TOKEN || fail 'RELEASES_TOKEN is not configured'

TAG="v$VERSION"
RELEASE_JSON="$(gh release view "$TAG" --repo "$RELEASE_REPO" --json isDraft,url 2>/dev/null || true)"

if [[ "$MODE" == "new" ]]; then
  [[ -z "$RELEASE_JSON" ]] || fail "$TAG already exists in the public releases repository"
  ! git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null || fail "local tag $TAG already exists"
  [[ -z "$(git ls-remote --tags origin "refs/tags/$TAG")" ]] || fail "remote tag $TAG already exists"
elif [[ -n "$RELEASE_JSON" ]]; then
  IS_DRAFT="$(node -e 'const data=JSON.parse(process.argv[1]); process.stdout.write(String(data.isDraft))' "$RELEASE_JSON")"
  [[ "$IS_DRAFT" == "true" ]] || fail "$TAG is public and immutable; prepare a new patch version"
fi

printf 'Release preflight passed for Orkestrai %s (%s mode).\n' "$VERSION" "$MODE"
