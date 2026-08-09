# Plan 009: CommandBus and QueryBus

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. This plan
> **requires plans 005 and 007**. If `src/shared/di/container.ts` or
> `src/shared/messaging/envelope.ts` is missing, STOP.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED — mostly mechanical once the primitives exist, but it touches
  all 13 server functions and the read-surface guarantee moves onto a new
  type.
- **Depends on**: plans/005-di-composition-root-migration.md,
  plans/007-message-envelope-and-context.md
- **Category**: architecture
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

The repo is described as "CQRS-lite" but only the _event_ side has a bus.
Commands and queries are bare functions with bespoke `deps` parameters and
hand-written wiring.

The measured cost — **adding one query requires editing three files** —
survives even plan 005: `AppQueries` (the type), `wireQueries` (the wiring),
and a server function. Plan 005 moved the wiring into a module but did not
dissolve it; it explicitly deferred that here.

The deeper problem is that commands and queries have **no uniform shape**:

- `createClient(deps: { repo, clock, logger }, input)` → `Result<Client, CreateClientError>`
- `createInvoice(deps: { repo, clock }, input)` → `Result<Invoice, InvoiceError>`
- `applyInvoiceCommand(deps: {...5 members}, input, transition)` → `Promise<Result<Invoice, InvoiceError>>`
- `getInvoiceDetail(deps: { repo }, id)` → `InvoiceDetail | null`
- `getRevenueByYear(deps: { readModel }, year)` → `readonly MonthlyRevenue[]`

Five shapes. Some async, some sync; some `Result`, some nullable; deps
hand-assembled at each call site. There is nowhere to put a cross-cutting
concern — timing, logging, correlation, feature-flag gating — so today those
are either sprinkled inline (`logger.info('Client created', ...)` inside
`createClient`) or bolted on as TanStack middleware
(`require-feature-flag.ts`).

A bus gives one shape, one registration site, and one place for middleware.

## Design

### Definitions as values

```ts
export interface CommandDefinition<TName extends string, TInput, TOutput, TError> {
  readonly name: TName;
  readonly input: z.ZodType<TInput>;
  readonly handle: (
    ctx: HandlerContext,
    input: TInput,
  ) => Promise<Result<TOutput, TError>> | Result<TOutput, TError>;
}

export interface QueryDefinition<TName extends string, TInput, TOutput> {
  readonly name: TName;
  readonly input: z.ZodType<TInput>;
  readonly handle: (ctx: HandlerContext, input: TInput) => TOutput;
}
```

**Commands always return `Result`. Queries never do** — they return data or
`null`, matching how every query in the repo already behaves. That asymmetry
is deliberate and worth stating: commands can fail for domain reasons, queries
cannot.

`HandlerContext` carries the resolved dependencies plus the current
`MessageMeta`, so a handler can derive child envelopes without reaching for
ambient state itself.

### Buses as typed registries

```ts
const queryBus = createQueryBus().register(getInvoiceDetailQuery).register(listInvoicesQuery);

const detail = queryBus.execute('invoicing.get-invoice-detail', { invoiceId });
//    ^ InvoiceDetail | null — inferred from the registration
```

The bus accumulates a name→definition type map exactly as plan 004's container
accumulates bindings. **Reuse that pattern**; it is verified to work at this
scale and consistency is worth more than a marginally better API.

### Middleware

```ts
export type BusMiddleware = (
  next: (input: unknown) => unknown,
  ctx: HandlerContext,
  name: string,
) => unknown;
```

Applied uniformly, this is where the observability from plan 007 finally pays
off: one timing/logging middleware replaces the scattered `logger.info` calls,
and every command and query gets correlation IDs without touching a handler.

### The read surface, again

**This is the load-bearing constraint of the plan.** Today `AppReadView` makes
it a compile error for a query server function to touch a repo or the command
path. Plan 005 moved that guarantee onto a narrowed container type. Here it
moves again: query server functions receive a `QueryBus` and **not** a
`CommandBus`.

