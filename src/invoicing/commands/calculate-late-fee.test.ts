import { it } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { FixedClock } from '@/shared/time/fixed-clock';
import { Money } from '@/shared/money/money';
import type { DueDate } from '@/shared/time/due-date';
import type { InvoiceId } from '@/shared/ids/invoice-id';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import {
  buildSentInvoice,
  buildDraftInvoice,
  buildPaidInvoice,
  buildLineItem,
} from '../testing/invoice-factory';
import { voidInvoice as voidInvoicePure } from '../entities/invoice';
import {
  calculateLateFee,
  calculateLateFeeLineItem,
  daysOverdue,
} from './calculate-late-fee';
import { expectOk } from '@/shared/testing/expect-ok';

describe('daysOverdue', () => {
  it('returns positive days when today is after due date', () => {
    expect(daysOverdue('2025-01-01' as DueDate, '2025-01-31' as DueDate)).toBe(30);
  });

  it('returns 0 when dates are the same', () => {
    expect(daysOverdue('2025-01-15' as DueDate, '2025-01-15' as DueDate)).toBe(0);
  });

  it('returns negative when today is before due date', () => {
    expect(daysOverdue('2025-02-15' as DueDate, '2025-01-15' as DueDate)).toBe(-31);
  });
});

describe('calculateLateFeeLineItem (pure)', () => {
  it('calculates correct fee for a simple case', () => {
    // $1,000 outstanding, 30 days overdue, 0.05% daily rate
    // fee = 100000 cents * 0.0005 * 30 = 1500 cents = $15.00
    const outstanding = Money.fromCents(100_000n);
    const item = calculateLateFeeLineItem(outstanding, 30);
    expect(item.unitPrice.cents).toBe(1500n);
    expect(item.description).toBe('Late fee (30 days overdue)');
    expect(item.quantity).toBe(1);
  });

  it('uses banker rounding for fractional cents', () => {
    // $1.00 outstanding, 1 day overdue
    // fee = 100 cents * 0.0005 * 1 = 0.05 cents -> rounds to 0 (banker's: half-to-even, 0 is even)
    const outstanding = Money.fromCents(100n);
    const item = calculateLateFeeLineItem(outstanding, 1);
    expect(item.unitPrice.cents).toBe(0n);
  });

  it('calculates correctly for 1 day overdue on larger amount', () => {
    // $10,000 outstanding, 1 day
    // fee = 1_000_000 * 0.0005 * 1 = 500 cents = $5.00
    const outstanding = Money.fromCents(1_000_000n);
    const item = calculateLateFeeLineItem(outstanding, 1);
    expect(item.unitPrice.cents).toBe(500n);
  });

  it.prop([
    fc.bigInt({ min: 0n, max: 10_000_000n }).map((c) => Money.fromCents(c)),
    fc.integer({ min: 1, max: 365 }),
  ])('fee is non-negative for any overdue invoice', (outstanding, days) => {
    const item = calculateLateFeeLineItem(outstanding, days);
    expect(item.unitPrice.cents).toBeGreaterThanOrEqual(0n);
  });

  it.prop([
    fc.bigInt({ min: 0n, max: 10_000_000n }).map((c) => Money.fromCents(c)),
    fc.integer({ min: 1, max: 365 }),
  ])('fee description includes days overdue', (outstanding, days) => {
    const item = calculateLateFeeLineItem(outstanding, days);
    expect(item.description).toBe(`Late fee (${days} days overdue)`);
  });
});

describe('calculateLateFee command', () => {
  it('adds a late fee to an overdue sent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    // Invoice due 2025-02-15, clock at 2025-03-15 = 28 days overdue
    const invoice = buildSentInvoice({ dueDate: '2025-02-15' as DueDate });
    repo.save(invoice);

    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));
    const result = await calculateLateFee({ repo, clock }, { invoiceId: invoice.id });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const updated = result.value;
      // Original line items + 1 late fee
      expect(updated.lineItems.length).toBe(invoice.lineItems.length + 1);
      const lateFeeItem = updated.lineItems[updated.lineItems.length - 1]!;
      expect(lateFeeItem.description).toMatch(/^Late fee \(\d+ days overdue\)$/);
      expect(lateFeeItem.unitPrice.cents).toBeGreaterThanOrEqual(0n);
    }
  });

  it('rejects when invoice is not overdue', async () => {
    const repo = new InMemoryInvoiceRepo();
    // Invoice due 2025-06-15, clock at 2025-03-15 = not overdue
    const invoice = buildSentInvoice({ dueDate: '2025-06-15' as DueDate });
    repo.save(invoice);

    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));
    const result = await calculateLateFee({ repo, clock }, { invoiceId: invoice.id });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('NotOverdue');
  });

  it('rejects when late fee already applied', async () => {
    const repo = new InMemoryInvoiceRepo();
    const invoice = buildSentInvoice({ dueDate: '2025-02-15' as DueDate });
    repo.save(invoice);

    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));

    // Apply first late fee
    const first = await calculateLateFee({ repo, clock }, { invoiceId: invoice.id });
    expect(first.isOk()).toBe(true);

    // Try again
    const second = await calculateLateFee({ repo, clock }, { invoiceId: invoice.id });
    expect(second.isErr()).toBe(true);
    if (second.isErr()) expect(second.error.kind).toBe('LateFeeAlreadyApplied');
  });

  it('rejects draft invoice with InvalidTransition', async () => {
    const repo = new InMemoryInvoiceRepo();
    const invoice = buildDraftInvoice({ lineItems: [buildLineItem()] });
    repo.save(invoice);

    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));
    const result = await calculateLateFee({ repo, clock }, { invoiceId: invoice.id });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('InvalidTransition');
  });

  it('rejects paid invoice with InvalidTransition', async () => {
    const repo = new InMemoryInvoiceRepo();
    const invoice = buildPaidInvoice();
    repo.save(invoice);

    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));
    const result = await calculateLateFee({ repo, clock }, { invoiceId: invoice.id });

    expect(result.isErr()).toBe(true);
    // paid invoice: the command handler checks status !== 'sent' first
    if (result.isErr()) expect(result.error.kind).toBe('InvalidTransition');
  });

  it('rejects voided invoice with InvalidTransition', async () => {
    const repo = new InMemoryInvoiceRepo();
    const sent = buildSentInvoice({ dueDate: '2025-02-15' as DueDate });
    const voided = expectOk(voidInvoicePure(sent));
    repo.save(voided);

    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));
    const result = await calculateLateFee({ repo, clock }, { invoiceId: voided.id });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('InvalidTransition');
  });

  it('rejects nonexistent invoice', async () => {
    const repo = new InMemoryInvoiceRepo();
    const clock = new FixedClock(new Date('2025-03-15T12:00:00Z'));

    const result = await calculateLateFee({ repo, clock }, {
      invoiceId: '00000000-0000-7000-8000-000000000000' as InvoiceId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('InvalidInput');
  });
});
