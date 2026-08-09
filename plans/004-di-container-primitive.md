# Plan 004: A lightweight, fully-inferred DI container (`src/shared/di/`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. This plan is
> purely additive — it creates `src/shared/di/` and touches nothing else. If
> `src/shared/di/` already exists, STOP.
>
> **Environment check (run first)**: `node --version` → `v24.x`,
> `npx tsc --version` → `6.0.2` or later.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: LOW — zero production code changes; the risk is design risk, and
  the core type design has been prototyped and verified (see "Validated design")
- **Depends on**: —
- **Category**: architecture / DX
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

The repo has inversion of control but no dependency injection. Everything is
centralised into a single `AppDeps` interface (`src/app/app-deps.ts`, 15
top-level members plus a nested `queries` tree of 11 methods) constructed by a
single 170-line `buildApp()` and duplicated wholesale by `buildTestApp()`.

Concretely, adding one dependency today means editing:

1. `src/app/app-deps.ts` — the interface
2. `src/app/build-app.ts` — the production factory
3. `src/app/testing/build-test-app.ts` — the test factory
4. `src/app/wire-queries.ts` — if it is a query

Four files, in lockstep, for one dependency. And because overrides are
`Partial<AppDeps>` threaded through five private sub-factories
(`createInfrastructure`, `createDatabase`, `createRepositories`,
`createAdapters`, `createEventingAndSubscribers`), every one of those takes the
whole `overrides` bag and reaches into it — the sub-factories are coupled to
the god object, not to their own inputs.

That is what "doesn't scale" means here. It is not that the graph is large; it
is that the graph has **no structure the compiler knows about**. There is no
way to say "the reporting module needs a `Database` and a `Logger` and
provides a `RevenueReadModel`" and have that checked.

