---
name: svelar-specialist
description: Use when working in this Svelar app, including routes, controllers, DTOs, FormRequests, schemas, ORM models, migrations, policies, permissions, teams, queues, cache, storage, PDF, search, SSE/Soketi broadcasting, Docker, tests, or production hardening.
---

# Svelar Specialist

Use this skill for Svelar app work. Svelar is Laravel-inspired on SvelteKit 2.

## Architecture

- Keep the app flow consistent: route -> controller/page action -> FormRequest/shared schema validation -> DTO -> action/service -> repository -> model/resource -> response.
- Use both FormRequest classes and DTOs for write paths.
- Keep validation consistent with `svelar.validation.json`: Zod apps use `z.infer` from `@beeblock/svelar/validation`; Valibot apps use `v.InferOutput` and may import Laravel-like rules from `@beeblock/svelar/validation/valibot`.
- Side effects belong in actions/services and events/listeners, not scattered through pages.
- Cross-module reads should go through a narrow public application service/query/facade from the owning module and return plain DTO/contract data. Events are for side effects, not request/response queries.
- Use Svelar ORM and migrations. Avoid raw SQL unless it is a low-level infrastructure exception.
- Keep one migration per table or focused schema change.

## CLI

Use Svelar CLI generators when available:

```bash
npx svelar make:entity Post --module posts --fields "title:string,body:text" --crud
npx svelar make:model Post --module posts
npx svelar make:migration create_posts_table
npx svelar make:controller PostController --module posts
npx svelar make:request CreatePostRequest --module posts
npx svelar make:action CreatePostAction --module posts
npx svelar make:job SendDigestJob
npx svelar make:task CleanupTask
```

## UI And Forms

- Use Svelte 5 runes in `.svelte`: `$props`, `$state`, `$derived`, `$effect`, and `{@render children()}`.
- Do not use runes in `.ts` files.
- Use shared schemas with Superforms when frontend and backend validation are shared.
- Action results should follow Svelar resource shape: `{ data, meta }`.
- Render field errors inline. Avoid duplicate validation toasts for normal field errors.
- Mutating browser fetch calls must include the CSRF token header.

## Runtime Coverage

When hardening features, account for auth/session/API tokens, policies/permissions/teams, queues and workers, scheduler, events/listeners, observers, cache, uploads/storage, PDF, search, mail, SSE/Soketi broadcasting, audit/logs, and exception handling.

## Verification

- Run focused tests after changes.
- Run `npm run build` before release-impacting work.
- Use `npm run dev:worker` and `npm run dev:scheduler` for local queue/scheduler checks.
