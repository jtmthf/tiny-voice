# Plan 008: EventBus v2 — envelopes, declarative subscribers, and an envelope-carrying outbox

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. This plan
> **requires plan 007** — if `src/shared/messaging/envelope.ts` does not
> exist, STOP. Confirm `registerSubscribers` still builds an `unsubs` array by
> hand and returns a combined `() => void`.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED–HIGH — changes the event bus contract, the outbox schema, and
  every event payload. The outbox is crash-recovery infrastructure with
  characterization tests written specifically to pin its guarantees; those must
  survive.
- **Depends on**: plans/007-message-envelope-and-context.md
- **Category**: architecture / observability
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

The maintainer's words were "the awkwardness of how subscriptions work
today". Concretely:

**Subscription mechanics are hand-rolled in two places.** Both
`registerSubscribers` and `registerNotificationSubscribers` do this:

```ts
const unsubs: (() => void)[] = [];
unsubs.push(deps.eventBus.subscribe('InvoiceSent', async (payload) => { ... }));
unsubs.push(...);
return () => { for (const unsub of unsubs) unsub(); };
```

Two files, the same array-of-thunks bookkeeping, ending in a single opaque
`() => void` that becomes `AppDeps.unsubscribe` — a member of the god object
that `Partial<AppDeps>` lets a test override with anything, including a no-op
that silently disables all event handling.

**Subscribers are anonymous.** An inline arrow function has no name, so a
failure inside one produces `AggregateError: 1 subscriber(s) failed for event
"InvoicePaymentRecorded"` with no indication of _which_. The outbox's
`onError` callback receives only `(eventName, error)` for the same reason.

**Payloads carry infrastructure concerns.** Every payload has its own
timestamp (`sentAt`, `recordedAt`, `voidedAt`) — three names for one concept —
and the revenue projection has to dedupe on `paymentId` because there is no
message identity to dedupe on.

Plan 007 built the envelope. This plan adopts it and makes subscribers
declarative, named values.

## Design

### Envelope-carrying bus

```ts
export interface EventBus<TEventMap extends object> {
  publish<K extends keyof TEventMap & string>(envelope: Envelope<K, TEventMap[K]>): Promise<void>;
  register(
    subscribers: readonly EventSubscriber<TEventMap, keyof TEventMap & string>[],
  ): Subscription;
}

export interface Subscription {
  readonly [Symbol.dispose]: () => void;
}
```

`register` takes a list and returns one disposable. The array-of-thunks
bookkeeping moves inside the bus, once, and `Subscription` plugs directly into
the container's disposal protocol (plan 004), so plan 005's
`SubscriptionsToken` becomes trivial.

### Declarative subscribers

```ts
export interface EventSubscriber<TEventMap extends object, K extends keyof TEventMap & string> {
  /** Stable identity — appears in logs, errors, and outbox failure rows. */
  readonly name: string;
  readonly on: K;
  readonly handle: (envelope: Envelope<K, TEventMap[K]>) => Promise<void> | void;
}

export function defineSubscriber<TEventMap extends object, K extends keyof TEventMap & string>(
  spec: EventSubscriber<TEventMap, K>,
): EventSubscriber<TEventMap, K>;
```

A subscriber becomes a named value a module exports, rather than a closure
buried in a registration function:

```ts
export function revenueProjection(deps: { readModel: RevenueReadModel; logger: Logger }) {
  return defineSubscriber<InvoicingEventMap, 'InvoicePaymentRecorded'>({
    name: 'reporting.revenue-projection',
    on: 'InvoicePaymentRecorded',
    handle: (envelope) => {
      /* ... */
    },
  });
}
```

Naming buys three things at once: which subscriber failed, per-subscriber
timing/logging in one place, and a `register-subscribers.test.ts` that can
assert the exact expected subscriber set by name.

### Error strategy — unchanged

`publish` still runs every subscriber and throws an `AggregateError` if any
fail. This was explicitly re-affirmed in the prior planning round; **do not
change it**. The only change is that the error message now names the failing
subscribers.

### Outbox

Rows carry the whole envelope:

```ts
export interface Outbox<TEventMap extends object> {
  enqueue<K extends keyof TEventMap & string>(envelope: Envelope<K, TEventMap[K]>): void;
  drain(
    handler: (
      envelope: Envelope<keyof TEventMap & string, TEventMap[keyof TEventMap]>,
    ) => Promise<void>,
    onError?: (envelope: { name: string; id: MessageId }, error: unknown) => void,
  ): Promise<void>;
}
```

