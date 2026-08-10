import { it } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import fc from 'fast-check';
import { Money } from '@/shared/money/money';
import { newLineItemId } from '@/shared/ids/line-item-id';
import { DueDate } from '@/shared/time/due-date';
import { expectOk } from '@/shared/testing/expect-ok';
import { buildSentInvoice } from '../testing/invoice-factory';
import { addLateFee, calculateLateFeeLineItem, daysOverdue } from './invoice';

describe('daysOverdue', () => {
  it('returns positive days when today is after due date', () => {
    expect(daysOverdue(DueDate.trusted('2025-01-01'), DueDate.trusted('2025-01-31'))).toBe(30);
  });

  it('returns 0 when dates are the same', () => {
    expect(daysOverdue(DueDate.trusted('2025-01-15'), DueDate.trusted('2025-01-15'))).toBe(0);
  });

  it('returns negative when today is before due date', () => {
    expect(daysOverdue(DueDate.trusted('2025-02-15'), DueDate.trusted('2025-01-15'))).toBe(-31);
  });
});

describe('calculateLateFeeLineItem (pure)', () => {
  it('calculates correct fee for a simple case', () => {
    const outstanding = Money.fromCents(100_000n);
    const item = calculateLateFeeLineItem(outstanding, 30, newLineItemId());
    expect(item.unitPrice.cents).toBe(1500n);
    expect(item.description).toBe('Late fee (30 days overdue)');
    expect(item.quantity).toBe(1);
    expect(item.kind).toBe('lateFee');
  });

  it('uses banker rounding for fractional cents', () => {
    const outstanding = Money.fromCents(100n);
    const item = calculateLateFeeLineItem(outstanding, 1, newLineItemId());
    expect(item.unitPrice.cents).toBe(0n);
  });

  it('calculates correctly for 1 day overdue on larger amount', () => {
    const outstanding = Money.fromCents(1_000_000n);
    const item = calculateLateFeeLineItem(outstanding, 1, newLineItemId());
    expect(item.unitPrice.cents).toBe(500n);
  });

  it.prop([
    fc.bigInt({ min: 0n, max: 10_000_000n }).map((c) => Money.fromCents(c)),
    fc.integer({ min: 1, max: 365 }),
  ])('fee is non-negative for any overdue invoice', (outstanding, days) => {
    const item = calculateLateFeeLineItem(outstanding, days, newLineItemId());
    expect(item.unitPrice.cents).toBeGreaterThanOrEqual(0n);
  });

  it.prop([
    fc.bigInt({ min: 0n, max: 10_000_000n }).map((c) => Money.fromCents(c)),
    fc.integer({ min: 1, max: 365 }),
  ])('fee description includes days overdue', (outstanding, days) => {
    const item = calculateLateFeeLineItem(outstanding, days, newLineItemId());
    expect(item.description).toBe(`Late fee (${days} days overdue)`);
  });
});

describe('addLateFee transition', () => {
  it('appends a late-fee line item for an overdue sent invoice and emits no event', () => {
    const sent = buildSentInvoice({ dueDate: DueDate.trusted('2025-02-15') });
    const outcome = expectOk(addLateFee(sent, DueDate.trusted('2025-03-15'), newLineItemId()));

    expect(outcome.aggregate.lineItems.length).toBe(sent.lineItems.length + 1);
    const lateFee = outcome.aggregate.lineItems[outcome.aggregate.lineItems.length - 1]!;
    expect(lateFee.kind).toBe('lateFee');
    expect(lateFee.description).toMatch(/^Late fee \(\d+ days overdue\)$/);
    expect(outcome.events).toEqual([]);
  });

  it('rejects when the invoice is not overdue', () => {
    const sent = buildSentInvoice({ dueDate: DueDate.trusted('2025-03-15') });
    const result = addLateFee(sent, DueDate.trusted('2025-02-15'), newLineItemId());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.kind).toBe('NotOverdue');
  });

  it('rejects a second late fee on the same invoice', () => {
    const sent = buildSentInvoice({ dueDate: DueDate.trusted('2025-02-15') });
    const today = DueDate.trusted('2025-03-15');
    const first = expectOk(addLateFee(sent, today, newLineItemId())).aggregate;
    const second = addLateFee(first, today, newLineItemId());

    expect(second.isErr()).toBe(true);
    if (second.isErr()) expect(second.error.kind).toBe('LateFeeAlreadyApplied');
  });
});