That is a _stronger_ guarantee than today — a query fn cannot even name a
command — but only if the types are right. **Verify it explicitly (Step 6) and
do not ship without it.**

## Current state

- `src/app/wire-queries.ts` — `wireQueries` returning the 11-method tree
  (`clients`: 2, `invoicing`: 6, `reporting`: 3).
- `AppQueries` — the tree's type (in `app-deps.ts` at `a9b67eb`; relocated by
  plan 005).
- Query functions: `get-client`, `list-clients`, `get-invoice-summary`,
  `get-invoice-line-items`, `get-invoice-payments`, `get-invoice-detail`,
  `list-invoice-summaries`, `get-outstanding-by-client`, `get-revenue-by-month`,
  `get-revenue-by-year`, plus `revenueReadModel.listAll()` wired inline as
  `listAllRevenue` — **note that one is not a query function at all**, it is a
  direct port call. Give it a real query module when it moves onto the bus.
- Command functions: `create-client`, `delete-client`, `create-invoice`,
  `delete-invoice`, and `applyInvoiceCommand` for the four transitions.
- `src/app/fns/` — 13 server functions. Query fns call `getAppReadView()`;
  mutation fns call `getAppInstance()`. Each defines its own Zod schema at the
  HTTP boundary.
- `src/app/fns/middleware/require-feature-flag.ts` — TanStack middleware
  gating at the dispatch boundary (AGENTS.md rule 7).
- `src/app/queries/*.ts` — TanStack Query `queryOptions` keyed by hand
  (`['invoices']`, `['invoices', invoiceId]`, …).

## Commands you will need

| Purpose        | Command                           | Expected on success |
| -------------- | --------------------------------- | ------------------- |
| Typecheck      | `pnpm typecheck`                  | exit 0              |
| Lint           | `pnpm lint`                       | exit 0              |
| Dep rules      | `pnpm deps`                       | exit 0              |
| Bus suite      | `pnpm vitest run src/shared/cqrs` | all pass            |
| App suite      | `pnpm vitest run src/app`         | all pass            |
| Full suite     | `pnpm test`                       | exit 0 (Node 24)    |
| E2E            | `pnpm test:e2e`                   | all pass            |
| Typecheck time | `time pnpm typecheck`             | see Step 7          |

## Scope

**In scope**:

- New `src/shared/cqrs/` — `define-command.ts`, `define-query.ts`,
  `command-bus.ts`, `query-bus.ts`, `bus-middleware.ts`, tests
- Every query function → a `QueryDefinition`
- Every command function → a `CommandDefinition`
- `src/app/wire-queries.ts` and `AppQueries` — **deleted**
- All 13 server functions — dispatch through a bus
- Logging/timing middleware
- `docs/architecture.md`, `AGENTS.md`

**Out of scope** (do NOT touch):

- **Query/command logic.** This is a re-shaping of the dispatch path. If a
  query's _behavior_ changes, you have gone too far.
- **The event bus.** Plan 008 owns it. The three buses stay separate — a
  single "message bus" would collapse the distinction CQRS exists to draw.
- **`applyInvoiceCommand`'s internals** — transaction, outbox, drain, and the
  ADR-0001 scope decision all stand. The four transitions become commands
  _that call it_; it does not become the bus.
- TanStack Query cache keys and `queryOptions`. Tempting to derive keys from
  query names; that is a separate change with its own invalidation risks
  (AGENTS.md rule 11). Note it as a follow-up.
- Feature-flag gating moving off TanStack middleware. Rule 7 says gate at the
  dispatch boundary; that boundary is arguably now the bus, but changing it is
  a separate decision.

## Git workflow

- Branch: `advisor/009-command-query-bus`
- Commits: `feat: add query bus primitive`, `feat: add command bus primitive`,
  `refactor: migrate queries onto the query bus`,
  `refactor: migrate commands onto the command bus`,
  `refactor: dispatch server functions through the buses`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Definition primitives