The **drain contract is unchanged**: every pending row is attempted; rows whose
handler rejects are retained and reported; rows that succeed are deleted;
`drain()` never rejects because of a handler failure. That contract has
dedicated characterization tests (added by a prior plan precisely to pin it)
and it survives verbatim.

## Current state

- `src/shared/events/event-bus.ts` — `publish(event, payload)`,
  `subscribe(event, handler): () => void`.
- `src/shared/events/in-process-event-bus.ts` — `Map<string, Handler[]>`,
  `Promise.allSettled`, `AggregateError` on any rejection.
- `src/shared/events/outbox.ts` + `sqlite-outbox.ts` + `in-memory-outbox.ts` —
  the drain contract is documented in the port's doc comment; read it before
  changing anything.
- `migrations/0005_create_outbox.sql` — `id INTEGER PRIMARY KEY AUTOINCREMENT`,
  `event_name TEXT`, `payload TEXT`, `created_at TEXT DEFAULT (datetime('now'))`.
- `src/app/register-subscribers.ts` — 7 deps, two `unsubs.push` calls.
- `src/invoicing/subscribers/register-notification-subscribers.ts` — two more
  `unsubs.push` calls; the `InvoiceSent` handler resolves the client name via
  an injected `getClient`, and the `InvoicePaymentRecorded` handler re-reads
  the invoice for the outstanding balance (correctly — AGENTS.md rule 12 says
  subscribers fetch mutable state fresh).
- `src/reporting/projections/register-revenue-projection.ts` — one subscriber;
  dedupes on `paymentId` via `readModel.recordPayment`.
- `src/invoicing/events/` — `InvoiceSentSchema` (`sentAt`),
  `InvoicePaymentRecordedSchema` (`recordedAt`, `becamePaid`),
  `InvoiceVoidedSchema` (`voidedAt`).
- `src/invoicing/entities/invoice.ts` — transitions build event payloads
  inline, including the timestamps.
- `src/invoicing/commands/apply-invoice-command.ts` — `outbox.enqueue(event.type, event.payload)`
  inside the transaction, then post-commit drain.
- `build-app.ts` — the startup crash-recovery drain.
- Existing tests that pin this behavior: `event-bus.test.ts`,
  `sqlite-outbox.test.ts`, `in-memory-outbox.test.ts`,
  `register-subscribers.test.ts`, `register-revenue-projection.test.ts`,
  `apply-invoice-command.sqlite.test.ts`.

## Commands you will need

| Purpose       | Command                                                                                              | Expected on success |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------- |
| Typecheck     | `pnpm typecheck`                                                                                     | exit 0              |
| Lint          | `pnpm lint`                                                                                          | exit 0              |
| Dep rules     | `pnpm deps`                                                                                          | exit 0              |
| Events suite  | `pnpm vitest run src/shared/events`                                                                  | all pass            |
| Outbox suites | `pnpm vitest run src/shared/events/sqlite-outbox.test.ts src/shared/events/in-memory-outbox.test.ts` | all pass            |
| Full suite    | `pnpm test`                                                                                          | exit 0 (Node 24)    |
| Migrate       | `pnpm migrate`                                                                                       | exit 0              |
| E2E           | `pnpm test:e2e`                                                                                      | all pass            |

## Scope

**In scope**:

- `src/shared/events/event-bus.ts`, `in-process-event-bus.ts` — envelope API,
  `register`, `Subscription`
- `src/shared/events/define-subscriber.ts` (new)
- `src/shared/events/outbox.ts` + both adapters — envelope persistence
- `migrations/0011_*.sql` (or next free number) — outbox envelope columns
- Both subscriber modules — rewritten as `defineSubscriber` exports
- `src/app/register-subscribers.ts` — reduced to a subscriber list
- `src/invoicing/entities/invoice.ts` — payloads drop their timestamps
- The three event schemas
- `apply-invoice-command.ts` — envelope construction
- `docs/architecture.md`, `AGENTS.md`

**Out of scope** (do NOT touch):

- **The `publish` error strategy.** Collect-and-rethrow stays. Settled.
- **The drain contract.** Attempt-all / retain-failures / never-reject stays.
- Command and query buses — plan 009.
- Aggregate state shape — plan 006.
- Adding retry/backoff/dead-lettering to the outbox. Tempting once rows carry
  identity; it is a separate feature with its own failure modes.
