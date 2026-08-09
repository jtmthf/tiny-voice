# Plan 009: Collapse redundant aggregate loads on the read path and delete the dead query module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm the "Current state" excerpts match
> the live files. This plan assumes plan 008 (shared `wireQueries` factory)
> has landed; if `src/app/wire-queries.ts` does not exist, STOP — either run
> plan 008 first or report back.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED — additive query + one query rewrite with identical
  observable behavior; existing tests cover both
- **Depends on**: plans/008-query-wiring-consolidation.md
- **Category**: perf / tech-debt
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

Three read-path problems, one theme — the expensive "hydrate the whole
aggregate" path is used where a cheaper path exists:

1. The invoice-detail server fn calls three queries (`getInvoiceSummary`,
   `getInvoiceLineItems`, `getInvoicePayments`) that **each** call
   `repo.findById` — 3 hydrations, 9 SQL queries per detail render, with the
   summary call discarding the very line items the next call re-fetches.
2. `getOutstandingByClient` calls `repo.list({ clientId })`, hydrating every
   invoice's full line items and payments as JSON just to sum one number —
   when `repo.listSummaries` already returns the per-invoice
   `subtotalCents`/`taxRate`/`paidAmountCents` needed to derive it.
3. `src/invoicing/queries/list-invoices.ts` is dead code — zero importers
   (the app wires `listInvoices` to `listInvoiceSummaries`) — and its
   existence invites future callers onto the full-hydration path.

Note on (2): the outstanding balance includes tax computed with **banker's
rounding** (`bankersRound`), which SQL cannot reproduce — so the fix derives
the total in TypeScript from summary rows, NOT via a SQL `SUM`.

## Current state

- `src/app/fns/get-invoice-detail.ts:20-29` — the triple load:

```ts
const app = getAppReadView();
const summary = app.queries.invoicing.getInvoiceSummary(data.invoiceId);
const lineItems = app.queries.invoicing.getInvoiceLineItems(data.invoiceId);
const payments = app.queries.invoicing.getInvoicePayments(data.invoiceId);
```

It then fetches `clientName` via `app.queries.clients.getClient` and maps
through DTOs from `src/app/fns/dto.ts` (`invoiceSummaryToDto`,
`lineItemToDto`, `paymentToDto`).

- `src/invoicing/queries/get-invoice-summary.ts` — `repo.findById` + derived
  getters (`subtotal`, `taxAmount`, `total`, `paidAmount`,
  `outstandingBalance` from `../entities/invoice`); returns `InvoiceSummary`.
- `src/invoicing/queries/get-invoice-line-items.ts` and
  `get-invoice-payments.ts` — same shape, each with its own `findById`;
  return `LineItemSummary[]` / `PaymentSummary[]` (open both for the exact
  mapped fields).
- `src/invoicing/queries/get-outstanding-by-client.ts:11-23`:

```ts
export function getOutstandingByClient(deps, clientId): MoneyType {
  const invoices = deps.repo.list({ clientId });
  let sum = Money.zero();
  for (const inv of invoices) {
    if (inv.status === 'sent') sum = Money.add(sum, outstandingBalance(inv));
  }
  return sum;
}
```

- `src/invoicing/queries/list-invoice-summaries.ts:23-43` — the exemplar for
  deriving money fields from summary rows (this is the pattern to reuse):

```ts
const sub = Money.fromCents(item.subtotalCents);
const tax = calculateTax(sub, item.taxRate);
const tot = Money.add(sub, tax);
const paid = Money.fromCents(item.paidAmountCents);
const outstanding = Money.subtract(tot, paid);
```

- `src/invoicing/queries/list-invoices.ts` — the dead module (exports
  `listInvoices` + `ListInvoicesFilters`; verified zero importers).
- `src/invoicing/ports/invoice-repository.ts` — `listSummaries(filters)`
  returns `InvoiceListItem[]` with `status`, `subtotalCents`, `taxRate`,
  `paidAmountCents` — everything (2) needs. `repo.list` keeps one other
  caller: `src/clients/commands/delete-client.ts` (do not remove `list` from
  the port).