**Why not a third-party container**: every mainstream TypeScript DI library
(tsyringe, InversifyJS, typed-inject's decorator path) depends on decorators
plus `emitDecoratorMetadata` — non-standard TypeScript that plan 001's
`erasableSyntaxOnly` flag makes a compile error, and that the maintainer has
ruled out. inferdi avoids decorators and gets the type story right, but ships
a wider surface than this repo needs: async resolution with promise
deduplication, `Lazy<T>` companions for cycle-breaking, a transient lifetime,
and strict/fast runtime modes. This plan takes inferdi's two genuinely load-
bearing ideas — **compile-time lifetime safety** and **`.override()` for
tests** — and drops the rest.

## Validated design

The type machinery below was prototyped against TypeScript 6.0.2 with
`--strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess` before this
plan was written. **All six negative cases error and all positive cases
compile.** Treat it as a verified starting point, not a sketch.

```ts
// src/shared/di/token.ts
declare const TypeTag: unique symbol;

export interface Token<TKey extends string = string, T = unknown> {
  readonly key: TKey;
  readonly [TypeTag]?: T; // phantom — never present at runtime
}

/**
 * Curried because TypeScript has no partial type-argument inference: we need
 * to specify T explicitly while inferring TKey as a literal.
 *   export const ClockToken = token<Clock>()('shared.clock');
 */
export function token<T>() {
  return <const TKey extends string>(key: TKey): Token<TKey, T> => ({ key });
}
```

```ts
// src/shared/di/container.ts
type Bindings = Record<string, unknown>;
type Keys<T extends Bindings> = Extract<keyof T, string>;
type Resolved<TDeps extends readonly Token[]> = {
  [I in keyof TDeps]: TDeps[I] extends Token<string, infer T> ? T : never;
};

export interface Container<TB extends Bindings = {}, TScopedKeys extends string = never> {
  provideSingleton<
    TKey extends string,
    T,
    const TDeps extends readonly Token<Exclude<Keys<TB>, TScopedKeys>, unknown>[],
  >(
    tok: Token<TKey, T>,
    deps: TDeps,
    factory: (...args: Resolved<TDeps>) => T,
  ): Container<TB & { [K in TKey]: T }, TScopedKeys>;

  provideScoped<TKey extends string, T, const TDeps extends readonly Token<Keys<TB>, unknown>[]>(
    tok: Token<TKey, T>,
    deps: TDeps,
    factory: (...args: Resolved<TDeps>) => T,
  ): Container<TB & { [K in TKey]: T }, TScopedKeys | TKey>;

  install<TReq extends Bindings, TOut extends Bindings, TOutScoped extends string>(
    this: TB extends TReq ? Container<TB, TScopedKeys> : never,
    mod: Module<TReq, TOut, TOutScoped>,
  ): Container<TB & TOut, TScopedKeys | TOutScoped>;

  override<TKey extends Keys<TB>>(
    tok: Token<TKey, TB[TKey]>,
    value: TB[TKey],
  ): Container<TB, TScopedKeys>;

  resolve<TKey extends Exclude<Keys<TB>, TScopedKeys>>(tok: Token<TKey, TB[TKey]>): TB[TKey];

  createScope(): Scope<TB>;
  [Symbol.dispose](): void;
}
```

```ts
// src/shared/di/module.ts
export interface Module<
  TRequires extends Bindings,
  TProvides extends Bindings,
  TScoped extends string = never,
> {
  readonly name: string;
  readonly register: (c: Container<TRequires>) => Container<TRequires & TProvides, TScoped>;
}

export function defineModule<
  TRequires extends Bindings,
  TProvides extends Bindings,
  TScoped extends string = never,
>(
  name: string,
  register: Module<TRequires, TProvides, TScoped>['register'],
): Module<TRequires, TProvides, TScoped>;
```

### What the compiler catches (all verified)

| Mistake                                                        | Result                                           |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Depending on an unregistered token                             | ✅ error                                         |
| Swapping two dependencies' positions in the `deps` tuple       | ✅ error — factory params are positionally typed |
| A **singleton** depending on a **scoped** binding              | ✅ error — `Exclude<Keys<TB>, TScopedKeys>`      |
| Resolving a **scoped** binding from the **root** container     | ✅ error                                         |
| `install`ing a module whose requirements are unmet             | ✅ error — via the `this`-type constraint        |
| `override` with a value that does not satisfy the token's type | ✅ error                                         |
| Resolving a token absent from a **narrowed** container type    | ✅ error — this is what preserves `AppReadView`  |

That last row is the one to protect above all others (see plan 005).

### Deliberately excluded

- **Async resolution.** The entire graph is synchronous (better-sqlite3 is
  sync). Async would add promise caching, in-flight deduplication, and
  `await using` semantics for zero current benefit.
- **`transient` lifetime.** No consumer. Two lifetimes keep the
  `Exclude<>` rule to a single, readable constraint.
- **`Lazy<T>` companions.** They exist to break cycles; `import-x/no-cycle`
  already forbids cycles.
- **Strict/fast runtime modes.** Always strict. This is a demo repo; a
  throughput knob is noise.

Record these in an ADR (Step 8) so the next review does not re-propose them.

## Current state

- `src/shared/di/` does not exist.
- Nothing in the repo imports a DI container.
- `src/shared/` is the shared kernel; dependency-cruiser rule
  `no-shared-into-app` already forbids it from importing `src/app/`, and
  `no-framework-outside-app` forbids TanStack imports. The container inherits
  both, correctly.
- Existing conventions the new directory must satisfy: kebab-case filenames
  matching a named export (`local/filename-matches-export`), no default
  exports, no barrel files, and — once plan 001 lands — no parameter
  properties.

## Commands you will need

| Purpose    | Command                         | Expected on success |
| ---------- | ------------------------------- | ------------------- |
| Typecheck  | `pnpm typecheck`                | exit 0              |
| Lint       | `pnpm lint`                     | exit 0              |
| Dep rules  | `pnpm deps`                     | exit 0              |
| DI suite   | `pnpm vitest run src/shared/di` | all pass            |
| Full suite | `pnpm test`                     | exit 0 (Node 24)    |

## Scope

**In scope** — new files only:

- `src/shared/di/token.ts` + test
- `src/shared/di/container.ts` (types + `createContainer`) + test
- `src/shared/di/module.ts` (`defineModule`) + test
- `src/shared/di/container-errors.ts`
- `src/shared/di/di.type-test.ts` — compile-time negative tests
- `docs/adr/0002-di-container-scope.md`
- `AGENTS.md` — a short section on the container

**Out of scope** (do NOT touch):

- **Any existing file other than `AGENTS.md`.** No `app-deps.ts`, no
  `build-app.ts`, no adapters. Migration is plan 005 and mixing them makes
  both unreviewable.
- Registering real application dependencies. Tests use local fixture
  interfaces, not `Clock`/`Logger`/`InvoiceRepository`.
- Async, transient, `Lazy`, strict/fast modes — see "Deliberately excluded".

## Git workflow

- Branch: `advisor/004-di-container-primitive`
- Commits: `feat: add DI token primitive`,
  `feat: add DI container with singleton and scoped lifetimes`,
  `feat: add DI modules`, `test: pin DI container type-level guarantees`,
  `docs: ADR for DI container scope`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tokens

Create `src/shared/di/token.ts` with the `Token` interface and curried
`token<T>()` factory exactly as given in "Validated design".

Two notes for the implementation:

- The phantom property must be **optional and covariant** (`readonly [TypeTag]?: T`).
  This is what makes `Token<'k', Clock>` assignable to `Token<'k', unknown>`,
  which the `deps` tuple constraint relies on. Do not make it a method or a
  function-typed property — that flips variance and breaks the constraint.
- Under `exactOptionalPropertyTypes` some mismatches surface as TS2379 rather
  than TS2322. Both are errors; the type tests in Step 5 should assert _that_
  an error occurs, not which code.

Key naming convention: `'<module>.<name>'`, e.g. `'shared.clock'`,
`'invoicing.invoice-repo'`. The string is the runtime map key and the
type-level identity, so collisions across modules are real. Document the
convention in the file header.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 2: Container runtime

Create `src/shared/di/container.ts`. The interface is given above; this step
is the implementation behind `createContainer()`.

Runtime shape — a persistent registration map plus a resolution cache:

- Registrations: `Map<string, { deps: readonly string[]; factory: (...a: unknown[]) => unknown; lifetime: 'singleton' | 'scoped' }>`.
- `provideSingleton`/`provideScoped` return a **new** container object sharing
  the same registration map, or copy it — pick one and document it. Copying is
  safer (no aliasing surprises when a builder is reused); sharing is cheaper.
  Given the graph size here, **copy**.
- `resolve` on the root: singleton instances cached in a root-level `Map`.
  Resolving a scoped key from the root throws `ScopedResolutionError` at
  runtime as well as erroring at compile time — belt and braces, because a
  narrowed container type can be defeated by an `any` at the boundary.
- **Duplicate registration throws** `DuplicateRegistrationError`. `override` is
  the sanctioned way to replace a binding. (The compile-time type does not
  prevent re-registering the same key — `TB & { [K in TKey]: T }` happily
  narrows — so this check must exist at runtime.)
- **Cycle detection**: maintain a resolution stack; on re-entry throw
  `CircularDependencyError` naming the full cycle path. Cheap and it turns a
  stack overflow into a readable message.
- `[Symbol.dispose]()`: for each cached instance created by this container, if
  it exposes `[Symbol.dispose]` or a `close()` method, call it in **reverse
  creation order**; collect failures and throw a single `AggregateError`. This
  mirrors the existing `InProcessEventBus.publish` error strategy, which the
  repo has already settled on. Requires `esnext.disposable` in tsconfig `lib`
  — check whether the current `["ES2024", "DOM", "DOM.Iterable"]` already
  provides `Symbol.dispose`; if not, add it and note the change.
- After dispose, further `resolve`/`provide` calls throw `DisposedContainerError`.

Errors go in `src/shared/di/container-errors.ts`. These are **infrastructure**
failures — misconfiguration of the object graph — so they throw rather than
returning `Result`, consistent with AGENTS.md rule 1. Say so in a comment;
otherwise the next reviewer will flag it.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 3: Scopes

Implement `createScope()` returning `Scope<TB>`:

- `scope.resolve(tok)` resolves scoped bindings into a scope-local cache;
  singleton bindings delegate to the parent's cache (created once, shared).
- A scope's own `[Symbol.dispose]()` disposes only **its** instances, never
  the parent's.
- Disposing the root disposes any still-live child scopes, then its own
  singletons.

Scope exists for one concrete future consumer: plan 007's per-request
`MessageContext` (correlation ID, request ID, traceparent). Note that in the
file header so its purpose is not a mystery until 007 lands.

**Verify**: `pnpm vitest run src/shared/di` → the tests from Step 4 pass.

### Step 4: Runtime tests

`src/shared/di/container.test.ts` — use local fixture interfaces, not real app
ports:

- Resolves a value with no dependencies.
- Resolves a value with dependencies, in the right positional order.
- **Singletons are created exactly once** — assert with a call counter, not
  just reference equality.
- Scoped bindings: one instance per scope, different across two scopes,
  shared within one scope.
- A scoped binding depending on a singleton gets the same singleton instance
  in every scope.
- Resolving a scoped key from the root throws `ScopedResolutionError`.
- Duplicate registration throws `DuplicateRegistrationError`.
- Circular dependency throws `CircularDependencyError` with all cycle members
  named in the message.
- `override` replaces the binding and is not cached from a prior resolution.
- Dispose: reverse creation order (assert the exact order with a shared log
  array), errors aggregated into one `AggregateError`, post-dispose calls
  throw.
- Disposing a scope leaves parent singletons usable.

`src/shared/di/module.test.ts`:

- `install` registers everything the module provides.
- Installing two modules where the second depends on the first's bindings
  resolves correctly.
- A module's scoped bindings stay scoped after `install` (i.e. `TOutScoped`
  propagates — verify by asserting the root-resolution throw).

