# Plan 006: Make impossible invoice states unrepresentable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. Confirm
> `src/invoicing/entities/invoice.ts` still defines a single `Invoice`
> interface with a `status: InvoiceStatus` field and six transitions each
> opening with the same three guard lines.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.
> Requires plan 003 (domain kit) — if `src/shared/domain/value-object.ts` does
> not exist, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED–HIGH — rewrites the aggregate type, both repository adapters'
  hydration paths, the command dispatcher, and the test factories. Zero
  intended behavior change, but the blast radius is wide.
- **Depends on**: plans/003-domain-value-object-kit.md
- **Category**: domain modeling / correctness
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

`Invoice` is one flat interface where `status` is a field and every other
field is always present. That means the type system currently permits:

- a `draft` invoice carrying five payments
- a `void` invoice with an outstanding balance being paid
- a `sent` invoice with **zero line items** — even though `sendInvoice`
  rejects that at runtime, nothing stops a repository, a test factory, or a
  future transition from constructing one
- a `paid` invoice with no payments

None of these are reachable through the current transitions. They are all
reachable through the _type_, which is what "impossible states are
representable" means, and it is the gap the maintainer asked to close.

The second cost is duplication. All six transitions open with the same block:

```ts
if (invoice.status === 'void') return err(IE.invoiceVoided());
if (invoice.status === 'paid') return err(IE.alreadyPaid());
if (invoice.status !== 'draft') return err(IE.invalidTransition(invoice.status, 'draft'));
```

That is a convention, hand-copied six times, with a **known history of getting
it wrong**: commit `04158bf` — "fix: return AlreadyPaid from addLineItem on
paid invoices" — was exactly this block being subtly different in one
transition. A convention that has already failed once should become a
primitive.

## Validated design

Prototyped against TypeScript 6.0.2 with `--strict --exactOptionalPropertyTypes
--noUncheckedIndexedAccess`. All three impossible constructions error; the
dispatcher pattern and the shared derived functions compile.

```ts
type NonEmptyArray<T> = readonly [T, ...T[]];

interface InvoiceBase {
  readonly id: InvoiceId;
  readonly clientId: ClientId;
  readonly taxRate: TaxRate;
  readonly dueDate: DueDate;
  readonly createdAt: Date;
  readonly version: number;
}

interface DraftInvoice extends InvoiceBase {
  readonly status: 'draft';
  readonly lineItems: readonly LineItem[]; // may be empty; no payments field at all
}
interface SentInvoice extends InvoiceBase {
  readonly status: 'sent';
  readonly lineItems: NonEmptyArray<LineItem>;
  readonly payments: readonly Payment[];
  readonly sentAt: Date;
}
interface PaidInvoice extends InvoiceBase {
  readonly status: 'paid';
  readonly lineItems: NonEmptyArray<LineItem>;
  readonly payments: NonEmptyArray<Payment>;
  readonly paidAt: Date;
}
interface VoidInvoice extends InvoiceBase {
  readonly status: 'void';
  readonly lineItems: readonly LineItem[];
  readonly payments: readonly Payment[];
  readonly voidedAt: Date;
}

export type Invoice = DraftInvoice | SentInvoice | PaidInvoice | VoidInvoice;
export type InvoiceOf<S extends Invoice['status']> = Extract<Invoice, { status: S }>;
```

**Transitions take the precise variant. The signature is the guard:**

```ts
export function sendInvoice(
  invoice: DraftInvoice,
  now: Date,
): Result<Outcome<SentInvoice, InvoiceDomainEvent>, InvoiceError>;
export function recordPayment(
  invoice: SentInvoice,
  payment: Payment,
): Result<Outcome<SentInvoice | PaidInvoice, InvoiceDomainEvent>, InvoiceError>;
export function addLineItem(
  invoice: DraftInvoice,
  item: LineItem,
): Result<Outcome<DraftInvoice, never>, InvoiceError>;
export function addLateFee(
  invoice: SentInvoice,
  today: DueDate,
  id: LineItemId,
): Result<Outcome<SentInvoice, never>, InvoiceError>;
export function voidInvoice(
  invoice: DraftInvoice | SentInvoice,
  now: Date,
): Result<Outcome<VoidInvoice, InvoiceDomainEvent>, InvoiceError>;
```

