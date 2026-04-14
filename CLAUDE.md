# tiny-voice -- Agent guide

## Orientation

tiny-voice is a small invoicing system built as a validation exercise for AI-native codebase patterns. It has three domain modules -- clients, invoicing, and reporting -- plus a shared kernel, organized as a hexagonal modular monolith with CQRS-lite. Commands go through aggregate roots returning `Result<T, DomainError>` via neverthrow; queries bypass the domain and read from repos or a materialized read model. A single `buildApp()` composition root in `src/app/build-app.ts` wires everything. CI gates: `pnpm typecheck`, `pnpm lint`, `pnpm deps`, `pnpm test`.

## Module map

- `src/shared/` -- Shared kernel: `Money` (bigint cents), `Clock`, `DueDate`/`YearMonth`, branded IDs (UUID v7), `EventBus`, `Logger`, `Config`, `FeatureFlags`, `Database` port, `Result` re-exports from neverthrow.
- `src/clients/` -- Client entity (name + email), `ClientRepository` port, create/get/list operations.
- `src/invoicing/` -- Invoice aggregate root with state machine (draft/sent/paid/void), line items, payments, events (`InvoiceSent`, `InvoicePaymentRecorded`, `InvoiceVoided`), `PdfGenerator` and `NotificationSender` ports.
- `src/reporting/` -- Revenue read model projected from payment events; `getRevenueByMonth` and `getRevenueByYear` queries.
- `src/app/` -- Composition root (`buildApp`), oRPC contract + router with `.actionable()` Server Actions, `register-subscribers.ts` event wiring, Next.js App Router pages (RSCs for reads, Server Actions for mutations).

## Rules the toolchain enforces

- **Filename kebab-case** -- ESLint: `check-file/filename-naming-convention` + `unicorn/filename-case`
- **Folder kebab-case** -- ESLint: `check-file/folder-naming-convention` (NEXT_JS_APP_ROUTER_CASE)
- **Filename matches export** -- ESLint: `local/filename-matches-export` (inline rule in `eslint.config.js`)
- **No default exports** -- ESLint: `import-x/no-default-export` (relaxed for `src/app/**`, configs, tests)
- **No circular deps** -- ESLint: `import-x/no-cycle`
- **Module boundaries** -- dependency-cruiser: cross-module imports only via `index.ts`; six pairwise rules prevent reaching into internals
- **Domain never imports adapters or app** -- dependency-cruiser: `domain-no-adapters` rule
- **No next/* outside src/app/** -- dependency-cruiser: `no-next-outside-app` rule. Next.js imports (`next/cache`, `next/navigation`, `next/link`, etc.) are confined to the app layer
- **RSC read surface** -- TypeScript: `instance.ts` exports `AppReadView` (queries + featureFlags + clock only). Repos, event bus, DB, and infrastructure are not on the type. Do not widen `AppReadView` -- mutations go through Server Actions / RPC context
- **TypeScript strict** -- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Conventional commits** -- commitlint via `simple-git-hooks`

## Rules the toolchain cannot enforce

1. Commands return `Result<T, DomainError>` via neverthrow -- never throw for domain errors. Infrastructure failures (DB down) may throw.
2. Aggregate round-trip: load whole via `findById` -> mutate (pure function) -> `save` whole. Never introduce row-level repository methods. If the aggregate feels too big, split it.
3. Migrations in `migrations/` are append-only. Never edit a committed migration -- add a new numbered file.
4. Tax calculation uses banker's rounding (half-to-even) via `bankersRound` in `src/shared/money/bankers-round.ts`.
5. Schema-first at boundaries: Zod schemas at RPC input/output and event payloads. Types derived via `z.infer`. Pure TypeScript types inside the domain core.
6. Event bus handles projections (read model) and notifications. All subscribers registered in `src/app/register-subscribers.ts`. Cache invalidation is handled directly in Server Actions via `updateTag` from `next/cache`.
7. Feature flags gate at the dispatch boundary (RPC procedure), not inside domain logic. The domain is flag-unaware.
8. Client components must NOT import `@/app/instance` (the server singleton). Enforced at build time via `server-only`.
9. Queries bypass the domain layer -- RSCs call `app.queries.*` directly with `'use cache'` + `cacheTag`. RSC pages must never access repos, event bus, or infrastructure on the app singleton. If a page needs data not on `app.queries`, add a new query function in the module's `queries/` directory, wire it through `AppDeps.queries`, and call it via `app.queries.*`. The `AppReadView` type enforces this at compile time.
10. Filename-matches-export: exported symbol name corresponds to kebab-case filename (e.g., `create-invoice.ts` exports `createInvoice` / `CreateInvoiceInput`). Co-located schema + handler is the expected pattern.
11. Framework cache primitives (`updateTag`, `revalidateTag`, `cacheTag`, `cacheLife`) must be called where Next.js expects them -- `updateTag` in Server Actions, `cacheTag`/`cacheLife` in `'use cache'` scopes. Never wrap them in adapter classes or route through domain events.

## Intentional omissions

- **Authentication/authorization** -- Intentionally omitted. This is a demo app validating architecture patterns, not a production system. Adding auth would obscure the patterns being demonstrated. Do not flag the lack of auth as a security issue or add auth middleware.

## Pointers

- Domain vocabulary: `docs/domain-terms.md`
- Architecture details: `docs/architecture.md`

## Framework-specific rules

<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated -- the docs are the source of truth.

<!-- END:nextjs-agent-rules -->
