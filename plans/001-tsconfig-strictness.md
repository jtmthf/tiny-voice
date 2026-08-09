# Plan 001: tsconfig strictness sweep

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Written against commit `a9b67eb`. Confirm the
> "Current state" excerpt of `tsconfig.json` matches the live file.
>
> **Environment check (run first)**: `node --version` → `v24.x` required.
> `npx tsc --version` → `6.0.2` or later.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — 18 known errors, all mechanical, none change runtime behavior
- **Depends on**: —
- **Category**: types / DX
- **Planned at**: commit `a9b67eb`, 2026-08-09

## Why this matters

The repo's whole thesis is that conventions should be enforced by tooling.
`tsconfig.json` currently enables `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes` — good, but it leaves eight further flags off,
including several that TypeScript 6 either defaults on or that directly serve
stated repo goals:

- `erasableSyntaxOnly` bans parameter properties and enums. The maintainer's
  direction is explicitly "framework-like while avoiding classes"; this flag
  is the compiler-level expression of that preference, and it also
  structurally forecloses the decorator-based DI that plan 004 is designed to
  avoid.
- `noPropertyAccessFromIndexSignature` forces `process.env['X']` over
  `process.env.X`, which matters because `EnvConfig` is the one place the app
  reads untyped external input.
- `noImplicitReturns` and `noFallthroughCasesInSwitch` pair with the existing
  `@typescript-eslint/switch-exhaustiveness-check` to make the many
  discriminated-union switches in this codebase total — and plans 006 and 008
  add several more.
- `noUnusedLocals`/`noUnusedParameters` keep the mechanical debris out of the
  large refactors in 005 and 006.

Doing this first is deliberate: every later plan writes type-level code, and
these flags catch mistakes at authoring time rather than in review.

## Current state

