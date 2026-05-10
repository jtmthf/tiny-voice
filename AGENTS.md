<!-- intent-skills:start -->
## Skill Loading

Before substantial work:
- Skill check: run `npx @tanstack/intent@latest list`, or use skills already listed in context.
- Skill guidance: if one local skill clearly matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` and follow the returned `SKILL.md`.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

# tiny-voice -- Agent guide

## Orientation

tiny-voice is a small invoicing system built as a validation exercise for AI-native codebase patterns. It has three domain modules -- clients, invoicing, and reporting -- plus a shared kernel, organized as a hexagonal modular monolith with CQRS-lite. Commands go through aggregate roots returning `Result<T, DomainError>` via neverthrow; queries bypass the domain and read from repos or a materialized read model. A single `buildApp()` composition root in `src/app/build-app.ts` wires everything. CI gates: `pnpm typecheck`, `pnpm lint`, `pnpm deps`, `pnpm test`.

## Module map

- `src/shared/` -- Shared kernel: `Money` (bigint cents), `Clock`, `DueDate`/`YearMonth`, branded IDs (UUID v7), `EventBus`, `Logger`, `Config`, `FeatureFlags`, `Database` port, `Result` re-exports from neverthrow.
- `src/clients/` -- Client entity (name + email), `ClientRepository` port, create/get/list operations.
- `src/invoicing/` -- Invoice aggregate root with state machine (draft/sent/paid/void), line items, payments, events (`InvoiceSent`, `InvoicePaymentRecorded`, `InvoiceVoided`), `PdfGenerator` and `NotificationSender` ports.
- `src/reporting/` -- Revenue read model projected from payment events; `getRevenueByMonth` and `getRevenueByYear` queries.
- `src/app/` -- Composition root (`buildApp`), TanStack Start server functions in `fns/` (mutations and queries), TanStack Router file-based routes in `routes/`, TanStack Query for data fetching, `register-subscribers.ts` event wiring.

## Rules the toolchain enforces

- **Filename kebab-case** -- ESLint: `check-file/filename-naming-convention` + `unicorn/filename-case`
- **Folder kebab-case** -- ESLint: `check-file/folder-naming-convention` (KEBAB_CASE)
- **Filename matches export** -- ESLint: `local/filename-matches-export` (inline rule in `eslint.config.js`)
- **No default exports** -- ESLint: `import-x/no-default-export` (relaxed for `src/app/**`, configs, tests)
- **No circular deps** -- ESLint: `import-x/no-cycle`
- **No barrel files** -- ESLint: `barrel-files/avoid-barrel-files`. No `index.ts` re-export files. Always use direct imports to the source file.
- **Module boundaries** -- dependency-cruiser: cross-module imports are allowed to any subdirectory *except* `adapters/`. Three rules (`no-clients-into-other-adapters`, `no-invoicing-into-other-adapters`, `no-reporting-into-other-adapters`) enforce this. The app layer has no such restriction.
- **Domain never imports adapters or app** -- dependency-cruiser: `domain-no-adapters` rule
- **No framework outside src/app/** -- dependency-cruiser: `no-framework-outside-app` rule. TanStack imports (`@tanstack/react-router`, `@tanstack/react-start`, `@tanstack/react-query`) are confined to the app layer
- **Narrow read surface** -- TypeScript: `app-deps.ts` exports `AppReadView` (queries + featureFlags + clock only). Repos, event bus, DB, and infrastructure are not on the type. Do not widen `AppReadView` -- mutations go through server functions that call `getAppInstance()`
- **TypeScript strict** -- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **Conventional commits** -- commitlint via `simple-git-hooks`

## Rules the toolchain cannot enforce

1. Commands return `Result<T, DomainError>` via neverthrow -- never throw for domain errors. Infrastructure failures (DB down) may throw.
2. Aggregate round-trip for mutations: load whole via `findById` -> mutate (pure function) -> `save` whole. Never introduce partial-update repository methods (no `updateStatus`, `addRow`, etc.). Read-optimized projections (e.g. `listSummaries` returning pre-aggregated counts/totals via SQL) are fine on the repository port -- the prohibition is on mutation shortcuts, not read shortcuts. If the aggregate feels too big, split it.
3. Migrations in `migrations/` are append-only. Never edit a committed migration -- add a new numbered file.
4. Tax calculation uses banker's rounding (half-to-even) via `bankersRound` in `src/shared/money/bankers-round.ts`.
5. Schema-first at boundaries: Zod schemas at RPC input/output and event payloads. Types derived via `z.infer`. Pure TypeScript types inside the domain core.
6. Event bus handles projections (read model) and notifications. All subscribers registered in `src/app/register-subscribers.ts`.
7. Feature flags gate at the dispatch boundary (RPC procedure), not inside domain logic. The domain is flag-unaware.
8. Client components must NOT import `@/app/instance` (the server singleton). Enforced at build time via `createServerOnlyFn` from `@tanstack/react-start`.
9. Queries bypass domain *logic* (aggregates, commands), not domain *ports*. Query functions in `queries/` depend on repository ports (`InvoiceRepository`, `ClientRepository`) or read-model ports (`RevenueReadModel`) -- never on `Database` directly. `Database` is an infrastructure port consumed by adapters, not by query functions. Route components fetch data via `useSuspenseQuery` with `queryOptions` from `src/app/queries/`. If a route needs data not on `app.queries`, add a new query function in the module's `queries/` directory, wire it through `AppDeps.queries`, expose it via a server function in `src/app/fns/`, and consume it with `queryOptions`. The `AppReadView` type enforces the narrow surface at compile time.
10. Filename-matches-export: exported symbol name corresponds to kebab-case filename (e.g., `create-invoice.ts` exports `createInvoice` / `CreateInvoiceInput`). Co-located schema + handler is the expected pattern.
11. Cache invalidation uses TanStack Query: mutation server functions redirect or return on success; the calling component calls `queryClient.invalidateQueries({ queryKey: [...] })` in `onSuccess`. Never route cache invalidation through the event bus.
12. Event payloads carry IDs and immutable facts (amounts, timestamps) -- never mutable state (names, balances, statuses). Subscribers that need mutable data fetch it fresh from the repository at handling time.

## Intentional omissions

- **Authentication/authorization** -- Intentionally omitted. This is a demo app validating architecture patterns, not a production system. Adding auth would obscure the patterns being demonstrated. Do not flag the lack of auth as a security issue or add auth middleware.

## Pointers

- Domain vocabulary: `docs/domain-terms.md`
- Architecture details: `docs/architecture.md`

## Documentation rules

Assume built-in knowledge of the libraries below is incomplete or out of date. Before writing or modifying code that uses any of them, fetch the latest documentation via Context7 (`resolve-library-id` then `query-docs`).

| Library | Context7 ID | Notes |
|---|---|---|
| TanStack Router | `/tanstack/router` | File-based routing, `createFileRoute`, `useSuspenseQuery` integration |
| TanStack Start | `/tanstack/start` | `createServerFn`, `createServerOnlyFn`, server function patterns |
| TanStack Query | `/tanstack/query` | `queryOptions`, `useSuspenseQuery`, `useQueryClient`, cache invalidation |
| Zod 4 | `/websites/zod_dev_v4` | v4 API differs significantly from v3 |
| neverthrow | `/supermacro/neverthrow` | |
| fast-check | `/dubzzz/fast-check` | Property-based testing; also `@fast-check/vitest` integration |
