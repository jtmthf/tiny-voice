# Plan 007: Make `db.transaction` roll back when the callback returns an `Err` Result

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm the "Current state" excerpts match
> the live files. If plan 004 has landed, `apply-invoice-command.ts` will have
> a logger and a changed drain call — that's expected and does not affect this
> plan; the transaction excerpt itself must still match.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — behavior only changes on paths that were already erroring
- **Depends on**: none (if plan 004 is in flight, land this separately to keep
  transactional-semantics changes reviewable in isolation)
- **Category**: tech-debt (latent correctness hazard)
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

The repo's convention is "domain errors are `Result` values, never throws."
But better-sqlite3 only rolls a transaction back when the callback **throws**.
So `return err(...)` inside `db.transaction(...)` **commits** whatever was
written before the return. Today this is latent — every err path happens to
return before writing — but the invariant "err paths never write first" is
enforced by nothing. The first future edit that writes-then-errs inside a
transaction silently commits partial state into money tables. This plan makes
the port's semantics match the convention: returning an `Err` rolls back, so
"return err" and "abort the transaction" become the same thing.

## Current state

- `src/shared/db/sqlite-database.ts:37-39` — the real adapter:

```ts
transaction<T>(fn: () => T): T {
  return this.db.transaction(fn)();
}
```

- `src/shared/db/database.ts` — the `Database` port declaring
  `transaction<T>(fn: () => T): T` (open it to confirm the exact signature and
  doc comment).
- Callers that return `Result` from inside a transaction:
  - `src/invoicing/commands/apply-invoice-command.ts:37-46` — returns
    `saveResult` (possibly `Err`) or `ok(undefined)` from the tx callback.
  - `src/invoicing/adapters/sqlite-invoice-repo.ts:116-188` — `save` returns
    `err(IE.concurrencyConflict())` from inside `this.db.transaction` when the
    optimistic version check matches 0 rows. NOTE: this creates **nested**
    transactions (repo.save's tx inside applyInvoiceCommand's tx) —
    better-sqlite3 handles nesting via savepoints automatically.
