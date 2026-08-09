# Plan 006: Fix actively-wrong docs and close the CI/DX gaps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: Written against commit `f82bc6a` plus
> uncommitted working-tree changes. Confirm each "Current state" fact by
> opening the cited file before editing it.
>
> **Environment check**: `node --version` → `v24.x` for running tests locally.

## Status

- **Priority**: P2
- **Effort**: S–M (S for docs/matrix/nvmrc; M only if the CI e2e job needs iteration)
- **Risk**: LOW for docs; MED for the CI e2e job (flake potential — mitigated by gating on the `@smoke|@critical` subset, chromium only)
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `f82bc6a` (dirty working tree), 2026-07-08

## Why this matters

This repo exists to demonstrate an architecture that coding agents can
navigate and maintain by following the docs and the tooling rails. Right now
the docs actively derail an agent in two places: the canonical "How to add a
feature" recipe instructs creating a barrel file that the repo's own ESLint
rule rejects, and the domain-vocabulary doc points Late Fee at a file deleted
by the in-flight refactor. On the tooling side: the CI matrix runs ESLint
twice (`check:filenames` is a literal alias of `lint`) while never running the
Playwright suite — the only tests covering routes + server functions + SQLite
together — and nothing pins the Node version, so a contributor on Node 22
gets 29 baffling native-binding test failures (observed during this audit).
The commit-msg hook is the only local gate; a pre-commit typecheck+lint stops
bad commits minutes earlier than CI.

## Current state

- `docs/architecture.md:110-121` — "How to add a new feature" recipe. Step 2
  (line 113) reads:
  `2. **Add to module index**: Re-export from 'src/reporting/index.ts'.`
  But `find src -name index.ts` → zero files, and ESLint's
  `barrel-files/avoid-barrel-files` (see AGENTS.md "No barrel files") rejects
  exactly this. Every other step in the recipe is accurate.
- `docs/domain-terms.md` — a Markdown table of terms. The **Late Fee** row's
  code-reference cell cites `src/invoicing/commands/calculate-late-fee.ts`,
  which is **deleted** (logic now lives in
  `src/invoicing/entities/invoice.ts` — `addLateFee` and
  `calculateLateFeeLineItem` — plus the server fn
  `src/app/fns/calculate-late-fee.ts`). Also the **Invoice** row lists the
  transitions as `createInvoice, addLineItem, sendInvoice, recordPayment,
voidInvoice` — omitting `addLateFee`.
- `.github/workflows/ci.yml` — single job, matrix:
  `command: [typecheck, lint, deps, 'check:filenames', test]` (line 15), with
  pnpm + Node 24 setup. No Playwright job.
- `package.json:15` — `"check:filenames": "pnpm lint"` (the duplicate).
- `package.json:71-73` — `simple-git-hooks` block registers only
  `"commit-msg": "pnpm commitlint --edit $1"`.
- No `.nvmrc`, `.node-version`, or `.tool-versions` exists (verified);
  `engines.node` is `>=24`.
- E2E: `e2e/playwright.config.ts` self-starts `pnpm dev` (unless
  `E2E_BASE_URL` is set) with `DATABASE_PATH: ./data/e2e-test.db`; retries: 2;
  reporter switches to `github` on CI; projects: chromium, firefox, webkit.
  `e2e/global-setup.ts` just deletes `./data/e2e-test.db`. The app
  self-migrates at startup (`buildApp` → `runMigrations`), so no separate
  migrate step is needed. `package.json:19` —
  `"test:e2e:critical": "playwright test --config e2e/playwright.config.ts --grep '@smoke|@critical'"`.
- Also record here (from the audit, for the doc addition in Step 2):
  `SqliteInvoiceRepo.save` (`src/invoicing/adapters/sqlite-invoice-repo.ts:161-168`)
  deletes and re-inserts all line items on every save. This is **intentional**
  (whole-aggregate save, AGENTS.md rule 2) and should be documented so future
  audits don't re-flag it.

## Commands you will need

| Purpose                              | Command                                                 | Expected on success                                                         |
| ------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Lint                                 | `pnpm lint`                                             | exit 0                                                                      |
| Typecheck                            | `pnpm typecheck`                                        | exit 0                                                                      |
| Unit tests                           | `pnpm test`                                             | exit 0 (Node 24)                                                            |
| E2E critical (local check of Step 5) | `pnpm test:e2e:critical --project=chromium`             | all pass (Playwright browsers installed: `npx playwright install chromium`) |
| Workflow syntax                      | `gh workflow list` after push, or just YAML-lint by eye | valid YAML                                                                  |

## Scope

**In scope**:

- `docs/architecture.md` (fix step 2; add one save-semantics note)
- `docs/domain-terms.md` (Late Fee code ref; Invoice transitions list)
- `.github/workflows/ci.yml`
- `package.json` (remove `check:filenames` script; extend `simple-git-hooks`)
- `.nvmrc` (create)

**Out of scope** (do NOT touch):

- `e2e/**` — the Playwright config and specs work as-is; the CI job adapts to
  them, not vice versa.
- `AGENTS.md` / `CLAUDE.md` — accurate already.
- Any `src/**` file.

## Git workflow

- Branch: `advisor/006-docs-and-ci-hygiene`
- Conventional commits per concern: `docs: ...`, `ci: ...`, `chore: ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the feature recipe in `docs/architecture.md`

Replace step 2 of "How to add a new feature" (line ~113) with a direct-import
instruction, e.g.:

```markdown
2. **Import directly**: There are no barrel files (enforced by ESLint
   `barrel-files/avoid-barrel-files`). Consumers import from the source file:
   `import { exportRevenueCsv } from '@/reporting/queries/export-revenue-csv'`.
