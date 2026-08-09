# Plan 003: Domain kit — one convention for value objects and branded IDs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. Confirm the
> "Current state" excerpts of `email-address.ts`, `tax-rate.ts`,
> `due-date.ts`, `year-month.ts`, and `id.ts` match the live files.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED — additive kit plus mechanical migration; the one real
  behavior change is `parseId` going from throwing to returning `Result`
- **Depends on**: — (but see "Ordering" below)
- **Category**: domain modeling / types
- **Planned at**: commit `a9b67eb`, 2026-08-09

**Ordering**: independent of 001/002, but the plans README sequences it after
them so the kit is authored under the stricter compiler and linter. If you are
running 003 first, that is fine — just expect plan 002 to touch these files
again.

## Why this matters

The repo has **five different conventions for "a validated primitive"**, and
none of them is enforced:

| Type           | Brand style                    | Schema                               | Parser                               |
| -------------- | ------------------------------ | ------------------------------------ | ------------------------------------ |
| `EmailAddress` | `string & { __brand: '…' }`    | `.transform(v => v as EmailAddress)` | `emailAddress()` → `Result`          |
| `TaxRate`      | `number & { __brand: '…' }`    | `.transform(v => v as TaxRate)`      | **none** — callers cast              |
| `DueDate`      | `string & { __brand: '…' }`    | `.transform(v => v as DueDate)`      | **none** — `dueDateOf(Date)` casts   |
| `YearMonth`    | `string & { __brand: '…' }`    | `.transform(v => v as YearMonth)`    | **none** — `yearMonthOf(Date)` casts |
| `Id<Prefix>`   | `string & { __brand: Prefix }` | `prefixedIdSchema()`                 | `parseId()` → **throws**             |

Consequences that are visible in the code today:

1. **12 hand-rolled `as <Brand>` casts** outside test factories. Every one is
   an unchecked assertion that the type system trusts and the runtime does not
   verify. `src/app/fns/create-invoice.ts:52-53` has two that are outright
   redundant (the schema already branded the value) — noise that makes a
   validated boundary _look_ unvalidated.
2. **`parseId` throws** (`src/shared/ids/id.ts:28,32`), violating AGENTS.md
   rule 1. Every other parse in the codebase returns `Result`.
3. Zod 4 has had a native `.brand<T>()` since v4 — the repo hand-rolls
   intersection brands anyway, so the two mechanisms coexist and neither is
   canonical.
4. Adding a value object means picking one of five precedents. Plan 007 alone
   needs four new branded types (`MessageId`, `CorrelationId`, `RequestId`,
   `Traceparent`); without a kit it will invent a sixth convention.

The fix is one small module that makes the _right_ thing the _shortest_ thing
to write, plus a lint rule (plan 002 rule (c)) that makes the wrong thing an
error.

## Current state

- `src/clients/value-objects/email-address.ts` — the most complete precedent:
  branded type, schema, `EmailError`, and a `Result`-returning `emailAddress()`
  parser. Kept as the model for the kit's shape.
- `src/invoicing/value-objects/tax-rate.ts` — brand + `TaxRateSchema`
  (`z.number().min(0).max(1).transform(...)`) + `calculateTax`. No parser.
- `src/shared/time/due-date.ts` — brand + `DueDateSchema` (regex) +
  `dueDateOf(Date)` + `isOverdue(due, today)`.
- `src/shared/time/year-month.ts` — brand + `YearMonthSchema` (regex) +
  `yearMonthOf(Date)`.
- `src/shared/ids/id.ts` — `Id<Prefix>`, `newId`, `parseId` (throws), `toDb`,
  `fromDb`, `prefixedIdSchema`. Four concrete IDs build on it:
  `client-id.ts`, `invoice-id.ts`, `line-item-id.ts`, `payment-id.ts`, each
  exporting `new*Id`, `parse*Id`, `*IdSchema`.
- `src/shared/money/money.ts` — namespace object over `{ cents: bigint;
currency: 'USD' }`. **Out of scope**: a dozen arithmetic operations, not a
  parse-and-brand wrapper. Forcing it into the kit loses clarity.
- All 24 Zod imports in `src` use `from 'zod/v4'`. Installed Zod is `4.3.6`,
  where the root `'zod'` export is the v4 API and `'zod/v4'` is a
  compatibility subpath.

