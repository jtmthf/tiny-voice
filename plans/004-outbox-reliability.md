# Plan 004: Make event delivery idempotent, isolated, and crash-recoverable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm the "Current state" excerpts match
> the live files. Also confirm plan 003's test files exist and pass
> (`pnpm vitest run src/shared/events src/invoicing/commands`) — this plan
> depends on them.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED — touches the money read model and every invoice mutation's
  dispatch path; mitigated by plan 003's characterization tests
- **Depends on**: plans/003-outbox-test-harness.md
- **Category**: bug
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

Three related defects in the event pipeline:

1. **Double-counted revenue.** `SqliteOutbox.drain` retains a row when any
   handler fails, and `InProcessEventBus.publish` throws if *any* subscriber
   rejects — even when the others succeeded. `InvoicePaymentRecorded` has two
   subscribers (revenue projection + notification). If the notification throws,
   the projection has already applied the payment, but the row is redelivered
   by the next drain and the projection — which blindly adds
   `total_cents += amount` — counts the payment twice.
2. **False failures.** The dispatcher drains *after* the transaction commits;
   a drain rejection propagates out of `applyInvoiceCommand`, so the server
   function reports failure for a mutation that committed. Users retry and
   double-submit.
3. **Silent loss on crash.** If the process dies between commit and drain,
   rows sit in the outbox forever — nothing drains at startup, despite the
   port's doc comment promising recovery "on next startup."

