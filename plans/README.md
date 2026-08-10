# Implementation Plans — Architectural Enhancement Round

Generated 2026-08-09 at commit `a9b67eb` from a maintainer-directed design
review across four themes: **dependency injection**, **entity/aggregate
primitives**, **CQRS bus primitives**, and **stricter types & lint**.

Repo purpose, which every plan serves: a demonstration app architected so
coding agents can navigate and maintain it — conventions enforced by tooling,
docs that are executable, and test suites that pin the contracts agents rely
on. Every plan here converts a **convention** into a **primitive the compiler
or the linter enforces**. If a plan's change leaves the rule as prose in
`AGENTS.md` rather than as a type or a lint error, it has missed the point.

> **Environment note for all executors**: Node 24 is required
> (`better-sqlite3` native binding). The machine these plans were written on
> was running **Node v22.23.0**, where every SQLite-backed suite fails with
> `NODE_MODULE_VERSION 137 vs 127` — 47 failures across 9 files at `a9b67eb`,
> all environmental. Pure-domain suites (`src/invoicing/entities`,
> `src/shared/money`, `src/shared/time`, `src/clients/entities`) were
> **verified green: 108 passed**. Establish your own Node 24 baseline with
> `pnpm test` before starting, and do not attribute pre-existing SQLite
> failures to your change.

## Execution order & status

| Plan | Title                                                       | Theme        | Priority | Effort | Depends on | Status |
| ---- | ----------------------------------------------------------- | ------------ | -------- | ------ | ---------- | ------ |
| 001  | tsconfig strictness sweep (8 flags, 18 known errors)        | Types & lint | P1       | S      | —          | DONE   |
| 002  | typescript-eslint `strictTypeChecked` + repo-specific rules | Types & lint | P1       | M      | 001        | DONE   |
| 003  | Domain kit: value objects and branded IDs                   | Entities     | P1       | M      | —          | DONE   |
| 004  | DI container primitive (`src/shared/di/`)                   | DI           | P1       | M–L    | —          | TODO   |
| 005  | Migrate the composition root onto the container             | DI           | P1       | L      | 004        | TODO   |
| 006  | Invoice as a discriminated union of status states           | Entities     | P2       | L      | 003        | TODO   |
| 007  | Message envelope, metadata, and ambient request context     | CQRS         | P2       | M      | 003        | TODO   |
| 008  | EventBus v2: envelopes + declarative subscribers            | CQRS         | P2       | M–L    | 007        | TODO   |
| 009  | CommandBus and QueryBus                                     | CQRS         | P3       | L      | 005, 007   | TODO   |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Why this order

001 and 002 come first deliberately. They are the cheapest plans and they
**raise the floor for every plan after them** — the container in 004 and the
union in 006 are exactly the kind of type-level code where
`no-unnecessary-condition` and `noUnusedParameters` earn their keep during
authoring rather than in review. Running them last means writing the hard
plans without the safety net and then paying to retrofit.

003 comes before 006 and 007 because both consume value objects: 006 rebuilds
the `Invoice` type around them and 007 introduces four new branded ID types
(`MessageId`, `CorrelationId`, `RequestId`, `Traceparent`). Landing 003 first
means those are three-line definitions instead of three more hand-rolled
`string & { __brand }` conventions.

004 before 005 splits "build the primitive" from "migrate onto it". 004 is
pure, additive, and fully unit-testable with zero app changes; 005 is the
risky one. Keeping them separate gives a real STOP point and keeps 005's diff
reviewable.

## Dependency notes

- **001 → 002**: `noUnusedLocals`/`noUnusedParameters` (001) and
  `@typescript-eslint/no-unused-vars` (002) overlap. Landing 001 first means
  002's fix list is smaller and you are not fixing the same unused import
  twice under two different error messages.
- **003 → 006**: 006 rewrites `Invoice` field-by-field. Doing it before the
  value-object kit means rewriting `taxRate`/`dueDate` handling twice.