**Verify**: `pnpm vitest run src/shared/di` → all pass.

### Step 5: Compile-time (type-level) tests

This is the most important test file in the plan, because the container's
value **is** its type behavior — a runtime test cannot demonstrate that the
wrong wiring fails to compile.

Create `src/shared/di/di.type-test.ts` covering all seven rows of the "What
the compiler catches" table. Each negative case gets a
`@ts-expect-error` with a description of at least 10 characters (plan 002's
`ban-ts-comment` config requires one; write one regardless):

```ts
// @ts-expect-error a singleton may not depend on a scoped binding
const bad = c.provideSingleton(FooToken, [RequestCtxToken], (ctx) => makeFoo(ctx));
```

`@ts-expect-error` is self-verifying in both directions: if the error stops
occurring, `tsc` fails on the unused directive. That is exactly the property
this file needs.

Also add positive assertions with Vitest's `expectTypeOf` (or a local
`assertType` helper) that `resolve` returns the precise type, not `unknown`.

Naming: `di.type-test.ts` — must be included by `tsconfig.json` (it is, via
`"include": ["src", ...]`) but should **not** be picked up as a Vitest suite.
Check `vitest.config.ts`'s `include` pattern; if `*.type-test.ts` would match,
rename to something outside it. Also confirm `local/filename-matches-export`
and `check-file/filename-naming-convention` accept the name — if not, use
`di-type.test.ts` with a single `it('typechecks')` body and let `tsc` do the
real work.