Verified cast sites to eliminate (production, excluding `testing/`):

```
src/clients/value-objects/email-address.ts:10
src/app/fns/create-invoice.ts:52,53        ← already redundant
src/shared/time/due-date.ts:14,20
src/shared/time/year-month.ts:14,20
src/shared/ids/id.ts:14,31,47,63
src/invoicing/value-objects/tax-rate.ts:16
```

## Commands you will need

| Purpose       | Command                                                                                                                | Expected on success |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Typecheck     | `pnpm typecheck`                                                                                                       | exit 0              |
| Lint          | `pnpm lint`                                                                                                            | exit 0              |
| Dep rules     | `pnpm deps`                                                                                                            | exit 0              |
| Domain suites | `pnpm vitest run src/shared src/clients src/invoicing`                                                                 | all pass            |
| Full suite    | `pnpm test`                                                                                                            | exit 0 (Node 24)    |
| Count casts   | `grep -rn --include='*.ts' "as EmailAddress\|as TaxRate\|as DueDate\|as YearMonth\|as Id<" src \| grep -v '/testing/'` | no matches          |

## Scope

**In scope**:

- New `src/shared/domain/` — `value-object.ts`, `branded-id.ts`, and their
  tests
- Migrate `EmailAddress`, `TaxRate`, `DueDate`, `YearMonth` onto the kit
- Migrate the `Id` family; **`parseId` returns `Result`**
- Update every call site of the above
- Remove the two redundant casts in `src/app/fns/create-invoice.ts`
- Move all `from 'zod/v4'` imports to `from 'zod'`
- `AGENTS.md` + `docs/domain-terms.md` — document the one convention
- Uncomment plan 002's brand-cast lint rule (if 002 has landed)

**Out of scope** (do NOT touch):

- `src/shared/money/money.ts` — deliberate. See "Current state".
- `Invoice`, `Client`, or any aggregate/entity shape. Plan 006 owns entities.
  This plan changes only the _primitives they are built from_.
- Repository interfaces or SQL. `toDb`/`fromDb` keep their exact signatures.
- Adding new value objects. Plan 007's four message types come later, on this
  kit.
- Zod `z.codec` — tempting for `toDb`/`fromDb` (they are literally a
  bidirectional transform), but it changes the persistence path's error
  handling. Noted as a follow-up, not done here.

## Git workflow

- Branch: `advisor/003-domain-value-object-kit`
- One commit per migrated type so each is independently revertable:
  `feat: add value-object and branded-id kit`,
  `refactor: migrate EmailAddress onto the domain kit`, etc.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The value-object kit

Create `src/shared/domain/value-object.ts`. Design constraints: no classes, no
decorators, filename matches the exported symbol, and the returned object must
be usable both as a namespace (`EmailAddress.parse(x)`) and as a type
(`EmailAddress`) — the `const` + `type` co-declaration pattern the repo
already uses for `Money` and `InvoiceError`.

```ts
import { z } from 'zod';
import { ok, err, type Result } from 'neverthrow';

export interface ValueObjectError<TBrand extends string = string> {
  readonly kind: 'InvalidValueObject';
  readonly brand: TBrand;
  readonly raw: unknown;
  readonly issues: readonly string[];
}

export interface ValueObject<TBrand extends string, TSchema extends z.ZodType> {
  readonly brand: TBrand;
  /** Branded schema — use at RPC/event boundaries (AGENTS.md rule 5). */
  readonly schema: z.ZodType<z.output<TSchema> & z.$brand<TBrand>>;
  /** Result-returning parse — the only sanctioned way to produce the type. */
  parse(raw: unknown): Result<z.output<TSchema> & z.$brand<TBrand>, ValueObjectError<TBrand>>;
  /** Type guard. */
  is(raw: unknown): raw is z.output<TSchema> & z.$brand<TBrand>;
  /**
   * Bypass validation. ONLY for values already proven valid by construction —
   * DB rows written through `parse`, or generated values. Every call site
   * needs a comment saying which.
   */
  trusted(value: z.output<TSchema>): z.output<TSchema> & z.$brand<TBrand>;
}

export function defineValueObject<TBrand extends string, TSchema extends z.ZodType>(
  brand: TBrand,
  schema: TSchema,
): ValueObject<TBrand, TSchema> {
  /* ... */
}
```

Implementation notes:

- Build the branded schema with Zod's native `schema.brand<TBrand>()` — **do
  not** hand-roll `& { __brand }`. Confirmed available in Zod 4.3.6.
- `parse` wraps `schema.safeParse` and maps `error.issues` to a `string[]` of
  messages. Do not leak `ZodError` into the domain — it is a boundary type.
- `trusted` is `value as ...`. It is the single sanctioned cast site in the
  codebase, which is exactly why plan 002's rule (c) can then ban the cast
  everywhere else.
- Export `defineValueObject` as the sole named export matching the filename?
  No — `local/filename-matches-export` requires _at least one_ named export
  matching the file's basename, so `value-object.ts` must export something
  normalizing to `valueobject`. `ValueObject` (the interface) satisfies it.
  Verify with `pnpm lint` rather than assuming.

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 2: Kit tests

Create `src/shared/domain/value-object.test.ts`:

- `parse` on a valid input returns `Ok` with the branded value.
- `parse` on an invalid input returns `Err` with `kind: 'InvalidValueObject'`,
  the right `brand`, the original `raw`, and a non-empty `issues` array.
- `is` narrows correctly for valid and invalid inputs.
- `trusted` returns its argument unchanged (identity at runtime).
- **A type-level test**: two value objects built from the same underlying
  schema (`z.string()`) with different brands are not mutually assignable.
  Use a `@ts-expect-error` with a description (plan 002 rule (d) requires one)
  or `expectTypeOf` from Vitest. This is the whole point of branding — pin it.

**Verify**: `pnpm vitest run src/shared/domain` → all pass.

### Step 3: The branded-ID kit

Create `src/shared/domain/branded-id.ts`, folding in the existing `id.ts`
behavior with **one change: parse returns `Result`**.

```ts
export interface BrandedId<TPrefix extends string> {
  /* ... */
}

export function defineBrandedId<TPrefix extends string>(prefix: TPrefix): BrandedId<TPrefix>;
```

The returned object provides:

- `create(): Id<TPrefix>` — mints `${prefix}_${uuidv7()}` (was `newId`)
- `parse(raw: unknown): Result<Id<TPrefix>, ValueObjectError<TPrefix>>` —
  **was `parseId`, which threw**
- `schema` — the branded prefixed-ID schema (was `prefixedIdSchema`)
- `is(raw): raw is Id<TPrefix>`
- `toDb(id): string` / `fromDb(raw): Id<TPrefix>` — **identical signatures to
  today**. `fromDb` is documented as trusted-source-only, same as now.

Keep the prefix/UUID validation semantics byte-for-byte: require the
`${prefix}_` prefix, then validate the remainder with `z.uuid()`. Do not
tighten to UUID v7 specifically — existing seed and test data may not comply,
and that is not this plan's fight.

**Verify**: `pnpm typecheck` → exit 0 (nothing imports it yet).

### Step 4: Branded-ID tests

Create `src/shared/domain/branded-id.test.ts`, porting the cases from
`src/shared/ids/id.test.ts` and adding:

- `parse` on a wrong-prefix string returns `Err` (previously: threw).
- `parse` on a malformed UUID returns `Err` (previously: threw).
- `create()` output round-trips through `toDb` → `fromDb` to an equal value.
- `toDb` on a prefixed ID strips exactly the prefix; on an unprefixed string
  it returns the input (preserving today's `indexOf('_') === -1` behavior).
- Type-level: `Id<'inv'>` is not assignable to `Id<'client'>`.

**Verify**: `pnpm vitest run src/shared/domain` → all pass.

### Step 5: Migrate the four value objects

One commit each. For each type, the module keeps its current file path and its
current exported _names_ so importers do not all churn:

```ts
// src/invoicing/value-objects/tax-rate.ts
import { defineValueObject } from '@/shared/domain/value-object';

export const TaxRate = defineValueObject('TaxRate', z.number().min(0).max(1));
export type TaxRate = z.infer<typeof TaxRate.schema>;
export const TaxRateSchema = TaxRate.schema;   // keep for existing importers
export function calculateTax(...) { /* unchanged */ }
```

`TaxRateSchema`, `DueDateSchema`, `YearMonthSchema`, `EmailAddressSchema` all
stay exported so RPC-boundary schemas in `src/app/fns/` need no edit.

Per-type notes:

- **`EmailAddress`**: `emailAddress(raw)` becomes a thin alias for
  `EmailAddress.parse(raw)`. Its `EmailError` type (`{ kind: 'InvalidEmail';
raw: string }`) is referenced by `CreateClientError` in
  `src/clients/commands/create-client.ts`. Either keep `EmailError` as an
  alias of `ValueObjectError<'EmailAddress'>` or update `CreateClientError` —
  pick one and be consistent. Keeping the alias is the smaller diff.
- **`DueDate`**: `dueDateOf(date)` and `isOverdue(due, today)` keep their
  signatures. `dueDateOf` uses `DueDate.trusted(format(date, 'yyyy-MM-dd'))`
  with a comment: `date-fns` output is well-formed by construction.
- **`YearMonth`**: same shape as `DueDate` via `yearMonthOf`.
- **`TaxRate`**: `calculateTax` is untouched — it takes a `TaxRate` and does
  bigint math.

**Verify** after each: `pnpm typecheck && pnpm vitest run src` → exit 0. The
existing `tax-rate.test.ts` and `email-address.test.ts` should pass with at
most import-line changes; if an assertion needs rewriting, the migration
changed behavior — STOP.

### Step 6: Migrate the ID family

Rewrite the four concrete ID modules on `defineBrandedId`, keeping every
exported name:

```ts
// src/shared/ids/invoice-id.ts
import { defineBrandedId } from '@/shared/domain/branded-id';

const InvoiceIdKit = defineBrandedId('inv');
export type InvoiceId = ReturnType<typeof InvoiceIdKit.create>;
export const newInvoiceId = InvoiceIdKit.create;
export const parseInvoiceId = InvoiceIdKit.parse; // ⚠️ now returns Result
export const InvoiceIdSchema = InvoiceIdKit.schema;
```

`src/shared/ids/id.ts` becomes a re-export shim or is deleted. **Deleting is
correct** — `barrel-files/avoid-barrel-files` forbids re-export modules, and
`toDb`/`fromDb` have importers (`sqlite-client-repo.ts:5` among others) that
should point at `@/shared/domain/branded-id` directly. Move
`src/shared/ids/id.test.ts` alongside as `branded-id.test.ts` (Step 4) and
delete the original.

**`parse*Id` returning `Result` is the one breaking change in this plan.**
Find every call site (`grep -rn "parse[A-Za-z]*Id(" src scripts e2e`) and
handle the `Result`. Most are in test factories
(`src/clients/testing/client-factory.ts:1`, `src/invoicing/testing/`), where
`expectOk` from `@/shared/testing/expect-ok` is the sanctioned unwrap — the
`_unsafeUnwrap` ban applies here too.

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → exit 0.
`grep -rn "parseId\b" src` → no matches.

### Step 7: Delete the redundant casts and normalize Zod imports

- Remove `as TaxRate` / `as DueDate` at `src/app/fns/create-invoice.ts:52-53`
  and the now-unused `import type` lines above them. (Plan 002's autofix may
  have already done this; confirm rather than assume.)
- Replace all `from 'zod/v4'` with `from 'zod'` across `src` (24 files). Zod
  4.3.6's root export **is** the v4 API; the subpath is a compat alias. This
  is a pure import-specifier change with no type impact — confirm with
  `pnpm typecheck` immediately after.

**Verify**: `grep -rn "zod/v4" src` → no matches. The cast-count command in
"Commands you will need" → no matches. `pnpm typecheck && pnpm test` → exit 0.

### Step 8: Enforce and document

- If plan 002 has landed, **uncomment its brand-cast rule (c)** in
  `eslint.config.js` and extend the `typeName.name` regex to cover any brands
  added here. Add an override allowing the cast inside
  `src/shared/domain/**` (where `trusted` lives) and inside `**/testing/**`.
- If plan 002 has **not** landed, add the rule yourself using the snippet in
  002 Step 6(c), and note in 002's file that (c) is already done.
- `AGENTS.md`: add to "Rules the toolchain cannot enforce" (or move to
  "enforces", since it now is enforced):

  > **Value objects**: every validated primitive is defined via
  > `defineValueObject` / `defineBrandedId` in `src/shared/domain/`. Parsing
  > returns `Result`; the only sanctioned cast is `.trusted()`, which requires
  > a comment justifying why the value is valid by construction. `Money` is
  > the deliberate exception — it is an arithmetic namespace, not a wrapper.

- `docs/domain-terms.md`: update the `Tax Rate` and `Due Date` rows to point
  at the kit, and add a `Value Object` row.

**Verify**: `pnpm format && pnpm typecheck && pnpm lint && pnpm deps && pnpm test`
→ all exit 0.

## Test plan

- `src/shared/domain/value-object.test.ts` (new) — Step 2's six cases,
  including the type-level non-assignability test.
- `src/shared/domain/branded-id.test.ts` (new) — Step 4's cases, ported from
  `id.test.ts` plus the three `Result` cases replacing the throw assertions.
- `src/shared/ids/id.test.ts` — deleted, superseded.
- **Existing tests must pass with at most import-line changes.**
  `email-address.test.ts`, `tax-rate.test.ts`, `time.test.ts`, and the
  property tests in `src/invoicing/testing/arbitraries.ts` consumers are the
  behavioral net. If any needs a rewritten _assertion_, the migration changed
  semantics — that is a STOP condition, not a test to update.
- **Property test worth adding** (`src/shared/domain/value-object.property.test.ts`):
  for an arbitrary schema and arbitrary input, `is(x) === parse(x).isOk()`.
  Cheap, and it pins the guard/parser agreement that everything else assumes.
  Use `@fast-check/vitest`, consistent with the existing property tests.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `src/shared/domain/{value-object,branded-id}.ts` exist with tests
- [ ] `grep -rn --include='*.ts' "as EmailAddress\|as TaxRate\|as DueDate\|as YearMonth\|as Id<" src | grep -v '/testing/'` → no matches
- [ ] `grep -rn "zod/v4" src` → no matches
- [ ] `grep -rn "parseId\b" src` → no matches; `src/shared/ids/id.ts` deleted
- [ ] `parse*Id` returns `Result` and no call site throws on bad input
- [ ] Brand-cast lint rule active (rule (c) from plan 002)
- [ ] `AGENTS.md` and `docs/domain-terms.md` updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any existing test needs a **changed assertion** (not just a changed import)
  to pass. The migration is supposed to be behavior-preserving except for
  `parse*Id`; anything else means a semantic drift worth surfacing.
- Zod 4.3.6's `.brand<T>()` does not compose with `.transform()`/`.pipe()` the
  way Step 1 assumes — in particular if `z.output<TSchema> & z.$brand<TBrand>`
  does not infer cleanly through the generic. Report the exact inference
  failure; the fallback is to keep the hand-rolled intersection brand inside
  the kit (still one convention, just a different mechanism) rather than
  abandoning the kit.
- Moving `from 'zod/v4'` to `from 'zod'` changes any inferred type. It should
  be a no-op at 4.3.6; if it is not, revert that step and leave the subpath in
  place — it is cosmetic and not worth risk.
- `local/filename-matches-export` rejects `value-object.ts` or
  `branded-id.ts` despite the interface exports. Report the rule's message
  rather than renaming files to something non-obvious.
- The `parse*Id` migration reaches more than ~25 call sites. Planning expected
  most to be in test factories; a much larger blast radius means production
  code is parsing IDs in places it should be accepting already-parsed ones,
  which is worth its own discussion.

## Maintenance notes

- **Plan 007 depends on this kit** for `MessageId`, `CorrelationId`,
  `RequestId`, and `Traceparent`. `Traceparent` in particular is a good test
  of the kit's ergonomics: it is a regex-validated string
  (`00-<32hex>-<16hex>-<2hex>`) with no `create()`. If the kit cannot express
  it cleanly, that is a design signal worth acting on before 007 starts.
- **`z.codec` for `toDb`/`fromDb`** is the natural follow-up: the pair is
  literally a bidirectional transform, and Zod 4 has first-class support
  (`z.codec(inputSchema, outputSchema, { decode, encode })`). It would make
  the persistence boundary symmetric and validated in both directions.
  Deliberately deferred — it changes error handling on the read path.
- `Money` staying outside the kit will look like an inconsistency to the next
  reviewer. The AGENTS.md wording in Step 8 says why, explicitly, so the
  question does not get re-asked.
- Reviewer: check that every `.trusted()` call site carries a comment naming
  why the value is valid by construction. An uncommented `.trusted()` is just
  a cast with extra steps, and the lint rule cannot tell the difference.
