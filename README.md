# tiny-voice

A small invoicing system built as a validation exercise for AI-native codebase patterns. The interesting thing is not the invoicing — it's how much of the architecture is enforced by tooling so that both humans and AI agents stay on the rails.

See [`CLAUDE.md`](./CLAUDE.md) for the concise agent guide and [`docs/architecture.md`](./docs/architecture.md) for the full reference.

## What it does

Three domain modules:

- **clients** — create, get, list
- **invoicing** — draft → sent → paid / void, line items, payments, late fees, PDF generation
- **reporting** — revenue by month / year, projected from payment events

Next.js App Router UI on top, SQLite for storage, oRPC for the RPC layer.

## Shape

Hexagonal modular monolith with CQRS-lite:

- **Commands** go through aggregate roots, return `Result<T, DomainError>` via neverthrow, never throw for domain errors.
- **Queries** bypass the domain, read from repos or a materialized read model.
- **Events** handle projections and notifications; subscribers registered in `src/app/register-subscribers.ts`.
- **Ports/adapters** for every IO boundary (`Clock`, `Database`, `ClientRepository`, `PdfGenerator`, …) with real + test implementations.
- **One composition root** in `src/app/build-app.ts` wires the whole graph.

Mutations go through Server Actions / oRPC. RSC pages read through a narrow `AppReadView` that exposes only `queries`, `featureFlags`, and `clock` — repos and infrastructure are deliberately off the type so pages can't drift into calling them directly.

## What's enforced by tooling

Rather than prose conventions, the rules live in linters and type-checkers:

- Kebab-case filenames and folders, filename must match the exported symbol (ESLint)
- No default exports (except app layer), no barrel files, no import cycles (ESLint)
- Module boundaries: cross-module imports allowed to public surface but not into `adapters/` (dependency-cruiser)
- Domain never imports adapters or app (dependency-cruiser)
- `next/*` imports confined to `src/app/**` (dependency-cruiser)
- Narrow RSC read surface — `AppReadView` excludes repos, event bus, DB (TypeScript)
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (TypeScript)
- Conventional commits (commitlint + simple-git-hooks)

CI gate is four commands: `pnpm typecheck`, `pnpm lint`, `pnpm deps`, `pnpm test`.

## Running it

Requires Node 24+ and pnpm 9.15+.

```sh
pnpm install
pnpm migrate     # apply SQL migrations to tiny-voice.db
pnpm seed        # optional: seed sample data
pnpm dev         # Next.js dev server
```

Other scripts:

```sh
pnpm typecheck
pnpm lint
pnpm deps        # dependency-cruiser
pnpm test        # vitest
pnpm test:watch
pnpm build
```

## Layout

```
src/
  shared/        kernel: Money, Clock, IDs, EventBus, Database port, Result
  clients/       client entity + repo + commands/queries
  invoicing/     Invoice aggregate, state machine, commands, events, PDF
  reporting/     revenue read model + queries
  app/           buildApp, oRPC contract/router, Next.js pages, subscribers
docs/            architecture.md, domain-terms.md
migrations/      append-only numbered SQL files
scripts/         migrate.ts, seed.ts
```

## Intentional omissions

No authentication or authorization. This is a demo app validating architecture patterns — adding auth would obscure what's being demonstrated.