- `AppDeps` / container restructuring — plan 005 owns it. If 005 has landed,
  adapt to it; if not, keep the existing wiring shape.

## Git workflow

- Branch: `advisor/008-event-bus-v2`
- Commits: `feat: add defineSubscriber primitive`,
  `feat: event bus publishes envelopes`, `feat: outbox persists envelopes`,
  `refactor: declare subscribers declaratively`,
  `refactor: move event timestamps onto message metadata`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `defineSubscriber`

Create `src/shared/events/define-subscriber.ts`. At runtime it is
`(spec) => spec`; its value is entirely in the type constraint — `on` must be
a key of the event map and `handle`'s envelope payload is inferred from it.

Add a `name` format convention (`'<module>.<purpose>'`) and validate it at
registration (Step 2): a duplicate subscriber name is a wiring bug worth
throwing on, since names are how failures are attributed.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 2: Bus v2

Rewrite `event-bus.ts` (port) and `in-process-event-bus.ts`:

- `register(subscribers)` groups by `on`, stores `{ name, handle }`, returns a
  `Subscription` whose `[Symbol.dispose]` removes exactly those handlers.
  Registering the same name twice throws `DuplicateSubscriberError`.
- `publish(envelope)` runs handlers for `envelope.name` via
  `Promise.allSettled`, exactly as today. On failure, the `AggregateError`
  message **names the failing subscribers**:
  `2 subscriber(s) failed for "InvoicePaymentRecorded": reporting.revenue-projection, invoicing.payment-notification`.
- Preserve **registration-order execution** — `event-bus.test.ts` asserts it.

Update `event-bus.test.ts` for the new API. Every existing assertion about
delivery, ordering, error aggregation, and unsubscribe must be preserved in
meaning; add cases for named-error attribution and duplicate-name rejection.

**Verify**: `pnpm vitest run src/shared/events/event-bus.test.ts` → all pass.

### Step 3: Outbox migration and adapters

`migrations/0011_add_outbox_envelope_columns.sql` — **append-only; never edit
`0005`**:

```sql
ALTER TABLE outbox ADD COLUMN message_id TEXT;
ALTER TABLE outbox ADD COLUMN correlation_id TEXT;
ALTER TABLE outbox ADD COLUMN causation_id TEXT;
ALTER TABLE outbox ADD COLUMN request_id TEXT;
ALTER TABLE outbox ADD COLUMN traceparent TEXT;
ALTER TABLE outbox ADD COLUMN occurred_at TEXT;
CREATE INDEX idx_outbox_correlation ON outbox (correlation_id);
```

**Design choice — record it in the migration comment**: store `meta` as
discrete columns (queryable: "show me everything from correlation X") rather
than as a JSON blob. `payload` stays JSON. `event_name` is retained.

Legacy rows have `NULL` metadata. `drain` must handle them — a row enqueued
before this migration and not yet drained is exactly the crash-recovery case
the outbox exists for. Reconstruct a synthetic envelope with a generated
`MessageId`, `occurredAt` from `created_at`, and `null` correlation. **Test
this explicitly**; it is a one-time path, which is precisely why nobody will
notice it is broken.

Update both adapters. The drain contract is unchanged; only the row↔envelope
mapping is new. `onError` now receives `{ name, id }`.

**Verify**: `pnpm migrate` on a fresh DB → exit 0.
`pnpm vitest run src/shared/events` → all pass, **including the
characterization tests** (retention on handler failure, per-row isolation,
delete-only-after-success).

### Step 4: Move timestamps onto `meta`

Remove `sentAt` from `InvoiceSentSchema`, `recordedAt` from
`InvoicePaymentRecordedSchema`, and `voidedAt` from `InvoiceVoidedSchema`.
`meta.occurredAt` replaces all three.

Then update consumers:

- `src/invoicing/entities/invoice.ts` — transitions stop putting timestamps in
  payloads. They still take `now: Date` (for aggregate fields such as plan
  006's `sentAt`), so `Outcome.events` should carry `{ type, payload }` and
  let the dispatcher build the envelope with `occurredAt` from the clock.
- `register-revenue-projection` reads `envelope.meta.occurredAt` instead of
  `payload.recordedAt` to derive the `YearMonth`.

⚠️ **`recordedAt` drives which month revenue lands in.** If `meta.occurredAt`
is not the same instant the payment was recorded, revenue moves months. Assert
equality in a test: for a payment recorded at time T, the projected month must
be `yearMonthOf(T)`. This is the single highest-consequence line in the plan.

`becamePaid` **stays on the payload** — it is a domain fact, not metadata.

**Verify**: `pnpm vitest run src/invoicing src/reporting` → all pass.

### Step 5: Declarative subscribers

Rewrite the three subscribers as `defineSubscriber` factories:

- `src/reporting/projections/revenue-projection.ts` —
  `'reporting.revenue-projection'`
- `src/invoicing/subscribers/invoice-sent-notification.ts` —
  `'invoicing.invoice-sent-notification'`
- `src/invoicing/subscribers/payment-received-notification.ts` —
  `'invoicing.payment-received-notification'`

Each takes its deps and returns a subscriber. Filenames must match exports
(`local/filename-matches-export`), so one subscriber per file — which is an
improvement anyway.

`src/app/register-subscribers.ts` collapses to:

```ts
export function registerSubscribers(deps: RegisterSubscribersDeps): Subscription {
  return deps.eventBus.register([
    revenueProjection({ readModel: deps.revenueReadModel, logger: deps.logger }),
    invoiceSentNotification({
      notifications: deps.notifications,
      getClient: deps.getClient,
      logger: deps.logger,
    }),
    paymentReceivedNotification({
      notifications: deps.notifications,
      invoiceRepo: deps.invoiceRepo,
      logger: deps.logger,
    }),
  ]);
}
```

Delete both `unsubs` arrays. Preserve every handler's **behavior** exactly —
including the `notification.client_not_found` warning and the `'Unknown Client'`
fallback in the `InvoiceSent` handler, and the fresh `invoiceRepo.findById`
re-read in the payment handler (AGENTS.md rule 12).

If plan 005 has landed, `SubscriptionsToken` now holds a real `Subscription`
and the ad-hoc `{ [Symbol.dispose]: ... }` wrapper goes away. If not, adapt
`AppDeps.unsubscribe` to `() => subscription[Symbol.dispose]()`.

Update `register-subscribers.test.ts` to assert the exact subscriber set **by
name** — now possible, and it turns "are all subscribers wired?" from an
inference into an assertion.

**Verify**: `pnpm vitest run src/app src/invoicing src/reporting` → all pass.

### Step 6: Envelope construction in the dispatcher

`apply-invoice-command.ts` builds envelopes from the transition's events:

```ts
const envelopes = events.map((e) =>
  createEnvelope({ clock: deps.clock, context: deps.context }, e.type, e.payload),
);
const txResult = deps.db.transaction(() => {
  const saveResult = deps.repo.save(aggregate);
  if (saveResult.isErr()) return saveResult;
  for (const envelope of envelopes) deps.outbox.enqueue(envelope);
  return ok(undefined);
});
```

⚠️ **Build envelopes _before_ the transaction, enqueue _inside_ it.** Envelope
creation reads ambient context and the clock; doing it inside a better-sqlite3
transaction callback is fine today but the transaction must stay as short and
as side-effect-free as possible. More importantly, the enqueue must remain
inside the transaction or the outbox loses its atomicity guarantee — the
entire point of the pattern.

`applyInvoiceCommand` now needs `clock` and `context` in its deps. Update its
callers (the server functions) accordingly.

Also update `build-app.ts`'s startup recovery drain for the new `onError`
signature, preserving its fire-and-forget semantics.

**Verify**: `pnpm vitest run src/invoicing/commands` → all pass, including
`apply-invoice-command.sqlite.test.ts`. `pnpm test:e2e` → all pass.

### Step 7: Document

- `docs/architecture.md` — update the "Event / Subscriber fan-out table" to
  list subscribers by their new names, and revise the payload-design rule:
  payloads carry domain facts; **identity and time live on `meta`**.
- `AGENTS.md` — amend rule 6 and rule 12:

  > **Rule 6**: Subscribers are declared with `defineSubscriber` as named
  > exports in the owning module and listed in
  > `src/app/register-subscribers.ts`. Never call `eventBus.register`
  > directly from a domain module.
  >
  > **Rule 12**: Event payloads carry IDs and immutable domain facts.
  > Timestamps, correlation, causation, and actor live on `envelope.meta`, not
  > on the payload.

Consider a lint rule enforcing rule 6 (a `no-restricted-syntax` selector
banning `.register(` outside `src/app/` and `src/shared/events/`). Add it if it
is a clean two-line addition; skip it if it produces false positives.

**Verify**: `pnpm format && pnpm typecheck && pnpm lint && pnpm deps && pnpm test`
→ all exit 0. `pnpm test:e2e` → all pass.

## Test plan

The outbox characterization tests are the crown jewels here — they were
written by a prior plan specifically to pin guarantees during a rewrite of
exactly this kind. **They must pass with changed setup only, never changed
expectations.**

- `event-bus.test.ts` — existing delivery/ordering/aggregation cases preserved;
  new: named error attribution, duplicate-name rejection, `Subscription`
  disposal removes exactly its own handlers.
- `sqlite-outbox.test.ts` / `in-memory-outbox.test.ts` — existing contract
  preserved; new: envelope round-trips through persistence with every `meta`
  field intact (including `null`s); **legacy NULL-metadata rows drain
  successfully**.
- `register-subscribers.test.ts` — assert the exact subscriber name set.
- **Revenue month test (Step 4)**: a payment at time T projects to
  `yearMonthOf(T)`. Non-negotiable.
- **Correlation propagation integration test**: record a payment inside a
  `context.run(...)`; assert the enqueued outbox row carries that
  `correlationId`, and that after drain both subscribers' log records carry it
  too. This is the plan's headline claim — assert it end to end.
- Subscriber behavior tests move with their files; preserve every case,
  including `client_not_found`.
- `apply-invoice-command.sqlite.test.ts` — atomicity unchanged. Add a case
  asserting that a failed `repo.save` leaves **zero** outbox rows.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `pnpm test:e2e` fully passes; `pnpm dev` manual flow works
- [ ] `EventBus.publish` takes an envelope; `register` returns a `Subscription`
- [ ] `grep -rn "unsubs" src` → no matches
- [ ] All three subscribers are named `defineSubscriber` exports, one per file
- [ ] `register-subscribers.test.ts` asserts the exact subscriber name set
- [ ] `AggregateError` message names the failing subscribers (test)
- [ ] Outbox rows persist full envelope metadata; legacy NULL rows still drain (test)
- [ ] Drain contract intact: attempt-all, retain-failures, never-reject —
      characterization tests pass with **unchanged expectations**
- [ ] Payload timestamps removed; revenue-month test proves the projection
      still lands in the right month
- [ ] Correlation ID propagates command → outbox → subscriber logs (integration test)
- [ ] Outbox enqueue still happens **inside** the transaction; failed save
      leaves zero rows (test)
- [ ] `migrations/0011_*.sql` added; no committed migration edited
- [ ] Startup crash-recovery drain preserved
- [ ] Docs and AGENTS.md rules 6 and 12 updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any outbox characterization test needs a **changed expectation**. Those
  guarantees are load-bearing crash-recovery behavior; a changed expectation
  means the rewrite lost something real.
- The revenue-month test fails after Step 4. `meta.occurredAt` is not the
  payment instant — revenue would silently land in the wrong month, and no UI
  would show it.
- Legacy NULL-metadata outbox rows cannot be drained. That is data loss on
  upgrade for exactly the rows the outbox exists to protect.
- You need to change the `publish` error strategy or the drain contract to make
  something work. Both are settled decisions; re-sequence rather than reopen.
- The `.register(` lint rule produces false positives. Drop the rule and note
  it; do not weaken the selector until it happens to pass.
- The envelope makes `Outcome`'s shape awkward enough that you want to change
  aggregate transitions beyond removing payload timestamps. Aggregate shape is
  plan 006's; report the friction.

## Maintenance notes

- **Retry/backoff/dead-lettering is now cheap** — rows carry identity and a
  correlation ID, so an `attempts` column and a poison-message table are
  small additions. Deliberately out of scope; revisit as its own plan.
- **Projection rebuild from the event log** becomes nearly free once envelopes
  are persisted (README direction option 4). The revenue read model's
  `paymentId` dedupe could then be reconsidered in favour of deduping on
  `meta.id` — a cleaner separation of domain fact from delivery concern.
- Plan 009 puts commands and queries on the same envelope; the `causationId`
  chain then spans command → event → projection, which is when the metadata
  becomes genuinely powerful rather than merely present.
- Reviewer: focus on Step 4 (the revenue-month equivalence) and Step 6 (the
  enqueue staying inside the transaction). Both are places where the code
  looks right, the tests mostly pass, and the failure is silent and expensive.