**One canonical guard replaces the six copied blocks:**

```ts
export function narrow<S extends Invoice['status']>(
  invoice: Invoice,
  to: S,
): Result<InvoiceOf<S>, InvoiceError> {
  if (invoice.status === to) return ok(invoice as InvoiceOf<S>);
  if (invoice.status === 'void') return err(IE.invoiceVoided());
  if (invoice.status === 'paid') return err(IE.alreadyPaid());
  return err(IE.invalidTransition(invoice.status, to));
}
```

The error **precedence** — void before paid before generic — is now a single
fact in one place rather than a pattern six functions are trusted to repeat.

### Verified compile errors

| Attempt                                           | Result                              |
| ------------------------------------------------- | ----------------------------------- |
| `sendInvoice(paidInvoice, now)`                   | ✅ error                            |
| `draftInvoice.payments`                           | ✅ error — the field does not exist |
| Constructing a `SentInvoice` with `lineItems: []` | ✅ error                            |
| `recordPayment(draftInvoice, p)`                  | ✅ error                            |

### One friction point found while prototyping

`[...invoice.payments, payment]` **does not** typecheck as
`NonEmptyArray<Payment>`. TypeScript models it as `[...Payment[], Payment]`
and cannot prove index 0 is populated, so the assignment fails even though the
result is obviously non-empty.

Do **not** solve this by casting at each transition — that reintroduces exactly
the unchecked assertions this plan removes. Add one audited helper to the
shared kernel:

```ts
// src/shared/domain/non-empty-array.ts
export type NonEmptyArray<T> = readonly [T, ...T[]];

/** The single sanctioned construction site. Appending to any array yields ≥1 element. */
export function appendNonEmpty<T>(items: readonly T[], item: T): NonEmptyArray<T> {
  return [...items, item] as unknown as NonEmptyArray<T>;
}

export function nonEmpty<T>(items: readonly T[]): NonEmptyArray<T> | null {
  return items.length > 0 ? (items as unknown as NonEmptyArray<T>) : null;
}
```

Two casts, in one file, with tests — instead of a dozen scattered through the
aggregate. `nonEmpty` is what the repository hydration path uses to turn a
`Payment[]` from SQL into the right variant.

## Current state

- `src/invoicing/entities/invoice.ts` — the flat `Invoice` interface;
  `InvoiceOutcome = Outcome<Invoice, InvoiceDomainEvent>`; derived functions
  `subtotal`, `taxAmount`, `total`, `paidAmount`, `outstandingBalance`,
  `isOverdue`, `daysOverdue`, `calculateLateFeeLineItem`; and six transitions.
- Note the aggregate has **no `sentAt` / `paidAt` / `voidedAt` fields today** —
  those timestamps exist only on the emitted events. Adding them to the
  variants is a schema change (Step 5).
- `src/invoicing/commands/apply-invoice-command.ts` — dispatcher taking
  `InvoiceTransition = (invoice: Invoice) => Result<InvoiceOutcome, InvoiceError>`.