- Stub/test implementations of the port that must stay semantically aligned:
  - `src/invoicing/commands/apply-invoice-command.test.ts:25-30` — `STUB_DB`
    with passthrough `transaction<T>(fn: () => T): T { return fn(); }`
  - `src/app/testing/build-test-app.ts:28-33` — identical `STUB_DB`
  (Passthrough is fine for stubs — they have no state to roll back — but see
  Step 3 for keeping the port's documented contract honest.)
- Existing test pattern for the sqlite adapter:
  `src/shared/db/sqlite-database.test.ts` (exists; model new cases on it).
- neverthrow is already a dependency of the shared kernel (AGENTS.md: "Result
  re-exports from neverthrow" in `src/shared/`), so importing `Result` types
  in `sqlite-database.ts` does not violate layering.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| DB suite | `pnpm vitest run src/shared/db/sqlite-database.test.ts` | all pass |
| Full suite | `pnpm test` | exit 0 (Node 24) |
| Dep rules | `pnpm deps` | exit 0 |

## Scope

**In scope**:

- `src/shared/db/sqlite-database.ts`
- `src/shared/db/database.ts` (doc comment on the port only)
- `src/shared/db/sqlite-database.test.ts` (extend)

**Out of scope** (do NOT touch):

- `apply-invoice-command.ts`, `sqlite-invoice-repo.ts` — they already return
  errs before writing; their behavior must be identical after this change.
- The two `STUB_DB` literals — passthrough stubs stay as they are.
- Adding a `transactionResult<T,E>(...)` second method to the port —
  rejected; one method with consistent semantics beats two methods.

## Git workflow

- Branch: `advisor/007-transaction-err-rollback`
- Conventional commit, e.g. `fix: roll back sqlite transactions when the callback returns Err`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Implement rollback-on-Err in `SqliteDatabase`

Rewrite `transaction` to detect a returned neverthrow `Err` and convert it to
a throw (triggering better-sqlite3's rollback), then return the same `Err` to
the caller so external behavior is unchanged:

```ts
import type { Result } from 'neverthrow';

function isErrResult(value: unknown): value is Result<unknown, unknown> & { isErr(): true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isErr' in value &&
    typeof (value as { isErr: unknown }).isErr === 'function' &&
    (value as { isErr(): boolean }).isErr()
  );
}

transaction<T>(fn: () => T): T {
  class RollbackSignal extends Error {
    constructor(readonly result: T) { super('rollback'); }
  }
  try {
    return this.db.transaction(() => {
      const result = fn();
      if (isErrResult(result)) throw new RollbackSignal(result);
      return result;
    })();
  } catch (e) {
    if (e instanceof RollbackSignal) return e.result;
    throw e;
  }
}
```

(Adapt naming/placement to the file's style; `isErrResult` can be a
module-level function. Keep the class inside the method or hoist it —
lint will tell you.)

Nested-transaction note: when `repo.save`'s inner transaction returns an
`Err`, the inner wrapper now throws → inner savepoint rolls back → the
wrapper catches and **returns** the `Err` to the outer callback, which also
returns it → outer rolls back too. Same final state as today (nothing
committed), but now guaranteed rather than incidental.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Update the port's contract

In `src/shared/db/database.ts`, extend the `transaction` doc comment:

```ts
/**
 * Runs fn atomically. Rolls back if fn throws OR returns a neverthrow Err
 * Result; the Err is still returned to the caller. Test stubs without real
 * storage may implement this as a passthrough.
 */
```

**Verify**: `pnpm lint` → exit 0.

### Step 3: Regression tests

Extend `src/shared/db/sqlite-database.test.ts` (match its existing setup —
it constructs a `SqliteDatabase`; if it uses a temp file or `:memory:`,
follow suit) with:

1. **Rollback on Err**: create a table, then inside `transaction` insert a row
   and return `err('domain failure')` → the returned value is that same `Err`
   object, and the table has 0 rows.
2. **Commit on Ok**: same shape returning `ok(undefined)` after the insert →
   1 row.
3. **Rollback on throw** (pre-existing behavior pin): insert then `throw` →
   the throw propagates and the table has 0 rows.
4. **Nested**: outer transaction inserts row A, calls an inner
   `db.transaction` that inserts row B and returns `err(...)`; outer returns
   `ok(...)` → row A committed, row B rolled back.

Import `ok`/`err` from `'neverthrow'`.

**Verify**: `pnpm vitest run src/shared/db/sqlite-database.test.ts` → all
pass, including 4 new cases.

### Step 4: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → all
exit 0. Pay attention to `sqlite-invoice-repo.test.ts` (concurrency-conflict
cases) and any plan-003/004 outbox tests — they exercise err-returning
transactions and must be unaffected.

## Test plan

Step 3 is the test plan; the four cases pin commit-on-Ok, rollback-on-Err,
rollback-on-throw, and savepoint nesting.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] The four new transaction-semantics tests exist and pass
- [ ] `sqlite-invoice-repo.test.ts` passes unmodified (concurrency-conflict path unchanged externally)
- [ ] Only the three in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any existing test fails after Step 1 — that means some code path *was*
  relying on write-then-return-err committing, which is exactly the corruption
  hazard; it needs a human look, not a workaround.
- The nested test (3.4) shows row A rolled back too — savepoint behavior
  differs from expectation; report the observed semantics.
- `database.ts`'s port signature is not `transaction<T>(fn: () => T): T`
  (drift).

## Maintenance notes

- The Err detection is duck-typed (`isErr()` function present and returning
  true) rather than `instanceof`, deliberately — neverthrow's classes may be
  bundled twice under some setups. A reviewer should confirm the guard can't
  false-positive on domain objects (none of the repo's entities have an
  `isErr` method).
- If a future adapter (e.g. Postgres) implements the port, it must honor the
  same rollback-on-Err contract — the port doc comment from Step 2 is the
  spec; the tests in Step 3 are the reference suite to copy.
