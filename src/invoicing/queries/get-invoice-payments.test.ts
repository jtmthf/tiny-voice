import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { Money } from '@/shared/money/money';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildSentInvoice, buildPayment } from '../testing/invoice-factory';
import { recordPayment } from '../entities/invoice';
import { getInvoicePayments } from './get-invoice-payments';

describe('getInvoicePayments', () => {
  it('returns null for unknown invoice', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = getInvoicePayments({ repo }, newInvoiceId());
    expect(result).toBeNull();
  });

  it('returns empty array for invoice with no payments', () => {
    const repo = new InMemoryInvoiceRepo();
    const sent = buildSentInvoice();
    repo.save(sent);

    const result = getInvoicePayments({ repo }, sent.id);
    expect(result).toEqual([]);
  });

  it('returns mapped payments', () => {
    const repo = new InMemoryInvoiceRepo();
    const sent = buildSentInvoice();
    const payment = buildPayment({ amount: Money.fromCents(5000n), recordedAt: new Date('2025-03-01T10:00:00Z') });
    const withPayment = recordPayment(sent, payment)._unsafeUnwrap();
    repo.save(withPayment);

    const result = getInvoicePayments({ repo }, withPayment.id);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0]!.amount.cents).toBe(5000n);
    expect(result![0]!.recordedAt).toEqual(new Date('2025-03-01T10:00:00Z'));
  });
});
