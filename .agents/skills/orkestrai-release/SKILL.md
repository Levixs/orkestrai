---
name: orkestrai-release
description: Prepare, publish, recover, and audit Orkestrai desktop releases for macOS, Windows, and Linux. Use when asked to cut or publish a new Orkestrai version, retry a failed release, inspect the Release Desktop workflow, validate public installers or latest-*.yml feeds, or diagnose desktop auto-update delivery.
---

# Orkestrai Release

Run the complete release from the `beeblock/orkestrai` repository and do not stop while required GitHub Actions jobs are active.

## Guardrails

- Read the repository `AGENTS.md` and `docs/releases.md` before changing files.
- Preserve unrelated user changes. Never stage, rewrite, or delete them.
- Never print, read, or request the value of `RELEASES_TOKEN`; only verify that the secret name exists.
- Treat a public release as immutable. Never force-move its tag or replace its assets. Prepare a new patch version instead.
- A failed, unpublished tag may be moved only after confirming that the public release is absent or still draft.
- Keep the release draft until every platform and manifest passes validation.
- Run builds and tests sequentially. Follow the disk cleanup rules in `AGENTS.md`.

Read `.agents/skills/orkestrai-release/references/release-contract.md` when checking artifacts, signing behavior, or failure recovery.

## 1. Inspect And Select The Version

Inspect the branch, remotes, worktree, latest tags, public releases, workflow, package version, and newest changelog section. Fetch before deciding the version.

Use SemVer. Use the exact version requested when valid; otherwise infer patch/minor/major from the shipped behavior and state the choice. Before editing, verify that `v<version>` is neither a public release nor an existing tag for a normal new release.

## 2. Prepare The Release Commit

Update both package files through npm:

```bash
npm version <version> --no-git-tag-version
```

In the same commit:

- Add the version section to `CHANGELOG.md` in English. This is the exclusive source for public GitHub Release notes.
- Add equivalent translated changelog entries, in the same position and structure, to `src/lib/i18n/docs/pt-BR.ts`, `en.ts`, and `es.ts`.
- Update `README.md`, long-form docs, use cases, and onboarding tours when required by `AGENTS.md`.
- Add every new UI string to all three Paraglide catalogs.
- Keep installer names compatible with `scripts/validate-release-artifacts.mjs` and the `latest-*.yml` URLs.

Synchronize the companion repositories before tagging:

- add the same version and changes to the three localized changelog catalogs in sibling `../orkestra-site`;
- for the one-time `0.1.4` feed transition, add/update the three localized changelogs and README guidance in sibling `../orkestrai-releases`;
- commit and push the applicable companion repositories, then let preflight verify that they are clean and synchronized with `origin/main`.

Normal releases publish in `beeblock/orkestrai` with the workflow's automatic
`GITHUB_TOKEN`. Version `0.1.4` additionally publishes the exact same artifacts
to `beeblock/orkestrai-releases` using `RELEASES_TOKEN`. Never delete the legacy
repository or its `0.1.4` release because old installations use it to migrate.

Do not create the tag yet.

## 3. Verify Locally

Run focused integrity tests first, then the full suite and production build:

```bash
npm test -- --run tests/unit/docs-catalog.test.ts tests/unit/tours-catalog.test.ts tests/unit/release-artifacts.test.ts
npm test
npm run build
```

When native dependencies changed, also run `npm run electron:rebuild`. Run relevant e2e tests only against a stable production build and remove `test-results/` afterward as required by `AGENTS.md`.

Review `git diff --check`, the complete diff, and the final status. Commit only release-related files and push `main`. Then run the deterministic gate:

```bash
bash .agents/skills/orkestrai-release/scripts/preflight.sh <version> new
```

## 4. Tag And Monitor

Create an annotated tag only after preflight passes:

```bash
git tag -a v<version> -m "Orkestrai v<version>"
git push origin v<version>
```

Find the `Release Desktop` run and monitor it through completion:

```bash
gh run list --repo beeblock/orkestrai --workflow "Release Desktop" --limit 3
gh run watch <run-id> --repo beeblock/orkestrai --exit-status
```

Confirm all five jobs: tag validation, macOS, Windows, Linux, and verified publication. For `0.1.4`, confirm both repositories expose identical assets. Do not report completion while the run is queued or in progress.

## 5. Recover A Failed Unpublished Release

Read the failed step before changing code:

```bash
gh run view <run-id> --repo beeblock/orkestrai --log-failed
```

Use the job logs API when the overall run is still active. Fix the root cause, update tests/docs when applicable, commit, and push `main`.

For a transient failure with unchanged source, rerun the workflow for the existing tag. For a source fix, first prove the public release is absent or draft, then run:

```bash
bash .agents/skills/orkestrai-release/scripts/preflight.sh <version> recover
git tag -fa v<version> -m "Orkestrai v<version>" HEAD
git push --force origin v<version>
```

If the release is already public in any applicable repository, stop source-changing recovery and create a new patch version. Never mutate the public version. A transient rerun with unchanged source may finish the other destination if the transition release was only partially published.

## 6. Audit The Public Release

After the workflow succeeds, run:

```bash
node .agents/skills/orkestrai-release/scripts/audit-release.mjs <version>
```

Also inspect the release notes and confirm the workflow tag resolves to the intended source commit. Report the release URL, run URL, version, asset count, supported architectures, signing limitation, commits, and verification results.

For `0.1.4`, the audit script verifies the primary and legacy feeds. For later
versions it verifies only `beeblock/orkestrai`.

Do not claim macOS automatic replacement works for an unsigned build. Unsigned macOS releases use the manual-download fallback; signed/notarized releases can update in place.
