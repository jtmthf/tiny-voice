import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database } from '@/shared/db/database';
import { setupDb } from '@/shared/testing/db-fixture';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { Money } from '@/shared/money/money';
import { newPaymentId } from '@/shared/ids/payment-id';
import { SqliteInvoiceRepo } from './sqlite-invoice-repo';
import { buildDraftInvoice, buildSentInvoice, buildLineItem } from '../testing/invoice-factory';
import { addLineItem, recordPayment } from '../entities/invoice';
import { expectOk } from '@/shared/testing/expect-ok';

describe('SqliteInvoiceRepo', () => {
  let db: Database;
  let teardown: () => void;
  let repo: SqliteInvoiceRepo;

  beforeEach(() => {
    const fixture = setupDb();
    db = fixture.db;
    teardown = fixture.teardown;
    repo = new SqliteInvoiceRepo(db);
  });

  afterEach(() => {
    teardown();
  });

  it('round-trips an invoice with line items', () => {
    const items = [buildLineItem(), buildLineItem({ quantity: 3 })];
    const invoice = buildDraftInvoice({ lineItems: items });

    const saveResult = repo.save(invoice);
    expect(saveResult.isOk()).toBe(true);

    const found = repo.findById(invoice.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(invoice.id);
    expect(found!.status).toBe('draft');
    expect(found!.lineItems).toHaveLength(2);
    expect(found!.lineItems[0]!.description).toBe(items[0]!.description);
    expect(found!.lineItems[1]!.quantity).toBe(3);
    expect(found!.taxRate).toBe(invoice.taxRate);
    expect(found!.version).toBe(invoice.version);
  });

  it('round-trips an invoice with payments', () => {
    const sent = buildSentInvoice();
    repo.save(sent);

    const payment = {
      id: newPaymentId(),
      amount: Money.fromCents(1000n),
      recordedAt: new Date('2025-02-01T10:00:00Z'),
    };
    const updated = expectOk(recordPayment(sent, payment)).aggregate;
    repo.save(updated);

    const found = repo.findById(updated.id);
    expect(found).not.toBeNull();
    expect(found!.payments).toHaveLength(1);
    expect(found!.payments[0]!.amount.cents).toBe(1000n);
  });

  it('returns null for unknown id', () => {
    const found = repo.findById(newInvoiceId());
    expect(found).toBeNull();
  });

  it('detects version conflict on stale update', () => {
    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const a = expectOk(addLineItem(invoice, buildLineItem())).aggregate;
    const b = expectOk(addLineItem(invoice, buildLineItem())).aggregate;

    const saveA = repo.save(a);
    expect(saveA.isOk()).toBe(true);

    const saveB = repo.save(b);
    expect(saveB.isErr()).toBe(true);
    if (saveB.isErr()) expect(saveB.error.kind).toBe('ConcurrencyConflict');
  });

  it('lists with status filter', () => {
    const draft = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const sent = buildSentInvoice();
    repo.save(draft);
    repo.save(sent);

    const drafts = repo.list({ status: 'draft' });
    expect(drafts).toHaveLength(1);

    const sents = repo.list({ status: 'sent' });
    expect(sents).toHaveLength(1);
  });

  it('lists with clientId filter', () => {
    const a = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const b = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(a);
    repo.save(b);

    const results = repo.list({ clientId: a.clientId });
    expect(results).toHaveLength(1);
  });

  it('lists an invoice with zero line items and zero payments as empty arrays', () => {
    const invoice = buildDraftInvoice({ lineItems: [] });
    repo.save(invoice);

    const [found] = repo.list();
    expect(found).toBeDefined();
    expect(found!.lineItems).toEqual([]);
    expect(found!.payments).toEqual([]);
  });

  it('preserves payments on subsequent saves (append-only)', () => {
    const sent = buildSentInvoice();
    repo.save(sent);

    // First payment
    const p1 = { id: newPaymentId(), amount: Money.fromCents(500n), recordedAt: new Date() };
    const afterP1 = expectOk(recordPayment(sent, p1)).aggregate;
    repo.save(afterP1);

    // Second payment
    const p2 = { id: newPaymentId(), amount: Money.fromCents(500n), recordedAt: new Date() };
    const afterP2 = expectOk(recordPayment(afterP1, p2)).aggregate;
    repo.save(afterP2);

    const found = repo.findById(sent.id);
    expect(found!.payments).toHaveLength(2);
  });
});
