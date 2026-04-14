# Code Review: tiny-voice (whole app)

**Date**: 2026-04-14
**Verdict**: REQUEST CHANGES (3 critical, 23 high, 20 medium, 5 low)

---

## Critical Findings

| ID | Finding | Remediation | Status |
|----|---------|-------------|--------|
| C1 | N+1 queries in `list()` *(sqlite-invoice-repo.ts:192-200)* | Batch child queries with `json_group_array` single query | FIXED |
| C2 | Line item inputs have no label association *(create-invoice-form.tsx:101-126)* | New `Field` compound component with context-based aria wiring | FIXED |
| C3 | Remove-row button has no accessible label *(create-invoice-form.tsx:128)* | `aria-label` + `aria-hidden` on entity | FIXED |

---

## High Findings

| ID | Finding | Remediation | Status |
|----|---------|-------------|--------|
| H1 | No authentication on any endpoint *(route.ts:1, actions/index.ts:1)* | Intentional omission for demo app; documented in CLAUDE.md | DOCUMENTED |
| H2 | Event published after save, outside transaction *(record-payment.ts:50-56)* | Transactional outbox pattern: save + enqueue in one transaction, drain after commit | FIXED |
| H3 | Revenue bigint truncated to Number *(sqlite-revenue-read-model.ts:38)* | Store as TEXT like other money columns; use `BigInt()` on read | FIXED |
| H4 | InvoiceDetail page fetches same data 4-5x *(invoices/[id]/page.tsx:16-153)* | Data-level `'use cache'` queries shared across components; page-level redundancies removed | FIXED |
| H5 | createInvoice + calculateLateFee missing cache invalidation *(actions/index.ts:57,83)* | Add `invalidateOnSuccess(result, 'invoices')` | FIXED |
| H6 | Event schemas use `z.date()`/`z.bigint()` -- not wire-safe *(invoice-payment-recorded.ts:7-8)* | Use `z.string()` + parse on read | FIXED |
| H7 | RSC bypasses query layer for invoiceRepo *(invoices/[id]/page.tsx:75,110,152)* | New `getInvoiceLineItems` + `getInvoicePayments` queries; components route through `app.queries.invoicing.*` | FIXED |
| H8 | listInvoices loads full aggregates for summary use *(build-app.ts:110-125)* | Add dedicated SQL summary query with JOINs | FIXED |
| H9 | Missing index on invoices.created_at *(migrations/0002)* | Add migration: `CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC)` | FIXED |
| H10 | Lost update window in commands *(send-invoice.ts:30, record-payment.ts:34)* | OCC guard is correct; verify concurrencyConflict maps to HTTP 409 in rpc-errors.ts | VERIFIED |
| H11 | Dashboard fetches all invoices twice *(page.tsx:11,58)* | Merge RecentInvoices + InvoiceSummary or lift query | FIXED |
| H12 | LIKE wildcard defeats index on revenue *(sqlite-revenue-read-model.ts:53-57)* | Replace with `WHERE month >= ? AND month < ?` range | FIXED |
| H13 | Duplicated Invoice->Summary mapping *(build-app.ts:110 + build-test-app.ts:83)* | Extract `toInvoiceSummary()` function | WONTFIX — composition-root wiring duplication is structural; `AppQueries` type ensures both stay in sync |
| H14 | Repeated actionable() context boilerplate *(router.ts:250-299)* | Extract shared `getContext` lambda | OPEN |
| H15 | Fragile error mapping in router *(router.ts:87-196)* | Use `result.match()` or add explicit return after map | OPEN |
| H16 | Misleading `.map()` on Err in commands *(send-invoice.ts:38, etc.)* | Replace with `return err(saveResult.error)` | OPEN |
| H17 | Invoicing queries have zero tests *(invoicing/queries/)* | Add tests for get-invoice-summary, list-invoices, get-outstanding-by-client | OPEN |
| H18 | calculateTax (banker's rounding) untested *(value-objects/tax-rate.ts)* | Add unit + property tests for half-cent boundary rounding | OPEN |
| H19 | Command not-found paths untested *(send/void/record-payment tests)* | Add `'returns error for non-existent invoice'` test to each | OPEN |
| H20 | Multiple aria-live gaps *(error.tsx, loading.tsx, invoice-actions.tsx)* | Add `role="alert"` / `aria-live="polite"` to dynamic status messages | OPEN |
| H21 | No skip-to-content link *(layout.tsx:8)* | Add visually-hidden skip link + `id="main-content"` on `<main>` | OPEN |
| H22 | Invoice link text is meaningless *(page.tsx:32, invoices/page.tsx:36)* | Add `sr-only` context: status + amount | OPEN |
| H23 | Table header contrast fails WCAG AA *(globals.css:82-87)* | Darken to `#595959` | OPEN |

---

## Medium Findings

| ID | Finding | Remediation | Status |
|----|---------|-------------|--------|
| M1 | Internal error messages exposed in error boundary *(error.tsx:8)* | Gate `error.message` behind `NODE_ENV === 'development'` | OPEN |
| M2 | No HTTP security headers *(next.config.ts)* | Add CSP, X-Frame-Options, X-Content-Type-Options via `headers()` | OPEN |
| M3 | Notification subscribers re-read invoice after event *(register-subscribers.ts:48-70)* | Embed needed data in event payload at publish time | OPEN |
| M4 | Module-level mutable singleton *(get-rpc-context.ts:10)* | Add double-set guard in `setRpcContext()` | OPEN |
| M5 | Event bus sequential: slow subscriber blocks later *(in-process-event-bus.ts:41-47)* | Use `Promise.allSettled()` for concurrent execution | OPEN |
| M6 | simple-git-hooks not auto-installed *(package.json)* | Add `"prepare": "simple-git-hooks"` to scripts | OPEN |
| M7 | Clients module imports neverthrow directly *(client.ts, create-client.ts)* | Change to `@/shared/result/result` for consistency | OPEN |
| M8 | CreateClientInput schema missing Schema suffix *(create-client.ts:15)* | Rename to `CreateClientInputSchema` per convention | OPEN |
| M9 | Money formatting inlined instead of using `formatMoney` *(page.tsx:72, reporting/page.tsx:62)* | Replace inline bigint arithmetic with `formatMoney()` | OPEN |
| M10 | `lineTotal` bypassed in render *(invoices/[id]/page.tsx:98)* | Import and use domain `lineTotal()` function | OPEN |
| M11 | Dead code: toResult, unwrapOr, allocate, compareYearMonth, isNegative, isZero | Remove unused exports or mark test-only | OPEN |
| M12 | `throwError` indirection in rpc-errors.ts *(rpc-errors.ts:47-51)* | Call error constructors directly | OPEN |
| M13 | Trivial pass-through queries add structural weight *(list-clients.ts, get-revenue-by-month.ts)* | Accept as uniformity tax or inline; document decision | OPEN |
| M14 | No rollback/down-migration support *(run-migrations.ts)* | Document constraint; require backup before migration | OPEN |
| M15 | Config has no .env.example | Add `.env.example` with all 5 required vars | OPEN |
| M16 | generatePdf returns stub schema *(contract.ts:120-123)* | Plan wire-safe return shape now for forward compatibility | OPEN |
| M17 | formatMoney untested *(app/lib/format-money.ts)* | Add tests for zero, single-digit cents, negatives, large values | OPEN |
| M18 | No buildVoidInvoice factory *(invoice-factory.ts)* | Add factory + arbitrary; test void-state transition rejection | OPEN |
| M19 | Links indistinguishable by color alone *(globals.css:36-41)* | Add `text-decoration: underline` default (WCAG 1.4.1) | OPEN |
| M20 | Redundant index on revenue_by_month.month *(migration 0004:9)* | Drop; PK (month, currency) already covers month scans | OPEN |

---

## Low Findings

| ID | Finding | Remediation | Status |
|----|---------|-------------|--------|
| L1 | `src/index.ts` exports unused APP_NAME | Remove file | OPEN |
| L2 | `instance.ts` dual export: instance + app | Remove unused `instance` export | OPEN |
| L3 | @types/uuid redundant with uuid v13 | Remove from devDependencies | OPEN |
| L4 | dep-cruiser missing shared->app rule | Add forbidden rule: `src/shared/` -> `src/app/` | OPEN |
| L5 | Migration runner silently skips on fs error *(run-migrations.ts:39)* | Re-throw instead of defaulting to empty file list | OPEN |

---

## Strengths

- **Parametrized queries everywhere** -- Zero string-interpolated SQL. Zod validation at every RPC boundary with branded ID types.
- **Immutable aggregate root** -- All `Invoice` fields are `readonly`, state transitions return new objects via spread.
- **Optimistic concurrency control** -- `SqliteInvoiceRepo.save()` uses `UPDATE ... WHERE version = ?` correctly.
- **WAL mode + NORMAL sync** -- Correct SQLite configuration for concurrent web app reads/writes.
- **Event bus error isolation** -- Collect-and-rethrow via `AggregateError` ensures all subscribers run.
- **`server-only` guard** -- `instance.ts` prevents the DB singleton from leaking to client bundles.
- **Migration checksum verification** -- SHA-256 checksums detect tampered migrations.
- **Feature flag placement** -- Late fees flag gated at the RPC dispatch boundary, domain is flag-unaware.
- **Schema-first at boundaries** -- Zod schemas at RPC I/O, pure TS types in domain core.
- **Property-based testing** -- Thorough PBT for money operations and invoice state machine invariants.
- **Config fail-fast** -- `EnvConfig` throws aggregated validation errors at startup.
- **Strict TypeScript** -- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all enabled.
- **Transactional outbox** -- Events enqueued atomically with aggregate save, drained after commit.
- **Synchronous repository ports** -- Honest about better-sqlite3's nature, enables natural transaction composition.
