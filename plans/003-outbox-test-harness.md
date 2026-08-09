# Plan 003: Pin the outbox's delivery guarantees with characterization tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm the "Current state" excerpts match
> the live files before proceeding; on a mismatch, STOP.
>
> **Environment check (run first)**: `node --version` → must be `v24.x`.
> This plan writes tests against real SQLite; on Node 22 they all fail with
> `NODE_MODULE_VERSION` errors unrelated to your work.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive tests + one test-adapter fix)
- **Depends on**: none. **Must land before plan 004**, which changes outbox
  behavior and needs these invariants pinned first.
- **Category**: tests
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

The transactional outbox is the only thing standing between "payment recorded"
and "revenue projection / notifications actually happen." Its core guarantees —
events enqueued atomically with the aggregate save, rows deleted only after a
handler succeeds, failed rows recoverable by a later drain — currently have
**zero tests**: no test file references `SqliteOutbox`, and
`apply-invoice-command.test.ts` uses `InMemoryOutbox` with a stub DB whose
`transaction()` is a passthrough. Worse, the two outbox adapters silently
disagree: `SqliteOutbox` retains a row when its handler throws, while
`InMemoryOutbox` `shift()`s the event **before** handling, so a throwing
handler drops it forever. Plan 004 will rework drain semantics; without these
tests first, that rework has no safety net.

## Current state

- `src/shared/events/outbox.ts` — the port. Its doc comment states the contract:
  "Events are enqueued synchronously inside a database transaction … `drain()`
  processes pending events through the real event bus … If the process crashes
  between commit and drain, events remain in the outbox table."
- `src/shared/events/sqlite-outbox.ts` — real adapter:

```ts
// sqlite-outbox.ts:19-28
async drain(handler: (...) => Promise<void>): Promise<void> {
  const rows = this.db
    .prepare<OutboxRow>('SELECT id, event_name, payload FROM outbox ORDER BY id')
    .all();

  for (const row of rows) {
    await handler(row.event_name as ..., JSON.parse(row.payload) as ...);
    this.db.prepare('DELETE FROM outbox WHERE id = ?').run(row.id);
  }
}
```

  Delete happens only after the handler resolves (good — that's the guarantee
  to pin). A throwing handler aborts the whole loop (that part changes in
  plan 004 — do NOT pin it).

- `src/shared/events/in-memory-outbox.ts` — test adapter with the divergent
  (buggy) semantics:

```ts
// in-memory-outbox.ts:15-21
async drain(handler: (...) => Promise<void>): Promise<void> {
  let event = this.pending.shift();     // removed BEFORE handling
  while (event) {
    await handler(event.eventName, event.payload);   // throw ⇒ event lost
    event = this.pending.shift();
  }
}
```

- `migrations/0005_create_outbox.sql` — the `outbox` table (id INTEGER PK,
  event_name, payload).
- `src/shared/testing/db-fixture.ts` — exports `setupDb` providing an
  in-memory SQLite `Database` with migrations applied; used by
  `src/invoicing/adapters/sqlite-invoice-repo.test.ts`. Model SQLite-backed
  tests on that file's setup/teardown pattern.
- `src/invoicing/commands/apply-invoice-command.ts:37-52` — enqueues events
  inside `db.transaction`, drains after commit.
- `src/invoicing/commands/apply-invoice-command.test.ts` — the structural
  pattern for dispatcher tests (builders from
  `src/invoicing/testing/invoice-factory.ts`: `buildDraftInvoice`,
  `buildSentInvoice`, `buildLineItem`; `InProcessEventBus`; Proxy-based spies).

Conventions: vitest; kebab-case filenames; test file named after its subject
(`sqlite-outbox.ts` → `sqlite-outbox.test.ts`); no default exports.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| One suite | `pnpm vitest run src/shared/events/sqlite-outbox.test.ts` | all pass |
| Full suite | `pnpm test` | exit 0 (Node 24) |

## Scope

**In scope**:

- `src/shared/events/sqlite-outbox.test.ts` (create)
- `src/shared/events/in-memory-outbox.test.ts` (create)
- `src/shared/events/in-memory-outbox.ts` (fix retention semantics only)
- `src/invoicing/commands/apply-invoice-command.sqlite.test.ts` (create)

**Out of scope** (do NOT touch):

- `src/shared/events/sqlite-outbox.ts` — production behavior changes belong to
  plan 004.
- `src/invoicing/commands/apply-invoice-command.ts` — same.
- `src/reporting/**` — projection idempotency is plan 004.
- The existing `apply-invoice-command.test.ts` — leave it as-is.

## Git workflow

- Branch: `advisor/003-outbox-test-harness`
- Conventional commits, e.g. `test: characterize outbox delivery guarantees`,
  `fix: retain in-memory outbox events when a handler throws`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix `InMemoryOutbox` retention semantics