- `src/invoicing/adapters/sqlite-invoice-repo.ts` — `toInvoice(row, lineItems, payments)`
  builds the flat object. **Lines 237-243 are already known-suspect** (see the
  plans README's "Latent bug"): untyped `JSON.parse` plus null guards that the
  type system says are dead. This plan rewrites that code; if plan 002 has not
  already resolved it, resolve it here.
- `src/invoicing/adapters/in-memory-invoice-repo.ts` — the parity counterpart.
- `src/invoicing/testing/invoice-factory.ts` and `invoice-arbitraries.ts` —
  construct invoices directly; both will need per-variant builders.
- Tests most affected: `invoice-transitions.test.ts` (the guard matrix pinned
  by a prior plan), `invoice.property.test.ts`, `invoice-late-fee.test.ts`,
  `invoice-repo-parity.property.test.ts`, `apply-invoice-command*.test.ts`.
- `docs/architecture.md` — the state-machine diagram and the "Allowed
  transitions by status" table.

## Commands you will need

| Purpose         | Command                                                                       | Expected on success |
| --------------- | ----------------------------------------------------------------------------- | ------------------- |
| Typecheck       | `pnpm typecheck`                                                              | exit 0              |
| Lint            | `pnpm lint`                                                                   | exit 0              |
| Invoicing suite | `pnpm vitest run src/invoicing`                                               | all pass            |
| Parity property | `pnpm vitest run src/invoicing/adapters/invoice-repo-parity.property.test.ts` | all pass            |
| Full suite      | `pnpm test`                                                                   | exit 0 (Node 24)    |
| E2E             | `pnpm test:e2e`                                                               | all pass            |

## Scope

**In scope**:

- `src/shared/domain/non-empty-array.ts` + test
- `src/invoicing/entities/invoice.ts` — the union, `narrow`, retyped transitions
- `src/invoicing/entities/invoice-transitions.ts` (new) — the transition table
- `src/invoicing/commands/apply-invoice-command.ts` — generic over the variant
- Both invoice repository adapters' hydration
- `migrations/0011_*.sql` — `sent_at` / `paid_at` / `voided_at` columns
- Test factories and arbitraries — per-variant
- `docs/architecture.md`, `docs/domain-terms.md`

**Out of scope** (do NOT touch):

- **`Client`.** It has no state machine — a single shape is correct for it.
  Do not manufacture variants to be consistent.
- The `InvoiceStatus` value object or its Zod schema. `'draft' | 'sent' |
'paid' | 'void'` is unchanged; only the aggregate's shape changes.
- Query return types (`InvoiceSummary`, `InvoiceListItem`, etc.). Queries read
  through derived functions that work across all variants. If a query's
  _output_ type changes, you have gone too far.
- Event payloads and `InvoicingEventMap`. Plan 007/008 own those.
- The `applyInvoiceCommand` scope decision in ADR-0001 — `createInvoice` and
  `deleteInvoice` stay outside the dispatcher. **Do not re-litigate this.**

## Git workflow

- Branch: `advisor/006-invoice-state-union`
- One commit per step. Step 4 (adapters) and Step 6 (tests) will each be large;
  keeping them separate from the type change is what makes review feasible.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `NonEmptyArray`

Create `src/shared/domain/non-empty-array.ts` exactly as in "Validated
design", plus `src/shared/domain/non-empty-array.test.ts`:

- `appendNonEmpty([], x)` → `[x]`; `appendNonEmpty([a], b)` → `[a, b]` —
  **order preserved** (payments are order-sensitive; the SQL query sorts by
  `recorded_at`).
- `nonEmpty([])` → `null`; `nonEmpty([a])` → the same array.
- A type test: a `NonEmptyArray<T>` is assignable to `readonly T[]`, and
  `[]` is not assignable to `NonEmptyArray<T>`.

The two `as unknown as` casts are the only ones permitted in this plan. Comment
each with why it is sound.

**Verify**: `pnpm vitest run src/shared/domain` → all pass.

### Step 2: The union and `narrow`

Rewrite the type section of `src/invoicing/entities/invoice.ts` per "Validated
design". Then fix the derived functions to work across all four variants:

- `subtotal`, `taxAmount`, `total` — read `lineItems`, present on every variant.
  No change.
- `paidAmount`, `outstandingBalance` — read `payments`, **absent on
  `DraftInvoice`**. Add a `paymentsOf(invoice: Invoice): readonly Payment[]`
  accessor returning `[]` for drafts, and route both through it. Do not add a
  `payments: []` field to `DraftInvoice` — "a draft cannot have payments" is
  the invariant being bought here.
- `isOverdue(invoice, today)` — currently checks `status === 'sent'`. It can
  now take `SentInvoice` directly, but it has query-layer callers passing an
  arbitrary `Invoice`. **Keep the `Invoice` signature** and the internal status
  check; narrowing it would push churn into the read path for no gain.

Add `narrow` as given. Its one cast (`invoice as InvoiceOf<S>`) is sound
because the preceding equality check discriminates the union — comment it.

**Verify**: `pnpm typecheck` → errors only in transitions, adapters, factories
(expected at this point).

### Step 3: Retype the transitions

Rewrite the six transitions to take precise variants, deleting the copied
guard blocks entirely. Each becomes just its own real logic:

```ts
export function sendInvoice(
  invoice: DraftInvoice,
  now: Date,
): Result<Outcome<SentInvoice, InvoiceDomainEvent>, InvoiceError> {
  const items = nonEmpty(invoice.lineItems);
  if (!items) return err(IE.noLineItems());
  const updated: SentInvoice = {
    ...invoice,
    status: 'sent',
    lineItems: items,
    payments: [],
    sentAt: now,
    version: invoice.version + 1,
  };
  return ok({
    aggregate: updated,
    events: [
      {
        type: 'InvoiceSent',
        payload: {
          /* unchanged */
        },
      },
    ],
  });
}
```

Per-transition notes:

- **`addLineItem`** takes `DraftInvoice`, returns `DraftInvoice`. The
  `AlreadyPaid`/`InvoiceVoided` cases move entirely into `narrow`.
- **`recordPayment`** takes `SentInvoice`, returns `SentInvoice | PaidInvoice`.
  The overpayment check stays. Use `appendNonEmpty` for the payments array;
  the paid branch needs `payments: NonEmptyArray<Payment>` — which is now
  _proven_, since a payment was just added.
- **`addLateFee`** takes `SentInvoice`. Keep both the
  `LateFeeAlreadyApplied` and `NotOverdue` checks — those are genuine runtime
  conditions the type cannot express.
- **`voidInvoice`** takes `DraftInvoice | SentInvoice`. `narrow` cannot
  express a two-status target, so add `narrowVoidable(invoice)` (or let the
  dispatcher accept a status _set_) — pick one and use it consistently.
- **`createInvoice`** returns `DraftInvoice`. Unchanged apart from the type.

**Preserve every error's identity and precedence.** `invoice-transitions.test.ts`
is a guard matrix pinned by a prior plan specifically to catch precedence
regressions; it must pass with changed _setup_ only, never changed expectations.

**Verify**: `pnpm vitest run src/invoicing/entities` → all pass after
mechanical factory updates.

### Step 4: Dispatcher and repositories

**`applyInvoiceCommand`** becomes generic over the expected variant and does
the narrowing once:

```ts
export async function applyInvoiceCommand<S extends Invoice['status'], TOut extends Invoice>(
  deps: ApplyInvoiceCommandDeps,
  input: { readonly invoiceId: InvoiceId; readonly expect: S },
  transition: (invoice: InvoiceOf<S>) => Result<Outcome<TOut, InvoiceDomainEvent>, InvoiceError>,
): Promise<Result<TOut, InvoiceError>>;
```

Load → `narrow(invoice, input.expect)` → transition → transaction → outbox →
drain. The transaction, outbox-enqueue, and post-commit drain logic is
**unchanged**; only the narrowing is new. `voidInvoice` needs the two-status
variant from Step 3.

**Repository hydration** is where the real work is. Both adapters must build
the correct variant from rows:

```ts
function toInvoice(
  row: InvoiceRow,
  lineItems: readonly LineItem[],
  payments: readonly Payment[],
): Invoice {
  switch (row.status) {
    case 'draft':
      return { ...base, status: 'draft', lineItems };
    case 'sent': {
      const items = nonEmpty(lineItems);
      if (!items) throw new InvoiceHydrationError(row.id, 'sent invoice has no line items');
      return { ...base, status: 'sent', lineItems: items, payments, sentAt: parseISO(row.sent_at) };
    }
    // paid, void...
  }
}
```

**Throwing here is correct** and does not violate AGENTS.md rule 1: a row that
cannot form a valid aggregate is corrupt data — an infrastructure failure, not
a domain error. `findById`'s signature stays `Invoice | null`. Say this in a
comment; the no-throw-in-domain lint rule from plan 002 scopes to
`entities|commands|queries`, so adapters are unaffected, but a reviewer will
ask.

While you are in `sqlite-invoice-repo.ts`, **resolve the known-suspect
lines 237-243** if plan 002 has not: type the `JSON.parse` results explicitly
and determine empirically whether `json_group_array` yields `[]` or `[null]`
for an empty set. A zero-line-item invoice is now a _hydration decision_
(draft vs. a corrupt sent row), so getting this right is load-bearing rather
than cosmetic.

**Verify**: `pnpm vitest run src/invoicing/adapters` → all pass, **including
`invoice-repo-parity.property.test.ts`**. That property test is the strongest
signal that both adapters build identical variants; if it fails, the two
hydration paths disagree.

### Step 5: Persist the transition timestamps

`sentAt` / `paidAt` / `voidedAt` do not exist in the schema today. Add
`migrations/0011_add_invoice_transition_timestamps.sql`:

```sql
ALTER TABLE invoices ADD COLUMN sent_at TEXT;
ALTER TABLE invoices ADD COLUMN paid_at TEXT;
ALTER TABLE invoices ADD COLUMN voided_at TEXT;
```

**Migrations are append-only** — new file, never edit `0002_create_invoices.sql`.

Backfill: existing non-draft rows have `NULL`. Two options —

- **(a)** Backfill from `created_at` in the migration. Wrong data, but the
  aggregate always has a value.
- **(b)** Make the fields `Date | null` on the variants. Honest, but it
  reintroduces a nullable field into the type this plan is tightening.

**Recommendation: (a)**, with a comment in the migration stating the
timestamps are approximate for pre-migration rows. This is a demo app with
regenerable seed data, and (b) weakens the invariant permanently to describe
a transient condition. If the maintainer objects, (b) is a one-line change.

Update `scripts/seed.ts` to populate the new columns.

**Verify**: `pnpm migrate` on a fresh DB → exit 0. `pnpm seed` → exit 0.
`pnpm vitest run src/invoicing` → all pass.

### Step 6: Factories, arbitraries, and the transition table

**Factories** — replace the single builder with per-variant builders
(`aDraftInvoice()`, `aSentInvoice()`, `aPaidInvoice()`, `aVoidInvoice()`),
each returning the precise variant so tests get full type information.
`aSentInvoice()` must default to at least one line item — it cannot compile
otherwise, which is the point.

**Arbitraries** — `arbInvoice` becomes a `fc.oneof` over four variant
arbitraries. Existing property tests over `arbInvoice` should keep working;
their invariants (subtotal ≥ 0, total = subtotal + tax, etc.) hold across
variants.

**Transition table** — create
`src/invoicing/entities/invoice-transitions.ts` exporting the state machine
as data:

```ts
export const InvoiceTransitionTable = {
  draft: { addLineItem: 'draft', sendInvoice: 'sent', voidInvoice: 'void' },
  sent: { recordPayment: 'sent|paid', addLateFee: 'sent', voidInvoice: 'void' },
  paid: {},
  void: {},
} as const satisfies Record<Invoice['status'], Record<string, string>>;
```

Then add `invoice-transitions.test.ts` asserting the table matches reality:
for every (status, operation) pair **absent** from the table, calling that
transition via `narrow` returns an `Err` with the expected error kind. This
turns the table from documentation into a tested contract, and makes the
`docs/architecture.md` table generatable (see README direction option 1).

**Verify**: `pnpm vitest run src/invoicing` → all pass.

### Step 7: Documentation

- `docs/architecture.md` — update "Allowed transitions by status" to note that
  most guards are now **compile-time**, and revise the "Invoice command
  dispatch" section for the new `applyInvoiceCommand` signature (its example
  snippet will be stale).
