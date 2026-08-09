# Plan 005: Restore the invoice state-machine guard coverage lost in the command consolidation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm the "Current state" excerpts match
> `src/invoicing/entities/invoice.ts` before proceeding.
>
> **Environment check (run first)**: `node --version` → `v24.x` required for
> the full suite (better-sqlite3 binding); the new tests themselves are pure.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (additive tests + one 2-line guard reorder)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

The refactor that collapsed `src/invoicing/commands/*` into
`applyInvoiceCommand` deleted the per-command test files, and with them every
assertion on *which* domain error a disallowed transition returns.
`grep -rn "InvalidTransition" src --include='*.test.ts'` returns **zero**
matches today. This is the money-critical state machine: a regression that
loosens a guard (late fee on a paid invoice, re-send of a sent invoice) would
ship green. Additionally, the audit found one real inconsistency: `addLineItem`
on a **paid** invoice returns `InvalidTransition`, while every other transition
returns `AlreadyPaid` for paid invoices — and `docs/architecture.md`'s table
says paid returns `AlreadyPaid` for all operations. This plan pins the whole
(status × transition) matrix and aligns that one guard with the documented rule.

## Current state

- `src/invoicing/entities/invoice.ts` — all transitions. Guard order today:

```ts
// invoice.ts:133-140 — addLineItem (note: NO paid → AlreadyPaid check)
export function addLineItem(invoice: Invoice, item: LineItem): Result<InvoiceOutcome, InvoiceError> {
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status !== 'draft') {
    return err(IE.invalidTransition(invoice.status, 'draft'));
  }
```

```ts
// invoice.ts:151-159 — sendInvoice (the pattern the others follow)
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  if (invoice.status !== 'draft') {
    return err(IE.invalidTransition(invoice.status, 'sent'));
  }
  if (invoice.lineItems.length === 0) {
    return err(IE.noLineItems());
  }
```

  `recordPayment` (lines 184-197): void → `InvoiceVoided`, paid →
  `AlreadyPaid`, not-sent → `InvalidTransition`, overpayment → `Overpayment`.
  `addLateFee` (lines 225-240): void → `InvoiceVoided`, paid → `AlreadyPaid`,
  not-sent → `InvalidTransition`, existing lateFee item →
  `LateFeeAlreadyApplied`, not overdue → `NotOverdue`.
  `voidInvoice` (lines 255-260): void → `InvoiceVoided`, paid → `AlreadyPaid`,
  otherwise allowed from draft and sent.

- `src/invoicing/errors/invoice-error.ts` — the `InvoiceError` discriminated
  union; every variant has a `kind` string (e.g. `'InvalidTransition'`,
  `'AlreadyPaid'`, `'InvoiceVoided'`, `'NoLineItems'`, `'Overpayment'`,
  `'NotOverdue'`, `'LateFeeAlreadyApplied'`).
- `src/invoicing/testing/invoice-factory.ts` — builders you must use:
  `buildDraftInvoice`, `buildSentInvoice`, `buildPaidInvoice`,
  `buildVoidInvoice`, `buildLineItem`, `buildPayment` (all take overrides;
  defaults: due date `2025-02-15`, tax 10%, one 10000-cent line item for sent).
- `src/invoicing/entities/invoice-late-fee.test.ts` — existing test file for
  late-fee math; it exercises `addLateFee` **only on sent invoices**. Use its
  import style (`expectOk` from `@/shared/testing/expect-ok`, `as DueDate`
  casts) as the structural pattern.
- `docs/architecture.md:18-27` — the allowed-transitions table (paid: "All
  operations return `AlreadyPaid`"; void: "All operations return
  `InvoiceVoided`").

Conventions: vitest; property tests via `@fast-check/vitest` exist in
`invoice.property.test.ts` but this plan's matrix is example-based (a table of
exact cases is the point); kebab-case filename; tests co-located with the
entity.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| New suite | `pnpm vitest run src/invoicing/entities/invoice-transitions.test.ts` | all pass |
| Full suite | `pnpm test` | exit 0 (Node 24) |

## Scope

**In scope**:

- `src/invoicing/entities/invoice-transitions.test.ts` (create)
- `src/invoicing/entities/invoice.ts` — ONLY the `addLineItem` guard reorder
  in Step 1 (two inserted lines, nothing else)
- `docs/architecture.md` — only if you choose Option B in Step 1 (you won't;
  see below)

**Out of scope** (do NOT touch):

- Any other transition's logic, event payloads, or the `Outcome` envelope.
- `invoice.property.test.ts`, `invoice-late-fee.test.ts` — leave them.
- `applyInvoiceCommand` and everything under `src/app/`.

## Git workflow

- Branch: `advisor/005-state-machine-guard-tests`
- Conventional commits, e.g. `fix: return AlreadyPaid from addLineItem on paid invoices`,
  `test: pin invoice transition guard matrix`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Align `addLineItem` with the documented paid-invoice rule

