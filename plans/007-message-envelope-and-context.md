# Plan 007: Message envelope, observability metadata, and ambient request context

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. Confirm
> `src/start.ts` does not exist and that the three event payload schemas in
> `src/invoicing/events/` each carry their own timestamp field
> (`sentAt`, `recordedAt`, `voidedAt`).
>
> **Environment check (run first)**: `node --version` → `v24.x` required.
> Requires plan 003 (domain kit) for the four new branded types.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — introduces a new cross-cutting type and a global request
  middleware. Additive at first; the breaking part (changing `EventBus`) is
  deliberately deferred to plan 008.
- **Depends on**: plans/003-domain-value-object-kit.md
- **Category**: observability / architecture
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

Messages in this system carry no identity and no context. Concretely:

- **No message ID.** An `InvoicePaymentRecorded` event cannot be referred to,
  deduplicated generically, or logged as a distinct thing. The revenue
  projection had to be made idempotent on `paymentId` (commit `426a8a8`) —
  a domain field doing an infrastructure job, because there was no message
  identity to use.
- **No consistent timestamp.** Each payload rolls its own: `sentAt`,
  `recordedAt`, `voidedAt`. Three names for "when did this happen", and a
  fourth event would invent a fifth.
- **No correlation.** When `recordPayment` fires an event that updates the
  read model _and_ sends a notification, nothing ties the three log lines
  together. `logger.info('revenue.projection.updated', { month, invoiceId })`
  and `logger.info('notification.payment_received', { invoiceId })` are
  correlatable only by squinting at `invoiceId`.
- **No causation.** Nothing records that this event was caused by that
  command.
- **No request identity and no trace context.** The outbox stores
  `event_name` + `payload`; a row that fails to drain cannot be traced back to
  the request that produced it.

The fix is one envelope type carrying metadata, and an ambient context that
populates it without every call site passing it down manually.

**Explicit non-goal**: this plan does **not** add an OpenTelemetry SDK. It
carries and propagates a W3C `traceparent` value so that a real exporter can
be added later without touching the domain. Adding an OTel dependency tree to
a repo whose purpose is legibility would cost more than it teaches.

## Design

### The envelope

```ts
// src/shared/messaging/envelope.ts
export interface Envelope<TName extends string, TPayload> {
  readonly id: MessageId;
  readonly name: TName;
  readonly payload: TPayload;
  readonly meta: MessageMeta;
}

export interface MessageMeta {
  /** When the fact occurred. Single source of truth — replaces per-payload timestamps. */
  readonly occurredAt: string; // ISO 8601
  /** Constant across an entire causal chain. */
  readonly correlationId: CorrelationId;
  /** The message that directly caused this one; null for chain roots. */
  readonly causationId: MessageId | null;
  /** The HTTP request this originated from; null for startup/background work. */
  readonly requestId: RequestId | null;
  /** Who initiated it. `{ kind: 'system' }` today — auth is an intentional omission. */
  readonly actor: Actor;
  /** W3C trace-context header value, propagated verbatim. Null if absent. */
  readonly traceparent: Traceparent | null;
}

export type Actor = { readonly kind: 'system' } | { readonly kind: 'anonymous' };
```

`Actor` is a discriminated union with two variants **specifically so that
adding `{ kind: 'user'; userId: UserId }` later is additive** and every
`switch` becomes an exhaustiveness error at exactly the sites that need
updating. It is not speculative generality — it is a two-line union chosen so
the intentional auth omission does not become a refactor.

### `Traceparent` — W3C trace-context

Format per the W3C spec:
`version-traceid-parentid-traceflags`, e.g.
`00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`

- version: 2 lowercase hex chars (`ff` forbidden)
- trace-id: 32 lowercase hex chars, not all zero
- parent-id (span-id): 16 lowercase hex chars, not all zero
- trace-flags: 2 lowercase hex chars (`01` = sampled)

Validation regex, with the all-zero cases rejected separately:

