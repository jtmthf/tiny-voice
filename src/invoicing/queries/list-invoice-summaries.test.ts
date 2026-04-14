import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/money/money';
import { InMemoryInvoiceRepo } from '../adapters/in-memory-invoice-repo';
import { buildDraftInvoice, buildSentInvoice, buildLineItem } from '../testing/invoice-factory';
import { subtotal, taxAmount, total, paidAmount, outstandingBalance } from '../entities/invoice';
import { listInvoiceSummaries } from './list-invoice-summaries';

describe('listInvoiceSummaries', () => {
  it('returns empty array when no invoices', () => {
    const repo = new InMemoryInvoiceRepo();
    const result = listInvoiceSummaries({ repo });
    expect(result).toEqual([]);
  });

  it('returns computed summaries matching aggregate calculations', () => {
    const repo = new InMemoryInvoiceRepo();
    const items = [buildLineItem({ quantity: 2, unitPrice: Money.fromCents(5000n) })];
    const sent = buildSentInvoice({ lineItems: items });
    repo.save(sent);

    const [summary] = listInvoiceSummaries({ repo });

    expect(summary).toBeDefined();
    expect(summary!.id).toBe(sent.id);
    expect(summary!.lineItemCount).toBe(1);
    expect(summary!.subtotal.cents).toBe(subtotal(sent).cents);
    expect(summary!.taxAmount.cents).toBe(taxAmount(sent).cents);
    expect(summary!.total.cents).toBe(total(sent).cents);
    expect(summary!.paidAmount.cents).toBe(paidAmount(sent).cents);
    expect(summary!.outstandingBalance.cents).toBe(outstandingBalance(sent).cents);
  });

  it('filters by status', () => {
    const repo = new InMemoryInvoiceRepo();
    const draft = buildDraftInvoice({ lineItems: [buildLineItem()] });
    const sent = buildSentInvoice();
    repo.save(draft);
    repo.save(sent);

    const result = listInvoiceSummaries({ repo }, { status: 'draft' });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('draft');
  });
});