```

**Verify**: `grep -n "index.ts" docs/architecture.md` → no hits describing a
re-export step.

### Step 2: Document the whole-aggregate save semantics

In `docs/architecture.md`, in the section describing invoice command dispatch
(after the `applyInvoiceCommand` paragraph, around line 73), add:

```markdown
> **Save semantics**: `SqliteInvoiceRepo.save` rewrites the full line-item set
> (delete + re-insert) on every save and appends only new payments. The
> rewrite is intentional — the repository persists whole aggregates (see
> AGENTS.md rule 2) rather than diffing mutations. Do not "optimize" it into
> partial updates.
```

**Verify**: the note renders correctly (`grep -n "Save semantics" docs/architecture.md` → 1 hit).

### Step 3: Fix `docs/domain-terms.md`

1. Late Fee row, code-reference cell: replace
   `src/invoicing/commands/calculate-late-fee.ts` with
   `src/invoicing/entities/invoice.ts#addLateFee` (keep the existing
   `invoice.ts#addLateFee`-style anchor format used elsewhere in the table)
   and `src/app/fns/calculate-late-fee.ts`.
2. Invoice row: add `addLateFee` to the transitions list.

**Verify**: `grep -n "commands/calculate-late-fee" docs/domain-terms.md` → no
matches; every path mentioned in the file exists
(`grep -o "src/[a-z/-]*\.ts" docs/domain-terms.md | sort -u | xargs ls` → no
"No such file" errors).

### Step 4: Pin Node and add the pre-commit hook

1. Create `.nvmrc` containing exactly `24`.
2. In `package.json`, extend the `simple-git-hooks` block:

```json
"simple-git-hooks": {
  "commit-msg": "pnpm commitlint --edit $1",
  "pre-commit": "pnpm typecheck && pnpm lint"
}
```

3. Run `pnpm prepare` to reinstall the hooks.
4. Remove the `"check:filenames"` script from `package.json` (it is
   `"pnpm lint"` verbatim; nothing else references it — confirm with
   `grep -rn "check:filenames" --include='*.{json,yml,yaml,md}' .` before
   deleting; expect hits only in `package.json` and `ci.yml`).

**Verify**: `git commit --allow-empty -m "test: hook check"` on your branch
runs typecheck+lint before committing (then `git reset HEAD~1` to drop the
empty commit). `grep -rn "check:filenames" .github package.json` → only the
ci.yml hit remains (removed next step).

### Step 5: Rework CI

Edit `.github/workflows/ci.yml`:

1. In the matrix, drop `'check:filenames'` →
   `command: [typecheck, lint, deps, test]`.
2. Add a second job (same trigger) for the critical e2e path:

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '24'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: npx playwright install --with-deps chromium
    - run: pnpm test:e2e:critical --project=chromium
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

Notes: the Playwright config self-starts `pnpm dev` and the app self-migrates,
so no build/migrate steps are needed; chromium-only keeps the job fast and
avoids webkit CI flakiness; `retries: 2` is already in the config.

**Verify locally before relying on CI**: `npx playwright install chromium`
then `pnpm test:e2e:critical --project=chromium` → all pass. YAML sanity:
`node -e "require('js-yaml')"` is not available — instead run
`npx --yes yaml-lint .github/workflows/ci.yml` or rely on a careful read;
the structure above is complete.

### Step 6: Full gate

**Verify**: `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` → all exit 0.

## Test plan

No new unit tests — the deliverables are docs and pipeline. The executable
checks are: the grep-based doc verifications (Steps 1–3), the hook firing on
an empty commit (Step 4), and a local `pnpm test:e2e:critical
--project=chromium` run proving the CI job's core command works (Step 5).

## Done criteria

- [ ] `grep -rn "index.ts" docs/architecture.md` shows no re-export instruction
- [ ] `grep -rn "commands/calculate-late-fee" docs/` → no matches
- [ ] All `src/...` paths cited in `docs/domain-terms.md` exist on disk
- [ ] `.nvmrc` exists with content `24`
- [ ] `package.json` has no `check:filenames` script; pre-commit hook installed and firing
- [ ] `ci.yml` matrix is `[typecheck, lint, deps, test]` and an `e2e` job exists
- [ ] `pnpm test:e2e:critical --project=chromium` passes locally
- [ ] `pnpm typecheck && pnpm lint && pnpm deps && pnpm test` all exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm test:e2e:critical --project=chromium` fails locally **before** your CI
  change — the e2e suite itself is broken and gating CI on it would block all
  merges; report the failing specs instead of adding the job.
- The pre-commit hook takes over ~60s locally — report timing and ask whether
  to keep it, scope it down, or drop it, rather than silently shipping slow
  commits.
- `docs/architecture.md`'s recipe section has been rewritten since planning
  (line numbers off by more than a few) — re-locate by heading, and if the
  barrel step is already gone, skip Step 1 and note it.

## Maintenance notes

- If the e2e job flakes in CI despite retries, first restrict the grep to
  `@smoke` only — don't remove the job.
- The pre-commit hook runs repo-wide typecheck+lint (~seconds at this size).
  If the repo grows, switch to lint-staged rather than deleting the hook.
- `docs/domain-terms.md` code references are now load-bearing for agents; the
  Step 3 existence check (`grep -o ... | xargs ls`) is worth adding to CI
  someday — deferred, noted here so it isn't lost.