```ts
/^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
```

This is a good stress test of plan 003's value-object kit: a regex-validated
string with **no `create()`** (traceparent comes from inbound headers or from
a generator, never minted arbitrarily). If the kit cannot express it cleanly,
say so — that is useful feedback about the kit, not a reason to hand-roll.

`tracestate` is deliberately **not** modelled: it is vendor-specific, needs
list-member parsing and truncation rules, and nothing here consumes it.

### Ambient context

```ts
// src/shared/messaging/message-context.ts  (port)
export interface MessageContext {
  current(): MessageMeta | null;
  /** Runs fn with `meta` as the ambient context. */
  run<T>(meta: MessageMeta, fn: () => T): T;
  /** Derives child metadata: same correlation, causationId = parent's id. */
  derive(parentId: MessageId): MessageMeta;
}
```

Adapter: `AsyncLocalStorageMessageContext` (`node:async_hooks`) for
production; `InMemoryMessageContext` (a mutable field) for tests, matching the
repo's established port/adapter pairing.

**Domain code never touches `MessageContext`.** It is a shared-kernel port
consumed by the app layer and by the buses in plans 008/009. Aggregates
continue to receive `now: Date` primitives.

## Current state

- `src/shared/events/event-bus.ts` — `publish(event, payload)`. **Unchanged by
  this plan**; plan 008 changes it.
- `src/invoicing/events/` — three Zod schemas, each with its own timestamp.
- `src/shared/logger/logger.ts` — `info/warn/error/debug(message, meta?)`.
  The natural place to auto-attach correlation IDs.
- `migrations/0005_create_outbox.sql` — `id`, `event_name`, `payload`,
  `created_at`. No metadata columns. Plan 008 migrates it.
- `src/app/fns/` — 13 server functions, none aware of request identity.
- `src/app/fns/middleware/require-feature-flag.ts` — the only existing
  middleware; a template for the shape.
- **No `src/start.ts`.** `vite.config.ts` configures `tanstackStart({ srcDirectory: './src', router: { entry: './app/router', ... } })`.
- Dependency-cruiser `no-framework-outside-app` scopes its `from` to
  `^src/(clients|invoicing|reporting|shared)/` — so a file at `src/start.ts`
  is **not** covered. Step 5 closes that hole.

## Commands you will need

| Purpose         | Command                                     | Expected on success            |
| --------------- | ------------------------------------------- | ------------------------------ |
| Typecheck       | `pnpm typecheck`                            | exit 0                         |
| Lint            | `pnpm lint`                                 | exit 0                         |
| Dep rules       | `pnpm deps`                                 | exit 0                         |
| Messaging suite | `pnpm vitest run src/shared/messaging`      | all pass                       |
| Full suite      | `pnpm test`                                 | exit 0 (Node 24)               |
| Dev server      | `pnpm dev`                                  | boots; correlation IDs in logs |
| E2E             | `pnpm test:e2e:critical --project=chromium` | all pass                       |

## Scope

**In scope**:

- New `src/shared/messaging/` — envelope, meta, IDs, traceparent, context port
  - two adapters, `createEnvelope`
- `src/start.ts` — global request middleware seeding the context
- `.dependency-cruiser.cjs` — cover `src/start.ts` (Step 5)
- `src/shared/logger/` — a context-aware decorator that auto-attaches
  correlation/request IDs
- `AGENTS.md`, `docs/architecture.md`

**Out of scope** (do NOT touch):

- **`EventBus`, the outbox schema, and the three event payload schemas.**
  Plan 008 owns all of them. This plan builds the envelope; 008 adopts it.
  Keeping them separate is what makes 008 reviewable.
- Command and query buses — plan 009.
- Any OpenTelemetry package, exporter, or `tracestate` parsing.
- Authentication. `Actor` is shaped for it and stops there.
- Aggregates and transitions.

## Git workflow

