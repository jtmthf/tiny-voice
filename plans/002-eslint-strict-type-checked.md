# Plan 002: typescript-eslint `strictTypeChecked` plus repo-specific rules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. Confirm
> `eslint.config.js` still uses `...tseslint.configs.strict` and
> `...tseslint.configs.stylistic` (the non-type-checked variants) as its base.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED — 70 production findings, mechanical individually, but a
  handful (`only-throw-error`, `no-unnecessary-condition`) point at real
  defects that need judgement rather than a codemod
- **Depends on**: plans/001-tsconfig-strictness.md
- **Category**: types / DX / correctness
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

`eslint.config.js` extends `tseslint.configs.strict` and
`tseslint.configs.stylistic` — the **non-type-checked** variants — even though
the config already sets up `projectService`, which means full type information
is available and being paid for. The type-aware rules are the ones that catch
the bugs a demo repo about enforceable conventions should be catching, and
they are currently switched off for no reason.

Measured at `a9b67eb`, switching to `strictTypeChecked` + `stylisticTypeChecked`
surfaces **70 production errors**. Three of them are not style at all:

- `sqlite-invoice-repo.ts:238-242` — two `no-unsafe-assignment` from untyped
  `JSON.parse`, and two `no-unnecessary-condition` saying the null guards
  below them can never fire, directly contradicting the comment that explains
  why they exist. One of the two is wrong. (See "Latent bug" in the plans
  README.)
- `money.ts:79` — `no-unnecessary-condition` on `a.currency === b.currency`,
  which is always true because `currency` is the literal `'USD'`. Dead code
  that will silently become live if a second currency is ever added.
- `create-invoice.ts:52-53` — two `no-unnecessary-type-assertion` on
  `data.taxRate as TaxRate` / `data.dueDate as DueDate`. The Zod schema
  already pipes through `TaxRateSchema`/`DueDateSchema`, so the values are
  _already_ branded. These casts are pure noise that make it look like the
  boundary is unvalidated when it is not — precisely the confusion the
  "impossible states" work is meant to remove.

Beyond the shared config, this plan adds four repo-specific rules that turn
existing prose conventions in `AGENTS.md` into lint errors.

## Current state

`eslint.config.js`, base configs:

```js
...tseslint.configs.strict,
...tseslint.configs.stylistic,
```

Custom rules already present and to be preserved verbatim: the inline
`local/filename-matches-export` rule, `import-x/no-default-export`,
`import-x/no-cycle`, `unicorn/filename-case`, the two `check-file` rules,
`barrel-files/avoid-barrel-files`, `@typescript-eslint/no-floating-promises`,
`no-misused-promises`, `switch-exhaustiveness-check`,
`consistent-type-imports`, `no-deprecated`, and the two `no-restricted-syntax`
selectors banning neverthrow's `_unsafeUnwrap`/`_unsafeUnwrapErr`.

Existing overrides to preserve: config/script/e2e relaxation of
`no-default-export`; the `src/app/**` relaxation; the TanStack Router
filename exemptions; and the test-file block relaxing `no-default-export` and
`no-non-null-assertion`.

**Measured production findings (70):**

| Count | Rule                                                        |
| ----- | ----------------------------------------------------------- |
| 22    | `@typescript-eslint/restrict-template-expressions`          |
| 16    | `@typescript-eslint/require-await`                          |
| 12    | `@typescript-eslint/dot-notation`                           |
| 6     | `@typescript-eslint/no-confusing-void-expression`           |
| 5     | `@typescript-eslint/no-unnecessary-condition`               |
| 2     | `@typescript-eslint/only-throw-error`                       |
| 2     | `@typescript-eslint/no-unnecessary-type-assertion`          |
| 2     | `@typescript-eslint/no-unsafe-assignment`                   |
| 1     | `@typescript-eslint/use-unknown-in-catch-callback-variable` |
| 1     | `@typescript-eslint/prefer-nullish-coalescing`              |
| 1     | `@typescript-eslint/no-unsafe-return`                       |