**Verify**: `pnpm typecheck` → exit 0 (proving every `@ts-expect-error` is
live). Then temporarily delete one `@ts-expect-error` and confirm
`pnpm typecheck` **fails** — this proves the file is load-bearing rather than
decorative. Restore it.

### Step 6: A worked example in the tests

Add `src/shared/di/module.example.test.ts` (or a `describe` block in
`module.test.ts`) that builds a small three-module graph — infrastructure →
persistence → domain — including one scoped binding, and resolves through it.
Roughly 40 lines.

Purpose: plan 005's executor needs a template for what a real module looks
like before restructuring `buildApp`. A test is a better template than a
doc comment because it cannot go stale.

**Verify**: `pnpm vitest run src/shared/di` → all pass.

### Step 7: Guard the boundary

Add a dependency-cruiser rule so the container stays a leaf:

```js
{
  name: 'di-is-a-leaf',
  severity: 'error',
  comment: 'The DI container is a primitive. It must not depend on app code, domain modules, or any other shared subsystem.',
  from: { path: '^src/shared/di/', pathNot: '\\.test\\.ts$' },
  to: { pathNot: ['^src/shared/di/', '^node_modules'] },
}
```

Verify the `to.pathNot` form behaves as intended against this repo's
dependency-cruiser version (17.x) — if the negation does not work as written,
express it as an explicit `to.path` list of everything forbidden
(`^src/app/`, `^src/(clients|invoicing|reporting)/`, `^@tanstack/`).

**Verify**: `pnpm deps` → exit 0. Then temporarily add
`import type { Clock } from '@/shared/time/clock';` to `container.ts` and
confirm `pnpm deps` **fails**. Remove it.

### Step 8: Document