- `docs/domain-terms.md` — update the **Invoice** row to describe the union;
  add rows for the four states describing what each _guarantees_
  ("Sent: at least one line item, by type").
- `AGENTS.md` — add to "Rules the toolchain cannot enforce":

  > **Aggregate states are a discriminated union.** Transitions take the
  > precise variant; the signature is the guard. New states get a new variant
  > and a `narrow` target, never a boolean flag or a nullable field.

**Verify**: `pnpm format && pnpm typecheck && pnpm lint && pnpm deps && pnpm test`
→ all exit 0. `pnpm test:e2e` → all pass.

## Test plan

- **`invoice-transitions.test.ts` (existing guard matrix) is the primary
  contract.** Setup may change (per-variant factories); **expectations must
  not**. Some cases become compile errors rather than runtime errors — for
  those, convert to a `@ts-expect-error` case in the same file with a
  description, so the coverage moves rather than disappearing. Do not silently
  delete a matrix cell.
- New: `non-empty-array.test.ts` (Step 1), transition-table conformance test
  (Step 6).
- New: hydration tests for each variant, including the corrupt-row cases —
  a `sent` row with zero line items and a `paid` row with zero payments must
  throw `InvoiceHydrationError`, not produce a malformed aggregate.
- New: a zero-line-item draft round-trips through both repos (this is the
  `json_group_array` case from the latent bug).