**Measured test/e2e/config findings (277)**, dominated by 170
`no-non-null-assertion` — which the existing test-file override already
disables. The effective test-side number once the override block is ordered
after the new configs is roughly 107, mostly `require-await` (57) on
`async` test callbacks that never await.

Other verified facts this plan acts on:

- **17 files use `../../` parent imports** instead of the `@/` alias — 15 in
  `src/clients`, 2 in `src/invoicing`. Two conventions for the same thing.
- **`parseId` in `src/shared/ids/id.ts` throws** on bad input, violating
  AGENTS.md rule 1. Plan 003 fixes the function; this plan adds the rule that
  stops it recurring.

## Commands you will need

| Purpose           | Command               | Expected on success |
| ----------------- | --------------------- | ------------------- |
| Lint              | `pnpm lint`           | exit 0              |
| Lint with autofix | `pnpm lint --fix`     | —                   |
| Count by rule     | see snippet in Step 2 | —                   |
| Typecheck         | `pnpm typecheck`      | exit 0              |
| Dep rules         | `pnpm deps`           | exit 0              |
| Full suite        | `pnpm test`           | exit 0 (Node 24)    |
| Lint timing       | `time pnpm lint`      | see Step 7          |

## Scope

**In scope**:

- `eslint.config.js` — swap to type-checked configs; add four repo-specific
  rules; adjust override ordering
- The ~70 production findings
- The test-side findings that survive the existing overrides
- `src/clients/**` and the 2 `src/invoicing` files — migrate `../../` imports
  to `@/`
- `AGENTS.md` — document the new enforced rules

**Out of scope** (do NOT touch):

- `src/app/routeTree.gen.ts` — generated, already globally ignored
- The `no-unnecessary-condition` finding at `sqlite-invoice-repo.ts:241-242`
  **beyond diagnosing it**. If the fix is more than deleting a dead guard —
  i.e. it turns out to be a real crash path — stop and report; plan 006
  rewrites that hydration code and may be the better home for the fix.
- Deleting the `_unsafeUnwrap` `no-restricted-syntax` selectors. They stay.
- `eslint-plugin-functional`, `ts-reset`, or any new lint dependency. The four
  custom rules below are ~40 lines of inline config, consistent with how
  `local/filename-matches-export` is already done.

## Git workflow

- Branch: `advisor/002-eslint-strict-type-checked`
- Commit per step so the mechanical fixes stay separable from the judgement
  calls, e.g. `build: adopt typescript-eslint strictTypeChecked`,
  `fix: remove dead currency comparison in Money.equals`,
  `refactor: use @/ alias in clients module`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap the base configs

In `eslint.config.js`, replace:

```js
...tseslint.configs.strict,
...tseslint.configs.stylistic,
```

with:

```js
...tseslint.configs.strictTypeChecked,
...tseslint.configs.stylisticTypeChecked,
```

**Critical ordering constraint**: the existing override blocks (test files,
`src/app/**`, config/scripts, router filenames) must remain **after** the main
rules block in the exported array, or their relaxations are silently
overwritten. Verify by confirming `no-non-null-assertion` still reports 0 in
test files after this step.

Add a `disableTypeChecked` block for files outside the TS project so the
type-aware rules do not error on them:

```js
{
  files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
  extends: [tseslint.configs.disableTypeChecked],
}
```

**Verify**: `pnpm lint` runs to completion (it will fail with findings — that
is expected). Confirm test-file `no-non-null-assertion` count is 0:

```
pnpm lint -f json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{let n=0;for(const f of JSON.parse(d))if(/\.test\.tsx?$/.test(f.filePath))for(const m of f.messages)if(m.ruleId==='@typescript-eslint/no-non-null-assertion')n++;console.log('non-null in tests:',n)})"
```

### Step 2: Take your own inventory

Do not trust this plan's counts — take a fresh one:

```
pnpm lint -f json 2>/dev/null | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
const prod={},test={};let tp=0,tt=0;
for(const f of JSON.parse(d)){
  const isTest=/\.(test|spec)\.tsx?$/.test(f.filePath)||/\/(e2e|testing)\//.test(f.filePath)||/config\.[tj]s$/.test(f.filePath);
  for(const m of f.messages){ if(m.severity!==2) continue; const b=isTest?test:prod; b[m.ruleId]=(b[m.ruleId]||0)+1; isTest?tt++:tp++; }}
console.log('PROD',tp,prod); console.log('TEST',tt,test);});"
```

Record the numbers. They are your progress metric for Steps 3–5.

### Step 3: Autofixable findings

Run `pnpm lint --fix`. This should clear most of `dot-notation`,
`prefer-nullish-coalescing`, `no-unnecessary-type-assertion` (including the
two redundant brand casts in `create-invoice.ts:52-53`), and some
`restrict-template-expressions`.

**Review the diff carefully before committing.** `no-unnecessary-type-assertion`
autofix deletes casts — confirm each deletion is genuinely redundant (for the
`create-invoice.ts` pair it is: `CreateInvoiceInput` already pipes through
`TaxRateSchema`/`DueDateSchema`, so the values arrive branded).

**Verify**: `pnpm typecheck && pnpm test` → exit 0. Re-run the Step 2
inventory; production count should drop substantially.

### Step 4: `restrict-template-expressions` and `require-await`

**`restrict-template-expressions`** (22 prod): mostly `bigint` and `number`
interpolated into template literals — e.g. money formatting in
`src/shared/money/money.ts` and ID construction in `src/shared/ids/id.ts`.
Prefer configuring the rule to permit the types this codebase legitimately
interpolates rather than sprinkling `String(...)` calls:

```js
'@typescript-eslint/restrict-template-expressions': [
  'error',
  { allowNumber: true, allowBigInt: true },
],
```

`allowNumber` and `allowBigInt` are safe — both have unambiguous, lossless
string forms. Do **not** add `allowAny`, `allowNullish`, or `allowBoolean`;
those are the cases where interpolation hides a bug. Fix any remaining hits
explicitly.

**`require-await`** (16 prod, ~57 test): `async` functions with no `await`.
In production these are mostly event subscribers and server-fn handlers whose
`async` is part of a port contract. Two correct responses:

- If the `async` is required by an interface (e.g. an `EventBus` handler typed
  `=> Promise<void> | void`), drop the `async` keyword and return the value
  directly — the union already permits a sync handler.
- If dropping `async` would change the return type at a call site that awaits
  it, keep `async` and add an inline disable **with a one-line reason**.

⚠️ **Several of these live in `src/invoicing/subscribers/register-notification-subscribers.ts`
and `src/reporting/projections/register-revenue-projection.ts`, which plan 008
rewrites entirely.** Keep this step's commit separate so 008 can rebase past
it cleanly.

**Verify**: `pnpm test` → exit 0. Both files' subscriber behavior is covered
by `register-subscribers.test.ts` and
`register-revenue-projection.test.ts`.

### Step 5: The judgement calls

Handle these four individually, each with its own commit:

1. **`money.ts:79`** — `a.currency === b.currency` is always true. Delete the
   comparison, keeping `a.cents === b.cents`. Add a comment noting the
   single-currency invariant is enforced by the `currency: 'USD'` literal type,
   so a second currency would be a compile error at every construction site
   rather than a silent equality bug. This is consistent with the existing
   comment in `money.ts` ("Single-currency system … infallible at the type
   level").

2. **`create-client.ts:27` and `create-invoice.ts:63`** —
   `only-throw-error`. Inspect what is thrown. If these are
   `throw redirect(...)` from TanStack Router, that is the framework's
   documented control-flow mechanism and the correct fix is a narrowly scoped
   disable with a comment naming the framework contract — **not** wrapping it
   in an `Error`. If they are `throw new Error(string)` the rule is satisfied
   already, so re-read the actual line before acting.

3. **`sqlite-invoice-repo.ts:237-243`** — type the `JSON.parse` results
   explicitly instead of relying on `any`:

   ```ts
   const lineItems = JSON.parse(row.line_items_json) as (LineItemRow | null)[];
   ```

   Then determine empirically whether `json_group_array` over zero rows yields
   `[]` or `[null]` — write a throwaway integration check against an invoice
   with no line items. Fix the guard to match reality (`(li) => li !== null`
   if the element can be null; delete the guard if it cannot) and **add a
   regression test** covering a zero-line-item invoice through
   `SqliteInvoiceRepo.list`. If the answer is "the element can be null", you
   have found a live crash path — say so explicitly in the commit message.

4. **`use-unknown-in-catch-callback-variable`** at `build-app.ts:133` — the
   outbox recovery `.catch((error) => ...)`. Change the parameter to
   `(error: unknown)`; the logger already accepts `unknown` in its meta record.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → exit 0 or only the
remaining categories from Step 6.

### Step 6: Repo-specific rules

Add to the main rules block in `eslint.config.js`. Each of these converts an
`AGENTS.md` prose rule into an error.

**(a) Ban `../../` parent imports — one path convention, not two.**

```js
'no-restricted-imports': [
  'error',
  {
    patterns: [
      {
        group: ['../../*', '../../../*'],
        message: "Use the '@/' alias for cross-directory imports. Relative imports are for siblings and direct children only.",
      },
    ],
  },
],
```

Then migrate the 17 offending files (15 in `src/clients`, 2 in
`src/invoicing`) to `@/`. This is mechanical; verify with
`grep -rn --include='*.ts' "from '\.\./\.\./" src` → no matches.

**(b) No `throw` in domain code — enforce AGENTS.md rule 1.**

Scoped override block:

```js
{
  files: [
    'src/{clients,invoicing,reporting}/{entities,commands,queries,value-objects,errors,ports}/**/*.ts',
    'src/shared/{money,ids,time,outcome}/**/*.ts',
  ],
  ignores: ['**/*.test.ts', '**/*.property.test.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ThrowStatement',
        message: 'Domain code returns Result<T, DomainError> (AGENTS.md rule 1). Throw only for infrastructure failures, which belong in adapters.',
      },
    ],
  },
},
```

⚠️ `no-restricted-syntax` does **not** merge across config blocks — a later
block's array replaces an earlier one entirely. This override therefore drops
the two neverthrow `_unsafeUnwrap` selectors for the files it covers, which is
exactly the domain code where they matter most. **Repeat both selectors inside
this block's array** alongside the `ThrowStatement` selector. Verify by
planting a temporary `x._unsafeUnwrap()` in `src/invoicing/entities/invoice.ts`
and confirming it still errors, then removing it.

**Known violations** this will surface: `Money.multiplyByInt` throws on a
non-integer (documented as "programming error, not domain error"), and
`parseId`/`prefixedIdSchema` in `src/shared/ids/id.ts` throw. `multiplyByInt`
is a deliberate assertion — give it an inline disable with the existing
rationale. `parseId` is a genuine rule-1 violation, but **plan 003 fixes it**.
If 003 has not landed, add a `TODO(plan-003)` inline disable rather than
fixing it here; do not do 003's work early.

**(c) Ban hand-rolled brand casts outside the domain kit.** Once plan 003
lands, `as SomeBrand` should only appear inside `src/shared/domain/`:

```js
{
  selector: "TSAsExpression > TSTypeReference[typeName.name=/^(EmailAddress|TaxRate|DueDate|YearMonth)$/]",
  message: 'Do not cast into a branded type. Parse it through the value object (src/shared/domain/).',
}
```

**If plan 003 has not landed, add this rule but leave it commented out** with
a `TODO(plan-003)` note — enabling it now would flag the 12 existing casts
that 003 is about to delete, and you would be fixing them twice. Plan 003's
final step is to uncomment it.

**(d) Ban `@ts-expect-error` without a description.**

```js
'@typescript-eslint/ban-ts-comment': [
  'error',
  { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
],
```

`strictTypeChecked` already enables `ban-ts-comment`; this tightens it.

**Verify**: `pnpm lint` → exit 0. `pnpm typecheck && pnpm deps && pnpm test`
→ exit 0.

### Step 7: Check the cost, then document

Type-aware linting is meaningfully slower. Run `time pnpm lint` and record it.
If it exceeds ~60s, add to `eslint.config.js`'s `parserOptions`:

```js
projectService: {
  allowDefaultProject: ['vitest.config.ts', '*.config.js'],
  defaultProject: 'tsconfig.json',
},
```

and confirm CI's lint job still fits its budget. If lint time is unacceptable
even so, report it — do not silently revert to the non-type-checked configs.

Then update `AGENTS.md` "Rules the toolchain enforces" with four new lines:
the type-checked base config, the `@/`-only import rule, the no-throw-in-domain
rule, and (if enabled) the brand-cast rule.

**Verify**: `pnpm format && pnpm lint` → exit 0.

## Test plan

- **No new unit tests for the lint config itself.** The gate is `pnpm lint`
  exiting 0 with the rules active.
- **One new regression test is required** (Step 5.3): a `SqliteInvoiceRepo`
  test hydrating an invoice with zero line items and zero payments, asserting
  `lineItems` and `payments` are empty arrays rather than arrays containing
  `null`. Put it in `src/invoicing/adapters/sqlite-invoice-repo.test.ts`
  alongside the existing cases. This test must be written **before** changing
  the guard so you can see it fail if the guard was load-bearing.
- **Two manual rule-efficacy checks** (Step 6): plant a temporary
  `_unsafeUnwrap()` in domain code and confirm it still errors; plant a
  temporary `throw new Error('x')` in `src/invoicing/entities/invoice.ts` and
  confirm the new selector fires. Remove both.
- Existing suites are the regression net for Steps 3–5. `require-await` and
  `no-confusing-void-expression` fixes change function return types; if a test
  fails, the fix was wrong, not the test.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `eslint.config.js` uses `strictTypeChecked` + `stylisticTypeChecked`
- [ ] Test-file `no-non-null-assertion` count is 0 (overrides still ordered last)
- [ ] `grep -rn --include='*.ts' "from '\.\./\.\./" src` → no matches
- [ ] Planted `_unsafeUnwrap` in domain code still errors (checked, then removed)
- [ ] Planted `throw` in `src/invoicing/entities/invoice.ts` errors (checked, then removed)
- [ ] Zero-line-item `SqliteInvoiceRepo` hydration test exists and passes
- [ ] `money.ts` currency comparison removed with an explanatory comment
- [ ] `time pnpm lint` recorded in the PR/commit description
- [ ] `AGENTS.md` updated
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Production findings after Step 2 exceed ~120 (planning measured 70). The
  codebase drifted enough that the effort estimate no longer holds.
- The `sqlite-invoice-repo.ts` investigation shows the null guard **is**
  load-bearing at runtime — i.e. `json_group_array` really can yield `[null]`
  and `li.id` would throw. That is a live crash, not a lint fix. Report it
  with the reproduction; the maintainer decides whether it ships here or in
  plan 006.
- The no-throw-in-domain rule flags something in `src/invoicing/entities/` or
  `src/clients/entities/` other than the two known cases (`multiplyByInt`,
  `parseId`). An unknown throw in an aggregate is a rule-1 violation worth
  reporting on its own.
- `time pnpm lint` exceeds ~3 minutes. Report rather than reverting.
- Any `require-await` fix would change a port interface signature. Port
  changes are plan 008's business, not this plan's.

## Maintenance notes

- Rule (c) stays commented out until plan 003 lands. Whoever executes 003 owns
  uncommenting it — that is written into 003's final step, but if 002 lands
  after 003, enable it here instead.
- `strictTypeChecked` is explicitly **not semver-stable** in typescript-eslint.
  A minor bump can add rules and break CI. That is an accepted cost for a demo
  repo whose point is strictness; if it becomes disruptive, pin the
  typescript-eslint minor rather than downgrading the config.
- Reviewer: the highest-value part of this diff is Step 5, not Steps 3–4. The
  autofixes are noise; the four judgement calls are where a real bug is either
  fixed or papered over. Read those four commits closely and check that
  `only-throw-error` disables (if any) name the framework contract they serve.
