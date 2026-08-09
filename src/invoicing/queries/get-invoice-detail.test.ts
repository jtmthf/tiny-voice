import { describe, it, expect } from 'vitest';
import { newInvoiceId } from '@/shared/ids/invoice-id';
import { Money } from '@/shared/money/money';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildSentInvoice, buildPayment } from '../testing/invoice-factory';
import { recordPayment } from '../entities/invoice';
import { getInvoiceDetail } from './get-invoice-detail';
import { getInvoiceSummary } from './get-invoice-summary';
import { getInvoiceLineItems } from './get-invoice-line-items';
import { getInvoicePayments } from './get-invoice-payments';
import { expectOk } from '@/shared/testing/expect-ok';

describe('getInvoiceDetail', () => {
  it('returns null for unknown invoice', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = getInvoiceDetail({ repo }, newInvoiceId());
    expect(result).toBeNull();
  });

  it('matches the combined output of the sibling summary/line-item/payment queries', () => {
    const repo = new InMemoryInvoiceRepo();
    const sent = buildSentInvoice();
    const payment = buildPayment({
      amount: Money.fromCents(5000n),
      recordedAt: new Date('2025-03-01T10:00:00Z'),
    });
    const withPayment = expectOk(recordPayment(sent, payment)).aggregate;
    repo.save(withPayment);

    const detail = getInvoiceDetail({ repo }, withPayment.id);
    const summary = getInvoiceSummary({ repo }, withPayment.id);
    const lineItems = getInvoiceLineItems({ repo }, withPayment.id);
    const payments = getInvoicePayments({ repo }, withPayment.id);

    expect(detail).not.toBeNull();
    expect(detail!.summary).toEqual(summary);
    expect(detail!.lineItems).toEqual(lineItems);
    expect(detail!.payments).toEqual(payments);
  });
});