- `invoice-repo-parity.property.test.ts` must pass **unmodified in meaning** —
  it is the strongest evidence both adapters agree.
- Type-level: a small `invoice.type-test.ts` with `@ts-expect-error` cases for
  the four verified rows in "Validated design". These replace runtime guard
  tests that no longer compile.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `pnpm test:e2e` fully passes; `pnpm dev` manual flow works end to end
- [ ] `Invoice` is a four-variant discriminated union; `DraftInvoice` has **no
      `payments` field**
- [ ] `SentInvoice`/`PaidInvoice` use `NonEmptyArray` for line items;
      `PaidInvoice` for payments
- [ ] No transition contains a copied void/paid/status guard block —
      `grep -c "invoiceVoided()" src/invoicing/entities/invoice.ts` → 1 (in `narrow`)
- [ ] `invoice.type-test.ts` pins all four verified compile errors; deleting
      one makes `pnpm typecheck` fail (spot-checked)
- [ ] The guard matrix's coverage is fully preserved (runtime cases stay
      runtime; compile-time cases become `@ts-expect-error`) — no cell deleted
- [ ] `invoice-repo-parity.property.test.ts` passes unmodified in meaning
- [ ] Corrupt-row hydration throws `InvoiceHydrationError` for both bad shapes
- [ ] `migrations/0011_*.sql` added; no committed migration edited
- [ ] `as ` casts added by this plan: exactly 3 (two in `non-empty-array.ts`,
      one in `narrow`), each commented
