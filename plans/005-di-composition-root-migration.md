# Plan 005: Migrate the composition root onto the container

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. This plan
> **requires plan 004** — if `src/shared/di/container.ts` does not exist,
> STOP and run 004 first. Confirm `src/app/build-app.ts` still has the five
> private sub-factories described in "Current state".
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED–HIGH — touches the composition root, both test app builders,
  the server-function entry point, and the read-surface guarantee. Behavior
  must be identical throughout; the e2e suite is the real gate.
- **Depends on**: plans/004-di-container-primitive.md
- **Category**: architecture
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

Plan 004 built the container; this is the plan that makes it pay. The measured
cost of the current design: **adding one dependency requires editing 3–4 files
in lockstep** (`app-deps.ts`, `build-app.ts`, `build-test-app.ts`, and
`wire-queries.ts` for queries). After this plan it is one — the owning
module's registration.

Equally important, `buildApp` and `buildTestApp` are two independent 90-line
transcriptions of the same graph. They have already drifted once
(`wire-queries.ts` exists precisely because query wiring was duplicated across
them — see the prior round's plan 008). Modules with swappable adapter
bindings make the drift structurally impossible rather than merely discouraged.

## The guarantee that must not break

`AppReadView` (`src/app/app-deps.ts`) is
`Pick<AppDeps, 'queries' | 'featureFlags' | 'clock'>`. It exists so query
server functions **cannot** reach repos, the event bus, the DB, or the command
path — enforced by the type, not by convention. `docs/architecture.md` explains
why at length, and AGENTS.md rule 9 codifies it.

The container preserves this via **narrowed container types**: plan 004
verified that `resolve` on a `Container<QueryBindings>` rejects a token outside
`QueryBindings` at compile time. So:

```ts
export type AppContainer = ReturnType<typeof buildApp>;
export type ReadBindings = Pick<ContainerBindings<AppContainer> /* query + flags + clock keys */>;
export const getAppReadView = createServerOnlyFn((): Container<ReadBindings> => getAppInstance());
```

`getAppReadView().resolve(InvoiceRepoToken)` must be a **compile error**. Step 6
verifies this explicitly, and it is a Done criterion. **If you cannot make it
hold, STOP** — do not ship a version where the read surface is enforced only
by convention. That would be a strict regression from today.

## Current state

- `src/app/app-deps.ts` — `AppDeps` (15 members + nested `queries` with 11
  methods) and `AppReadView`.
- `src/app/build-app.ts` — `buildApp(overrides: Partial<AppDeps> = {})`, with
  private `createInfrastructure`, `createDatabase`, `createRepositories`,
  `createAdapters`, `createEventingAndSubscribers`. Each takes the whole
  `overrides` bag. Also performs two side effects worth noting:
  - runs migrations inside `createDatabase` (with the `import.meta.dirname`
    fallback for Turbopack builds);
  - fires a **fire-and-forget outbox drain** at startup for crash recovery
    (`void outbox.drain(...).catch(...)`).
- `src/app/wire-queries.ts` — `wireQueries({ clientRepo, invoiceRepo, revenueReadModel })`
  returning the whole `queries` tree; shared by both builders.
- `src/app/register-subscribers.ts` — takes 7 deps, calls
  `registerRevenueProjection` and `registerNotificationSubscribers`, returns a
  combined `() => void`. Includes the cross-module wiring where invoicing's
  notification subscriber receives a bound `getClient` from the clients module.
- `src/app/instance.ts` — module-level singleton, `getAppInstance` /
  `getAppReadView` (both `createServerOnlyFn`), plus
  `setAppInstanceForTesting`.
- `src/app/testing/build-test-app.ts` — full in-memory transcription of the
  graph, plus a `STUB_DB` whose `prepare`/`exec` throw and whose `transaction`
  is a passthrough. Returns `{ app, capturing: { notifications } }`.
- `src/app/testing/build-integration-test-app.ts` — swaps in SQLite adapters
  over `setupDb()`, delegates the rest to `buildTestApp`, returns a `teardown`.
- Tests that consume the builders directly: `src/app/build-app.test.ts`,
  `src/app/wire-queries.test.ts`, `src/app/register-subscribers.test.ts`,
  `src/app/fns/handlers.test.ts`, plus the SQLite command tests.

## Commands you will need

| Purpose          | Command                   | Expected on success  |
| ---------------- | ------------------------- | -------------------- |
| Typecheck        | `pnpm typecheck`          | exit 0               |
| Lint             | `pnpm lint`               | exit 0               |
| Dep rules        | `pnpm deps`               | exit 0               |
| App suite        | `pnpm vitest run src/app` | all pass             |
| Full suite       | `pnpm test`               | exit 0 (Node 24)     |
| E2E (full)       | `pnpm test:e2e`           | all pass             |
| Dev server       | `pnpm dev`                | boots, routes render |
| Build            | `pnpm build`              | exit 0               |
| Typecheck timing | `time pnpm typecheck`     | see Step 8           |

## Scope

**In scope**:

- New `<module>/module.ts` + `<module>/tokens.ts` per domain module and for
  the shared kernel
- `src/app/build-app.ts` — rewritten as module installation
- `src/app/app-deps.ts` — retired or reduced to the read-view type
- `src/app/wire-queries.ts` — retired (see "Ordering vs plan 009")
- `src/app/testing/build-test-app.ts`, `build-integration-test-app.ts` —
  rewritten as adapter-binding overrides
- `src/app/instance.ts` — returns the container
- Every server function in `src/app/fns/` — `app.x` → `app.resolve(XToken)`
- `docs/architecture.md` — the "Composition root tour" section
- `AGENTS.md` — rules 9 and the composition-root guidance

**Out of scope** (do NOT touch):

- The **shape** of the query layer. `wireQueries` becomes a module, but the
  11 query functions and their signatures are unchanged. Replacing the query
  tree with a QueryBus is plan 009.
- Domain logic, entities, commands, repositories, SQL, migrations.
- The event bus and subscriber mechanics. Plan 008 owns those; this plan only
  moves _where they are constructed_.
- Adding request scopes. Plan 007 introduces the first scoped binding; this
  plan registers everything as singleton.
- Converting adapter classes to factories.

**Ordering vs plan 009**: 009 replaces `AppDeps['queries']` with a QueryBus.
Doing 005 first and 009 second means the query module gets rewritten twice.
That is accepted and correct — 005 must not be blocked on 009, and the second
rewrite is small because 005 already isolated queries into one module.

## Git workflow

- Branch: `advisor/005-di-composition-root-migration`
- **One commit per step.** This is the largest diff in the set; a reviewer
  needs to see "shared module extracted" separately from "server functions
  migrated".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tokens, next to their ports

Declare each token in the file that defines the port it injects — the token is
part of the port's contract, and co-locating avoids a token registry that
would itself become a god file (and would trip `barrel-files/avoid-barrel-files`).

```ts
// src/shared/time/clock.ts  (append)
import { token } from '@/shared/di/token';
export const ClockToken = token<Clock>()('shared.clock');
```

Tokens needed, matching today's `AppDeps` members:

| Key                             | Type                          |
| ------------------------------- | ----------------------------- |
| `shared.config`                 | `Config`                      |
| `shared.clock`                  | `Clock`                       |
| `shared.logger`                 | `Logger`                      |
| `shared.feature-flags`          | `FeatureFlags`                |
| `shared.database`               | `Database`                    |
| `shared.event-bus`              | `EventBus<InvoicingEventMap>` |
| `shared.outbox`                 | `Outbox<InvoicingEventMap>`   |
| `clients.repository`            | `ClientRepository`            |
| `invoicing.repository`          | `InvoiceRepository`           |
| `invoicing.pdf-generator`       | `PdfGenerator`                |
| `invoicing.notification-sender` | `NotificationSender`          |
| `reporting.revenue-read-model`  | `RevenueReadModel`            |

⚠️ `local/filename-matches-export` requires each file to export a symbol
matching its basename. Appending `ClockToken` to `clock.ts` is fine — `Clock`
already matches. But check files where the port name and filename relationship
is looser before appending.

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps` → exit 0. No behavior
change yet; nothing consumes these.

### Step 2: The shared-kernel module

Create `src/shared/shared-module.ts`:

```ts
export const sharedModule = defineModule<{}, SharedBindings>('shared', (c) =>
  c
    .provideSingleton(ConfigToken, [], () => new EnvConfig())
    .provideSingleton(ClockToken, [], () => new SystemClock())
    .provideSingleton(LoggerToken, [], () => new ConsoleLogger())
    .provideSingleton(FeatureFlagsToken, [ConfigToken], (config) => new ConfigFeatureFlags(config))
    .provideSingleton(DatabaseToken, [ConfigToken, LoggerToken], (config, logger) => {
      /* ... */
    })
    .provideSingleton(EventBusToken, [], () => new InProcessEventBus<InvoicingEventMap>())
    .provideSingleton(OutboxToken, [DatabaseToken], (db) => new SqliteOutbox(db)),
);
```

⚠️ **Two things must not be lost from `createDatabase`:**

1. The migration run, including the `import.meta.dirname ?? process.cwd()`
   fallback comment about Turbopack builds. Port it verbatim.
2. `runMigrations` is a side effect inside a factory. That is acceptable
   (the DB is not usable without it) but it means resolving `DatabaseToken`
   has an observable side effect. Comment it explicitly — a lazily-resolved
   container makes "when do migrations run?" a real question that the eager
   `buildApp` never raised.

**Dependency-cruiser check**: `src/shared/shared-module.ts` imports
`SqliteOutbox` and `SqliteDatabase`, which live in `src/shared/`, so no
cross-module adapter rule applies. But confirm plan 004's `di-is-a-leaf` rule
does not accidentally cover this file — it should scope to `src/shared/di/`
only.

**Verify**: `pnpm typecheck && pnpm deps` → exit 0.

### Step 3: Domain modules

Create `src/clients/clients-module.ts`, `src/invoicing/invoicing-module.ts`,
`src/reporting/reporting-module.ts`. Each declares its requirements in
`defineModule`'s `TRequires`, which plan 004 verified is compile-checked at
`install` time:

```ts
export const invoicingModule = defineModule<
  { 'shared.database': Database; 'shared.config': Config; 'shared.logger': Logger },
  {
    'invoicing.repository': InvoiceRepository;
    'invoicing.pdf-generator': PdfGenerator;
    'invoicing.notification-sender': NotificationSender;
  }
>('invoicing', (c) =>
  c
    .provideSingleton(InvoiceRepoToken, [DatabaseToken], (db) => new SqliteInvoiceRepo(db))
    .provideSingleton(PdfGeneratorToken, [ConfigToken], (config) =>
      config.get('PDF_GENERATOR') === 'pdfkit' ? new PdfKitGenerator() : new StubPdfGenerator(),
    )
    .provideSingleton(
      NotificationSenderToken,
      [LoggerToken],
      (logger) => new ConsoleNotificationSender(logger),
    ),
);
```

⚠️ **Module boundary rule**: `no-invoicing-into-other-adapters` forbids
`src/invoicing/**` from importing `src/clients/adapters/` or
`src/reporting/adapters/`. A module file registering its **own** adapters is
fine. Do not let a module register another module's adapters — that is exactly
what the rule exists to prevent, and `pnpm deps` will catch it.

**Verify**: `pnpm typecheck && pnpm deps` → exit 0.

### Step 4: Queries and subscribers as modules

**Queries** — move `wireQueries`'s body into
`src/app/queries-module.ts`, registering the tree under a single
`QueriesToken` typed as today's `AppDeps['queries']`:

```ts
export const queriesModule = defineModule<QueriesRequires, { 'app.queries': AppQueries }>(
  'queries',
  (c) =>
    c.provideSingleton(
      QueriesToken,
      [ClientRepoToken, InvoiceRepoToken, RevenueReadModelToken],
      (clientRepo, invoiceRepo, revenueReadModel) =>
        wireQueries({ clientRepo, invoiceRepo, revenueReadModel }),
    ),
);
```

Keep `wireQueries` as a plain function for now — a single-token registration is
the smallest change that gets queries into the container, and plan 009
dissolves it properly. Lift `AppQueries` out of `app-deps.ts` into its own
module so `app-deps.ts` can be retired.

**Subscribers** — `registerSubscribers` returns an unsubscribe thunk, which
does not fit `provideSingleton`'s value semantics. Register a
`SubscriptionsToken` whose value is `{ dispose(): void }`, so the container's
disposal protocol (plan 004 Step 2) tears subscribers down automatically and
`AppDeps.unsubscribe` disappears entirely:

```ts
.provideSingleton(SubscriptionsToken,
  [EventBusToken, RevenueReadModelToken, NotificationSenderToken, InvoiceRepoToken, ClientRepoToken, LoggerToken, ClockToken],
  (...deps) => ({ [Symbol.dispose]: registerSubscribers({ /* ... */ }) }))