- **003 → 007**: 007's `MessageMeta` is four branded types. Without 003 it
  invents a fifth branding convention.
- **007 → 008**: 008 changes `EventBus.publish` to take an envelope. The
  envelope type must exist first.
- **005 + 009**: 009's QueryBus is what finally deletes `wire-queries.ts` and
  `AppDeps['queries']`. Doing it before 005 means wiring the bus into a
  structure 005 then dismantles.
- **002 and 008 both touch event subscribers.** `@typescript-eslint/require-await`
  (16 production hits, several in `register-notification-subscribers.ts`) will
  edit the same handlers 008 rewrites. Land 002 first and let 008 rebase, or
  accept a small merge. Do not run them concurrently.
- **004/005 and 006 are independent** and can run in parallel — different
  files, no shared types. 005 and 009 both edit `src/app/`; sequence them.

## Cross-cutting constraints every executor must honor

These are the repo's load-bearing rules. A plan that breaks one has gone
wrong even if it typechecks:

1. **`AppReadView`'s narrow read surface must survive every refactor.** Query
   server functions must remain unable to reach repos, the event bus, the DB,
   or the command path — at compile time, not by convention. Plans 005 and 009
   each restate how they preserve it; if your implementation loses the
   guarantee, STOP rather than widening the surface.
2. **Domain code returns `Result`, never throws for domain errors** (AGENTS.md
   rule 1). Infrastructure failures may throw. Plan 003 fixed the one place
   this was violated (`parseId`, now `BrandedId.parse`).
3. **Migrations are append-only.** Plan 008 needs an outbox schema change; it
   adds `migrations/0011_*.sql`, it does not edit `0005_create_outbox.sql`.
4. **No barrel files, no default exports outside `src/app/`, kebab-case
   filenames matching exports.** New directories (`src/shared/di/`,
   `src/shared/domain/`, `src/shared/messaging/`) inherit all of it.
5. **No framework imports outside `src/app/`.** Plan 007 introduces
   `src/start.ts`, which sits outside `src/app/` and imports
   `@tanstack/react-start`. The existing dependency-cruiser rule does not
   catch it (the `from` pattern only covers
   `src/(clients|invoicing|reporting|shared)/`), but leaving it uncovered is a
   silent hole — 007 must explicitly extend the rule to allow `src/start.ts`
   and forbid everything else at the `src/` root.
6. **No decorators, no `reflect-metadata`, no `emitDecoratorMetadata`.** The
   DI container in 004 is built on plain values and inference only. This is
   both a maintainer requirement and a hard constraint once 001 enables
   `erasableSyntaxOnly`.

## Measurements taken while planning

Reproduce these before trusting a plan's effort estimate; they were taken at
`a9b67eb` and will drift.

| Measurement                                              | Result                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| tsconfig sweep (8 flags, plan 001)                       | **18 errors**: 13 × TS1294, 5 × TS4111               |
| `strictTypeChecked` + `stylisticTypeChecked`, production | **70 errors** across 11 rules                        |
| Same, tests/e2e/config                                   | 277 errors, of which 170 are `no-non-null-assertion` |
| Files using `../../` parent imports instead of `@/`      | 17 (15 in `src/clients`, 2 in `src/invoicing`)       |
| Hand-rolled `as <Brand>` casts outside test factories    | 12                                                   |
| Query wiring edit sites to add one query                 | 3 (`app-deps.ts`, `wire-queries.ts`, a fn in `fns/`) |

## Findings considered and rejected

Recorded so future reviews don't re-litigate them:

- **Adopting inferdi (or any third-party DI container) directly** — the
  maintainer's stated constraint is no non-standard TypeScript features, and
  inferdi's own API is broader than this repo needs (async resolution, `Lazy`
  companions, transient lifetime, strict/fast modes). Plan 004 borrows its two
  genuinely good ideas — compile-time lifetime safety and `.override()` for
  tests — and drops the rest. Adding a dependency to demonstrate an
  architecture pattern also defeats the repo's purpose.