Rewrite `drain` so an event is removed from `pending` only **after** its
handler resolves (peek at `this.pending[0]`, `await handler(...)`, then
`this.pending.shift()`). A throwing handler must leave the event (and any
later events) in `pending`. Do not change `enqueue`.

**Verify**: `pnpm typecheck` → exit 0. (Existing tests using `InMemoryOutbox`
only drive happy paths, so they must still pass: `pnpm vitest run src/invoicing/commands/apply-invoice-command.test.ts`.)

### Step 2: `in-memory-outbox.test.ts`

Cases (plain vitest, no DB):

1. Happy path: enqueue 3 events → `drain` invokes the handler with each
   name/payload in FIFO order → a second `drain` invokes nothing (queue empty).
2. Retention: enqueue 2 events, handler throws on the first →
   `await drain(...).catch(() => {})` → both events still pending; a re-drain
   with a working handler delivers both in order.

> Deliberately do NOT assert whether a failing drain rejects or resolves, and
> do NOT assert whether events *after* a failing one were attempted — plan 004
> changes exactly that. Pin only: no successful-delete-before-handle, and
> failed events remain.

**Verify**: `pnpm vitest run src/shared/events/in-memory-outbox.test.ts` → all pass.

### Step 3: `sqlite-outbox.test.ts`

Use `setupDb` from `src/shared/testing/db-fixture.ts` (copy the
setup/teardown shape from `src/invoicing/adapters/sqlite-invoice-repo.test.ts`).
Query the raw table with
`db.prepare('SELECT event_name FROM outbox ORDER BY id').all()` to assert row
state. Cases:

1. `enqueue` inserts a row with the JSON payload; `drain` with a succeeding
   handler receives the parsed payload and deletes the row.
2. FIFO: three enqueued events drain in id order.
3. **Transactional atomicity** (the port's reason to exist): inside
   `db.transaction(() => { outbox.enqueue(...); throw new Error('boom'); })`
   (catch the throw) → the outbox table has **zero** rows afterwards.
4. Retention: enqueue 1 event, drain with a throwing handler
   (`.catch(() => {})` the drain) → the row is still in the table; re-drain
   with a working handler delivers it and empties the table.

**Verify**: `pnpm vitest run src/shared/events/sqlite-outbox.test.ts` → all pass.

### Step 4: Real-SQLite dispatcher test

Create `src/invoicing/commands/apply-invoice-command.sqlite.test.ts` wiring
`applyInvoiceCommand` with: `setupDb` database, `SqliteInvoiceRepo`,
`SqliteOutbox`, real `InProcessEventBus`. Cases:

1. Happy path: send a draft invoice (built via `buildDraftInvoice({ lineItems: [buildLineItem()] })`,
   saved through the repo) → result ok, repo shows `sent`, a subscribed
   handler received `InvoiceSent`, outbox table empty.
2. **Committed-despite-subscriber-failure**: subscribe a handler that throws.
   Call `applyInvoiceCommand(...).catch(() => {})` (do not assert whether it
   rejects — plan 004 changes that). Then assert: the invoice IS saved as
   `sent` (the tx committed), and the `InvoiceSent` row is still in the outbox
   table (retained for retry).

**Verify**: `pnpm vitest run src/invoicing/commands/apply-invoice-command.sqlite.test.ts` → all pass.

### Step 5: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.

## Test plan

The plan IS the test plan — Steps 2–4 enumerate every case. Structural
patterns: `sqlite-invoice-repo.test.ts` for DB-backed setup,
`apply-invoice-command.test.ts` for dispatcher wiring and factories.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit 0 on Node 24
- [ ] Three new test files exist and pass with the cases listed
- [ ] `InMemoryOutbox.drain` no longer removes an event before its handler resolves
- [ ] No production file except `in-memory-outbox.ts` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `sqlite-outbox.ts` or `apply-invoice-command.ts` no longer match the
  excerpts (plan 004 may have landed first — in that order, these
  characterization tests need re-scoping, not improvising).
- Test 3.3 (atomicity) FAILS — that means enqueue does not participate in the
  transaction, which is a production bug beyond this plan's scope.
- `setupDb` doesn't apply the outbox migration (no `outbox` table) — fixture
  drift.

## Maintenance notes

- These tests define the outbox contract plan 004 must preserve: delete only
  after successful handling; enqueue atomic with the aggregate save; failed
  rows recoverable by re-drain. 004 may *add* behavior (continue past
  failures, never reject post-commit) but must keep these green.
- The two "don't assert" notes in Steps 2 and 4 are deliberate — if a future
  editor tightens those assertions, they couple the tests to pre-004 behavior.