In `invoice.ts` `addLineItem`, insert a paid check between the void check and
the draft check, matching `sendInvoice`'s pattern exactly:

```ts
if (invoice.status === 'void') return err(IE.invoiceVoided());
if (invoice.status === 'paid') return err(IE.alreadyPaid());
if (invoice.status !== 'draft') {
  return err(IE.invalidTransition(invoice.status, 'draft'));
}
```

Rationale (Option A, chosen): the other four transitions and the
architecture-doc table all say paid → `AlreadyPaid`; `addLineItem` is the
lone outlier. (Option B — changing the doc instead — would leave the domain
inconsistent with itself, so it was rejected.)

**Verify**: `pnpm typecheck` → exit 0; `pnpm vitest run src/invoicing` → all
existing invoicing tests still pass (nothing currently asserts the old
behavior — that absence is this plan's reason to exist).

### Step 2: Write the transition guard matrix

Create `src/invoicing/entities/invoice-transitions.test.ts`. Use `it.each`
(vitest) over a table of `(startStatus, operation, expectedErrorKind)`.
Build starting invoices with the factory builders. Call each transition with
valid arguments (e.g. `addLineItem(invoice, buildLineItem())`,
`sendInvoice(invoice, NOW)`, `recordPayment(invoice, buildPayment())`,
`addLateFee(invoice, '2099-01-01' as DueDate, newLineItemId())`,
`voidInvoice(invoice, NOW)`), assert `result.isErr()` and
`result.error.kind === expected`. The full disallowed matrix:

| start | operation | expected kind |
|---|---|---|
| sent | addLineItem | InvalidTransition |
| paid | addLineItem | AlreadyPaid *(after Step 1)* |
| void | addLineItem | InvoiceVoided |
| sent | sendInvoice | InvalidTransition |
| paid | sendInvoice | AlreadyPaid |
| void | sendInvoice | InvoiceVoided |
| draft | recordPayment | InvalidTransition |
| paid | recordPayment | AlreadyPaid |
| void | recordPayment | InvoiceVoided |
| draft | addLateFee | InvalidTransition |
| paid | addLateFee | AlreadyPaid |
| void | addLateFee | InvoiceVoided |
| paid | voidInvoice | AlreadyPaid |
| void | voidInvoice | InvoiceVoided |

Plus the non-status guards, as individual `it` cases:

- `sendInvoice` on a draft with zero line items → `NoLineItems`
  (`buildDraftInvoice()` with no overrides has no line items).
- `recordPayment` on sent for more than the outstanding balance →
  `Overpayment` (use `total(invoice)` + 1 cent; import `total` from
  `./invoice`).
- `addLateFee` on a sent invoice that is not overdue → `NotOverdue`
  (today before due date: `'2025-01-01' as DueDate` with default due
  `2025-02-15`).
- `addLateFee` twice → `LateFeeAlreadyApplied` (apply once via
  `expectOk(...)`, then again on the result aggregate with an overdue today).

And the allowed-but-easy-to-forget cases:

- `voidInvoice` on **draft** succeeds (status `void`, one `InvoiceVoided`
  event in `events`).
- `voidInvoice` on **sent** succeeds likewise.
- `recordPayment` for exactly the outstanding balance flips status to `paid`
  and the event payload has `becamePaid: true`.

**Verify**: `pnpm vitest run src/invoicing/entities/invoice-transitions.test.ts`
→ all pass (14 matrix cases + 7 named cases).

### Step 3: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0. Also
`grep -rn "InvalidTransition" src --include='*.test.ts'` → now returns matches
(the coverage-loss signal from the audit is gone).

## Test plan

Step 2 is the test plan: the complete disallowed matrix with exact error
kinds, the four non-status guards, and three allowed-path pins.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all exit 0 on Node 24
- [ ] `invoice-transitions.test.ts` exists; ≥ 21 passing cases
- [ ] `addLineItem` on a paid invoice returns `kind: 'AlreadyPaid'`
- [ ] `grep -rn "InvalidTransition" src --include='*.test.ts'` returns ≥ 1 match
- [ ] Diff to `invoice.ts` is exactly the one inserted guard line (plus nothing)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The guard order in the `invoice.ts` excerpts doesn't match the live file.
- Any *existing* test fails after Step 1 — something does assert
  `InvalidTransition` for paid `addLineItem`, and the alignment needs a
  human decision.
- A factory builder produces a shape that makes a matrix case unreachable
  (e.g. `buildPaidInvoice` stops paying in full).

## Maintenance notes

- Any new transition added to the aggregate must add its row(s) to this
  matrix — reviewers should treat a transition PR without a matrix update as
  incomplete.
- The matrix pins error *kinds*, not messages — message wording stays free to
  change.
- Deferred: property-based generation of the matrix (fast-check over statuses)
  was considered and rejected — the explicit table is more legible as
  documentation, which is the point for this repo.