Create `src/shared/cqrs/define-command.ts` and `define-query.ts`. Like
`defineSubscriber`, these are identity functions at runtime whose value is
their type constraints.

Naming convention `'<module>.<verb>-<noun>'` — `'invoicing.get-invoice-detail'`,
`'clients.create-client'`. Names appear in logs, timing metrics, and error
messages, so they need to be stable and greppable.

`HandlerContext`:

```ts
export interface HandlerContext {
  readonly meta: MessageMeta;
  readonly logger: Logger;
}
```

Deliberately **not** the whole container. A handler receives its dependencies
through the closure created at registration time (the same way query functions
take `{ repo }` today) — passing the container into handlers would recreate
the god-object problem this whole set of plans is dismantling.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 2: Query bus

`src/shared/cqrs/query-bus.ts`, following plan 004's container typing:

```ts
export interface QueryBus<TRegistry extends QueryRegistry = {}> {
  register<TName extends string, TInput, TOutput>(
    def: QueryDefinition<TName, TInput, TOutput>,
  ): QueryBus<TRegistry & Record<TName, { input: TInput; output: TOutput }>>;

  execute<TName extends Extract<keyof TRegistry, string>>(
    name: TName,
    input: TRegistry[TName]['input'],
  ): TRegistry[TName]['output'];

  use(middleware: BusMiddleware): QueryBus<TRegistry>;
}
```

`execute` parses input through the definition's Zod schema before calling the
handler. **Decide and document the parse-failure behavior**: queries do not
return `Result`, so a schema failure must throw. That is correct — a query
dispatched with structurally invalid input is a programming error, not a
domain error, consistent with AGENTS.md rule 1. Throw a typed
`QueryInputError`.

Tests (`query-bus.test.ts`): registration and execution; output type inference
(`expectTypeOf`); unknown name is a compile error (`@ts-expect-error`) **and**
a runtime throw; duplicate registration throws; invalid input throws
`QueryInputError`; middleware runs in registration order and can observe both
input and output.

**Verify**: `pnpm vitest run src/shared/cqrs` → all pass.

### Step 3: Command bus

`src/shared/cqrs/command-bus.ts`, same shape with three differences:

- `dispatch` is always `Promise<Result<TOutput, TError>>` — uniform, even for
  synchronous handlers. Callers should not care.
- Input parse failure returns `Err`, it does **not** throw. Commands come from
  the HTTP boundary where invalid input is an expected condition.
  ⚠️ This is the opposite of the query bus, deliberately. Comment both.
- The error type is part of the registry so `dispatch`'s `Err` branch is
  precisely typed per command.

Tests mirror the query bus, plus: a handler returning `Err` propagates it
unchanged; a handler that **throws** is not swallowed (infrastructure failures
must surface — assert this explicitly, it is the kind of thing a bus
accidentally papers over).

**Verify**: `pnpm vitest run src/shared/cqrs` → all pass.

### Step 4: Migrate queries

Convert all 11 queries. Each keeps its existing pure function and gains a
definition:

```ts
// src/invoicing/queries/get-invoice-detail.ts  (append)
export const getInvoiceDetailQuery = (deps: GetInvoiceDetailDeps) =>
  defineQuery({
    name: 'invoicing.get-invoice-detail',
    input: z.object({ invoiceId: InvoiceIdSchema }),
    handle: (_ctx, input) => getInvoiceDetail(deps, input.invoiceId),
  });
```

Keeping the plain function alongside means existing unit tests keep working
and the domain logic stays independently callable — worth the small
duplication.

⚠️ **`listAllRevenue` is currently `deps.revenueReadModel.listAll()` wired
inline in `wireQueries` — not a query module at all.** Give it a real one
(`src/reporting/queries/list-all-revenue.ts`) so every entry on the bus has
the same provenance. AGENTS.md rule 9 wants queries to be functions over
ports, and this one has been skipping that.