```

⚠️ **Subscribers only register when something resolves `SubscriptionsToken`.**
Today `buildApp` registers them eagerly. Lazy resolution would silently break
event delivery — a whole class of missing-notification bugs. Step 5 must
resolve `SubscriptionsToken` eagerly during `buildApp`. This is the single
most likely way to break this migration; `register-subscribers.test.ts` and
the e2e invoice-lifecycle spec are your detectors.

The cross-module `getClient` binding (invoicing's notification subscriber
needs a clients query) stays as it is today — a closure over `ClientRepoToken`
constructed in the app layer, which is the layer permitted to know both
modules.

**Verify**: `pnpm typecheck && pnpm deps` → exit 0.

### Step 5: Rewrite `buildApp`

```ts
export function buildApp(): AppContainer {
  const container = createContainer()
    .install(sharedModule)
    .install(clientsModule)
    .install(invoicingModule)
    .install(reportingModule)
    .install(queriesModule)
    .install(subscribersModule);

  // Eager: subscribers must be live before any command runs.
  container.resolve(SubscriptionsToken);

  // Startup crash recovery — fire and forget, must not block boot.
  const outbox = container.resolve(OutboxToken);
  const eventBus = container.resolve(EventBusToken);
  const logger = container.resolve(LoggerToken);
  void outbox.drain(...).catch(...);

  return container;
}