- After plan 008: wiring lives in `src/app/wire-queries.ts`; the queries type
  in `src/app/app-deps.ts:42-59`.
- Existing tests: `src/invoicing/queries/get-outstanding-by-client.test.ts`
  (uses `InMemoryInvoiceRepo` — behavior must be preserved so it should pass
  with at most import-level changes), `get-invoice-payments.test.ts` /
  `get-invoice-summary.test.ts` (structural patterns for the new query's test).
- Conventions: query = pure function taking `deps` + args, co-located
  interface, direct imports, kebab-case filename matching export
  (`get-invoice-detail.ts` → `getInvoiceDetail`). Queries depend on repository
  **ports**, never `Database` (AGENTS.md rule 9).

## Commands you will need

| Purpose                 | Command                                     | Expected on success |
| ----------------------- | ------------------------------------------- | ------------------- |
| Typecheck               | `pnpm typecheck`                            | exit 0              |
| Lint                    | `pnpm lint`                                 | exit 0              |
| Dep rules               | `pnpm deps`                                 | exit 0              |
| Invoicing suite         | `pnpm vitest run src/invoicing`             | all pass            |
| Full suite              | `pnpm test`                                 | exit 0 (Node 24)    |
| E2E smoke (detail page) | `pnpm test:e2e:critical --project=chromium` | all pass            |

## Scope

**In scope**:

- `src/invoicing/queries/get-invoice-detail.ts` (create) + its test
- `src/invoicing/queries/get-outstanding-by-client.ts` (rewrite internals)
- `src/invoicing/queries/list-invoices.ts` (delete)
- `src/app/app-deps.ts` (add `getInvoiceDetail` to the `invoicing` queries type)
- `src/app/wire-queries.ts` (wire it)
- `src/app/fns/get-invoice-detail.ts` (call the single query)

**Out of scope** (do NOT touch):

- `SqliteInvoiceRepo` / `InMemoryInvoiceRepo` — no repo or port changes; both
  `list` and `listSummaries` stay as they are.
- `get-invoice-summary.ts`, `get-invoice-line-items.ts`,
  `get-invoice-payments.ts` — they keep their other consumers; do not delete
  or change them.
- `src/app/fns/dto.ts` and the route components — the fn's response shape
  (`InvoiceDetailDto`) must not change.
- `AppReadView` in `app-deps.ts` — adding a query to `queries` is fine;
  widening the view beyond `queries`/`featureFlags`/`clock` is not.

## Git workflow

- Branch: `advisor/009-read-path-efficiency`
- Conventional commits per step, e.g. `feat: add getInvoiceDetail single-load query`,
  `perf: derive outstanding-by-client from summaries`, `chore: remove dead list-invoices query`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Single-load detail query

Create `src/invoicing/queries/get-invoice-detail.ts`:

```ts
export interface InvoiceDetail {
  readonly summary: InvoiceSummary;
  readonly lineItems: readonly LineItemSummary[];
  readonly payments: readonly PaymentSummary[];
}

export interface GetInvoiceDetailDeps {
  readonly repo: InvoiceRepository;
}

export function getInvoiceDetail(
  deps: GetInvoiceDetailDeps,
  invoiceId: InvoiceId,
): InvoiceDetail | null;
```

One `deps.repo.findById(invoiceId)`; return `null` if absent; otherwise build
all three parts from the single aggregate. Reuse the existing mapping logic:
import nothing from the three sibling queries if their mapping is inline —
instead replicate the field mappings exactly as those files do (open
`get-invoice-summary.ts`, `get-invoice-line-items.ts`,
`get-invoice-payments.ts` and mirror their return shapes field-for-field; the
types `InvoiceSummary`, `LineItemSummary`, `PaymentSummary` are imported from
those modules — importing types keeps a single source of truth for the shapes).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Wire it

- `app-deps.ts`: add `getInvoiceDetail(id: InvoiceId): InvoiceDetail | null;`
  to `queries.invoicing` (import the type from the new module).
- `wire-queries.ts`: `getInvoiceDetail: (id) => getInvoiceDetail({ repo: deps.invoiceRepo }, id),`

**Verify**: `pnpm typecheck && pnpm deps` → exit 0.

### Step 3: Use it in the server fn

In `src/app/fns/get-invoice-detail.ts`, replace the three query calls with one
`app.queries.invoicing.getInvoiceDetail(data.invoiceId)`; keep the
`clientName` lookup and the DTO mapping so `InvoiceDetailDto` is byte-for-byte
compatible (`summary`/`lineItems`/`payments` are `null` when the invoice is
missing — preserve that: when the query returns `null`, all three DTO fields
are `null`, as today).

**Verify**: `pnpm vitest run src/app` → all pass;
`pnpm test:e2e:critical --project=chromium` → invoice-detail specs pass.

### Step 4: Rewrite `getOutstandingByClient` on summaries

Same file, same signature, new internals:

```ts
const items = deps.repo.listSummaries({ clientId });
let sum = Money.zero();
for (const item of items) {
  if (item.status !== 'sent') continue;
  const sub = Money.fromCents(item.subtotalCents);
  const tax = calculateTax(sub, item.taxRate);
  const tot = Money.add(sub, tax);
  const outstanding = Money.subtract(tot, Money.fromCents(item.paidAmountCents));
  sum = Money.add(sum, outstanding);
}
return sum;
```

(Imports: `calculateTax` from `../value-objects/tax-rate`; drop the now-unused
`outstandingBalance` import.) This is numerically identical to the aggregate
path because `outstandingBalance = subtotal + calculateTax(subtotal) − paid`
and `listSummaries` returns exact bigint cents.

**Verify**: `pnpm vitest run src/invoicing/queries/get-outstanding-by-client.test.ts`
→ passes **unmodified** (if the test constructs repos where `listSummaries` is
unimplemented or diverges, STOP — see conditions).

### Step 5: Delete the dead module

`git rm src/invoicing/queries/list-invoices.ts`. Confirm no test file for it
exists (`ls src/invoicing/queries/list-invoices.test.ts` → not found).

**Verify**: `grep -rn "queries/list-invoices" src` → no matches;
`pnpm typecheck` → exit 0.

### Step 6: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → all exit 0.

## Test plan

- `src/invoicing/queries/get-invoice-detail.test.ts` (create; model on
  `get-invoice-payments.test.ts`): found invoice returns summary + items +
  payments consistent with the three sibling queries' outputs for the same
  repo state (assert deep equality against their results — that's the
  strongest cheap parity check); missing invoice returns `null`.
- `get-outstanding-by-client.test.ts` — existing cases pass unmodified; add
  one case with a non-zero tax rate and a partial payment to pin the
  banker's-rounding parity (expected value computed via the entity helpers in
  the test itself).

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `src/app/fns/get-invoice-detail.ts` contains exactly one `app.queries.invoicing.get…` call for invoice data
- [ ] `getOutstandingByClient` no longer calls `repo.list` (`grep -n "repo.list(" src/invoicing/queries/get-outstanding-by-client.ts` → no match)
- [ ] `src/invoicing/queries/list-invoices.ts` deleted; no references remain
- [ ] `get-invoice-detail.test.ts` exists with the parity + null cases passing
- [ ] `pnpm test:e2e:critical --project=chromium` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/app/wire-queries.ts` doesn't exist (plan 008 not landed).
- The existing `get-outstanding-by-client.test.ts` fails after Step 4 — the
  summary-derived math diverges from the aggregate math, which would be a
  genuine numeric bug to surface (do not "fix" the test).
- `InMemoryInvoiceRepo.listSummaries` turns out to compute subtotal/paid
  differently from the SQLite adapter for the shapes in the tests — that is
  plan 010's parity problem showing up early; report it.
- Anything requires changing `InvoiceDetailDto`'s shape.

## Maintenance notes

- `repo.list` (full hydration) now has a single caller
  (`delete-client.ts`). If that caller ever moves off it, remove `list` from
  the port entirely — noted here so the next audit knows the path is
  intentionally narrow.
- If invoice detail later needs client data beyond the name, resist adding a
  second query call — extend `getInvoiceDetail`'s deps instead.
- Reviewer: check the DTO `null` semantics for missing invoices are preserved
  (route components branch on them).