Then replace plan 005's `queriesModule` with bus registration, and **delete
`wire-queries.ts` and `AppQueries`**.

**Verify**: `pnpm vitest run src` → all pass. `pnpm typecheck` → exit 0.

### Step 5: Migrate commands

Convert `createClient`, `deleteClient`, `createInvoice`, `deleteInvoice`, and
the four invoice transitions (`send-invoice`, `record-payment`,
`void-invoice`, `calculate-late-fee`).

The transition commands wrap `applyInvoiceCommand`:

```ts
export const sendInvoiceCommand = (deps: ApplyInvoiceCommandDeps) =>
  defineCommand({
    name: 'invoicing.send-invoice',
    input: z.object({ invoiceId: InvoiceIdSchema }),
    handle: (ctx, input) =>
      applyInvoiceCommand(deps, { invoiceId: input.invoiceId, expect: 'draft' }, (invoice) =>
        sendInvoice(invoice, deps.clock.now()),
      ),
  });
```

(The `expect: 'draft'` field exists only if plan 006 has landed; omit if not.)

⚠️ **`createClient` currently calls `deps.logger.info('Client created', ...)`
inside the handler.** Once Step 7's logging middleware is in place that
becomes a duplicate. Remove the inline call **only after** verifying the
middleware emits an equivalent record — do not delete observability on the
assumption that a replacement works.

**Verify**: `pnpm vitest run src` → all pass.

### Step 6: Server functions and the read surface

Each server function becomes a thin HTTP adapter: parse → dispatch → map to
DTO. The Zod schema at the HTTP boundary stays (AGENTS.md rule 5); the bus
re-parses, which is a deliberate belt-and-braces at a trust boundary.

```ts
export const getInvoiceDetailFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const detail = getQueryBus().execute('invoicing.get-invoice-detail', data);
    return toDto(detail);
  });
```

**The guarantee.** `getQueryBus()` must be resolvable by query fns; the
command bus must not be. Pin it in `src/app/bus-access.type-test.ts`:

```ts
// @ts-expect-error query server functions must not reach the command bus
getAppReadView().resolve(CommandBusToken);
// @ts-expect-error an unregistered query name must not be dispatchable
getQueryBus().execute('invoicing.nope', {});
// @ts-expect-error a command name is not a query name
getQueryBus().execute('invoicing.send-invoice', { invoiceId });
```

`pnpm typecheck` passing proves all three errors are live.

**Verify**: `pnpm typecheck` → exit 0. Delete one `@ts-expect-error` and
confirm typecheck **fails**; restore. `pnpm test:e2e` → all pass.

### Step 7: Middleware, then document

Add two middlewares in `src/app/`:

- **Logging/timing** — logs `{ name, durationMs, outcome }` for every dispatch.
  Because plan 007's context logger auto-attaches correlation IDs, this
  produces a correlated trace of every command and query with no handler
  changes. That is the observability payoff of plans 007–009 combined.
- **Error normalisation** (commands only) — maps `Err` values to the shape
  server functions already return, replacing scattered
  `invoiceErrorMessage(result.error)` calls.

Then verify the headline claim: **adding a query now touches one file.**
Demonstrate it concretely in the PR description with a real worked example
(define + register), not a prose assertion.

Run `time pnpm typecheck` and compare with the plan-005 baseline. Two
accumulating registry types plus the container is the deepest type-level
nesting in the repo; if typecheck time has grown sharply, report it.

Docs:

- `docs/architecture.md` — replace the query-wiring description; add a "CQRS
  buses" section covering all three buses and why they stay separate. Update
  the "How to add a new feature" recipe — steps 3 and 4 will be substantially
  shorter.
- `AGENTS.md` — amend rule 9 (queries are `QueryDefinition`s on the query bus;
  the narrow read surface is now "query fns cannot name the command bus") and
  add a rule stating commands return `Result`, queries do not.

