# Plan 008: Consolidate query wiring into one shared factory

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm the "Current state" excerpts match
> `src/app/build-app.ts` and `src/app/testing/build-test-app.ts`.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches the composition root; mitigated by the existing
  `build-app.test.ts` and the full suite
- **Depends on**: none. **Plan 009 depends on this one** — land 008 first so
  009 adds its new query in one place instead of three.
- **Category**: tech-debt / dx
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

Adding one read query today means editing three files in lockstep: the
`AppDeps['queries']` type in `app-deps.ts`, the wiring literal in
`build-app.ts` (`createQueries`), and a second, hand-maintained copy of that
same literal in `build-test-app.ts`. The two copies are only linked by the
shared type — the test app could silently wire a query to a _different
implementation_ than production and still typecheck. For a repo whose thesis
is "agents follow rails," a convention that says "now repeat yourself in a
second file and don't drift" is the anti-pattern. One shared factory removes
the duplicated literal and reduces the lockstep to two files (type + factory).

## Current state

- `src/app/app-deps.ts:42-59` — `AppDeps['queries']` type: three groups,
  `clients` (getClient, listClients), `invoicing` (getInvoiceSummary,
  getInvoiceLineItems, getInvoicePayments, listInvoices,
  getOutstandingByClient), `reporting` (getRevenueByMonth, getRevenueByYear,
  listAllRevenue).
- `src/app/build-app.ts:124-151` — `createQueries(overrides, deps)`:

```ts
function createQueries(
  overrides: Partial<AppDeps>,
  deps: {
    clientRepo: ClientRepository;
    invoiceRepo: InvoiceRepository;
    revenueReadModel: RevenueReadModel;
  },
): AppDeps['queries'] {
  if (overrides.queries) return overrides.queries;
  return {
    clients: {
      getClient: (id) => getClient({ repo: deps.clientRepo }, id),
      listClients: () => listClients({ repo: deps.clientRepo }),
    },
    invoicing: {
      getInvoiceSummary: (id) => getInvoiceSummary({ repo: deps.invoiceRepo }, id),
      // ... getInvoiceLineItems, getInvoicePayments,
      listInvoices: (filters) => listInvoiceSummaries({ repo: deps.invoiceRepo }, filters),
      getOutstandingByClient: (clientId) =>
        getOutstandingByClient({ repo: deps.invoiceRepo }, clientId),
    },
    reporting: {
      /* getRevenueByMonth, getRevenueByYear, listAllRevenue */
    },
  };
}
```

- `src/app/testing/build-test-app.ts:71-88` — the near-identical literal
  (`const queries = overrides.queries ?? { ...same shape... }`), maintained by
  hand against the same imports.
- `src/app/build-app.test.ts` — existing tests over the composition root
  (integration test builds the app and exercises wiring); they are the safety
  net for this refactor.
- Conventions: kebab-case filename must match the exported symbol
  (`wire-queries.ts` exports `wireQueries`); no default exports; no barrel
  files (direct imports only); framework imports stay in `src/app/**` (this
  file has none — it imports only domain query functions and ports, which is
  allowed for the app layer).

## Commands you will need

| Purpose    | Command                   | Expected on success |
| ---------- | ------------------------- | ------------------- |
| Typecheck  | `pnpm typecheck`          | exit 0              |
| Lint       | `pnpm lint`               | exit 0              |
| Dep rules  | `pnpm deps`               | exit 0              |
| App suite  | `pnpm vitest run src/app` | all pass            |
| Full suite | `pnpm test`               | exit 0 (Node 24)    |

## Scope

**In scope**:

- `src/app/wire-queries.ts` (create)
- `src/app/build-app.ts` (replace `createQueries` body with a call to the factory)
- `src/app/testing/build-test-app.ts` (same)
- `src/app/wire-queries.test.ts` (create, small)

**Out of scope** (do NOT touch):

- `src/app/app-deps.ts` — the `queries` type and `AppReadView` stay exactly
  as they are; do NOT widen `AppReadView`.
- Any query function in `src/{clients,invoicing,reporting}/queries/`.
- The `overrides.queries` escape hatch — both builders must still honor a
  caller-supplied `queries` object unchanged.

## Git workflow