export type AppContainer = ReturnType<typeof buildApp>;
```

⚠️ Preserve the startup outbox drain **exactly**, including its
fire-and-forget semantics and both error handlers. It is crash-recovery
behavior added deliberately by a prior plan (commit `80e3b84`) and it is not
covered by a fast unit test — losing it would be silent.

Delete `buildApp`'s `Partial<AppDeps>` overrides parameter. Its replacement is
`.override()` (Step 7) plus module swapping.

**Verify**: `pnpm typecheck` → exit 0. `pnpm vitest run src/app/build-app.test.ts`
→ passes after mechanical updates. `pnpm dev` → app boots and routes render.

### Step 6: `instance.ts` and the read surface

```ts
export const getAppInstance = createServerOnlyFn((): AppContainer => {
  /* memoized */
});
export const getAppReadView = createServerOnlyFn((): AppReadContainer => getAppInstance());
```

where `AppReadContainer` is a container type narrowed to exactly the query,
feature-flag, and clock bindings.

**This step is the whole reason the plan has a STOP condition.** Verify the
guarantee with a live compile-time test, not by inspection. Add to
`src/app/app-read-view.type-test.ts`:

```ts
// @ts-expect-error query server functions must not reach the invoice repository
getAppReadView().resolve(InvoiceRepoToken);
// @ts-expect-error query server functions must not reach the event bus
getAppReadView().resolve(EventBusToken);
// @ts-expect-error query server functions must not reach the database
getAppReadView().resolve(DatabaseToken);
```

`pnpm typecheck` passing proves all three errors are live (an unused
`@ts-expect-error` is itself an error).

Keep `setAppInstanceForTesting` — `handlers.test.ts` depends on it.

**Verify**: `pnpm typecheck` → exit 0. Delete one `@ts-expect-error` and
confirm typecheck **fails**; restore it.

### Step 7: Test builders

`buildTestApp` becomes the same module graph with adapter bindings overridden:

```ts
export function buildTestApp(overrides: TestOverrides = {}): TestAppResult {
  const container = createContainer()
    .install(sharedTestModule) // InMemoryConfig, FixedClock, CapturingLogger, InMemoryFeatureFlags, STUB_DB, InMemoryOutbox
    .install(clientsTestModule); // InMemoryClientRepo
  // ...
  container.resolve(SubscriptionsToken);
  return {
    container,
    capturing: {
      notifications: container.resolve(NotificationSenderToken) as CapturingNotificationSender,
    },
  };
}
```

Two viable structures — **pick one and apply it uniformly**:

- **(a) Parallel test modules** — `sharedTestModule` etc. Explicit, but
  duplicates the module list, which is the drift this plan is fixing.
- **(b) One module set, adapters overridden** — install the production modules
  then `.override(...)` each adapter. No duplication; relies on `override`
  being sound and rejects any binding the test forgets to swap only at
  runtime.

**Recommendation: (b).** It is the structure that makes drift impossible, and
plan 004 type-checks `override`'s value against the token. If (b) proves
unworkable — e.g. because production factories have side effects that fire
before the override lands (the migration run in `DatabaseToken` is the
candidate) — fall back to (a) and record why in the file header.

`buildIntegrationTestApp` overrides the four SQLite bindings over `setupDb()`
and returns `teardown`. Its `teardown` and the container's `[Symbol.dispose]`
now overlap — make `teardown` call dispose then close the DB, and document the
order.

`FixedClock(new Date('2026-04-13T00:00:00Z'))` and
`InMemoryFeatureFlags({ lateFees: false })` must keep their exact current
values; several tests depend on both.

**Verify**: `pnpm vitest run src` → all pass. Any test needing a **changed
assertion** (not just changed accessor syntax) is a STOP condition.

### Step 8: Server functions, then docs

Mechanically update the 13 files in `src/app/fns/`: `app.invoiceRepo` →
`app.resolve(InvoiceRepoToken)`, etc. Do it in one commit — it is a large but
entirely mechanical diff, and mixing it with judgement work hides both.

Consider a local helper in command fns to avoid five `resolve` calls per
handler:

```ts
const [db, repo, outbox, eventBus, logger] = [DatabaseToken, InvoiceRepoToken, OutboxToken, EventBusToken, LoggerToken].map(...)
```

— but only if it stays fully typed. An untyped tuple helper trades the
guarantee this plan exists to provide for brevity. If it cannot be typed
cleanly, write the five calls.

Then delete `src/app/app-deps.ts` (or reduce it to the read-view type) and
`src/app/wire-queries.ts`'s app-layer wiring if fully absorbed.

Update `docs/architecture.md`'s "Composition root tour" to describe module
installation, and its "How to add a new feature" recipe — steps 4 and 5
currently instruct editing `app-deps.ts` and `wire-queries.ts`, which will no
longer exist. Update AGENTS.md rule 9 to describe the narrowed container type
instead of `AppReadView`.

Finally, run `time pnpm typecheck` and compare against the pre-migration
baseline. The container's accumulated type is large; if typecheck time more
than doubles, report it.

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → exit 0.
`pnpm build` → exit 0. `pnpm test:e2e` → all pass. `pnpm dev` → boot, create a
client, create an invoice, send it, record a payment, check the reporting page.

## Test plan

- **No new behavioral tests.** This plan is a pure restructuring; every
  existing test is the contract. That is the point — if the suite passes
  unchanged in _meaning_, the migration is correct.
- **Two new compile-time tests**: `src/app/app-read-view.type-test.ts`
  (Step 6, three `@ts-expect-error` cases) and a case asserting a module with
  unmet requirements fails to `install`.
- Existing tests may need **mechanical** updates (accessor syntax, builder
  return shape). They must **not** need changed assertions.
- **The e2e suite is the real gate.** Subscriber registration, outbox drain,
  and migration timing are the three things unit tests will not catch and the
  container's laziness could plausibly break. Run the full `pnpm test:e2e`,
  not just `test:e2e:critical`.
- Add one integration test asserting **subscribers are live immediately after
  `buildApp()`** without anything else being resolved first — the specific
  laziness regression Step 4 warns about.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `pnpm build` exits 0; `pnpm test:e2e` fully passes
- [ ] `pnpm dev` — full manual flow works (client → invoice → send → pay → reporting)
- [ ] `getAppReadView().resolve(InvoiceRepoToken)` is a **compile error**, pinned
      by a live `@ts-expect-error` (spot-checked by deleting it)
- [ ] Subscribers are live immediately after `buildApp()`, pinned by a test
- [ ] Startup outbox drain preserved with both error handlers intact
- [ ] Migrations still run exactly once at startup
- [ ] `src/app/app-deps.ts` deleted or reduced to the read-view type
- [ ] Adding a new dependency touches **one** file (demonstrate in the PR
      description with a concrete worked example)
- [ ] `docs/architecture.md` and `AGENTS.md` updated, including the
      "How to add a new feature" recipe
- [ ] `time pnpm typecheck` before/after recorded
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **The read-surface guarantee cannot be preserved at compile time.** Do not
  ship a convention-only version. This is the hard stop.
- Any existing test needs a **changed assertion** rather than a mechanical
  accessor update.
- `pnpm typecheck` time more than doubles. A container whose type does not
  scale to ~14 bindings will not scale to plan 009's bus, and that is worth
  knowing before 009 starts.
- Lazy resolution changes observable startup behavior in a way you cannot fix
  with an eager `resolve` — e.g. migrations running at first query instead of
  at boot, or the outbox drain racing subscriber registration.
- Option (b) in Step 7 fails because a production factory's side effect fires
  before the override applies. Report it and fall back to (a); do not paper
  over it by reordering side effects.
- The diff for Step 8 exceeds ~25 files. Planning expected ~13 server
  functions plus the builders; substantially more means the container reaches
  further into the app than intended.

## Maintenance notes

- **Plan 009 rewrites `queriesModule`.** The single-token `AppQueries`
  registration here is deliberately a placeholder. Do not invest in making it
  elegant.
- **Plan 007 adds the first `provideScoped` binding.** Everything here is
  singleton; that is correct for now.
- Once this lands, the "How to add a new feature" recipe in
  `docs/architecture.md` becomes genuinely shorter. Make sure the updated
  recipe reflects that — an unchanged recipe after this plan means the
  migration did not actually deliver its benefit.
- Reviewer: read Step 4 and Step 6 closely. Everything else is mechanical.
  Step 4 is where event delivery can silently break, and Step 6 is where the
  repo's most-explained invariant lives.