`tsconfig.json` `compilerOptions` (relevant subset):

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true,
  "allowJs": true
}
```

`include` is `["src", "scripts", "vite.config.ts", "e2e/**/*.ts", "playwright.config.ts"]`.

**Measured**: adding the eight flags below produces exactly **18 errors**:

| Code   | Count | Meaning                                                     |
| ------ | ----- | ----------------------------------------------------------- |
| TS1294 | 13    | Parameter property — not allowed under `erasableSyntaxOnly` |
| TS4111 | 5     | Index-signature property must use bracket access            |

The 13 TS1294 sites are all `constructor(private readonly db: Database) {}`
style parameter properties:

- `src/clients/adapters/sqlite-client-repo.ts:29`
- `src/invoicing/adapters/console-notification-sender.ts:12`
- `src/invoicing/adapters/sqlite-invoice-repo.ts:95`
- `src/reporting/adapters/sqlite-revenue-read-model.ts:25`
- `src/shared/db/sqlite-database.ts:16`
- `src/shared/events/sqlite-outbox.ts:11`
- `src/shared/flags/config-feature-flags.ts:16`
- `src/shared/flags/in-memory-feature-flags.ts:8`
- `e2e/pages/dashboard-page.ts:4`
- `e2e/pages/invoice-detail-page.ts:12`
- `e2e/pages/new-client-page.ts:8`
- `e2e/pages/new-invoice-page.ts:10`
- `e2e/pages/reporting-page.ts:6`

The 5 TS4111 sites are all `process.env.X` in `e2e/playwright.config.ts`
(lines 4, 9, 23, 26, 29 — `E2E_BASE_URL` and `CI`).

Note: `vite.config.ts` already uses `process.env['NODE_ENV']` bracket style,
so it is unaffected — the codebase is already 90% compliant.

## Commands you will need

| Purpose    | Command                                     | Expected on success |
| ---------- | ------------------------------------------- | ------------------- |
| Typecheck  | `pnpm typecheck`                            | exit 0              |
| Lint       | `pnpm lint`                                 | exit 0              |
| Dep rules  | `pnpm deps`                                 | exit 0              |
| Full suite | `pnpm test`                                 | exit 0 (Node 24)    |
| E2E smoke  | `pnpm test:e2e:critical --project=chromium` | all pass            |
| Build      | `pnpm build`                                | exit 0              |

## Scope

**In scope**:

- `tsconfig.json` — add eight compiler options
- The 8 production adapter files listed above — expand parameter properties
- The 5 e2e page-object files — expand parameter properties
- `e2e/playwright.config.ts` — bracket-notation env access
- Any incidental unused local/parameter the sweep surfaces
- `AGENTS.md` — add the new flags to the "Rules the toolchain enforces" list

**Out of scope** (do NOT touch):

- Converting adapters from classes to factory functions. `erasableSyntaxOnly`
  bans the _shorthand_, not the class. Expand the constructor; leave the class.
  Converting is a separate maintainer decision (see README direction option 2).
- `isolatedDeclarations` — would require explicit return-type annotations on
  every exported symbol. Real value, much larger diff, and it fights the
  inference-heavy container in plan 004. Revisit after 005 lands.
- `stableTypeOrdering` — TS 6 flag that aligns type ordering with TS 7 but
  costs up to 25% typecheck time. Not worth it for a demo repo.
- ESLint configuration — that is plan 002.

## Git workflow

- Branch: `advisor/001-tsconfig-strictness`
- Conventional commits per step, e.g.
  `build: enable eight stricter tsconfig flags`,
  `refactor: expand parameter properties for erasableSyntaxOnly`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Establish the baseline

Run `pnpm typecheck && pnpm lint && pnpm deps && pnpm test`. Record which, if
any, already fail. On Node 24 all four should exit 0.

**Verify**: all four exit 0. If not, STOP — you are not on a clean baseline.

### Step 2: Add the flags

In `tsconfig.json` `compilerOptions`, add:

```json
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noPropertyAccessFromIndexSignature": true,
"noImplicitOverride": true,
"noUncheckedSideEffectImports": true,
"erasableSyntaxOnly": true
```

`noUncheckedSideEffectImports` is already the default in TypeScript 6; state
it explicitly so the intent survives a future downgrade or a tooling change.

**Verify**: `pnpm typecheck` → **exactly 18 errors**, matching the code
distribution in "Current state" (13 × TS1294, 5 × TS4111). Confirm with:

```
pnpm typecheck 2>&1 | grep -oE "error TS[0-9]+" | sort | uniq -c
```

If the count or distribution differs, the codebase has drifted — reconcile
against the file list above before continuing.

### Step 3: Expand parameter properties (production)

For each of the 8 production files, convert the shorthand. Example —
`src/shared/events/sqlite-outbox.ts:11`:

```ts
// before
export class SqliteOutbox<TEventMap extends object = object> implements Outbox<TEventMap> {
  constructor(private readonly db: Database) {}

// after
export class SqliteOutbox<TEventMap extends object = object> implements Outbox<TEventMap> {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }
```

Keep the field `private readonly` and keep the parameter name identical so
every call site and `this.db` reference is untouched.

**Verify**: `pnpm typecheck 2>&1 | grep -c "TS1294"` → 5 remaining (the e2e
page objects). `pnpm vitest run src` → no new failures.

### Step 4: Expand parameter properties (e2e page objects)

Same mechanical change for the 5 files under `e2e/pages/`. These hold a
Playwright `Page`; check each file's actual parameter name and modifier before
editing — do not assume they match the adapters.

**Verify**: `pnpm typecheck 2>&1 | grep -c "TS1294"` → 0.

### Step 5: Bracket-notation env access

In `e2e/playwright.config.ts`, change the 5 flagged accesses to bracket form:

```ts
process.env['E2E_BASE_URL'];
process.env['CI'];
```

Match the style already used in `vite.config.ts:8`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 6: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → all
exit 0. Then `pnpm build` → exit 0 (the Vite/Nitro build has its own
transform pipeline; `erasableSyntaxOnly` changes what is emittable, so this
check is not redundant with `typecheck`). Then
`pnpm test:e2e:critical --project=chromium` → all pass (the page-object
constructors changed).

### Step 7: Document the new rules

In `AGENTS.md`, under "Rules the toolchain enforces", extend the TypeScript
strict line to name the new flags, and add one line making the intent
explicit:

> - **No parameter properties, no enums** — TypeScript: `erasableSyntaxOnly`.
>   Constructors take plain parameters and assign to declared fields. This
>   also forecloses decorator-based DI by construction (see plan 004).

**Verify**: `pnpm format` then `pnpm lint` → exit 0.

## Test plan

No new tests. This plan changes zero runtime behavior — every edit is either
a compiler option or a syntactic expansion with identical semantics. The
existing suite plus `pnpm build` and the e2e smoke run are the regression net.

If any existing test fails after Step 3 or 4, a parameter-property expansion
was done wrong (most likely a dropped `readonly`, a renamed parameter, or a
missed assignment). Fix the expansion; do not adjust the test.

## Done criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0 on Node 24
- [ ] `pnpm build` exits 0
- [ ] `pnpm test:e2e:critical --project=chromium` passes
- [ ] All eight flags present in `tsconfig.json`
- [ ] `grep -rn "constructor(private\|constructor(public\|constructor(protected" src e2e` → no matches
- [ ] `grep -rn "process\.env\.[A-Z]" e2e src scripts` → no matches
- [ ] `AGENTS.md` lists the new flags
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's baseline is not clean on Node 24.
- Step 2 produces materially more than 18 errors, or error codes other than
  TS1294/TS4111 appear. Extra codes mean the codebase drifted since planning;
  report the new distribution rather than fixing blind — a large `TS6133`
  (unused) or `TS7030` (not all paths return) count in domain code could
  indicate a real defect worth its own plan.
- `pnpm build` fails after Step 6 while `pnpm typecheck` passes. That means
  the Vite/Nitro transform disagrees with `tsc` about erasable syntax; report
  the failure rather than reverting the flag.
- Fixing a `noImplicitReturns` or `noFallthroughCasesInSwitch` error requires
  changing observable behavior (i.e. you found a genuine missing return or a
  real fallthrough). That is a bug, not a lint fix — report it, add a failing
  test, and let the maintainer decide whether it belongs in this plan.

## Maintenance notes

- `isolatedDeclarations` is the obvious next flag. Revisit after plan 005:
  the DI container's inferred container types are exactly the case where
  explicit declarations hurt most, so decide only once that shape is settled.
- If adapters are later converted to factory functions (README direction
  option 2), the Step 3/4 expansions disappear entirely. Do not treat them as
  permanent structure.
- Reviewer: check that no expansion silently dropped a `readonly`. The
  compiler will not catch it — `private db: Database` typechecks fine and
  quietly loses an invariant.