- `docs/adr/0002-di-container-scope.md` — following the tone of ADR-0001
  (which is written to stop future reviews re-litigating a settled decision).
  Record: why not a third-party container (decorators vs `erasableSyntaxOnly`);
  why two lifetimes and not three; why sync-only; why no `Lazy`; and that
  **the narrowed-container-type guarantee is what replaces `AppReadView`'s
  compile-time enforcement**, so any future change that weakens `resolve`'s
  key constraint breaks a load-bearing invariant.
- `AGENTS.md` — a short "Dependency injection" section: tokens are declared
  next to the port they inject; keys are `'<module>.<name>'`; modules declare
  requires/provides; singletons cannot depend on scoped bindings; `override`
  is test-only.

**Verify**: `pnpm format && pnpm typecheck && pnpm lint && pnpm deps && pnpm test`
→ all exit 0.

## Test plan

Summarised from Steps 4–6:

- `container.test.ts` — ~12 runtime cases (lifetimes, caching, errors, disposal)
- `module.test.ts` — ~3 install cases plus the worked three-module example
- `token.test.ts` — key identity; two tokens with the same key but different
  types are distinguishable at the type level and collide at runtime (pin the
  collision behavior explicitly, since the key is the runtime identity)
- `di.type-test.ts` — 7 `@ts-expect-error` negative cases + `expectTypeOf`
  positives

Coverage bar: every error class in `container-errors.ts` must be constructed by
at least one test. An error type with no test is an error type nobody has
checked the message of.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `src/shared/di/` contains token, container, module, errors, and tests
- [ ] All 7 rows of the "What the compiler catches" table have a live
      `@ts-expect-error` case
- [ ] Deleting any one `@ts-expect-error` makes `pnpm typecheck` fail (spot-checked)
- [ ] Adding an import of `@/shared/time/clock` to `container.ts` makes
      `pnpm deps` fail (spot-checked, then reverted)
- [ ] Singleton-created-once asserted with a counter, not reference equality
- [ ] Dispose order asserted explicitly (reverse creation), failures aggregated
- [ ] **Zero changes to files outside `src/shared/di/`, `.dependency-cruiser.cjs`,
      `docs/adr/`, and `AGENTS.md`**
- [ ] `docs/adr/0002-di-container-scope.md` exists
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `install` `this`-type constraint does not reject an unmet-requirements
  module in your TypeScript version. This was verified on 6.0.2; if it
  regresses, report it — the fallback (a `TB extends TReq ? Module<...> : never`
  constraint on the _parameter_ instead of `this`) produces worse error
  messages and should be a deliberate choice, not a silent one.
- Type inference degrades as the container type grows — e.g. a 20-binding
  chain makes `resolve` return `unknown`, or `tsc` time increases sharply.
  Measure `pnpm typecheck` duration against a 20-binding fixture **before**
  plan 005 starts migrating; a container that does not scale to the real graph
  must be found now, not mid-migration.
- You find yourself wanting async resolution, `transient`, or `Lazy` to make
  the tests pass. That means the design is wrong for a reason worth
  discussing, not a feature to quietly add.
- `Symbol.dispose` is unavailable under the repo's `lib` setting and adding
  `esnext.disposable` breaks any existing typecheck. Report rather than
  falling back to a bespoke `dispose()` method name — consistency with the
  language protocol matters more than shipping this step.
- The type-level test file cannot be made to satisfy both `vitest`'s include
  pattern and the repo's filename lint rules. Report the constraint; do not
  disable the lint rules to make it fit.

## Maintenance notes

- **Plan 005 migrates onto this and is where the real risk lives.** The single
  most important thing this plan hands 005 is the narrowed-container-type
  guarantee (row 7). If 005 cannot preserve `AppReadView`'s compile-time
  enforcement with it, 005 stops — it does not widen the surface.
- **Plan 007 is the first consumer of `provideScoped`**, for per-request
  message context. If scopes turn out to be unused after 007, that is a signal
  to delete them, not to find work for them.
- The `'<module>.<name>'` key convention is the only thing preventing runtime
  collisions between modules. If the graph grows enough that this feels
  fragile, the upgrade path is `unique symbol` keys — significantly more
  verbose, and not worth it until a collision actually happens.
- Reviewer: the runtime is the easy part. Spend your attention on
  `di.type-test.ts` and on whether the `Exclude<Keys<TB>, TScopedKeys>`
  constraint is intact in both `provide` signatures. That constraint is the
  whole lifetime-safety story and it is one careless edit from becoming a
  no-op that still compiles.