- [ ] Docs updated (`architecture.md`, `domain-terms.md`, `AGENTS.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A query's **output** type has to change. Queries read derived values that
  work across variants; if `InvoiceSummary` or `InvoiceListItem` needs a new
  shape, the union has leaked into the read model and the design needs
  revisiting.
- The parity property test fails. The two adapters disagree about which
  variant a row represents — a real correctness finding, not a test to adjust.
- You need more than the 3 budgeted casts. Each extra one is a hole in the
  guarantee; report where and why rather than adding it.
- A guard-matrix case can be neither kept as a runtime test nor converted to
  `@ts-expect-error`. That means coverage is being lost.
- Backfilling `sent_at`/`paid_at`/`voided_at` turns out to matter to a query
  or the UI (e.g. a "sent on" column). Then option (a)'s approximate data is
  not acceptable and the maintainer must choose.
- `apply-invoice-command.sqlite.test.ts` needs changed expectations. The
  dispatcher's transaction/outbox/drain semantics are supposed to be untouched.

## Maintenance notes

- **`Client` deliberately stays a single shape.** Expect a future reviewer to
  flag the asymmetry; the AGENTS.md wording added in Step 7 says why —
  variants track a state machine, and `Client` has none.
- The transition table (Step 6) is the seed for generating
  `docs/architecture.md`'s table from code (README direction option 1). Shape
  it with that in mind even though this plan does not do it.
- If a fifth status is ever added, the work is: one variant, one `narrow`
  target, one table row, one migration column. That is the payoff — check it
  is actually true before calling this plan done.
- Reviewer: the highest-risk code is Step 4's hydration. Everything upstream
  fails loudly at compile time; hydration is the one place a wrong variant can
  be built at runtime from real data. Read `toInvoice` in both adapters
  side by side.
