# Contributing to Orkestrai

Thank you for helping improve Orkestrai. This guide keeps changes reviewable and
protects the desktop release process across macOS, Windows, and Linux.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Use a GitHub issue to discuss large features, architectural changes, new
  providers, or changes to persisted data before implementation.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
- Read [AGENTS.md](AGENTS.md). Its architecture, i18n, documentation, testing,
  and packaging rules apply to every contribution.

## Local Setup

Requirements:

- Node.js 24 or newer
- npm 11 or newer
- Git

```bash
git clone https://github.com/beeblock/orkestrai.git
cd orkestrai
npm ci
npm run dev
```

Use `npm run electron:dev` to exercise the desktop shell. Changes to
`better-sqlite3` or `node-pty` may require `npm run electron:rebuild`.

## Development Rules

- Follow the Svelar request flow and module boundaries documented in
  [AGENTS.md](AGENTS.md).
- Use Svelte 5 runes in `.svelte` files and the existing shadcn-svelte
  components for application UI.
- Keep every visible string synchronized in pt-BR, English, and Spanish.
- Add focused tests for behavioral changes and regression tests for bug fixes.
- Never commit `.env`, databases, workspace data, model downloads, build output,
  installers, credentials, tokens, or private user content.
- Preserve unrelated changes in the working tree.

## Documentation And Changelog

User-visible features and fixes must update, in the same commit:

- the root `CHANGELOG.md`, written in English;
- all three in-app documentation catalogs in `src/lib/i18n/docs/`;
- user guides, use cases, and onboarding tours when applicable;
- the three README files when setup, compatibility, or major capabilities change.

New features require matching use cases and onboarding tours in all three
supported languages. Catalog parity is enforced by tests.

## Commit Messages

All commit subjects and bodies must be written in English and follow
[Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(canvas): add workspace activity filter
fix(updater): preserve signed macOS bundle permissions
docs: explain local voice model storage
```

Keep each commit focused on one coherent concern.

## Verification

Run the focused tests for your change, followed by:

```bash
npm test
npm run build
```

Run `npm run test:e2e` for canvas workflows and other user-facing flows. E2E
tests use the production build and run serially. Remove generated test results
and unpacked application directories afterward as described in `AGENTS.md`.

## Pull Requests

A pull request should:

- explain the problem and the chosen approach;
- link the related issue when one exists;
- identify platform-specific behavior and migrations;
- include screenshots or a short recording for visual changes;
- list the verification commands that passed;
- keep generated artifacts and unrelated formatting out of the diff.

Maintainers may ask for a smaller change when a pull request mixes independent
concerns or changes an established contract without tests.