- **Transient lifetime and `Lazy<T>` injection in the container** — nothing in
  the graph needs either. `import-x/no-cycle` already forbids the cycles
  `Lazy` exists to break. Add them when a real consumer appears, not before.
- **Async resolution in the container** — the entire graph is synchronous
  (better-sqlite3 is sync). Async resolution would add promise caching,
  in-flight deduplication, and `await using` semantics for zero current
  benefit. Explicitly out of scope in 004.
- **Adding an OpenTelemetry SDK** — plan 007 carries and propagates a W3C
  `traceparent` value and stops there. A real exporter is a deployment
  concern, not an architecture-demonstration concern, and would pull a large
  dependency tree into a repo whose point is legibility.
- **Making `InProcessEventBus.publish` stop throwing `AggregateError`** — kept
  by design and already re-litigated once (see the prior round's README).
  Plan 008 changes the envelope, not the error strategy.
- **Classes for entities/aggregates** — the maintainer explicitly wants
  framework-like structure _without_ classes. Plans 003 and 006 use branded
  types, discriminated unions, and namespace-object factories. Note the
  tension surfaced by plan 001: `erasableSyntaxOnly` bans parameter
  properties, which every SQLite adapter uses. That is a nudge toward
  factory functions for adapters too, but 001 keeps the classes and only
  expands the constructors — converting adapters away from classes is a
  separate call the maintainer has not made.
- **Replacing `Money`'s namespace object with the plan-003 value-object kit** —
  `Money` is bigint arithmetic with a dozen operations, not a parse-and-brand
  wrapper. Forcing it into the kit's shape would lose clarity. 003 leaves it
  alone deliberately.
- **Pagination, authentication, CSV export** — unchanged from the prior
  round's dispositions. Auth in particular remains an intentional omission
  per AGENTS.md; plan 007's `MessageMeta.actor` field is shaped so auth
  _could_ slot in later, but 007 does not add it.

## Direction options (not planned — maintainer's call)

Surfaced during this review with repo evidence:

1. **Generate the `docs/architecture.md` transition table from the transition
   table data structure** that plan 006 introduces, and assert the two match
   in a test. Closes the doc-drift loop permanently and is very much in the
   spirit of "docs that are executable." Effort S, once 006 lands.
2. **Convert SQLite adapters from classes to factory functions.** Plan 001
   forces their constructors open anyway (`erasableSyntaxOnly`); going the
   rest of the way would make the codebase class-free and simplify the DI
   registrations in 005. Effort M. Needs a maintainer decision, not a plan.
3. **A `defineAdapter`/port-conformance test kit** — the SQLite ↔ in-memory
   parity property test (`invoice-repo-parity.property.test.ts`) exists for
   invoices only. Generalising it into a reusable "any implementation of port
   P must satisfy contract C" harness would cover clients and the revenue read
   model too. Effort M.
4. **Replay/rebuild for the revenue read model.** Once 008 stores full
   envelopes in the outbox, projection rebuild from the event log becomes
   nearly free and would exercise the CQRS story end to end. Effort M–L.

## Latent bug found during planning (resolved by plan 002)

`src/invoicing/adapters/sqlite-invoice-repo.ts:237-243` — `JSON.parse` returned
`any`, so `lineItems`/`payments` were unchecked. The `.filter((li) => li.id !== null)`
guards were reported by `@typescript-eslint/no-unnecessary-condition` as
"the types have no overlap", contradicting the comment above them, which
claimed `json_group_array` returns `[null]` for empty sets.

Resolved: verified empirically (throwaway better-sqlite3 script) that a
correlated subquery `json_group_array` over zero matching rows returns `[]`,
not `[null]` — the comment was stale, not the guard. The guard was dead code,
not a live crash path. Plan 002 typed the `JSON.parse` results explicitly,
deleted the guard, and added a regression test
(`SqliteInvoiceRepo.list` with a zero-line-item, zero-payment invoice) in
`sqlite-invoice-repo.test.ts`, written before the guard was removed so it
could be observed passing against the old code too.
