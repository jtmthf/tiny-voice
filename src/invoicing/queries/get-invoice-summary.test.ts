import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildSentInvoice, buildLineItem, buildPayment } from '../testing/invoice-factory';
import { Money } from '@/shared/money/money';
import { recordPayment, subtotal, taxAmount, total, paidAmount, outstandingBalance } from '../entities/invoice';
import { getInvoiceSummary } from './get-invoice-summary';
import { expectOk } from '@/shared/testing/expect-ok';

describe('getInvoiceSummary', () => {
  it('returns null for unknown invoice', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = getInvoiceSummary({ repo }, newInvoiceId());
    expect(result).toBeNull();
  });

  it('returns correct summary for a sent invoice with a payment', () => {
    const repo = new InMemoryInvoiceRepo();
    const items = [
      buildLineItem({ quantity: 2, unitPrice: Money.fromCents(5000n) }),
      buildLineItem({ quantity: 1, unitPrice: Money.fromCents(3000n) }),
    ];
    const sent = buildSentInvoice({ lineItems: items });
    const payment = buildPayment({ amount: Money.fromCents(2000n) });
    const withPayment = expectOk(recordPayment(sent, payment));
    repo.save(withPayment);

    const summary = getInvoiceSummary({ repo }, withPayment.id);

    expect(summary).not.toBeNull();
    expect(summary!.id).toBe(withPayment.id);
    expect(summary!.status).toBe('sent');
    expect(summary!.lineItemCount).toBe(2);
    expect(summary!.subtotal.cents).toBe(subtotal(withPayment).cents);
    expect(summary!.taxAmount.cents).toBe(taxAmount(withPayment).cents);
    expect(summary!.total.cents).toBe(total(withPayment).cents);
    expect(summary!.paidAmount.cents).toBe(paidAmount(withPayment).cents);
    expect(summary!.outstandingBalance.cents).toBe(outstandingBalance(withPayment).cents);
    expect(summary!.dueDate).toBe(withPayment.dueDate);
  });
});