- Branch: `advisor/008-query-wiring-consolidation`
- Conventional commit, e.g. `refactor: share query wiring between buildApp and buildTestApp`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the factory

New file `src/app/wire-queries.ts` exporting:

```ts
export interface WireQueriesDeps {
  readonly clientRepo: ClientRepository;
  readonly invoiceRepo: InvoiceRepository;
  readonly revenueReadModel: RevenueReadModel;
}

export function wireQueries(deps: WireQueriesDeps): AppDeps['queries'] { ... }
```

Move the object literal from `build-app.ts`'s `createQueries` verbatim
(imports move with it: `getClient`, `listClients`, `getInvoiceSummary`,
`getInvoiceLineItems`, `getInvoicePayments`, `listInvoiceSummaries`,
`getOutstandingByClient`, `getRevenueByMonth`, `getRevenueByYear`, plus the
three port types and `AppDeps`). The `overrides.queries` check does NOT move —
it stays in the builders.

**Verify**: `pnpm typecheck` → exit 0 (will fail until Step 2 removes the old
imports — run it after Step 2 if so).

### Step 2: Switch both builders

- `build-app.ts`: `createQueries` becomes
  `overrides.queries ?? wireQueries({ clientRepo, invoiceRepo, revenueReadModel })`
  (either keep the small wrapper function or inline it at the call site in
  `buildApp` — prefer inlining and deleting `createQueries` since it no longer
  earns its name). Remove the now-unused query-function imports from
  `build-app.ts`.
- `build-test-app.ts`: replace the whole `const queries = overrides.queries ?? { ... }`
  literal with `overrides.queries ?? wireQueries({ clientRepo, invoiceRepo, revenueReadModel })`.
  Remove its now-unused imports (`getInvoiceSummary`, `listClients`, etc. —
  keep `getClient` only if still used by the `registerSubscribers` wiring at
  line 66, which it is).

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps` → all exit 0;
`pnpm vitest run src/app` → all pass.

### Step 3: Pin prod/test wiring identity

Create `src/app/wire-queries.test.ts` with one meaningful test: build the
queries via `wireQueries` with in-memory adapters (`InMemoryClientRepo`,
`InMemoryInvoiceRepo`, `InMemoryRevenueReadModel`), save a client + a sent
invoice through the repos (use `buildSentInvoice` from
`src/invoicing/testing/invoice-factory.ts`), and assert
`queries.invoicing.listInvoices()` returns summaries (has `outstandingBalance`
field — i.e. it is wired to `listInvoiceSummaries`, not raw aggregates) and
`queries.clients.getClient(id)` round-trips. This pins the one bug class the
duplication invited: test wiring diverging from prod wiring is now impossible
because there is only one wiring.

**Verify**: `pnpm vitest run src/app/wire-queries.test.ts` → passes.

### Step 4: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → all exit 0.

## Test plan

Step 3's identity test, plus the existing `build-app.test.ts` and every
query-consuming test in the suite acting as regression coverage.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `grep -c "getInvoiceSummary" src/app/build-app.ts src/app/testing/build-test-app.ts` → 0 in both (the literal exists only in `wire-queries.ts`)
- [ ] Both builders still honor `overrides.queries` (existing tests that pass override queries keep passing)
- [ ] `wire-queries.test.ts` exists and passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The two wiring literals are NOT currently identical in behavior (e.g. the
  test app maps `listInvoices` to something other than `listInvoiceSummaries`)
  — that's a live drift bug to surface, not to silently "fix" in a refactor.
- `pnpm deps` reports a new violation from the factory's imports — the module
  boundary rules disagree with the chosen location; report rather than moving
  files around experimentally.
- Plan 009 already landed (a `getInvoiceDetail` query exists in the wiring) —
  reconcile: the factory must include it; the excerpts here predate it.

## Maintenance notes

- "How to add a query" now reads: add the query function in the module, add it
  to the type in `app-deps.ts`, wire it in `wire-queries.ts` — two files plus
  the query itself. Update `docs/architecture.md`'s step 4 wording if plan 006
  hasn't already adjusted that section (it doesn't touch step 4; a one-line
  follow-up is fine here).
- Reviewer: confirm no `build-test-app.ts` behavior changed beyond sourcing
  the literal — `FixedClock` date, flag defaults, and capturing adapters must
  be untouched.
