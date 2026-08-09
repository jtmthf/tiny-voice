# Plan 001: Eliminate prototype pollution in the FormData bracket-notation parser

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: This plan was written against commit `f82bc6a`
> **plus uncommitted working-tree changes** (an in-flight refactor of
> `src/invoicing/commands/`). A SHA diff alone will not tell you about drift.
> Instead, open each file under "Current state" and confirm the excerpts match
> the live code. On a mismatch, STOP.
>
> **Environment check (run first)**: `node --version` must print `v24.x`.
> The repo's `better-sqlite3` native binding is compiled for Node 24; on Node
> 22 the SQLite-backed test suites fail with a NODE_MODULE_VERSION error that
> has nothing to do with your change. If you see `v22.x`, switch Node versions
> before running tests.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

`parseBracketNotation` converts multipart form keys like `lineItems[0][description]`
into a nested object. It splits attacker-controlled key strings and assigns
along the resulting path with no filtering, so a POST to the create-invoice
server function with a field named `__proto__[x]` walks onto `Object.prototype`
and assigns to it — polluting every object in the Node process. This can corrupt
unrelated property lookups or enable denial of service. The parser runs **before**
Zod validation, so schema validation does not protect against it.

## Current state

- `src/app/fns/parse-bracket-notation.ts` — the vulnerable parser (whole file, 36 lines).
- `src/app/fns/create-invoice.ts:32` — the only caller: `const raw = data instanceof FormData ? parseBracketNotation(data) : data;`

The vulnerable path in `parse-bracket-notation.ts`:

```ts
// parse-bracket-notation.ts:9-14
function parsePath(key: string): (string | number)[] {
  return key
    .split(/[\[\]]/)
    .filter(Boolean)
    .map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}
```

```ts
// parse-bracket-notation.ts:21-35 (inside setPath)
let cur: Record<string, unknown> | unknown[] = obj;
for (let i = 0; i < path.length - 1; i++) {
  const key = path[i];
  const nextKey = path[i + 1];
  if (key === undefined || nextKey === undefined) break;
  const curAsObj = cur as Record<string, unknown>;
  if (curAsObj[key as string] == null) {
    curAsObj[key as string] = typeof nextKey === 'number' ? [] : {};
  }
  cur = curAsObj[key as string] as Record<string, unknown> | unknown[];
}
const lastKey = path[path.length - 1];
if (lastKey !== undefined) {
  (cur as Record<string, unknown>)[lastKey as string] = value;
}
```

Attack trace for key `"__proto__[x]"`: `parsePath` → `['__proto__', 'x']`.
In `setPath`, `curAsObj['__proto__']` is `Object.prototype` (not null, so the
guard doesn't replace it), `cur` becomes `Object.prototype`, and the final line
assigns `Object.prototype.x = value`.

Repo conventions that apply:

- Domain errors use neverthrow `Result`, but **this is app-layer input handling
  at the HTTP boundary — throwing is the established pattern here** (see
  `create-invoice.ts:40` `throw new Error('Client not found')` and the Zod
  `.parse()` calls that throw on invalid input). Match that: throw on malicious keys.
- Kebab-case filenames; a test file sits next to its subject
  (`foo.ts` → `foo.test.ts`). No default exports.

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                       | exit 0              |
| Lint      | `pnpm lint`                            | exit 0              |
| One file's tests | `pnpm vitest run src/app/fns/parse-bracket-notation.test.ts` | all pass |
| Full unit suite | `pnpm test`                      | exit 0 (requires Node 24) |

## Scope

**In scope** (the only files you should modify/create):

- `src/app/fns/parse-bracket-notation.ts`
- `src/app/fns/parse-bracket-notation.test.ts` (create — it does not exist today)

**Out of scope** (do NOT touch):

- `src/app/fns/create-invoice.ts` — the caller's behavior for legitimate input
  must not change.
- `src/app/fns/record-payment.ts` — uses `Object.fromEntries(data.entries())`
  for flat forms, which is not vulnerable (no path walking). Leave it.
- Any Zod schema.

## Git workflow

- Branch: `advisor/001-fix-prototype-pollution`
- Conventional commits (commitlint-enforced), e.g. `fix: reject dangerous keys in bracket-notation parser`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Harden the parser

In `src/app/fns/parse-bracket-notation.ts`:

1. Add a module-level constant:
   ```ts
   const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
   ```
2. In `parsePath`, after `.filter(Boolean)`, throw on any forbidden segment:
   ```ts
   if (parts.some((p) => FORBIDDEN_KEYS.has(p))) {
     throw new Error(`Unsafe key in form data: ${key}`);
   }
   ```
   (Restructure the function body as needed — split, filter, check, then map
   digit segments to numbers.)
3. Defense in depth in `parseBracketNotation` and `setPath`: create the root
   and every intermediate object with `Object.create(null)` instead of `{}`
   so even a missed traversal cannot reach `Object.prototype`. Keep arrays as
   `[]` (the `typeof nextKey === 'number'` branch).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Write the regression tests

Create `src/app/fns/parse-bracket-notation.test.ts`. Use vitest (`describe`/
`it`/`expect` from `'vitest'`) — model the file layout on
`src/invoicing/commands/apply-invoice-command.test.ts` (imports at top, one
`describe` per unit). Cases:

1. Happy path: FormData with `clientId`, `taxRate`, `dueDate`,
   `lineItems[0][description]`, `lineItems[0][quantity]`,
   `lineItems[0][unitPriceCents]` produces
   `{ clientId, taxRate, dueDate, lineItems: [{ description, quantity, unitPriceCents }] }`.
2. Two line items (`lineItems[0][...]`, `lineItems[1][...]`) produce a
   two-element array in order.
3. `__proto__[x]` key → the call **throws**, and afterwards
   `({} as Record<string, unknown>)['x']` is `undefined` (prototype not polluted).
4. `constructor[prototype][x]` key → throws; `({} as any).x` still `undefined`.
5. `a[__proto__][x]` (nested position) → throws.
6. Result objects don't inherit from Object.prototype is NOT required —
   only assert no pollution occurred and legitimate parses still work.

Build FormData in tests with `new FormData()` + `.append(key, value)`
(available natively on Node 24).

**Verify**: `pnpm vitest run src/app/fns/parse-bracket-notation.test.ts` → all pass.

### Step 3: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.
(If SQLite suites fail with NODE_MODULE_VERSION errors, re-check Node version —
that failure is environmental, not caused by this change.)

## Test plan

Covered by Step 2: happy path (nested arrays/objects), the specific
`__proto__`/`constructor`/`prototype` attacks at top level and nested, and
post-parse assertion that `Object.prototype` was not polluted.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm vitest run src/app/fns/parse-bracket-notation.test.ts` — all pass, ≥5 tests
- [ ] `pnpm test` exits 0 on Node 24
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `parse-bracket-notation.ts` no longer matches the excerpts above (someone
  fixed or refactored it since planning).
- `create-invoice.ts` no longer calls `parseBracketNotation` (the fix location
  may have moved).
- Throwing from the parser breaks an existing test that expects lenient
  parsing — that means legitimate form keys collide with the deny-list, which
  needs a design decision.

## Maintenance notes

- Any future server function that accepts `FormData` with nested fields must
  go through this (now hardened) parser — never hand-roll another one.
- Reviewer should scrutinize: the deny-list check must run on **every** path
  segment, not just the first, and intermediate containers must be
  `Object.create(null)`.
- Deferred: replacing the hand-rolled parser with a library (e.g. qs) was
  considered and rejected — it would add a dependency for one 36-line file
  and qs has had its own pollution CVEs.