Fix: make the projection idempotent (dedup on `paymentId`), make drain
per-row-isolated (a failed row is skipped and retained, later rows still
process), decouple post-commit drain failures from the command result (log,
don't reject), and drain pending rows at startup.

## Current state

- `src/invoicing/commands/apply-invoice-command.ts:48-52` — post-commit drain:

```ts
if (events.length > 0) {
  await deps.outbox.drain((eventName, payload) => deps.eventBus.publish(eventName, payload));
}

return ok(aggregate);
```

  `ApplyInvoiceCommandDeps` (same file, lines 13-18) is
  `{ db, repo, outbox, eventBus }` — no logger.

- `src/shared/events/sqlite-outbox.ts:19-28` — drain aborts the loop on the
  first throwing handler and leaves that row plus all later rows.
- `src/shared/events/in-memory-outbox.ts` — after plan 003: retains an event
  whose handler throws; a throw still aborts the loop.
- `src/shared/events/in-process-event-bus.ts:39-49` — `publish` runs all
  subscribers via `Promise.allSettled`, then throws `AggregateError` if any
  rejected. **Keep this behavior** — "all subscribers run, caller can detect
  failure" is correct; the *outbox* must tolerate it.
- `src/reporting/adapters/sqlite-revenue-read-model.ts:27-61` — `recordPayment`
  SELECTs the month row then UPDATEs `total_cents = existing + amount,
  payment_count + 1` or INSERTs. No dedup key of any kind.
- `src/reporting/ports/revenue-read-model.ts` — the port; `recordPayment`
  input is `{ month: YearMonth; amount: Money; at: Date }`.
- `src/reporting/adapters/in-memory-revenue-read-model.ts` — test twin;
  mirror every port change here.
- `src/reporting/projections/register-revenue-projection.ts:17-23` — the only
  caller of `recordPayment`; the event payload it receives
  (`InvoicePaymentRecorded`) carries `paymentId` (see
  `src/invoicing/events/invoicing-event-map.ts` for the Zod schema; payload
  fields: `invoiceId`, `paymentId`, `amountCents`, `becamePaid`, `recordedAt`).
- `src/app/build-app.ts:92-122` (`createEventingAndSubscribers`) — constructs
  `SqliteOutbox` + bus + subscribers; **no startup drain exists**.
- `migrations/` — numbered `0001`–`0009`, append-only (per AGENTS.md rule 3).
  Next number: `0010`.
- Conventions: neverthrow `Result` for domain errors; ports in `ports/`,
  adapters in `adapters/`; Zod schemas at event boundaries; kebab-case files;
  tests co-located.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Dep rules | `pnpm deps` | exit 0 |
| Full tests | `pnpm test` | exit 0 (Node 24) |
| Migration smoke | `pnpm migrate` | applies 0010 without error |

## Scope

**In scope**:

- `migrations/0010_create_revenue_processed_payments.sql` (create)
- `src/reporting/ports/revenue-read-model.ts` (add `paymentId` to input)
- `src/reporting/adapters/sqlite-revenue-read-model.ts`
- `src/reporting/adapters/in-memory-revenue-read-model.ts`
- `src/reporting/projections/register-revenue-projection.ts`
- `src/shared/events/outbox.ts` (drain signature: add `onError`)
- `src/shared/events/sqlite-outbox.ts`
- `src/shared/events/in-memory-outbox.ts`
- `src/invoicing/commands/apply-invoice-command.ts` (optional logger; swallow
  drain errors)
- `src/app/build-app.ts` (startup recovery drain; pass logger to dispatcher
  deps is NOT needed — see Step 5)
- `src/app/fns/{send-invoice,record-payment,void-invoice,calculate-late-fee}.ts`
  (only if the `ApplyInvoiceCommandDeps` change requires passing `logger`)
- Tests for all of the above (see Test plan)

**Out of scope** (do NOT touch):

- `src/shared/events/in-process-event-bus.ts` — publish semantics stay.
- Any migration file `0001`–`0009` — append-only rule.
- Notification adapters — at-least-once delivery of notifications is accepted
  (a duplicate console notification is harmless; a duplicate revenue row is not).
- Retry scheduling/background workers — a startup drain is the agreed scope;
  do not add timers or queues.

## Git workflow

- Branch: `advisor/004-outbox-reliability`
- Conventional commits per step, e.g. `fix: dedup revenue projection on payment id`,
  `fix: isolate outbox drain failures per row`, `feat: drain pending outbox rows at startup`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Idempotent revenue projection

1. New migration `migrations/0010_create_revenue_processed_payments.sql`:

```sql
CREATE TABLE revenue_processed_payments (
  payment_id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  processed_at TEXT NOT NULL
);
```

2. Port change in `src/reporting/ports/revenue-read-model.ts`:
   `recordPayment(input: { paymentId: string; month: YearMonth; amount: Money; at: Date }): void`.
3. `SqliteRevenueReadModel.recordPayment`: wrap the whole method in
   `this.db.transaction(() => { ... })`. First
   `INSERT INTO revenue_processed_payments (payment_id, month, processed_at) VALUES (?, ?, ?)`
   guarded by a prior
   `SELECT 1 FROM revenue_processed_payments WHERE payment_id = ?` — if the
   row exists, return without touching `revenue_by_month`. Then the existing
   SELECT/UPDATE-or-INSERT logic unchanged.
4. `InMemoryRevenueReadModel`: add a private `Set<string>` of processed
   payment ids with the same skip-if-seen behavior.
5. `register-revenue-projection.ts`: pass `paymentId: payload.paymentId`.

**Verify**: `pnpm typecheck` → exit 0. `pnpm migrate` → applies 0010.
New test (see Test plan #1) passes: calling `recordPayment` twice with the
same `paymentId` yields the totals of one call.

### Step 2: Per-row drain isolation

Change the `Outbox` port's drain signature in `src/shared/events/outbox.ts`:

```ts
drain(
  handler: (eventName: keyof TEventMap & string, payload: TEventMap[keyof TEventMap]) => Promise<void>,
  onError?: (eventName: string, error: unknown) => void,
): Promise<void>;
```

Contract (write it into the port's doc comment): drain attempts **every**
pending row; a row whose handler rejects is retained and reported via
`onError`; rows whose handlers succeed are deleted; drain itself **never
rejects** because of a handler failure.

Implement in `SqliteOutbox` (try/catch around `await handler(...)`; on catch,
call `onError?.(...)` and `continue`; on success, delete the row) and in
`InMemoryOutbox` (same shape over the pending array — iterate by index,
collect survivors).

**Verify**: plan 003's retention tests still pass
(`pnpm vitest run src/shared/events`), plus new tests (Test plan #2).

### Step 3: Decouple post-commit failures from the command result

In `apply-invoice-command.ts`:

1. Add `readonly logger?: Logger` to `ApplyInvoiceCommandDeps`
   (`import type { Logger } from '@/shared/logger/logger'`).
2. Replace the drain block with:

```ts
if (events.length > 0) {
  await deps.outbox.drain(
    (eventName, payload) => deps.eventBus.publish(eventName, payload),
    (eventName, error) => deps.logger?.warn('outbox.drain.failed', { eventName, error }),
  );
}
```

(Check `src/shared/logger/logger.ts` for the exact `warn` signature and match
it.) Because drain no longer rejects on handler failure, the command returns
`ok(aggregate)` whenever the transaction committed.

3. In each server fn that builds `ApplyInvoiceCommandDeps`
   (`src/app/fns/send-invoice.ts`, `record-payment.ts`, `void-invoice.ts`,
   `calculate-late-fee.ts`), add `logger: app.logger` to the deps object.

**Verify**: `pnpm typecheck` → exit 0; plan 003's
`apply-invoice-command.sqlite.test.ts` "committed-despite-subscriber-failure"
case still passes; new test (Test plan #3) passes.

### Step 4: Startup recovery drain

In `build-app.ts` `createEventingAndSubscribers`, after `registerSubscribers`
returns, add a fire-and-forget recovery drain:

```ts
void outbox
  .drain(
    (eventName, payload) => eventBus.publish(eventName, payload),
    (eventName, error) => deps.logger.warn('outbox.recovery.failed', { eventName, error }),
  )
  .catch((error) => deps.logger.warn('outbox.recovery.error', { error }));
```

**Verify**: new test (Test plan #4) passes; `pnpm test` green.

### Step 5: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → all exit 0.

## Test plan

1. `src/reporting/adapters/sqlite-revenue-read-model.test.ts` (exists — extend)
   and the in-memory twin's test: same `paymentId` recorded twice → single
   application (total and `payment_count` reflect one payment); different
   `paymentId`s accumulate. Model on the file's existing cases.
2. `src/shared/events/sqlite-outbox.test.ts` + `in-memory-outbox.test.ts`
   (created by plan 003 — extend): three rows, handler fails on #2 → #1 and
   #3 delivered and deleted, #2 retained, `onError` called once with #2's
   event name, drain resolves.
3. `apply-invoice-command.sqlite.test.ts` (extend): subscriber throws →
   `applyInvoiceCommand` **resolves ok**, invoice saved, failing row retained,
   logger captured a `outbox.drain.failed` warn (use `CapturingLogger` from
   `src/shared/logger/capturing-logger.ts`).
4. End-to-end double-count regression, the headline case, in
   `apply-invoice-command.sqlite.test.ts`: real SQLite app slice (repo, outbox,
   bus, real `SqliteRevenueReadModel`, projection registered via
   `registerRevenueProjection`, plus a second subscriber that throws once then
   succeeds). Record a payment → first drain partially fails; run a second
   drain (simulating the next command / startup recovery) → assert
   `revenue_by_month.total_cents` equals the payment amount **once** and
   `payment_count = 1`.
5. Startup recovery: insert a row into `outbox` via a raw
   `db.prepare('INSERT INTO outbox ...')`, then wire the slice as `buildApp`
   does and invoke the recovery drain → subscriber received the event, table
   empty.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] Migration `0010_create_revenue_processed_payments.sql` exists; files 0001–0009 untouched (`git diff --stat migrations/`)
- [ ] Replaying the same `InvoicePaymentRecorded` event does not change `revenue_by_month` (test #4 green)
- [ ] A throwing subscriber no longer makes `applyInvoiceCommand` reject (test #3 green)
- [ ] `buildApp` drains pending outbox rows at startup (test #5 green)
- [ ] All plan-003 characterization tests still pass unmodified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 003's tests are absent or failing before you start.
- The `InvoicePaymentRecorded` payload schema lacks `paymentId` (check
  `src/invoicing/events/invoicing-event-map.ts`) — the dedup key assumption
  is false.
- You find yourself wanting to change `in-process-event-bus.ts` publish
  semantics — that's an out-of-scope design change.
- The port signature change breaks a caller not listed in Scope (search
  `grep -rn "\.drain(" src`).

## Maintenance notes

- Notifications remain at-least-once: a redelivered event re-sends a
  notification. Accepted for the console/stub senders; if a real email sender
  ever lands, it needs its own dedup (note for that future PR).
- The dedup table grows one row per payment, forever. Fine at demo scale;
  a pruning strategy is deliberately deferred.
- Reviewer should scrutinize: `recordPayment`'s check-then-insert runs inside
  `db.transaction` (better-sqlite3 is synchronous and single-connection here,
  so this is race-free); and that no code path deletes an outbox row before
  its handler resolves.
- Interaction with plan 007 (transaction-rollback-on-err): independent files,
  but both touch transactional semantics — land separately, not in one PR.