**Verify**: `pnpm format && pnpm typecheck && pnpm lint && pnpm deps && pnpm test`
→ all exit 0. `pnpm test:e2e` → all pass. `pnpm dev` → full manual flow.

## Test plan

- `query-bus.test.ts` / `command-bus.test.ts` — Steps 2–3, including the
  asymmetric input-failure behavior (query throws, command returns `Err`) and
  the "handler throws → not swallowed" case.
- **Every existing query and command test passes unmodified.** They test the
  plain functions, which are unchanged. If one breaks, logic changed that
  should not have.
- New per-bus registration test asserting the **complete registered name set**
  for each bus — the analogue of plan 008's subscriber-set assertion, and the
  thing that catches a query silently dropped during migration.
- `src/app/bus-access.type-test.ts` — three `@ts-expect-error` cases (Step 6).
- Middleware tests: timing middleware records a duration and the dispatch name;
  a failing command still produces a log record with `outcome: 'error'`.
- **`handlers.test.ts` is the integration net** for the server functions.
  Expect mechanical updates only.
- E2E is the final gate — the whole HTTP path changed shape even though no
  behavior did.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `pnpm test:e2e` fully passes; `pnpm dev` manual flow works end to end
- [ ] `src/app/wire-queries.ts` deleted; `AppQueries` gone
- [ ] All 11 queries and all 8 commands are bus-registered definitions
- [ ] `listAllRevenue` has a real query module
- [ ] `getAppReadView().resolve(CommandBusToken)` is a **compile error**,
      pinned and spot-checked
- [ ] Dispatching an unregistered or wrong-kind name is a compile error, pinned
- [ ] Per-bus registration tests assert the complete name sets
- [ ] Command input failure → `Err`; query input failure → throw. Both tested
      and both commented as deliberate.
- [ ] A handler that throws is not swallowed by either bus (test)
- [ ] Inline `logger.info` in `createClient` removed **only after** verifying
      the middleware emits an equivalent record
- [ ] Adding a query touches **one** file — demonstrated with a worked example
      in the PR description
- [ ] `time pnpm typecheck` before/after recorded
- [ ] Docs and AGENTS.md rule 9 updated, including the feature recipe
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **A query server function can reach the command bus** in any typed path. Hard
  stop — this is a regression against a guarantee the repo has held since
  `AppReadView` was introduced.
- Any existing query or command test needs a **changed assertion**.
- `pnpm typecheck` time more than doubles versus the plan-005 baseline. Three
  accumulating type-level registries may be past what is practical, and the
  answer might be a simpler bus rather than a faster machine.
- Bus type inference degrades — `execute` returning `unknown`, or an error
  message so large it is unreadable. Report the threshold at which it happens.
- You are tempted to merge the command, query, and event buses into one. That
  erases the distinction CQRS exists to draw; if the duplication is genuinely
  painful, extract a shared _registry_ helper, not a shared _bus_.
- Feature-flag gating cannot stay at the TanStack middleware boundary. That
  touches AGENTS.md rule 7 and is a maintainer decision.

## Maintenance notes

- **Deriving TanStack Query cache keys from query names** is the obvious
  follow-up (`['invoicing.get-invoice-detail', input]`), and would make
  invalidation mechanical rather than hand-maintained. Deliberately deferred —
  AGENTS.md rule 11 puts invalidation in components' `onSuccess`, and changing
  key structure without changing that rule risks silent staleness.
- With all three buses on plan 007's envelope, a causation chain now spans
  command → event → projection. A "show me everything from correlation X"
  debugging view becomes a small feature and would demonstrate the whole
  observability story end to end.
- The plain query/command functions are retained alongside their definitions.
  If that duplication ever grates, the answer is to delete the _definitions_'
  wrappers and inline the logic — not to delete the plain functions, which are
  what keeps the domain independently testable.
- Reviewer: check Step 6's type test above everything else, then the
  asymmetric input-failure decision in Steps 2–3. The rest is mechanical.
