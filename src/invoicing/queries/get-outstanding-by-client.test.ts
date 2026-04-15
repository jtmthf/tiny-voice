import { describe, it, expect } from 'vitest';
import { newClientId } from '@/shared/ids/client-id';
import { Money } from '@/shared/money/money';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildSentInvoice, buildPaidInvoice, buildLineItem, buildPayment } from '../testing/invoice-factory';
import { recordPayment } from '../entities/invoice';
import { getOutstandingByClient } from './get-outstanding-by-client';
import { expectOk } from '@/shared/testing/expect-ok';

describe('getOutstandingByClient', () => {
  it('returns zero for a client with no invoices', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = getOutstandingByClient({ repo }, newClientId());
    expect(result.cents).toBe(0n);
  });

  it('sums outstanding balances of sent invoices only', () => {
    const repo = new InMemoryInvoiceRepo();
    const clientId = newClientId();

    // Draft — should be excluded
    const draft = { ...buildDraftInvoice({ lineItems: [buildLineItem()] }), clientId };
    repo.save(draft);

    // Sent with partial payment — should be included
    const sent = { ...buildSentInvoice({ lineItems: [buildLineItem({ unitPrice: Money.fromCents(10000n) })] }), clientId };
    const payment = buildPayment({ amount: Money.fromCents(3000n) });
    const sentWithPayment = expectOk(recordPayment(sent, payment));
    repo.save(sentWithPayment);

    // Paid — should be excluded (status is 'paid')
    const paid = { ...buildPaidInvoice(), clientId };
    repo.save(paid);

    const result = getOutstandingByClient({ repo }, clientId);
    // Sent invoice: 10000 subtotal + 1000 tax (10%) = 11000 total - 3000 paid = 8000 outstanding
    expect(result.cents).toBe(8000n);
  });

  it('sums multiple sent invoices for the same client', () => {
    const repo = new InMemoryInvoiceRepo();
    const clientId = newClientId();

    const sent1 = { ...buildSentInvoice({ lineItems: [buildLineItem({ unitPrice: Money.fromCents(5000n) })] }), clientId };
    const sent2 = { ...buildSentInvoice({ lineItems: [buildLineItem({ unitPrice: Money.fromCents(7000n) })] }), clientId };
    repo.save(sent1);
    repo.save(sent2);

    const result = getOutstandingByClient({ repo }, clientId);
    // sent1: 5000 + 500 tax = 5500; sent2: 7000 + 700 tax = 7700; total = 13200
    expect(result.cents).toBe(13200n);
  });
});