- Branch: `advisor/007-message-envelope-and-context`
- Commits: `feat: add message envelope and metadata types`,
  `feat: add AsyncLocalStorage message context`,
  `feat: seed request context in global middleware`,
  `feat: auto-attach correlation ids to log records`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Branded message identifiers

Using plan 003's kit, in `src/shared/messaging/`:

- `MessageId` — `defineBrandedId('msg')`, UUID v7 (time-sortable, matching the
  repo's existing ID convention).
- `CorrelationId` — `defineBrandedId('corr')`.
- `RequestId` — `defineBrandedId('req')`.
- `Traceparent` — `defineValueObject('Traceparent', schema)` with the regex
  above plus explicit refinements rejecting an all-zero trace-id
  (`0`×32) and an all-zero parent-id (`0`×16), and rejecting version `ff`.
  Provide `Traceparent.generate()` minting a fresh sampled traceparent from
  `crypto.randomBytes`, and `Traceparent.childOf(parent)` producing a new
  span-id under the same trace-id.

**Verify**: `pnpm vitest run src/shared/messaging` → the Step 2 tests pass.

### Step 2: Identifier tests

`traceparent.test.ts` — table-driven against the spec:

- valid: `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
- reject: all-zero trace-id; all-zero parent-id; version `ff`; uppercase hex;
  wrong field lengths; missing fields; trailing content
- `generate()` output parses; `childOf(p)` preserves the trace-id and changes
  the parent-id

`message-id.test.ts` etc. can be thin — plan 003 already tests the kit; assert
only the prefixes and that the three ID types are mutually non-assignable.

**Verify**: `pnpm vitest run src/shared/messaging` → all pass.

### Step 3: Envelope and factory

`envelope.ts` (types) and `create-envelope.ts`:

```ts
export function createEnvelope<TName extends string, TPayload>(
  deps: { clock: Clock; context: MessageContext },
  name: TName,
  payload: TPayload,
  overrides?: Partial<MessageMeta>,
): Envelope<TName, TPayload>;
```

Behavior:

- `id` — always freshly minted.
- `occurredAt` — `deps.clock.now().toISOString()`. **Uses the `Clock` port**,
  never `new Date()` — otherwise `FixedClock` stops working in tests and the
  repo loses time determinism.
- `correlationId` — from ambient context; a fresh one if there is none.
- `causationId` — from ambient context's current message id; `null` at a chain
  root.
- `requestId`, `traceparent` — from ambient context; `null` when absent.
- `actor` — from ambient context; defaults to `{ kind: 'system' }`.
- `overrides` merge last, for tests and replay.

Also add a Zod `MessageMetaSchema` and `envelopeSchema(payloadSchema)` helper —
AGENTS.md rule 5 requires schemas at event-payload boundaries, and plan 008
persists envelopes to the outbox, which is a serialization boundary.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 4: `MessageContext` port and adapters

- `message-context.ts` — the port.
- `async-local-storage-message-context.ts` — production adapter over
  `AsyncLocalStorage<MessageMeta>` from `node:async_hooks`.
- `in-memory-message-context.ts` — test adapter; a mutable field with `run()`
  saving/restoring, so tests need no async plumbing.

⚠️ **`node:async_hooks` is server-only.** `src/shared/` is bundled for the
client in principle. Confirm the ALS adapter is never reachable from a client
component — it should only be constructed in the composition root, which is
already server-only via `createServerOnlyFn`. If Vite pulls it into the client
graph, that is a STOP condition, not something to work around with a dynamic
import.

Tests (`async-local-storage-message-context.test.ts`):

- `current()` is `null` outside `run()`
- `run(meta, fn)` — `fn` sees `meta`
- **context survives an `await` boundary** (the whole reason for ALS —
  assert explicitly with an awaited timer)
- nested `run()` calls restore the outer context on exit
- two concurrent `run()` calls do not leak into each other (assert with
  interleaved async functions — this is the failure mode a naive mutable
  global would have)
- `derive(parentId)` keeps `correlationId`, sets `causationId` to `parentId`

**Verify**: `pnpm vitest run src/shared/messaging` → all pass.

### Step 5: Global request middleware

Create `src/start.ts` per TanStack Start's documented global-middleware API:

```ts
import { createStart, createMiddleware } from '@tanstack/react-start';

const requestContext = createMiddleware().server(async ({ next, request }) => {
  const inbound = request.headers.get('traceparent');
  const meta = buildRequestMeta(inbound); // parse or generate
  return getMessageContext().run(meta, () => next());
});

export const startInstance = createStart(() => ({
  requestMiddleware: [requestContext],
}));
```

Semantics:

- Parse an inbound `traceparent` header; on parse failure **generate a fresh
  one** and log at `debug`. Never reject a request over a malformed trace
  header — it is diagnostic data, not input.
- Mint a fresh `RequestId` per request; mint a fresh `CorrelationId` unless an
  inbound correlation header supplies one.
- `causationId` is `null` at the request boundary.
- Set a `traceparent` response header so the client can correlate.

⚠️ **Two things to verify rather than assume**:

1. That `src/start.ts` is the path this app's `tanstackStart({ srcDirectory: './src' })`
   configuration actually picks up, and that the middleware runs for both SSR
   and server functions. Verify empirically with a `logger.debug` on every
   request, hitting a route and a server function. If Start expects a
   different location, use that and note it.
2. That `next()` is invoked **inside** `context.run(...)`, so everything
   downstream — including awaits — sees the context. Getting this inverted
   silently yields `null` context everywhere with no error.

Then close the dependency-cruiser hole. Add:

```js
{
  name: 'no-framework-at-src-root',
  severity: 'error',
  comment: 'Only src/start.ts may import framework packages outside src/app/.',
  from: { path: '^src/[^/]+\\.ts$', pathNot: ['^src/start\\.ts$', '\\.test\\.ts$'] },
  to: { path: '^@tanstack/' },
}
```

and confirm `no-framework-outside-app` still passes.

**Verify**: `pnpm deps` → exit 0. `pnpm dev` → hit a route and a server
function; both log a request ID and a correlation ID. `pnpm build` → exit 0.

### Step 6: Context-aware logging

This is where the metadata becomes visible rather than theoretical. Add
`src/shared/logger/context-logger.ts` — a decorator wrapping any `Logger` and
merging the ambient `correlationId` / `requestId` / `causationId` into every
record's `meta`:

```ts
export function contextLogger(inner: Logger, context: MessageContext): Logger;
```

Wire it in the composition root so `LoggerToken` (or `AppDeps.logger`)
resolves to the decorated logger. Existing call sites — including
`revenue.projection.updated` and `notification.payment_received` — get
correlation for free, with **zero call-site changes**. That is the payoff:
after this step those two log lines and the request that caused them share a
correlation ID.

Test: `context-logger.test.ts` over `CapturingLogger` — a record emitted
inside `run(meta, ...)` carries the IDs; one emitted outside does not; and
explicit `meta` passed by the caller **wins** over ambient values (so an
existing call site can never be silently overwritten).

**Verify**: `pnpm vitest run src/shared` → all pass. `pnpm dev` → trigger a
payment; the projection and notification log lines share a correlation ID.

### Step 7: Document

- `docs/architecture.md` — a new "Message metadata and correlation" section:
  the envelope shape, what each field means, where context is seeded, and
  explicitly that **no OTel SDK is present** — `traceparent` is carried, not
  exported.
- `AGENTS.md` — under "Rules the toolchain cannot enforce":

  > **Every message carries an envelope.** Events, commands, and queries are
  > wrapped in `Envelope<TName, TPayload>` with `MessageMeta`. Payloads carry
  > domain facts only — never timestamps or identity, which belong on `meta`.
  > Ambient context is read via the `MessageContext` port at the app layer;
  > domain code never touches it.

**Verify**: `pnpm format && pnpm typecheck && pnpm lint && pnpm deps && pnpm test`
→ all exit 0.

## Test plan

- `traceparent.test.ts` — spec-derived table, valid and invalid (Step 2)
- `create-envelope.test.ts` — every `meta` field populated from ambient
  context; `FixedClock` controls `occurredAt`; overrides win; a chain root has
  `causationId: null`
- `async-local-storage-message-context.test.ts` — six cases (Step 4), with
  the await-boundary and concurrency cases as the load-bearing ones
- `in-memory-message-context.test.ts` — same contract, so the two adapters are
  interchangeable in tests. Write it as a **shared contract suite** run against
  both adapters; that is what makes the test-double trustworthy.
- `context-logger.test.ts` — three cases (Step 6)
- **One integration test**: within a single `context.run(...)`, two derived
  envelopes share a `correlationId` and each has `causationId` pointing at its
  parent. This is the plan's central claim; assert it directly.
- No changes to existing tests. If one breaks, the middleware or the logger
  decorator changed observable behavior it should not have.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `pnpm build` exits 0; `pnpm test:e2e:critical --project=chromium` passes
- [ ] `src/shared/messaging/` contains envelope, meta, four branded types,
      context port, two adapters, all tested
- [ ] `Traceparent` validation rejects all-zero trace-id, all-zero parent-id,
      version `ff`, and uppercase hex
- [ ] Context survives an `await` boundary (test) and does not leak across
      concurrent requests (test)
- [ ] `src/start.ts` seeds context for **both** SSR requests and server
      functions (verified empirically, method recorded in the PR description)
- [ ] `pnpm dev` → a payment produces projection and notification log lines
      sharing one correlation ID (paste the log excerpt in the PR description)
- [ ] `no-framework-at-src-root` dep-cruiser rule added and passing
- [ ] `occurredAt` comes from the `Clock` port, never `new Date()` —
      `grep -n "new Date()" src/shared/messaging/` → no matches
- [ ] Zero changes to `EventBus`, the outbox schema, or event payload schemas
- [ ] Docs updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `node:async_hooks` ends up in the client bundle. Report the import chain;
  do not work around it with a dynamic import or a stub — it means the
  server/client boundary is weaker than the repo believes, which is a finding
  in its own right.
- The global middleware does not run for server functions (only for SSR, or
  vice versa). Partial coverage is worse than none: some messages would have
  context and some would not, and the resulting gaps would look like bugs.
- Context does **not** survive an `await` in this runtime (Nitro/Vite SSR).
  Everything downstream depends on it; report rather than falling back to
  threading `meta` through every call signature.
- `src/start.ts` conflicts with the `tanstackStart({ srcDirectory: './src' })`
  config or with route generation.
- You find yourself needing to change `EventBus` or an event payload schema to
  make something work. That is plan 008's scope — stop and re-sequence.
- The value-object kit from plan 003 cannot express `Traceparent` cleanly.
  Report the specific friction; it is useful feedback about the kit.

## Maintenance notes

- **Plan 008 consumes this immediately**: `EventBus.publish(envelope)`, outbox
  rows storing full envelopes, and per-payload timestamps
  (`sentAt`/`recordedAt`/`voidedAt`) collapsing into `meta.occurredAt`.
  Do not pre-empt any of it here.
- **Plan 009** puts commands and queries on the same envelope, which is what
  makes "this query was caused by that command" expressible.
- `Actor` is two variants today so that adding `{ kind: 'user'; userId: UserId }`
  is additive and every `switch` fails loudly at exactly the right sites.
  Auth remains an intentional omission.
- If an OTel exporter is ever wanted, the seam is `MessageContext` — it
  already holds the trace-id and span-id. Nothing else should need to change.
- Reviewer: check Step 5's `run()`/`next()` nesting and Step 6's precedence
  rule (explicit meta beats ambient). Both are one-line mistakes with
  silent, hard-to-diagnose consequences.
